/**
 * OpenAI Chat Completions API endpoint
 * Refactored to use adapter pattern for multi-API format support
 */

import { consola } from "consola";
import { Elysia, t } from "elysia";
import type { ModelWithProvider } from "@/adapters/types";
import {
  getRequestAdapter,
  getResponseAdapter,
  getUpstreamAdapter,
} from "@/adapters";
import { getModelsWithProviderBySystemName } from "@/db";
import { apiKeyPlugin, type ApiKey } from "@/plugins/apiKeyPlugin";
import { apiKeyRateLimitPlugin, consumeTokens } from "@/plugins/apiKeyRateLimitPlugin";
import { rateLimitPlugin } from "@/plugins/rateLimitPlugin";
import type {
  CompletionsMessageType,
  ToolDefinitionType,
  ToolCallType,
  ToolChoiceType,
} from "@/db/schema";
import {
  extractUpstreamHeaders,
  selectModel,
  extractContentText,
  extractToolCalls,
  parseModelProvider,
  PROVIDER_HEADER,
} from "@/utils/api-helpers";
import { addCompletions, type Completion } from "@/utils/completions";

const logger = consola.withTag("completionsApi");

// =============================================================================
// Request Schema
// =============================================================================

// Stream options schema for OpenAI Chat API
const tStreamOptions = t.Object({
  include_usage: t.Optional(t.Boolean()),
});

// Tool function definition schema
const tToolFunction = t.Object({
  name: t.String(),
  description: t.Optional(t.String()),
  parameters: t.Optional(t.Record(t.String(), t.Unknown())),
});

// Tool definition schema
const tToolDefinition = t.Object({
  type: t.Literal("function"),
  function: tToolFunction,
});

// Tool choice schema - can be string or object
const tToolChoice = t.Union([
  t.Literal("auto"),
  t.Literal("none"),
  t.Literal("required"),
  t.Object({
    type: t.Literal("function"),
    function: t.Object({ name: t.String() }),
  }),
]);

// Message schema - supports various message types
const tMessage = t.Object(
  {
    role: t.String(),
    content: t.Optional(t.Union([t.String(), t.Null()])),
    tool_calls: t.Optional(t.Array(t.Object({
      id: t.String(),
      type: t.Literal("function"),
      function: t.Object({
        name: t.String(),
        arguments: t.String(),
      }),
    }))),
    tool_call_id: t.Optional(t.String()),
    name: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

// loose validation, only check required fields
const tChatCompletionCreate = t.Object(
  {
    messages: t.Array(tMessage),
    model: t.String(),
    n: t.Optional(t.Number()),
    stream: t.Optional(t.Boolean()),
    stream_options: t.Optional(tStreamOptions),
    tools: t.Optional(t.Array(tToolDefinition)),
    tool_choice: t.Optional(tToolChoice),
  },
  { additionalProperties: true },
);

/**
 * Build completion record for logging
 */
function buildCompletionRecord(
  requestedModel: string,
  modelId: number,
  messages: CompletionsMessageType[],
  tools?: ToolDefinitionType[],
  toolChoice?: ToolChoiceType,
  extraBody?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Completion {
  return {
    model: requestedModel,
    upstreamId: undefined,
    modelId,
    prompt: {
      messages,
      tools,
      tool_choice: toolChoice,
      extraBody,
      extraHeaders,
    },
    promptTokens: -1,
    completion: [],
    completionTokens: -1,
    status: "pending",
    ttft: -1,
    duration: -1,
  };
}

/**
 * Handle non-streaming completion request
 */
async function handleNonStreamingRequest(
  upstreamUrl: string,
  upstreamInit: RequestInit,
  completion: Completion,
  bearer: string,
  set: { status?: number | string },
  providerType: string,
  apiKeyRecord: ApiKey | null,
): Promise<string> {
  const begin = Date.now();

  logger.debug("proxying completions request to upstream", {
    bearer,
    upstreamUrl,
    providerType,
  });

  const [resp, err] = await fetch(upstreamUrl, upstreamInit)
    .then((r) => [r, null] as [Response, null])
    .catch((error: unknown) => {
      logger.error("fetch error", error);
      return [null, error] as [null, Error];
    });

  if (!resp) {
    logger.error("upstream error", {
      status: 500,
      msg: "Failed to fetch upstream",
    });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Failed to fetch upstream. ${err.toString()}`,
      details: {
        type: "completionError",
        data: { type: "fetchError", msg: err.toString() },
      },
    }).catch(() => {
      logger.error("Failed to log completion after fetch failure");
    });
    set.status = 500;
    return JSON.stringify({ error: "Failed to fetch upstream" });
  }

  if (!resp.ok) {
    const msg = await resp.text();
    logger.error("upstream error", { status: resp.status, msg });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Upstream error: ${msg}`,
      details: {
        type: "completionError",
        data: { type: "upstreamError", status: resp.status, msg },
      },
    }).catch(() => {
      logger.error("Failed to log completion error after upstream error");
    });
    set.status = resp.status;
    return msg;
  }

  // Parse response using upstream adapter
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const internalResponse = await upstreamAdapter.parseResponse(resp);

  // Convert to OpenAI format for response
  const responseAdapter = getResponseAdapter("openai-chat");
  const serialized = responseAdapter.serialize(internalResponse);

  // Update completion record
  completion.promptTokens = internalResponse.usage.inputTokens;
  completion.completionTokens = internalResponse.usage.outputTokens;
  completion.status = "completed";
  completion.ttft = Date.now() - begin;
  completion.duration = Date.now() - begin;

  // Extract tool calls from response
  const toolCalls = extractToolCalls(internalResponse);
  completion.completion = [
    {
      role: "assistant",
      content: extractContentText(internalResponse) || null,
      tool_calls: toolCalls,
    },
  ];
  addCompletions(completion, bearer).catch(() => {
    logger.error("Failed to log completion after non-streaming");
  });

  // Consume tokens for TPM rate limiting (post-flight)
  // Only consume if token counts are valid (not -1 which indicates parsing failure)
  if (apiKeyRecord && completion.promptTokens > 0 && completion.completionTokens > 0) {
    const totalTokens = completion.promptTokens + completion.completionTokens;
    await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
  }

  return JSON.stringify(serialized);
}

/**
 * Handle streaming completion request
 * @yields string chunks in OpenAI format
 */
async function* handleStreamingRequest(
  upstreamUrl: string,
  upstreamInit: RequestInit,
  completion: Completion,
  bearer: string,
  set: { status?: number | string },
  providerType: string,
  apiKeyRecord: ApiKey | null,
): AsyncGenerator<string, void, unknown> {
  const begin = Date.now();

  logger.debug("proxying stream completions request to upstream", {
    userKey: bearer,
    upstreamUrl,
    providerType,
    stream: true,
  });

  const [resp, err] = await fetch(upstreamUrl, upstreamInit)
    .then((r) => [r, null] as [Response, null])
    .catch((error: unknown) => {
      logger.error("fetch error", error);
      return [null, error] as [null, Error];
    });

  if (!resp) {
    logger.error("upstream error", {
      status: 500,
      msg: "Failed to fetch upstream",
    });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Failed to fetch upstream. ${err.toString()}`,
      details: {
        type: "completionError",
        data: { type: "fetchError", msg: err.toString() },
      },
    }).catch(() => {
      logger.error("Failed to log completion after fetch failure");
    });
    set.status = 500;
    yield JSON.stringify({ error: "Failed to fetch upstream" });
    return;
  }

  if (!resp.ok) {
    const msg = await resp.text();
    logger.error("upstream error", { status: resp.status, msg });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Upstream error: ${msg}`,
      details: {
        type: "completionError",
        data: { type: "upstreamError", status: resp.status, msg },
      },
    }).catch(() => {
      logger.error("Failed to log completion after upstream error");
    });
    set.status = resp.status;
    yield msg;
    return;
  }

  if (!resp.body) {
    logger.error("upstream error", { status: resp.status, msg: "No body" });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: "No body",
      details: {
        type: "completionError",
        data: { type: "upstreamError", status: resp.status, msg: "No body" },
      },
    }).catch(() => {
      logger.error("Failed to log completion after no body error");
    });
    set.status = 500;
    yield JSON.stringify({ error: "No body" });
    return;
  }

  // Get adapters
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const responseAdapter = getResponseAdapter("openai-chat");

  logger.debug("parse stream completions response");

  let ttft = -1;
  let isFirstChunk = true;
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  let inputTokens = -1;
  let outputTokens = -1;

  // Track tool calls during streaming
  // Use Map with tool call ID as key to avoid index collision issues
  const streamToolCalls: Map<string, ToolCallType> = new Map();
  const toolCallArguments: Map<string, string[]> = new Map();
  // Track index-to-id mapping for chunks that only provide index
  const indexToIdMap: Map<number, string> = new Map();
  let nextToolCallIndex = 0;

  try {
    const chunks = upstreamAdapter.parseStreamResponse(resp);

    for await (const chunk of chunks) {
      if (isFirstChunk) {
        isFirstChunk = false;
        ttft = Date.now() - begin;
      }

      // Collect content for completion record
      if (chunk.type === "content_block_start") {
        // Track new tool call block
        if (chunk.contentBlock?.type === "tool_use") {
          const toolId = chunk.contentBlock.id;
          const index = chunk.index ?? nextToolCallIndex++;
          indexToIdMap.set(index, toolId);
          streamToolCalls.set(toolId, {
            id: toolId,
            type: "function",
            function: {
              name: chunk.contentBlock.name,
              arguments: "",
            },
          });
          toolCallArguments.set(toolId, []);
        }
      } else if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
          textParts.push(chunk.delta.text);
        } else if (
          chunk.delta?.type === "thinking_delta" &&
          chunk.delta.thinking
        ) {
          thinkingParts.push(chunk.delta.thinking);
        } else if (chunk.delta?.type === "input_json_delta" && chunk.delta.partialJson) {
          // Collect tool call arguments - lookup by index to get tool ID
          // Skip if index is missing to avoid data corruption
          if (chunk.index !== undefined) {
            const toolId = indexToIdMap.get(chunk.index);
            if (toolId) {
              const args = toolCallArguments.get(toolId);
              if (args) {
                args.push(chunk.delta.partialJson);
              }
            }
          } else {
            logger.warn("Received input_json_delta without index, skipping");
          }
        }
      } else if (chunk.type === "content_block_stop") {
        // Finalize tool call arguments - lookup by index to get tool ID
        // Skip if index is missing to avoid data corruption
        if (chunk.index !== undefined) {
          const toolId = indexToIdMap.get(chunk.index);
          if (toolId) {
            const toolCall = streamToolCalls.get(toolId);
            const args = toolCallArguments.get(toolId);
            if (toolCall && args) {
              toolCall.function.arguments = args.join("");
            }
          }
        }
      }

      // Collect usage info
      if (chunk.usage) {
        inputTokens = chunk.usage.inputTokens;
        outputTokens = chunk.usage.outputTokens;
      }

      // Convert to OpenAI format and yield
      const serialized = responseAdapter.serializeStreamChunk(chunk);
      if (serialized) {
        yield serialized;
      }

      // Handle message_stop
      if (chunk.type === "message_stop") {
        yield responseAdapter.getDoneMarker();
      }
    }

    // Collect final tool calls
    const finalToolCalls: ToolCallType[] | undefined =
      streamToolCalls.size > 0
        ? Array.from(streamToolCalls.values())
        : undefined;

    // Finalize completion record
    const contentText =
      (thinkingParts.length > 0
        ? `<think>${thinkingParts.join("")}</think>\n`
        : "") + textParts.join("");

    completion.completion = [
      {
        role: "assistant",
        content: contentText || null,
        tool_calls: finalToolCalls,
      },
    ];
    completion.promptTokens = inputTokens;
    completion.completionTokens = outputTokens;
    completion.status = "completed";
    completion.ttft = ttft;
    completion.duration = Date.now() - begin;
    addCompletions(completion, bearer).catch((error: unknown) => {
      logger.error("Failed to log completion after streaming", error);
    });

    // Consume tokens for TPM rate limiting (post-flight)
    if (apiKeyRecord && inputTokens > 0 && outputTokens > 0) {
      const totalTokens = inputTokens + outputTokens;
      await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
    }

    // Handle case where no chunks were received
    if (isFirstChunk) {
      logger.error("upstream error: no chunk received");
      completion.status = "failed";
      addCompletions(completion, bearer, {
        level: "error",
        message: "No chunk received",
        details: {
          type: "completionError",
          data: {
            type: "upstreamError",
            status: 500,
            msg: "No chunk received",
          },
        },
      }).catch(() => {
        logger.error("Failed to log completion after no chunk received");
      });
      set.status = 500;
      yield JSON.stringify({ error: "No chunk received" });
    }
  } catch (error) {
    logger.error("Stream processing error", error);
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Stream processing error: ${String(error)}`,
      details: {
        type: "completionError",
        data: { type: "streamError", msg: String(error) },
      },
    }).catch(() => {
      logger.error("Failed to log completion after stream processing error");
    });
    set.status = 500;
    yield JSON.stringify({ error: "Stream processing error" });
  }
}

export const completionsApi = new Elysia({
  prefix: "/chat",
  detail: {
    security: [{ apiKey: [] }],
  },
})
  .use(apiKeyPlugin)
  .use(apiKeyRateLimitPlugin)
  .use(rateLimitPlugin)
  .post(
    "/completions",
    async function* ({ body, set, bearer, request, apiKeyRecord }) {
      if (bearer === undefined) {
        set.status = 500;
        yield JSON.stringify({ error: "Internal server error" });
        return;
      }

      const reqHeaders = request.headers;

      // Parse model@provider format and extract provider from header
      const { systemName, targetProvider } = parseModelProvider(
        body.model,
        reqHeaders.get(PROVIDER_HEADER),
      );

      // Find models with provider info using the new architecture
      const modelsWithProviders = await getModelsWithProviderBySystemName(
        systemName,
        "chat",
      );

      // Check if model exists
      if (modelsWithProviders.length === 0) {
        set.status = 404;
        yield JSON.stringify({
          error: {
            message: `Model '${systemName}' not found`,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        });
        return;
      }

      // Select model/provider
      const selected = selectModel(
        modelsWithProviders as ModelWithProvider[],
        targetProvider,
      );
      if (!selected) {
        set.status = 404;
        yield JSON.stringify({
          error: {
            message: `No available provider for model '${systemName}'`,
            type: "invalid_request_error",
            code: "no_provider",
          },
        });
        return;
      }

      const { model: modelConfig, provider } = selected;

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      // Parse request using adapter
      const requestAdapter = getRequestAdapter("openai-chat");
      const internalRequest = requestAdapter.parse(
        body as Record<string, unknown>,
      );

      // Update model in internal request to use remote ID
      internalRequest.model = modelConfig.remoteId ?? modelConfig.systemName;

      // Add extra headers
      if (extraHeaders) {
        internalRequest.extraHeaders = {
          ...internalRequest.extraHeaders,
          ...extraHeaders,
        };
      }

      // Get provider type (default to openai for compatibility)
      const providerType = provider.type || "openai";

      // Build upstream request using adapter
      const upstreamAdapter = getUpstreamAdapter(providerType);
      const { url: upstreamUrl, init: upstreamInit } =
        upstreamAdapter.buildRequest(internalRequest, provider);

      // Build completion record for logging (with full message data)
      // tools and tool_choice are now validated by schema
      const completion = buildCompletionRecord(
        body.model,
        modelConfig.id,
        body.messages as CompletionsMessageType[],
        body.tools as ToolDefinitionType[] | undefined,
        body.tool_choice as ToolChoiceType | undefined,
        internalRequest.extraParams,
        extraHeaders,
      );

      // Handle streaming vs non-streaming
      if (internalRequest.stream) {
        if (body.n && body.n > 1) {
          set.status = 400;
          yield JSON.stringify({
            error: "Stream completions with n > 1 is not supported",
          });
          return;
        }

        yield* handleStreamingRequest(
          upstreamUrl,
          upstreamInit,
          completion,
          bearer,
          set,
          providerType,
          apiKeyRecord ?? null,
        );
      } else {
        const response = await handleNonStreamingRequest(
          upstreamUrl,
          upstreamInit,
          completion,
          bearer,
          set,
          providerType,
          apiKeyRecord ?? null,
        );
        yield response;
      }
    },
    {
      body: tChatCompletionCreate,
      checkApiKey: true,
      apiKeyRateLimit: true,
      rateLimit: {
        identifier: (body: unknown) => (body as { model: string }).model,
      },
    },
  );

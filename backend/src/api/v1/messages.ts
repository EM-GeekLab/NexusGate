/**
 * Anthropic Messages API endpoint
 * Provides Anthropic-compatible API format for clients
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
import {
  extractUpstreamHeaders,
  selectModel,
  extractContentText,
  parseModelProvider,
  PROVIDER_HEADER,
} from "@/utils/api-helpers";
import { addCompletions, type Completion } from "@/utils/completions";

const logger = consola.withTag("messagesApi");

// =============================================================================
// Request Schema
// =============================================================================

// Anthropic content block types
const tAnthropicTextBlock = t.Object({
  type: t.Literal("text"),
  text: t.String(),
});

const tAnthropicImageBlock = t.Object({
  type: t.Literal("image"),
  source: t.Object({
    type: t.String(),
    media_type: t.Optional(t.String()),
    data: t.Optional(t.String()),
    url: t.Optional(t.String()),
  }),
});

const tAnthropicToolUseBlock = t.Object({
  type: t.Literal("tool_use"),
  id: t.String(),
  name: t.String(),
  input: t.Record(t.String(), t.Unknown()),
});

const tAnthropicToolResultBlock = t.Object({
  type: t.Literal("tool_result"),
  tool_use_id: t.String(),
  content: t.Optional(t.Union([t.String(), t.Array(t.Unknown())])),
  is_error: t.Optional(t.Boolean()),
});

const tAnthropicContentBlock = t.Union([
  tAnthropicTextBlock,
  tAnthropicImageBlock,
  tAnthropicToolUseBlock,
  tAnthropicToolResultBlock,
]);

// Anthropic tool definition
const tAnthropicTool = t.Object({
  name: t.String(),
  description: t.Optional(t.String()),
  input_schema: t.Record(t.String(), t.Unknown()),
});

// Anthropic tool choice
const tAnthropicToolChoice = t.Union([
  t.Object({ type: t.Literal("auto") }),
  t.Object({ type: t.Literal("any") }),
  t.Object({ type: t.Literal("tool"), name: t.String() }),
]);

// Anthropic metadata
const tAnthropicMetadata = t.Object({
  user_id: t.Optional(t.String()),
});

// Anthropic Messages API request schema
const tAnthropicMessageCreate = t.Object(
  {
    model: t.String(),
    messages: t.Array(
      t.Object(
        {
          role: t.String(),
          content: t.Union([t.String(), t.Array(tAnthropicContentBlock)]),
        },
        { additionalProperties: true },
      ),
    ),
    max_tokens: t.Number(),
    system: t.Optional(t.Union([t.String(), t.Array(tAnthropicTextBlock)])),
    stream: t.Optional(t.Boolean()),
    temperature: t.Optional(t.Number()),
    top_p: t.Optional(t.Number()),
    top_k: t.Optional(t.Number()),
    stop_sequences: t.Optional(t.Array(t.String())),
    tools: t.Optional(t.Array(tAnthropicTool)),
    tool_choice: t.Optional(tAnthropicToolChoice),
    metadata: t.Optional(tAnthropicMetadata),
  },
  { additionalProperties: true },
);

/**
 * Build completion record for logging
 */
function buildCompletionRecord(
  requestedModel: string,
  modelId: number,
  messages: Array<{ role: string; content: unknown }>,
  extraBody?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Completion {
  return {
    model: requestedModel,
    upstreamId: undefined,
    modelId,
    prompt: {
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
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
 * Handle non-streaming message request
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

  logger.debug("proxying messages request to upstream", {
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
    return JSON.stringify({
      type: "error",
      error: { type: "api_error", message: "Failed to fetch upstream" },
    });
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
    return msg;
  }

  // Parse response using upstream adapter
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const internalResponse = await upstreamAdapter.parseResponse(resp);

  // Convert to Anthropic format for response
  const responseAdapter = getResponseAdapter("anthropic");
  const serialized = responseAdapter.serialize(internalResponse);

  // Update completion record
  completion.promptTokens = internalResponse.usage.inputTokens;
  completion.completionTokens = internalResponse.usage.outputTokens;
  completion.status = "completed";
  completion.ttft = Date.now() - begin;
  completion.duration = Date.now() - begin;
  completion.completion = [
    {
      role: "assistant",
      content: extractContentText(internalResponse),
    },
  ];
  addCompletions(completion, bearer).catch(() => {
    logger.error("Failed to log completion after non-streaming");
  });

  // Consume tokens for TPM rate limiting (post-flight)
  if (apiKeyRecord) {
    const totalTokens = completion.promptTokens + completion.completionTokens;
    await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
  }

  return JSON.stringify(serialized);
}

/**
 * Handle streaming message request
 * @yields string - SSE formatted string chunks
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

  logger.debug("proxying stream messages request to upstream", {
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
      logger.error("Failed to log completion after fetch error");
    });
    set.status = 500;
    yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "api_error", message: "Failed to fetch upstream" } })}\n\n`;
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
    yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "api_error", message: "No body" } })}\n\n`;
    return;
  }

  // Get adapters
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const responseAdapter = getResponseAdapter("anthropic");

  logger.debug("parse stream messages response");

  let ttft = -1;
  let isFirstChunk = true;
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  let inputTokens = -1;
  let outputTokens = -1;

  try {
    const chunks = upstreamAdapter.parseStreamResponse(resp);

    for await (const chunk of chunks) {
      if (isFirstChunk) {
        isFirstChunk = false;
        ttft = Date.now() - begin;
      }

      // Collect content for completion record
      if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
          textParts.push(chunk.delta.text);
        } else if (
          chunk.delta?.type === "thinking_delta" &&
          chunk.delta.thinking
        ) {
          thinkingParts.push(chunk.delta.thinking);
        }
      }

      // Collect usage info
      if (chunk.usage) {
        inputTokens = chunk.usage.inputTokens;
        outputTokens = chunk.usage.outputTokens;
      }

      // Convert to Anthropic format and yield
      const serialized = responseAdapter.serializeStreamChunk(chunk);
      if (serialized) {
        yield serialized;
      }
    }

    // Finalize completion record
    completion.completion = [
      {
        role: undefined,
        content:
          (thinkingParts.length > 0
            ? `<think>${thinkingParts.join("")}</think>\n`
            : "") + textParts.join(""),
      },
    ];
    completion.promptTokens = inputTokens;
    completion.completionTokens = outputTokens;
    completion.status = "completed";
    completion.ttft = ttft;
    completion.duration = Date.now() - begin;
    addCompletions(completion, bearer).catch(() => {
      logger.error("Failed to log completion after streaming");
    });

    // Consume tokens for TPM rate limiting (post-flight)
    if (apiKeyRecord && inputTokens > 0 && outputTokens > 0) {
      const totalTokens = inputTokens + outputTokens;
      await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
    }

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
      yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "api_error", message: "No chunk received" } })}\n\n`;
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
      logger.error("Failed to log completion after stream error");
    });
    set.status = 500;
    yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "api_error", message: "Stream processing error" } })}\n\n`;
  }
}

export const messagesApi = new Elysia({
  detail: {
    security: [{ apiKey: [] }],
  },
})
  .use(apiKeyPlugin)
  .use(apiKeyRateLimitPlugin)
  .use(rateLimitPlugin)
  .post(
    "/messages",
    async function* ({ body, set, bearer, request, store }) {
      if (bearer === undefined) {
        set.status = 500;
        yield JSON.stringify({
          type: "error",
          error: { type: "api_error", message: "Internal server error" },
        });
        return;
      }

      const reqHeaders = request.headers;

      // Parse model@provider format and extract provider from header
      const { systemName, targetProvider } = parseModelProvider(
        body.model,
        reqHeaders.get(PROVIDER_HEADER),
      );

      // Find models with provider info
      const modelsWithProviders = await getModelsWithProviderBySystemName(
        systemName,
        "chat",
      );

      // Check if model exists
      if (modelsWithProviders.length === 0) {
        set.status = 404;
        yield JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: `Model '${systemName}' not found`,
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
          type: "error",
          error: {
            type: "not_found_error",
            message: `No available provider for model '${systemName}'`,
          },
        });
        return;
      }

      const { model: modelConfig, provider } = selected;

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      // Parse request using Anthropic adapter
      const requestAdapter = getRequestAdapter("anthropic");
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

      // Build completion record for logging
      const completion = buildCompletionRecord(
        body.model,
        modelConfig.id,
        body.messages,
        internalRequest.extraParams,
        extraHeaders,
      );

      // Handle streaming vs non-streaming
      if (internalRequest.stream) {
        yield* handleStreamingRequest(
          upstreamUrl,
          upstreamInit,
          completion,
          bearer,
          set,
          providerType,
          store.apiKeyRecord,
        );
      } else {
        const response = await handleNonStreamingRequest(
          upstreamUrl,
          upstreamInit,
          completion,
          bearer,
          set,
          providerType,
          store.apiKeyRecord,
        );
        yield response;
      }
    },
    {
      body: tAnthropicMessageCreate,
      checkApiKey: true,
      apiKeyRateLimit: true,
      rateLimit: {
        identifier: (body: unknown) => (body as { model: string }).model,
      },
    },
  );

/**
 * OpenAI Response API endpoint
 * Provides OpenAI Response API format for clients (agent/agentic interactions)
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

const logger = consola.withTag("responsesApi");

// =============================================================================
// Request Schema
// =============================================================================

// Response API input item types
const tResponseInputMessage = t.Object({
  type: t.Literal("message"),
  role: t.Union([
    t.Literal("user"),
    t.Literal("assistant"),
    t.Literal("system"),
  ]),
  content: t.Union([
    t.String(),
    t.Array(
      t.Object({
        type: t.String(),
        text: t.Optional(t.String()),
        image_url: t.Optional(t.Object({ url: t.String() })),
      }),
    ),
  ]),
});

const tResponseFunctionCallOutput = t.Object({
  type: t.Literal("function_call_output"),
  call_id: t.String(),
  output: t.String(),
});

const tResponseInputItem = t.Union([
  tResponseInputMessage,
  tResponseFunctionCallOutput,
]);

// Response API tool definition
const tResponseTool = t.Object({
  type: t.Literal("function"),
  name: t.String(),
  description: t.Optional(t.String()),
  parameters: t.Optional(t.Record(t.String(), t.Unknown())),
  strict: t.Optional(t.Boolean()),
});

// Response API tool choice
const tResponseToolChoice = t.Union([
  t.Literal("auto"),
  t.Literal("none"),
  t.Literal("required"),
  t.Object({ type: t.Literal("function"), name: t.String() }),
]);

// Response API metadata
const tResponseMetadata = t.Record(t.String(), t.String());

// OpenAI Response API request schema
const tResponseApiCreate = t.Object(
  {
    model: t.String(),
    input: t.Optional(t.Union([t.String(), t.Array(tResponseInputItem)])),
    instructions: t.Optional(t.String()),
    modalities: t.Optional(t.Array(t.String())),
    max_output_tokens: t.Optional(t.Number()),
    temperature: t.Optional(t.Number()),
    top_p: t.Optional(t.Number()),
    stream: t.Optional(t.Boolean()),
    tools: t.Optional(t.Array(tResponseTool)),
    tool_choice: t.Optional(tResponseToolChoice),
    parallel_tool_calls: t.Optional(t.Boolean()),
    previous_response_id: t.Optional(t.String()),
    store: t.Optional(t.Boolean()),
    metadata: t.Optional(tResponseMetadata),
  },
  { additionalProperties: true },
);

/**
 * Build completion record for logging
 */
function buildCompletionRecord(
  requestedModel: string,
  modelId: number,
  input: unknown,
  extraBody?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Completion {
  // Convert input to messages format for storage
  const messages: Array<{ role: string; content: string }> = [];
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj.type === "message") {
          messages.push({
            role: (obj.role as string) || "user",
            content:
              typeof obj.content === "string"
                ? obj.content
                : JSON.stringify(obj.content),
          });
        } else if (obj.type === "function_call_output") {
          messages.push({
            role: "tool",
            content: (obj.output as string) || "",
          });
        }
      }
    }
  }

  return {
    model: requestedModel,
    upstreamId: undefined,
    modelId,
    prompt: {
      messages,
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
 * Handle non-streaming response request
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

  logger.debug("proxying responses request to upstream", {
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
      logger.error("Failed to log completion error after fetch failure");
    });
    set.status = 500;
    return JSON.stringify({
      object: "error",
      error: { type: "server_error", message: "Failed to fetch upstream" },
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
      logger.error("Failed to log completion error after upstream error");
    });
    set.status = resp.status;
    return msg;
  }

  // Parse response using upstream adapter
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const internalResponse = await upstreamAdapter.parseResponse(resp);

  // Convert to Response API format
  const responseAdapter = getResponseAdapter("openai-responses");
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
 * Handle streaming response request
 * @yields SSE formatted strings
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

  logger.debug("proxying stream responses request to upstream", {
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
      logger.error("Failed to log completion error after fetch failure");
    });
    set.status = 500;
    yield `data: ${JSON.stringify({ type: "error", error: { type: "server_error", message: "Failed to fetch upstream" } })}\n\n`;
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
      logger.error("Failed to log completion error after upstream error");
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
      logger.error("Failed to log completion error after no body");
    });
    set.status = 500;
    yield `data: ${JSON.stringify({ type: "error", error: { type: "server_error", message: "No body" } })}\n\n`;
    return;
  }

  // Get adapters
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const responseAdapter = getResponseAdapter("openai-responses");

  logger.debug("parse stream responses");

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

      // Convert to Response API format and yield
      const serialized = responseAdapter.serializeStreamChunk(chunk);
      if (serialized) {
        yield serialized;
      }

      // Handle message_stop
      if (chunk.type === "message_stop") {
        yield responseAdapter.getDoneMarker();
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
        logger.error("Failed to log completion error after no chunk received");
      });
      set.status = 500;
      yield `data: ${JSON.stringify({ type: "error", error: { type: "server_error", message: "No chunk received" } })}\n\n`;
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
      logger.error("Failed to log completion error after stream failure");
    });
    set.status = 500;
    yield `data: ${JSON.stringify({ type: "error", error: { type: "server_error", message: "Stream processing error" } })}\n\n`;
  }
}

export const responsesApi = new Elysia({
  detail: {
    security: [{ apiKey: [] }],
  },
})
  .use(apiKeyPlugin)
  .use(apiKeyRateLimitPlugin)
  .use(rateLimitPlugin)
  .post(
    "/responses",
    async function* ({ body, set, bearer, request, store }) {
      if (bearer === undefined) {
        set.status = 500;
        yield JSON.stringify({
          object: "error",
          error: { type: "server_error", message: "Internal server error" },
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
          object: "error",
          error: {
            type: "invalid_request_error",
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
          object: "error",
          error: {
            type: "invalid_request_error",
            message: `No available provider for model '${systemName}'`,
          },
        });
        return;
      }

      const { model: modelConfig, provider } = selected;

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      // Parse request using Response API adapter
      const requestAdapter = getRequestAdapter("openai-responses");
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
        body.input,
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
      body: tResponseApiCreate,
      checkApiKey: true,
      apiKeyRateLimit: true,
      rateLimit: {
        identifier: (body: unknown) => (body as { model: string }).model,
      },
    },
  );

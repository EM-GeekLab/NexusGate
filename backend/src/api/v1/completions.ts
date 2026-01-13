/**
 * OpenAI Chat Completions API endpoint
 * Refactored to use adapter pattern for multi-API format support
 */

import { consola } from "consola";
import { Elysia, t } from "elysia";
import { getModelsWithProviderBySystemName } from "@/db";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { rateLimitPlugin } from "@/plugins/rateLimitPlugin";
import { addCompletions, type Completion } from "@/utils/completions";
import {
  extractUpstreamHeaders,
  selectModel,
  extractContentText,
  parseModelProvider,
  PROVIDER_HEADER,
} from "@/utils/api-helpers";
import {
  getRequestAdapter,
  getResponseAdapter,
  getUpstreamAdapter,
} from "@/adapters";
import type {
  ModelWithProvider,
  ProviderConfig,
} from "@/adapters/types";

const logger = consola.withTag("completionsApi");

// =============================================================================
// Request Schema
// =============================================================================

// Stream options schema for OpenAI Chat API
const tStreamOptions = t.Object({
  include_usage: t.Optional(t.Boolean()),
});

// loose validation, only check required fields
const tChatCompletionCreate = t.Object(
  {
    messages: t.Array(
      t.Object({
        role: t.String(),
        content: t.String(),
      }),
    ),
    model: t.String(),
    n: t.Optional(t.Number()),
    stream: t.Optional(t.Boolean()),
    stream_options: t.Optional(tStreamOptions),
  },
  { additionalProperties: true },
);

/**
 * Build completion record for logging
 */
function buildCompletionRecord(
  requestedModel: string,
  modelId: number,
  messages: Array<{ role: string; content: string }>,
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
        content: m.content,
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
 * Handle non-streaming completion request
 */
async function handleNonStreamingRequest(
  upstreamUrl: string,
  upstreamInit: RequestInit,
  completion: Completion,
  bearer: string,
  set: { status?: number | string },
  providerType: string,
): Promise<string> {
  const begin = Date.now();

  logger.debug("proxying completions request to upstream", {
    bearer,
    upstreamUrl,
    providerType,
  });

  const [resp, err] = await fetch(upstreamUrl, upstreamInit)
    .then((r) => [r, null] as [Response, null])
    .catch((error) => {
      logger.error("fetch error", error);
      return [null, error] as [null, Error];
    });

  if (!resp) {
    logger.error("upstream error", { status: 500, msg: "Failed to fetch upstream" });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Failed to fetch upstream. ${err.toString()}`,
      details: {
        type: "completionError",
        data: { type: "fetchError", msg: err.toString() },
      },
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
  completion.completion = [
    {
      role: "assistant",
      content: extractContentText(internalResponse),
    },
  ];
  addCompletions(completion, bearer);

  return JSON.stringify(serialized);
}

/**
 * Handle streaming completion request
 */
async function* handleStreamingRequest(
  upstreamUrl: string,
  upstreamInit: RequestInit,
  completion: Completion,
  bearer: string,
  set: { status?: number | string },
  providerType: string,
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
    .catch((error) => {
      logger.error("fetch error", error);
      return [null, error] as [null, Error];
    });

  if (!resp) {
    logger.error("upstream error", { status: 500, msg: "Failed to fetch upstream" });
    completion.status = "failed";
    addCompletions(completion, bearer, {
      level: "error",
      message: `Failed to fetch upstream. ${err.toString()}`,
      details: {
        type: "completionError",
        data: { type: "fetchError", msg: err.toString() },
      },
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
        } else if (chunk.delta?.type === "thinking_delta" && chunk.delta.thinking) {
          thinkingParts.push(chunk.delta.thinking);
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
    addCompletions(completion, bearer);

    // Handle case where no chunks were received
    if (isFirstChunk) {
      logger.error("upstream error: no chunk received");
      completion.status = "failed";
      addCompletions(completion, bearer, {
        level: "error",
        message: "No chunk received",
        details: {
          type: "completionError",
          data: { type: "upstreamError", status: 500, msg: "No chunk received" },
        },
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
  .use(rateLimitPlugin)
  .post(
    "/completions",
    async function* ({ body, set, bearer, request }) {
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
      const internalRequest = requestAdapter.parse(body as Record<string, unknown>);

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
      const providerType = (provider as ProviderConfig).type || "openai";

      // Build upstream request using adapter
      const upstreamAdapter = getUpstreamAdapter(providerType);
      const { url: upstreamUrl, init: upstreamInit } = upstreamAdapter.buildRequest(
        internalRequest,
        provider as ProviderConfig,
      );

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
        );
      } else {
        const response = await handleNonStreamingRequest(
          upstreamUrl,
          upstreamInit,
          completion,
          bearer,
          set,
          providerType,
        );
        yield response;
      }
    },
    {
      body: tChatCompletionCreate,
      checkApiKey: true,
      rateLimit: {
        identifier: (body: unknown) => (body as { model: string }).model,
      },
    },
  );

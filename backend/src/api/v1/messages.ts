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
  filterCandidates,
  extractContentText,
  parseModelProvider,
  processFailoverError,
  PROVIDER_HEADER,
} from "@/utils/api-helpers";
import { addCompletions, type Completion } from "@/utils/completions";
import { StreamingContext } from "@/utils/streaming-context";
import {
  executeWithFailover,
  selectMultipleCandidates,
  type FailoverConfig,
} from "@/services/failover";

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
  modelId: number | undefined,
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
 * Process a successful non-streaming message response
 * Ensures completion is saved to database before returning
 */
async function processNonStreamingResponse(
  resp: Response,
  completion: Completion,
  bearer: string,
  providerType: string,
  apiKeyRecord: ApiKey | null,
  begin: number,
  signal?: AbortSignal,
): Promise<string> {
  // Parse response using upstream adapter
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const internalResponse = await upstreamAdapter.parseResponse(resp);

  // Convert to Anthropic format for response
  const responseAdapter = getResponseAdapter("anthropic");
  const serialized = responseAdapter.serialize(internalResponse);

  // Update completion record
  completion.promptTokens = internalResponse.usage.inputTokens;
  completion.completionTokens = internalResponse.usage.outputTokens;
  completion.ttft = Date.now() - begin;
  completion.duration = Date.now() - begin;
  completion.completion = [
    {
      role: "assistant",
      content: extractContentText(internalResponse),
    },
  ];

  // Check if client disconnected during processing
  if (signal?.aborted) {
    completion.status = "aborted";
    await addCompletions(completion, bearer, {
      level: "info",
      message: "Client disconnected during non-streaming response",
      details: {
        type: "completionError",
        data: { type: "aborted", msg: "Client disconnected" },
      },
    });
  } else {
    completion.status = "completed";
    await addCompletions(completion, bearer);
  }

  // Consume tokens for TPM rate limiting (post-flight)
  // Only consume if token counts are valid (not -1 which indicates parsing failure)
  if (apiKeyRecord && completion.promptTokens > 0 && completion.completionTokens > 0) {
    const totalTokens = completion.promptTokens + completion.completionTokens;
    await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
  }

  return JSON.stringify(serialized);
}

/**
 * Process a successful streaming message response
 * Uses StreamingContext to ensure completion is saved even on client disconnect
 * @yields string - SSE formatted string chunks
 */
async function* processStreamingResponse(
  resp: Response,
  completion: Completion,
  bearer: string,
  providerType: string,
  apiKeyRecord: ApiKey | null,
  begin: number,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  // Get adapters
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const responseAdapter = getResponseAdapter("anthropic");

  logger.debug("parse stream messages response");

  // Create streaming context with abort handling
  const ctx = new StreamingContext(completion, bearer, apiKeyRecord, begin, signal);

  try {
    const chunks = upstreamAdapter.parseStreamResponse(resp);

    for await (const chunk of chunks) {
      // Check if client has disconnected (but continue processing to collect all data)
      const clientAborted = ctx.isAborted();

      ctx.recordTTFT();

      // Collect content for completion record (always, even if client aborted)
      if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
          ctx.textParts.push(chunk.delta.text);
        } else if (
          chunk.delta?.type === "thinking_delta" &&
          chunk.delta.thinking
        ) {
          ctx.thinkingParts.push(chunk.delta.thinking);
        }
      }

      // Collect usage info
      if (chunk.usage) {
        ctx.inputTokens = chunk.usage.inputTokens;
        ctx.outputTokens = chunk.usage.outputTokens;
      }

      // Only yield to client if not aborted (client is still listening)
      if (!clientAborted) {
        // Convert to Anthropic format and yield
        const serialized = responseAdapter.serializeStreamChunk(chunk);
        if (serialized) {
          yield serialized;
        }
      }
    }

    // Handle case where no chunks were received
    if (ctx.isFirstChunk) {
      throw new Error("No chunk received from upstream");
    }

    // Save completion with appropriate status
    if (!ctx.isSaved()) {
      if (ctx.isAborted()) {
        await ctx.saveCompletion("aborted", "Client disconnected");
      } else {
        await ctx.saveCompletion("completed");
      }
    }
  } catch (error) {
    // Only log error if not due to client abort
    if (!ctx.isAborted()) {
      logger.error("Stream processing error", error);
    }

    // Save failed completion
    if (!ctx.isSaved()) {
      if (ctx.isAborted()) {
        // If client aborted and we got an error, still save as aborted with the error info
        await ctx.saveCompletion("aborted", `Client disconnected, stream error: ${String(error)}`);
      } else {
        await ctx.saveCompletion("failed", String(error));
      }
    }

    // Only re-throw if client is still connected
    if (!ctx.isAborted()) {
      throw error;
    }
  } finally {
    ctx.cleanup();
  }
}

// Failover configuration for messages API
const MESSAGES_FAILOVER_CONFIG: Partial<FailoverConfig> = {
  maxProviderAttempts: 3,
  sameProviderRetries: 1,
  retriableStatusCodes: [429, 500, 502, 503, 504],
  timeoutMs: 120000, // 2 minutes for messages
};

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
    async function* ({ body, set, bearer, request, apiKeyRecord }) {
      if (bearer === undefined) {
        set.status = 500;
        return {
          type: "error",
          error: { type: "api_error", message: "Internal server error" },
        };
      }

      const reqHeaders = request.headers;
      const begin = Date.now();

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
        return {
          type: "error",
          error: {
            type: "not_found_error",
            message: `Model '${systemName}' not found`,
          },
        };
      }

      // Filter candidates by target provider (if specified)
      const filteredCandidates = filterCandidates(
        modelsWithProviders as ModelWithProvider[],
        targetProvider,
      );

      if (filteredCandidates.length === 0) {
        set.status = 404;
        return {
          type: "error",
          error: {
            type: "not_found_error",
            message: `No available provider for model '${systemName}'`,
          },
        };
      }

      // Select candidates for failover (weighted random order)
      const candidates = selectMultipleCandidates(
        filteredCandidates,
        MESSAGES_FAILOVER_CONFIG.maxProviderAttempts || 3,
      );

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      // Parse request using Anthropic adapter
      const requestAdapter = getRequestAdapter("anthropic");
      const internalRequest = requestAdapter.parse(
        body as Record<string, unknown>,
      );

      // Add extra headers to internal request
      if (extraHeaders) {
        internalRequest.extraHeaders = {
          ...internalRequest.extraHeaders,
          ...extraHeaders,
        };
      }

      // Build request function for failover
      const buildRequestForProvider = (mp: ModelWithProvider) => {
        // Clone internal request and update model
        const req = { ...internalRequest };
        req.model = mp.model.remoteId ?? mp.model.systemName;

        const providerType = mp.provider.type || "openai";
        const upstreamAdapter = getUpstreamAdapter(providerType);
        return upstreamAdapter.buildRequest(req, mp.provider);
      };

      // Handle streaming vs non-streaming
      if (internalRequest.stream) {
        // Streaming request - use yield for streaming responses
        const result = await executeWithFailover(
          candidates,
          buildRequestForProvider,
          MESSAGES_FAILOVER_CONFIG,
        );

        if (!result.success) {
          const completion = buildCompletionRecord(
            body.model,
            result.provider?.model.id ?? candidates[0]?.model.id,
            body.messages,
            internalRequest.extraParams,
            extraHeaders,
          );

          const errorResult = await processFailoverError(result, completion, bearer, "streaming");

          if (errorResult.type === "upstream_error") {
            set.status = errorResult.status;
            return JSON.parse(errorResult.body) as Record<string, unknown>;
          }

          set.status = 502;
          return {
            type: "error",
            error: {
              type: "api_error",
              message: "All upstream providers failed",
            },
          };
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          return {
            type: "error",
            error: { type: "api_error", message: "Internal server error" },
          };
        }

        if (!result.response.body) {
          set.status = 500;
          return {
            type: "error",
            error: { type: "api_error", message: "No body in response" },
          };
        }

        const providerType = result.provider.provider.type || "openai";
        const completion = buildCompletionRecord(
          body.model,
          result.provider.model.id,
          body.messages,
          internalRequest.extraParams,
          extraHeaders,
        );

        try {
          yield* processStreamingResponse(
            result.response,
            completion,
            bearer,
            providerType,
            apiKeyRecord ?? null,
            begin,
            request.signal,
          );
        } catch (error) {
          // Don't log error if it's due to client abort
          if (!request.signal.aborted) {
            logger.error("Stream processing error", error);
            set.status = 500;
            yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "server_error", message: "Stream processing error" } })}\n\n`;
          }
        }
      } else {
        // Non-streaming request - use return for normal JSON response
        const result = await executeWithFailover(
          candidates,
          buildRequestForProvider,
          MESSAGES_FAILOVER_CONFIG,
        );

        if (!result.success) {
          const completion = buildCompletionRecord(
            body.model,
            result.provider?.model.id ?? candidates[0]?.model.id,
            body.messages,
            internalRequest.extraParams,
            extraHeaders,
          );

          const errorResult = await processFailoverError(result, completion, bearer, "non-streaming");

          if (errorResult.type === "upstream_error") {
            set.status = errorResult.status;
            return JSON.parse(errorResult.body) as Record<string, unknown>;
          }

          set.status = 502;
          return {
            type: "error",
            error: {
              type: "api_error",
              message: "All upstream providers failed",
            },
          };
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          return {
            type: "error",
            error: { type: "api_error", message: "Internal server error" },
          };
        }

        const providerType = result.provider.provider.type || "openai";
        const completion = buildCompletionRecord(
          body.model,
          result.provider.model.id,
          body.messages,
          internalRequest.extraParams,
          extraHeaders,
        );

        try {
          const response = await processNonStreamingResponse(
            result.response,
            completion,
            bearer,
            providerType,
            apiKeyRecord ?? null,
            begin,
            request.signal,
          );
          // Return parsed JSON object for proper content-type
          return JSON.parse(response) as Record<string, unknown>;
        } catch (error) {
          // Handle error based on whether client aborted
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (request.signal.aborted) {
            // Client disconnected - save as aborted
            completion.status = "aborted";
            try {
              await addCompletions(completion, bearer, {
                level: "info",
                message: "Client disconnected during non-streaming response",
                details: {
                  type: "completionError",
                  data: { type: "aborted", msg: errorMsg },
                },
              });
            } catch (logError: unknown) {
              logger.error("Failed to log aborted completion after processing error", logError);
            }
            // Return nothing for aborted requests
            return;
          } else {
            logger.error("Failed to process response", error);
            completion.status = "failed";
            try {
              await addCompletions(completion, bearer, {
                level: "error",
                message: `Response processing error: ${errorMsg}`,
                details: {
                  type: "completionError",
                  data: { type: "processingError", msg: errorMsg },
                },
              });
            } catch (logError: unknown) {
              logger.error("Failed to log completion after processing error", logError);
            }
            set.status = 500;
            return {
              type: "error",
              error: { type: "api_error", message: "Failed to process response" },
            };
          }
        }
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

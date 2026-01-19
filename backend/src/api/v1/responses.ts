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
  filterCandidates,
  extractContentText,
  parseModelProvider,
  PROVIDER_HEADER,
} from "@/utils/api-helpers";
import { addCompletions, type Completion } from "@/utils/completions";
import {
  executeWithFailover,
  selectMultipleCandidates,
  type FailoverConfig,
} from "@/services/failover";

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
  modelId: number | undefined,
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
 * Process a successful non-streaming response
 */
async function processNonStreamingResponse(
  resp: Response,
  completion: Completion,
  bearer: string,
  providerType: string,
  apiKeyRecord: ApiKey | null,
  begin: number,
): Promise<string> {
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
  // Only consume if token counts are valid (not -1 which indicates parsing failure)
  if (apiKeyRecord && completion.promptTokens > 0 && completion.completionTokens > 0) {
    const totalTokens = completion.promptTokens + completion.completionTokens;
    await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
  }

  return JSON.stringify(serialized);
}

/**
 * Process a successful streaming response
 * @yields SSE formatted strings
 */
async function* processStreamingResponse(
  resp: Response,
  completion: Completion,
  bearer: string,
  providerType: string,
  apiKeyRecord: ApiKey | null,
  begin: number,
): AsyncGenerator<string, void, unknown> {
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

    // Handle case where no chunks were received
    if (isFirstChunk) {
      throw new Error("No chunk received from upstream");
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
    throw error;
  }
}

// Failover configuration for responses API
const RESPONSES_FAILOVER_CONFIG: Partial<FailoverConfig> = {
  maxProviderAttempts: 3,
  sameProviderRetries: 1,
  retriableStatusCodes: [429, 500, 502, 503, 504],
  timeoutMs: 120000, // 2 minutes for responses
};

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
    async function* ({ body, set, bearer, request, apiKeyRecord }) {
      if (bearer === undefined) {
        set.status = 500;
        yield JSON.stringify({
          object: "error",
          error: { type: "server_error", message: "Internal server error" },
        });
        return;
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
        yield JSON.stringify({
          object: "error",
          error: {
            type: "invalid_request_error",
            message: `Model '${systemName}' not found`,
          },
        });
        return;
      }

      // Filter candidates by target provider (if specified)
      const filteredCandidates = filterCandidates(
        modelsWithProviders as ModelWithProvider[],
        targetProvider,
      );

      if (filteredCandidates.length === 0) {
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

      // Select candidates for failover (weighted random order)
      const candidates = selectMultipleCandidates(
        filteredCandidates,
        RESPONSES_FAILOVER_CONFIG.maxProviderAttempts || 3,
      );

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      // Parse request using Response API adapter
      const requestAdapter = getRequestAdapter("openai-responses");
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
        // For streaming, use failover only for connection establishment
        const result = await executeWithFailover(
          candidates,
          buildRequestForProvider,
          RESPONSES_FAILOVER_CONFIG,
        );

        if (!result.success) {
          // Build completion record for logging
          const completion = buildCompletionRecord(
            body.model,
            result.provider?.model.id ?? candidates[0]?.model.id,
            body.input,
            internalRequest.extraParams,
            extraHeaders,
          );
          completion.status = "failed";

          // Non-retriable HTTP error from upstream - forward the response
          if (result.response) {
            logger.warn("Non-retriable upstream error for streaming request", {
              status: result.response.status,
              provider: result.provider?.provider.name,
            });
            const errorSummary = result.errors
              .map((e) => `${e.providerName}: ${e.error}`)
              .join("; ");
            addCompletions(completion, bearer, {
              level: "error",
              message: `Upstream error (non-retriable): ${errorSummary}`,
              details: {
                type: "completionError",
                data: {
                  type: "upstreamError",
                  msg: result.finalError,
                },
              },
            }).catch(() => {
              logger.error("Failed to log completion after upstream error");
            });

            set.status = result.response.status;
            const responseBody = await result.response.text();
            yield responseBody;
            return;
          }

          // All providers failed with retriable errors or network errors
          logger.error("All providers failed for streaming request", {
            errors: result.errors,
            totalAttempts: result.totalAttempts,
          });
          const errorSummary = result.errors
            .map((e) => `${e.providerName}: ${e.error}`)
            .join("; ");
          addCompletions(completion, bearer, {
            level: "error",
            message: `All providers failed (${result.totalAttempts} attempts): ${errorSummary}`,
            details: {
              type: "completionError",
              data: {
                type: "failoverExhausted",
                msg: result.finalError,
              },
            },
          }).catch(() => {
            logger.error("Failed to log completion after failover exhaustion");
          });

          set.status = 502;
          yield JSON.stringify({
            object: "error",
            error: {
              type: "server_error",
              message: "All upstream providers failed",
            },
          });
          return;
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          yield JSON.stringify({
            object: "error",
            error: { type: "server_error", message: "Internal server error" },
          });
          return;
        }

        // Check if response has body
        if (!result.response.body) {
          set.status = 500;
          yield JSON.stringify({
            object: "error",
            error: { type: "server_error", message: "No body in response" },
          });
          return;
        }

        const providerType = result.provider.provider.type || "openai";
        const completion = buildCompletionRecord(
          body.model,
          result.provider.model.id,
          body.input,
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
          );
        } catch (error) {
          logger.error("Stream processing error", error);
          set.status = 500;
          yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { code: "internal_error", message: "Stream processing error", param: null, help_url: null } })}\n\n`;
        }
      } else {
        // Non-streaming request with failover
        const result = await executeWithFailover(
          candidates,
          buildRequestForProvider,
          RESPONSES_FAILOVER_CONFIG,
        );

        if (!result.success) {
          // Build completion record for logging
          const completion = buildCompletionRecord(
            body.model,
            result.provider?.model.id ?? candidates[0]?.model.id,
            body.input,
            internalRequest.extraParams,
            extraHeaders,
          );
          completion.status = "failed";

          // Non-retriable HTTP error from upstream - forward the response
          if (result.response) {
            logger.warn("Non-retriable upstream error for non-streaming request", {
              status: result.response.status,
              provider: result.provider?.provider.name,
            });
            const errorSummary = result.errors
              .map((e) => `${e.providerName}: ${e.error}`)
              .join("; ");
            addCompletions(completion, bearer, {
              level: "error",
              message: `Upstream error (non-retriable): ${errorSummary}`,
              details: {
                type: "completionError",
                data: {
                  type: "upstreamError",
                  msg: result.finalError,
                },
              },
            }).catch(() => {
              logger.error("Failed to log completion after upstream error");
            });

            set.status = result.response.status;
            const responseBody = await result.response.text();
            yield responseBody;
            return;
          }

          // All providers failed with retriable errors or network errors
          logger.error("All providers failed for non-streaming request", {
            errors: result.errors,
            totalAttempts: result.totalAttempts,
          });
          const errorSummary = result.errors
            .map((e) => `${e.providerName}: ${e.error}`)
            .join("; ");
          addCompletions(completion, bearer, {
            level: "error",
            message: `All providers failed (${result.totalAttempts} attempts): ${errorSummary}`,
            details: {
              type: "completionError",
              data: {
                type: "failoverExhausted",
                msg: result.finalError,
              },
            },
          }).catch(() => {
            logger.error("Failed to log completion after failover exhaustion");
          });

          set.status = 502;
          yield JSON.stringify({
            object: "error",
            error: {
              type: "server_error",
              message: "All upstream providers failed",
            },
          });
          return;
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          yield JSON.stringify({
            object: "error",
            error: { type: "server_error", message: "Internal server error" },
          });
          return;
        }

        const providerType = result.provider.provider.type || "openai";
        const completion = buildCompletionRecord(
          body.model,
          result.provider.model.id,
          body.input,
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
          );
          yield response;
        } catch (error) {
          logger.error("Failed to process response", error);
          completion.status = "failed";
          addCompletions(completion, bearer, {
            level: "error",
            message: `Response processing error: ${String(error)}`,
            details: {
              type: "completionError",
              data: { type: "processingError", msg: String(error) },
            },
          }).catch(() => {
            logger.error("Failed to log completion after processing error");
          });
          set.status = 500;
          yield JSON.stringify({
            object: "error",
            error: { type: "server_error", message: "Failed to process response" },
          });
        }
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

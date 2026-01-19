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
  // Only consume if token counts are valid (not -1 which indicates parsing failure)
  if (apiKeyRecord && completion.promptTokens > 0 && completion.completionTokens > 0) {
    const totalTokens = completion.promptTokens + completion.completionTokens;
    await consumeTokens(apiKeyRecord.id, apiKeyRecord.tpmLimit, totalTokens);
  }

  return JSON.stringify(serialized);
}

/**
 * Process a successful streaming message response
 * @yields string - SSE formatted string chunks
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
      logger.error("Failed to log completion after stream error");
    });
    throw error;
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
        yield JSON.stringify({
          type: "error",
          error: { type: "api_error", message: "Internal server error" },
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
          type: "error",
          error: {
            type: "not_found_error",
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
          type: "error",
          error: {
            type: "not_found_error",
            message: `No available provider for model '${systemName}'`,
          },
        });
        return;
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
        // For streaming, use failover only for connection establishment
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
            yield errorResult.body;
            return;
          }

          set.status = 502;
          yield JSON.stringify({
            type: "error",
            error: {
              type: "api_error",
              message: "All upstream providers failed",
            },
          });
          return;
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          yield JSON.stringify({
            type: "error",
            error: { type: "api_error", message: "Internal server error" },
          });
          return;
        }

        if (!result.response.body) {
          set.status = 500;
          yield JSON.stringify({
            type: "error",
            error: { type: "api_error", message: "No body in response" },
          });
          return;
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
          );
        } catch (error) {
          logger.error("Stream processing error", error);
          set.status = 500;
          yield `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "server_error", message: "Stream processing error" } })}\n\n`;
        }
      } else {
        // Non-streaming request with failover
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
            yield errorResult.body;
            return;
          }

          set.status = 502;
          yield JSON.stringify({
            type: "error",
            error: {
              type: "api_error",
              message: "All upstream providers failed",
            },
          });
          return;
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          yield JSON.stringify({
            type: "error",
            error: { type: "api_error", message: "Internal server error" },
          });
          return;
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
            type: "error",
            error: { type: "api_error", message: "Failed to process response" },
          });
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

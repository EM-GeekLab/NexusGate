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
  ToolChoiceType,
  CachedResponseType,
} from "@/db/schema";
import {
  extractUpstreamHeaders,
  filterCandidates,
  extractContentText,
  extractToolCalls,
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
import {
  checkReqId,
  finalizeReqId,
  recordCacheHit,
  buildInFlightErrorResponse,
  extractReqId,
  type ApiFormat,
} from "@/utils/reqIdHandler";

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

// Content part schema - supports text and image_url
const tContentPart = t.Union([
  t.Object({
    type: t.Literal("text"),
    text: t.String(),
  }),
  t.Object({
    type: t.Literal("image_url"),
    image_url: t.Object({
      url: t.String(),
      detail: t.Optional(t.Union([
        t.Literal("auto"),
        t.Literal("low"),
        t.Literal("high"),
      ])),
    }),
  }),
]);

// Message schema - supports various message types
const tMessage = t.Object(
  {
    role: t.String(),
    content: t.Optional(t.Union([
      t.String(),
      t.Null(),
      t.Array(tContentPart),
    ])),
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
  modelId: number | undefined,
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
 * ReqId context for request deduplication
 */
interface ReqIdContext {
  reqId: string;
  apiKeyId: number;
  preCreatedCompletionId: number;
  apiFormat: ApiFormat;
}

/**
 * Process a successful non-streaming response
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
  reqIdContext?: ReqIdContext,
): Promise<string> {
  // Parse response using upstream adapter
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const internalResponse = await upstreamAdapter.parseResponse(resp);

  // Convert to OpenAI format for response
  const responseAdapter = getResponseAdapter("openai-chat");
  const serialized = responseAdapter.serialize(internalResponse);

  // Update completion record
  completion.promptTokens = internalResponse.usage.inputTokens;
  completion.completionTokens = internalResponse.usage.outputTokens;
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

  // Build cached response for ReqId deduplication
  const cachedResponse: CachedResponseType = {
    body: serialized,
    format: "openai-chat",
  };

  // Check if client disconnected during processing
  if (signal?.aborted) {
    completion.status = "aborted";
    if (reqIdContext) {
      // Use finalizeReqId for ReqId requests
      await finalizeReqId(
        reqIdContext.apiKeyId,
        reqIdContext.reqId,
        reqIdContext.preCreatedCompletionId,
        {
          ...completion,
          cachedResponse,
        },
      );
    } else {
      await addCompletions(completion, bearer, {
        level: "info",
        message: "Client disconnected during non-streaming response",
        details: {
          type: "completionError",
          data: { type: "aborted", msg: "Client disconnected" },
        },
      });
    }
  } else {
    completion.status = "completed";
    if (reqIdContext) {
      // Use finalizeReqId for ReqId requests
      await finalizeReqId(
        reqIdContext.apiKeyId,
        reqIdContext.reqId,
        reqIdContext.preCreatedCompletionId,
        {
          ...completion,
          cachedResponse,
        },
      );
    } else {
      // Use await to ensure database write completes before returning
      await addCompletions(completion, bearer);
    }
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
 * Process a successful streaming response
 * Uses StreamingContext to ensure completion is saved even on client disconnect
 * @yields string chunks in OpenAI format
 */
async function* processStreamingResponse(
  resp: Response,
  completion: Completion,
  bearer: string,
  providerType: string,
  apiKeyRecord: ApiKey | null,
  begin: number,
  signal?: AbortSignal,
  reqIdContext?: ReqIdContext,
): AsyncGenerator<string, void, unknown> {
  // Get adapters
  const upstreamAdapter = getUpstreamAdapter(providerType);
  const responseAdapter = getResponseAdapter("openai-chat");

  logger.debug("parse stream completions response");

  // Build streaming ReqId context if provided
  const streamingReqIdContext = reqIdContext
    ? {
        reqId: reqIdContext.reqId,
        apiKeyId: reqIdContext.apiKeyId,
        preCreatedCompletionId: reqIdContext.preCreatedCompletionId,
        apiFormat: reqIdContext.apiFormat,
        buildCachedResponse: (comp: Completion): CachedResponseType => {
          // For streaming, we build a complete non-streaming response for cache
          return {
            body: {
              id: `chatcmpl-cache-${reqIdContext.preCreatedCompletionId}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: comp.model,
              choices: comp.completion.map((c, i) => ({
                index: i,
                message: {
                  role: c.role || "assistant",
                  content: c.content,
                  tool_calls: c.tool_calls,
                },
                finish_reason: c.tool_calls?.length ? "tool_calls" : "stop",
              })),
              usage: {
                prompt_tokens: comp.promptTokens,
                completion_tokens: comp.completionTokens,
                total_tokens: comp.promptTokens + comp.completionTokens,
              },
            },
            format: "openai-chat",
          };
        },
      }
    : undefined;

  // Create streaming context with abort handling
  const ctx = new StreamingContext(completion, bearer, apiKeyRecord, begin, signal, streamingReqIdContext);

  // Track whether we've logged the client abort (to avoid duplicate logs)
  let loggedAbort = false;

  try {
    const chunks = upstreamAdapter.parseStreamResponse(resp);

    for await (const chunk of chunks) {
      // Check if client has disconnected (but continue processing to collect all data)
      const clientAborted = ctx.isAborted();

      // Log client disconnect once when first detected
      if (clientAborted && !loggedAbort) {
        loggedAbort = true;
        logger.info("Client disconnected during streaming, continuing to collect upstream data");
      }

      ctx.recordTTFT();

      // Collect content for completion record (always, even if client aborted)
      if (chunk.type === "content_block_start") {
        // Track new tool call block
        if (chunk.contentBlock?.type === "tool_use") {
          const toolId = chunk.contentBlock.id;
          const index = chunk.index ?? ctx.nextToolCallIndex++;
          ctx.indexToIdMap.set(index, toolId);
          ctx.streamToolCalls.set(toolId, {
            id: toolId,
            type: "function",
            function: {
              name: chunk.contentBlock.name,
              arguments: "",
            },
          });
          ctx.toolCallArguments.set(toolId, []);
        }
      } else if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
          ctx.textParts.push(chunk.delta.text);
        } else if (
          chunk.delta?.type === "thinking_delta" &&
          chunk.delta.thinking
        ) {
          ctx.thinkingParts.push(chunk.delta.thinking);
        } else if (chunk.delta?.type === "input_json_delta" && chunk.delta.partialJson) {
          // Collect tool call arguments - lookup by index to get tool ID
          // Skip if index is missing to avoid data corruption
          if (chunk.index !== undefined) {
            const toolId = ctx.indexToIdMap.get(chunk.index);
            if (toolId) {
              const args = ctx.toolCallArguments.get(toolId);
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
          const toolId = ctx.indexToIdMap.get(chunk.index);
          if (toolId) {
            const toolCall = ctx.streamToolCalls.get(toolId);
            const args = ctx.toolCallArguments.get(toolId);
            if (toolCall && args) {
              toolCall.function.arguments = args.join("");
            }
          }
        }
      }

      // Collect usage info
      if (chunk.usage) {
        ctx.inputTokens = chunk.usage.inputTokens;
        ctx.outputTokens = chunk.usage.outputTokens;
      }

      // Only yield to client if not aborted (client is still listening)
      if (!clientAborted) {
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

// Failover configuration for completions API
const COMPLETIONS_FAILOVER_CONFIG: Partial<FailoverConfig> = {
  maxProviderAttempts: 3,
  sameProviderRetries: 1,
  retriableStatusCodes: [429, 500, 502, 503, 504],
  timeoutMs: 120000, // 2 minutes for completions
};

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
    async function ({ body, set, bearer, request, apiKeyRecord }) {
      if (bearer === undefined) {
        set.status = 500;
        return { error: "Internal server error" };
      }

      const reqHeaders = request.headers;
      const begin = Date.now();

      // Extract ReqId for request deduplication
      const reqId = extractReqId(reqHeaders);
      const apiFormat: ApiFormat = "openai-chat";

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
        return {
          error: {
            message: `Model '${systemName}' not found`,
            type: "invalid_request_error",
            code: "model_not_found",
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
          error: {
            message: `No available provider for model '${systemName}'`,
            type: "invalid_request_error",
            code: "no_provider",
          },
        };
      }

      // Select candidates for failover (weighted random order)
      const candidates = selectMultipleCandidates(
        filteredCandidates,
        COMPLETIONS_FAILOVER_CONFIG.maxProviderAttempts || 3,
      );

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      // Check ReqId for deduplication (if provided)
      const isStream = body.stream === true;
      const reqIdResult = await checkReqId(reqId, {
        apiKeyId: apiKeyRecord.id,
        model: body.model,
        modelId: candidates[0]?.model.id,
        prompt: {
          messages: body.messages as CompletionsMessageType[],
          tools: body.tools as ToolDefinitionType[] | undefined,
          tool_choice: body.tool_choice as ToolChoiceType | undefined,
          extraHeaders,
        },
        apiFormat,
        endpoint: "/v1/chat/completions",
        isStream,
      });

      // Handle cache hit - return cached response
      if (reqIdResult.type === "cache_hit") {
        const sourceCompletion = reqIdResult.completion;
        // Record the cache hit
        await recordCacheHit(sourceCompletion, apiKeyRecord.id);

        // Return cached response
        if (sourceCompletion.cachedResponse) {
          return sourceCompletion.cachedResponse.body as Record<string, unknown>;
        }

        // Fallback: reconstruct response from completion data
        const reconstructed = {
          id: `chatcmpl-cache-${sourceCompletion.id}`,
          object: "chat.completion",
          created: Math.floor(sourceCompletion.createdAt.getTime() / 1000),
          model: sourceCompletion.model,
          choices: sourceCompletion.completion.map((c, i) => ({
            index: i,
            message: {
              role: c.role || "assistant",
              content: c.content,
              tool_calls: c.tool_calls,
            },
            finish_reason: c.tool_calls?.length ? "tool_calls" : "stop",
          })),
          usage: {
            prompt_tokens: sourceCompletion.promptTokens,
            completion_tokens: sourceCompletion.completionTokens,
            total_tokens: sourceCompletion.promptTokens + sourceCompletion.completionTokens,
          },
        };
        return reconstructed;
      }

      // Handle in-flight - return 409 Conflict
      if (reqIdResult.type === "in_flight") {
        set.status = 409;
        set.headers["Retry-After"] = String(reqIdResult.retryAfter);
        return buildInFlightErrorResponse(
          reqId!,
          reqIdResult.inFlight,
          reqIdResult.retryAfter,
          apiFormat,
        );
      }

      // For new_request, we have a pre-created completionId
      const preCreatedCompletionId = reqIdResult.type === "new_request"
        ? reqIdResult.completionId
        : null;

      // Parse request using adapter
      const requestAdapter = getRequestAdapter("openai-chat");
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
        // Streaming request - return an async generator
        if (body.n && body.n > 1) {
          set.status = 400;
          return { error: "Stream completions with n > 1 is not supported" };
        }

        // For streaming, use failover only for connection establishment
        const result = await executeWithFailover(
          candidates,
          buildRequestForProvider,
          COMPLETIONS_FAILOVER_CONFIG,
        );

        if (!result.success) {
          const completion = buildCompletionRecord(
            body.model,
            result.provider?.model.id ?? candidates[0]?.model.id,
            body.messages as CompletionsMessageType[],
            body.tools as ToolDefinitionType[] | undefined,
            body.tool_choice as ToolChoiceType | undefined,
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
            error: {
              message: "All upstream providers failed",
              type: "upstream_error",
              code: "all_providers_failed",
            },
          };
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          return { error: "Internal server error" };
        }

        if (!result.response.body) {
          set.status = 500;
          return { error: "No body in response" };
        }

        const providerType = result.provider.provider.type || "openai";
        const completion = buildCompletionRecord(
          body.model,
          result.provider.model.id,
          body.messages as CompletionsMessageType[],
          body.tools as ToolDefinitionType[] | undefined,
          body.tool_choice as ToolChoiceType | undefined,
          internalRequest.extraParams,
          extraHeaders,
        );

        // Build ReqId context if we have a pre-created completion
        const streamReqIdContext = preCreatedCompletionId && reqId
          ? {
              reqId,
              apiKeyId: apiKeyRecord.id,
              preCreatedCompletionId,
              apiFormat,
            }
          : undefined;

        // Return an async generator for streaming
        const streamResponse = result.response;
        const streamSignal = request.signal;
        return (async function* () {
          try {
            yield* processStreamingResponse(
              streamResponse,
              completion,
              bearer,
              providerType,
              apiKeyRecord ?? null,
              begin,
              streamSignal,
              streamReqIdContext,
            );
          } catch (error) {
            // Don't log error if it's due to client abort
            if (!streamSignal.aborted) {
              logger.error("Stream processing error", error);
              set.status = 500;
              yield JSON.stringify({ error: "Stream processing error" });
            }
          }
        })();
      } else {
        // Non-streaming request - return JSON response directly
        const result = await executeWithFailover(
          candidates,
          buildRequestForProvider,
          COMPLETIONS_FAILOVER_CONFIG,
        );

        if (!result.success) {
          const completion = buildCompletionRecord(
            body.model,
            result.provider?.model.id ?? candidates[0]?.model.id,
            body.messages as CompletionsMessageType[],
            body.tools as ToolDefinitionType[] | undefined,
            body.tool_choice as ToolChoiceType | undefined,
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
            error: {
              message: "All upstream providers failed",
              type: "upstream_error",
              code: "all_providers_failed",
            },
          };
        }

        if (!result.response || !result.provider) {
          set.status = 500;
          return { error: "Internal server error" };
        }

        const providerType = result.provider.provider.type || "openai";
        const completion = buildCompletionRecord(
          body.model,
          result.provider.model.id,
          body.messages as CompletionsMessageType[],
          body.tools as ToolDefinitionType[] | undefined,
          body.tool_choice as ToolChoiceType | undefined,
          internalRequest.extraParams,
          extraHeaders,
        );

        // Build ReqId context if we have a pre-created completion
        const nonStreamReqIdContext = preCreatedCompletionId && reqId
          ? {
              reqId,
              apiKeyId: apiKeyRecord.id,
              preCreatedCompletionId,
              apiFormat,
            }
          : undefined;

        try {
          const response = await processNonStreamingResponse(
            result.response,
            completion,
            bearer,
            providerType,
            apiKeyRecord ?? null,
            begin,
            request.signal,
            nonStreamReqIdContext,
          );
          // Return parsed JSON object for proper content-type
          return JSON.parse(response) as Record<string, unknown>;
        } catch (error) {
          // Handle error based on whether client aborted
          const errorMsg = error instanceof Error ? error.message : String(error);
          // Only save if completion wasn't already saved in processNonStreamingResponse
          const alreadySaved = completion.status !== "pending";
          if (request.signal.aborted) {
            // Client disconnected - save as aborted (if not already saved)
            if (!alreadySaved) {
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
            }
            // Return nothing for aborted requests
            return;
          } else {
            logger.error("Failed to process response", error);
            if (!alreadySaved) {
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
            }
            set.status = 500;
            return { error: "Failed to process response" };
          }
        }
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

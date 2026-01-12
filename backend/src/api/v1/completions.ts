import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessage,
} from "openai/resources";
import { consola } from "consola";
import { Elysia, t } from "elysia";
import { getModelsWithProviderBySystemName } from "@/db";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { rateLimitPlugin } from "@/plugins/rateLimitPlugin";
import { addCompletions, type Completion } from "@/utils/completions";
import { parseSse } from "@/utils/sse";

const logger = consola.withTag("completionsApi");

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
    stream_options: t.Optional(t.Unknown()),
  },
  { additionalProperties: true },
);

// Header prefix for NexusGate-specific headers (e.g., X-NexusGate-Provider)
const NEXUSGATE_HEADER_PREFIX = "x-nexusgate-";
// Header name for provider selection
const PROVIDER_HEADER = "x-nexusgate-provider";

/**
 * Extract extra body fields (any fields not in the known schema)
 */
function extractExtraBody(
  body: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const knownFields = new Set([
    "messages",
    "model",
    "n",
    "stream",
    "stream_options",
  ]);
  const extra: Record<string, unknown> = {};
  let hasExtra = false;

  for (const [key, value] of Object.entries(body)) {
    if (!knownFields.has(key)) {
      extra[key] = value;
      hasExtra = true;
    }
  }

  return hasExtra ? extra : undefined;
}

// Headers that should NOT be forwarded to upstream
const EXCLUDED_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "content-type",
  "authorization",
  "accept",
  "accept-encoding",
  "accept-language",
  "user-agent",
  "origin",
  "referer",
  "cookie",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
]);

/**
 * Extract headers to be forwarded to upstream
 * All headers are forwarded EXCEPT:
 * - Headers starting with "x-nexusgate-" (NexusGate-specific headers)
 * - Standard HTTP headers (host, authorization, content-type, etc.)
 */
function extractUpstreamHeaders(
  headers: Headers,
): Record<string, string> | undefined {
  const extra: Record<string, string> = {};
  let hasExtra = false;

  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Skip NexusGate-specific headers and excluded standard headers
    if (
      lowerKey.startsWith(NEXUSGATE_HEADER_PREFIX) ||
      EXCLUDED_HEADERS.has(lowerKey)
    ) {
      return;
    }
    // Forward all other headers as-is
    extra[key] = value;
    hasExtra = true;
  });

  return hasExtra ? extra : undefined;
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

      // Extract provider from header (X-NexusGate-Provider)
      // Support URL-encoded values for non-ASCII characters
      const rawProviderHeader = reqHeaders.get(PROVIDER_HEADER);
      const providerFromHeader = rawProviderHeader
        ? decodeURIComponent(rawProviderHeader)
        : null;

      // Parse model@provider format
      const modelMatch = body.model.match(/^(\S+)@(\S+)$/);
      const systemName = modelMatch ? modelMatch[1]! : body.model;

      // Determine target provider: header takes precedence over model@provider format
      // Note: empty string should be treated as no provider specified
      const targetProvider = providerFromHeader || modelMatch?.[2];

      // Find models with provider info using the new architecture
      const modelsWithProviders = await getModelsWithProviderBySystemName(
        systemName,
        "chat",
      );

      // First check if the model exists at all
      if (modelsWithProviders.length === 0) {
        // Model doesn't exist - return 404 error
        // In async generator, use set.status to set HTTP status code
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

      // If specific provider requested, try to filter to that provider
      // If the provider doesn't offer this model, fall back to any available provider
      let candidates = modelsWithProviders;
      if (targetProvider) {
        const filtered = modelsWithProviders.filter(
          (mp) => mp.provider.name === targetProvider,
        );
        if (filtered.length > 0) {
          candidates = filtered;
        } else {
          // Provider doesn't offer this model, ignore the provider header and use any available
          logger.warn(
            `Provider '${targetProvider}' does not offer model '${systemName}', falling back to available providers`,
          );
        }
      }

      // TODO: implement load balancing
      const selected = candidates[0]!;
      const { model: modelConfig, provider } = selected;

      // Extract extra body fields for passthrough
      const extraBody = extractExtraBody(body as Record<string, unknown>);

      // Extract extra headers for passthrough
      const extraHeaders = extractUpstreamHeaders(reqHeaders);

      const requestedModel = body.model;
      const upstreamEndpoint = `${provider.baseUrl}/chat/completions`;
      body.model = modelConfig.remoteId ?? modelConfig.systemName;

      const reqInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey === null
            ? undefined
            : { Authorization: `Bearer ${provider.apiKey}` }),
          // Forward extra headers to upstream
          ...extraHeaders,
        },
      };

      logger.debug("extra data", { extraBody, extraHeaders });

      const completion: Completion = {
        model: requestedModel,
        upstreamId: undefined,
        modelId: modelConfig.id, // Reference to the ModelsTable
        prompt: {
          messages: body.messages.map((m) => {
            return {
              role: m.role as string,
              content: m.content as string,
            };
          }),
          n: body.n,
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

      switch (!!body.stream) {
        case false: {
          logger.debug("proxying completions request to upstream", {
            bearer,
            upstreamEndpoint,
          });
          const begin = Date.now();
          const [resp, err] = await fetch(upstreamEndpoint, {
            body: JSON.stringify(body),
            ...reqInit,
          })
            .then((r) => [r, null] as [Response, null])
            .catch((err) => {
              logger.error("fetch error", err);
              return [null, err] as [null, Error];
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
                data: {
                  type: "fetchError",
                  msg: err.toString(),
                },
              },
            });
            set.status = 500;
            yield JSON.stringify({ error: "Failed to fetch upstream" });
            return;
          }
          if (!resp.ok) {
            const msg = await resp.text();
            logger.error("upstream error", {
              status: resp.status,
              msg,
            });
            completion.status = "failed";
            addCompletions(completion, bearer, {
              level: "error",
              message: `Upstream error: ${msg}`,
              details: {
                type: "completionError",
                data: {
                  type: "upstreamError",
                  status: resp.status,
                  msg,
                },
              },
            });
            set.status = resp.status;
            yield msg;
            return;
          }
          const respText = await resp.text();
          const respJson = JSON.parse(respText) as ChatCompletion;

          completion.promptTokens = respJson.usage?.prompt_tokens ?? -1;
          completion.completionTokens = respJson.usage?.completion_tokens ?? -1;
          completion.status = "completed";
          completion.ttft = Date.now() - begin;
          completion.duration = Date.now() - begin;
          completion.completion = respJson.choices.map((c) => {
            const msg = c.message as ChatCompletionMessage & {
              reasoning_content?: string;
            };
            return {
              role: c.message.role as string,
              content:
                (msg.reasoning_content
                  ? `<think>${msg.reasoning_content}</think>\n`
                  : "") + (msg.content ?? undefined),
            };
          });
          addCompletions(completion, bearer);

          yield respText;
          return;
        }

        case true: {
          if (!!body.n && body.n > 1) {
            set.status = 400;
            yield JSON.stringify({
              error: "Stream completions with n > 1 is not supported",
            });
            return;
          }

          // always set include_usage to true
          body.stream_options = {
            include_usage: true,
          };

          logger.debug("proxying stream completions request to upstream", {
            userKey: bearer,
            upstreamEndpoint,
            stream: true,
          });
          const begin = Date.now();
          const [resp, err] = await fetch(upstreamEndpoint, {
            body: JSON.stringify(body),
            ...reqInit,
          })
            .then((r) => [r, null] as [Response, null])
            .catch((err) => {
              logger.error("fetch error", err);
              return [null, err] as [null, Error];
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
                data: {
                  type: "fetchError",
                  msg: err.toString(),
                },
              },
            });
            set.status = 500;
            yield JSON.stringify({ error: "Failed to fetch upstream" });
            return;
          }
          if (!resp.ok) {
            const msg = await resp.text();
            logger.error("upstream error", {
              status: resp.status,
              msg,
            });
            completion.status = "failed";
            addCompletions(completion, bearer, {
              level: "error",
              message: `Upstream error: ${msg}`,
              details: {
                type: "completionError",
                data: {
                  type: "upstreamError",
                  status: resp.status,
                  msg,
                },
              },
            });
            set.status = resp.status;
            yield msg;
            return;
          }
          if (!resp.body) {
            logger.error("upstream error", {
              status: resp.status,
              msg: "No body",
            });
            completion.status = "failed";
            addCompletions(completion, bearer, {
              level: "error",
              message: "No body",
              details: {
                type: "completionError",
                data: {
                  type: "upstreamError",
                  status: resp.status,
                  msg: "No body",
                },
              },
            });
            set.status = 500;
            yield JSON.stringify({ error: "No body" });
            return;
          }

          logger.debug("parse stream completions response");
          const chunks: AsyncGenerator<string> = parseSse(resp.body);

          let ttft = -1;
          let isFirstChunk = true;
          const partials: string[] = [];
          const extendedTags: { think?: string[] } = {};
          let finished = false;
          for await (const chunk of chunks) {
            if (isFirstChunk) {
              // log the time to first chunk as ttft
              isFirstChunk = false;
              ttft = Date.now() - begin;
            }
            if (chunk.startsWith("[DONE]")) {
              // Workaround: In most cases, upstream will return a message that is a valid json, and has length of choices = 0,
              //   which will be handled in below. However, in some cases, the last message is '[DONE]', and no usage is returned.
              //   In this case, we will end this completion.
              completion.completion = [
                {
                  role: undefined,
                  content:
                    (extendedTags.think
                      ? `<think>${extendedTags.think.join("")}</think>\n`
                      : "") + partials.join(""),
                },
              ];
              completion.status = "completed";
              completion.ttft = ttft;
              completion.duration = Date.now() - begin;
              addCompletions(completion, bearer);
              yield `data: ${chunk}\n\n`;
              break;
            }

            let data: ChatCompletionChunk | undefined = undefined;
            try {
              data = JSON.parse(chunk) as ChatCompletionChunk;
            } catch (e) {
              logger.error("Error occured when parsing json", e);
            }
            if (data === undefined) {
              // Unreachable, unless json parsing failed indicating a malformed response
              logger.error("upstream error", {
                status: resp.status,
                msg: "Invalid JSON",
                chunk,
              });
              set.status = 500;
              yield JSON.stringify({ error: "Invalid JSON" });
              return;
            }
            if (data.usage) {
              completion.promptTokens = data.usage.prompt_tokens;
              completion.completionTokens = data.usage.completion_tokens;
            }
            if (finished) {
              yield `data: ${chunk}\n\n`;
              continue;
            }
            if (
              data.choices.length === 1 &&
              data.choices[0]!.finish_reason !== "stop"
            ) {
              // If there is only one choice, regular chunk
              const delta = data.choices[0]!.delta;
              const content = delta.content;
              if (content) {
                partials.push(content);
              } else {
                const delta_ = delta as unknown as {
                  reasoning_content?: string;
                };
                if (delta_.reasoning_content) {
                  // workaround: api.deepseek.com returns reasoning_content in delta
                  if (extendedTags.think === undefined) {
                    extendedTags.think = [];
                  }
                  extendedTags.think.push(delta_.reasoning_content);
                }
              }
              yield `data: ${chunk}\n\n`;
              continue;
            }
            // work around: api.deepseek.com returns choices with empty content and finish_reason = "stop" in usage response
            if (
              data.choices.length === 0 ||
              (data.choices.length === 1 &&
                data.choices[0]!.finish_reason === "stop")
            ) {
              // Assuse that is the last chunk
              console.log(data.usage);
              completion.completion = [
                {
                  role: undefined,
                  content:
                    (extendedTags.think
                      ? `<think>${extendedTags.think.join("")}</think>\n`
                      : "") + partials.join(""),
                },
              ];
              completion.status = "completed";
              completion.ttft = ttft;
              completion.duration = Date.now() - begin;
              // addCompletions(completion, bearer);
              yield `data: ${chunk}\n\n`;
              finished = true;
              continue;
            }
            // Unreachable, unless upstream returned a malformed response
            set.status = 500;
            yield JSON.stringify({ error: "Unexpected chunk" });
            return;
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
            });
            set.status = 500;
            yield JSON.stringify({ error: "No chunk received" });
            return;
          }
        }
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

import { consola } from "consola";
import { Elysia, t } from "elysia";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessage,
} from "openai/resources";
import { addCompletions, type Completion } from "@/utils/completions";
import { parseSse } from "@/utils/sse";
import { selectUpstream } from "@/utils/upstream";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { rateLimitPlugin } from "@/plugins/rateLimitPlugin";

const logger = consola.withTag("completionsApi");

// loose validation, only check required fields
const tChatCompletionCreate = t.Object(
  {
    messages: t.Array(t.Object({
      role: t.String(),
      content: t.String(),
    })),
    model: t.String(),
    n: t.Optional(t.Number()),
    stream: t.Optional(t.Boolean()),
    stream_options: t.Optional(t.Unknown()),
  },
  { additionalProperties: true },
);

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
    async function* ({ body, status, bearer }) {
      if (bearer === undefined) {
        return status(500);
      }
      const upstream = await selectUpstream(body.model);
      if (!upstream) {
        return status(404, "Model not found");
      }
      const requestedModel = body.model;
      const upstreamEndpoint = `${upstream.url}/chat/completions`;
      body.model = upstream.upstreamModel ?? upstream.model;

      const reqInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(upstream.apiKey === null
            ? undefined
            : { Authorization: `Bearer ${upstream.apiKey}` }),
        },
      };

      const completion: Completion = {
        model: requestedModel,
        upstreamId: upstream.id,
        prompt: {
          messages: body.messages.map((m) => {
            return {
              role: m.role as string,
              content: m.content as string,
            };
          }),
          n: body.n,
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
            return status(500, "Failed to fetch upstream");
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
            return status(resp.status, msg);
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

          return respText;
        }

        case true: {
          if (!!body.n && body.n > 1) {
            return status(
              400,
              "Stream completions with n > 1 is not supported",
            );
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
            return status(500, "Failed to fetch upstream");
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
            return status(resp.status, msg);
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
            return status(500, "No body");
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
              return status(500, "Invalid JSON");
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
            return status(500, "Unexpected chunk");
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
            return status(500, "No chunk received");
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
  )
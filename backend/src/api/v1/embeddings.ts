import { consola } from "consola";
import { Elysia, t } from "elysia";
import type { CreateEmbeddingResponse } from "openai/resources";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { rateLimitPlugin } from "@/plugins/rateLimitPlugin";
import {
  selectModel,
  buildUpstreamUrl,
  getRemoteModelId,
} from "@/utils/model";
import { addEmbedding, type EmbeddingRecord } from "@/utils/embeddings";

const logger = consola.withTag("embeddingsApi");

// OpenAI-compatible embeddings request schema
const tEmbeddingCreate = t.Object(
  {
    input: t.Union([t.String(), t.Array(t.String())]),
    model: t.String(),
    dimensions: t.Optional(t.Number()),
    encoding_format: t.Optional(t.Union([t.Literal("float"), t.Literal("base64")])),
    user: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const embeddingsApi = new Elysia({
  prefix: "/embeddings",
  detail: {
    security: [{ apiKey: [] }],
  },
})
  .use(apiKeyPlugin)
  .use(rateLimitPlugin)
  .post(
    "/",
    async ({ body, status, bearer }) => {
      if (bearer === undefined) {
        return status(500);
      }

      // Select model with embedding type filter
      const selected = await selectModel(body.model, "embedding");
      if (!selected) {
        return status(404, "Embedding model not found");
      }

      const { model, provider } = selected;
      const requestedModel = body.model;
      const upstreamEndpoint = buildUpstreamUrl(provider, "/embeddings");

      // Replace model with upstream model ID
      body.model = getRemoteModelId(model);

      const reqInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey === null
            ? undefined
            : { Authorization: `Bearer ${provider.apiKey}` }),
        },
        body: JSON.stringify(body),
      };

      // Initialize embedding record
      const embeddingRecord: EmbeddingRecord = {
        model: requestedModel,
        modelId: model.id,
        input: body.input,
        inputTokens: -1,
        embedding: [],
        dimensions: body.dimensions ?? 0,
        status: "pending",
        duration: -1,
      };

      logger.debug("proxying embeddings request to upstream", {
        bearer,
        upstreamEndpoint,
        model: body.model,
      });

      const begin = Date.now();

      // Make request to upstream
      const [resp, fetchError] = await fetch(upstreamEndpoint, reqInit)
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
        embeddingRecord.status = "failed";
        embeddingRecord.duration = Date.now() - begin;
        addEmbedding(embeddingRecord, bearer, {
          level: "error",
          message: `Failed to fetch upstream. ${fetchError.toString()}`,
          details: {
            type: "embeddingError",
            data: {
              type: "fetchError",
              msg: fetchError.toString(),
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
        embeddingRecord.status = "failed";
        embeddingRecord.duration = Date.now() - begin;
        addEmbedding(embeddingRecord, bearer, {
          level: "error",
          message: `Upstream error: ${msg}`,
          details: {
            type: "embeddingError",
            data: {
              type: "upstreamError",
              status: resp.status,
              msg,
            },
          },
        });
        return status(resp.status, msg);
      }

      // Parse response
      const respText = await resp.text();
      let respJson: CreateEmbeddingResponse;
      try {
        respJson = JSON.parse(respText) as CreateEmbeddingResponse;
      } catch (e) {
        logger.error("Failed to parse response JSON", e);
        embeddingRecord.status = "failed";
        embeddingRecord.duration = Date.now() - begin;
        addEmbedding(embeddingRecord, bearer, {
          level: "error",
          message: "Failed to parse upstream response",
          details: {
            type: "embeddingError",
            data: {
              type: "parseError",
              msg: e instanceof Error ? e.message : "Unknown parse error",
            },
          },
        });
        return status(500, "Failed to parse upstream response");
      }

      // Extract embeddings and record
      const embeddings = respJson.data.map((d) => d.embedding as number[]);
      const dimensions = embeddings.length > 0 ? embeddings[0].length : 0;

      embeddingRecord.inputTokens = respJson.usage?.prompt_tokens ?? -1;
      embeddingRecord.embedding = embeddings;
      embeddingRecord.dimensions = dimensions;
      embeddingRecord.status = "completed";
      embeddingRecord.duration = Date.now() - begin;

      addEmbedding(embeddingRecord, bearer);

      logger.debug("embeddings request completed", {
        inputTokens: embeddingRecord.inputTokens,
        dimensions,
        count: embeddings.length,
        duration: embeddingRecord.duration,
      });

      return respText;
    },
    {
      body: tEmbeddingCreate,
      checkApiKey: true,
      rateLimit: {
        identifier: (body) => (body as { model: string }).model,
      },
    },
  );

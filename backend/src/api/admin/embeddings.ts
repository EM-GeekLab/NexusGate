import { Elysia, t } from "elysia";
import {
  deleteEmbedding,
  findEmbedding,
  listEmbeddings,
  sumEmbeddingTokenUsage,
} from "@/db";

export const adminEmbeddings = new Elysia({ prefix: "/embeddings" })
  // List embeddings (paginated)
  .get(
    "/",
    async ({ query }) => {
      const { offset, limit, apiKeyId, modelId } = query;
      const result = await listEmbeddings(
        offset ?? 0,
        limit ?? 20,
        apiKeyId,
        modelId,
      );
      return result;
    },
    {
      query: t.Object({
        offset: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
        apiKeyId: t.Optional(t.Numeric()),
        modelId: t.Optional(t.Numeric()),
      }),
      detail: {
        description: "List embedding requests (paginated)",
        tags: ["Admin - Embeddings"],
      },
    },
  )
  // Get single embedding
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const embedding = await findEmbedding(id);
      if (!embedding) {
        return status(404, { error: "Embedding not found" });
      }
      return embedding;
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Get an embedding request by ID",
        tags: ["Admin - Embeddings"],
      },
    },
  )
  // Delete embedding
  .delete(
    "/:id",
    async ({ params: { id }, status }) => {
      const embedding = await deleteEmbedding(id);
      if (!embedding) {
        return status(404, { error: "Embedding not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Delete an embedding request (soft delete)",
        tags: ["Admin - Embeddings"],
      },
    },
  )
  // Get embedding token usage statistics
  .get(
    "/usage",
    async ({ query }) => {
      const { apiKeyId } = query;
      const usage = await sumEmbeddingTokenUsage(apiKeyId);
      return {
        total_input_tokens: usage?.total_input_tokens ?? 0,
      };
    },
    {
      query: t.Object({
        apiKeyId: t.Optional(t.Numeric()),
      }),
      detail: {
        description: "Get embedding token usage statistics",
        tags: ["Admin - Embeddings"],
      },
    },
  );

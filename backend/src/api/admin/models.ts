import { Elysia, t } from "elysia";
import {
  deleteModel,
  findModel,
  findProvider,
  getModelsWithProviderBySystemName,
  insertModel,
  listModels,
  listUniqueSystemNames,
  updateModel,
  updateModelWeights,
} from "@/db";
import type { ModelTypeEnumType } from "@/db/schema";

export const adminModels = new Elysia({ prefix: "/models" })
  // List all models (global model registry)
  .get(
    "/",
    async ({ query }) => {
      const { modelType } = query;
      const models = await listModels(modelType as ModelTypeEnumType | undefined);
      return models;
    },
    {
      query: t.Object({
        modelType: t.Optional(t.Union([t.Literal("chat"), t.Literal("embedding")])),
      }),
      detail: {
        description: "List all models (optionally filtered by type)",
        tags: ["Admin - Models"],
      },
    },
  )
  // Get unique system names (for global model registry view)
  .get(
    "/system-names",
    async ({ query }) => {
      const { modelType } = query;
      const names = await listUniqueSystemNames(modelType as ModelTypeEnumType | undefined);
      return names;
    },
    {
      query: t.Object({
        modelType: t.Optional(t.Union([t.Literal("chat"), t.Literal("embedding")])),
      }),
      detail: {
        description: "List unique system names for the global model registry",
        tags: ["Admin - Models"],
      },
    },
  )
  // Get models by system name (for load balancing view)
  .get(
    "/by-system-name/:systemName",
    async ({ params: { systemName }, query }) => {
      const { modelType } = query;
      const models = await getModelsWithProviderBySystemName(
        systemName,
        modelType as ModelTypeEnumType | undefined,
      );
      return models;
    },
    {
      params: t.Object({
        systemName: t.String(),
      }),
      query: t.Object({
        modelType: t.Optional(t.Union([t.Literal("chat"), t.Literal("embedding")])),
      }),
      detail: {
        description: "Get all models with a specific system name (with provider info)",
        tags: ["Admin - Models"],
      },
    },
  )
  // Update load balancing weights for models with same system name
  .put(
    "/by-system-name/:systemName/weights",
    async ({ params: { systemName }, body }) => {
      await updateModelWeights(body.weights);
      // Return updated models
      const models = await getModelsWithProviderBySystemName(systemName);
      return models;
    },
    {
      params: t.Object({
        systemName: t.String(),
      }),
      body: t.Object({
        weights: t.Array(
          t.Object({
            modelId: t.Number(),
            weight: t.Number({ minimum: 0 }),
          }),
        ),
      }),
      detail: {
        description: "Update load balancing weights for models with same system name",
        tags: ["Admin - Models"],
      },
    },
  )
  // Get single model
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const model = await findModel(id);
      if (!model) {
        return status(404, { error: "Model not found" });
      }
      return model;
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Get a model by ID",
        tags: ["Admin - Models"],
      },
    },
  )
  // Create model
  .post(
    "/",
    async ({ body, status }) => {
      // Verify provider exists
      const provider = await findProvider(body.providerId);
      if (!provider) {
        return status(404, { error: "Provider not found" });
      }

      const model = await insertModel(body);
      if (!model) {
        return status(409, { error: "Model with this system name already exists for this provider" });
      }
      return model;
    },
    {
      body: t.Object({
        providerId: t.Number(),
        systemName: t.String({ minLength: 1, maxLength: 63 }),
        remoteId: t.Optional(t.String({ maxLength: 63 })),
        modelType: t.Optional(t.Union([t.Literal("chat"), t.Literal("embedding")])),
        contextLength: t.Optional(t.Number()),
        inputPrice: t.Optional(t.Number()),
        outputPrice: t.Optional(t.Number()),
        weight: t.Optional(t.Number({ minimum: 0, default: 1 })),
        comment: t.Optional(t.String()),
      }),
      detail: {
        description: "Create a new model configuration",
        tags: ["Admin - Models"],
      },
    },
  )
  // Update model
  .put(
    "/:id",
    async ({ params: { id }, body, status }) => {
      const existing = await findModel(id);
      if (!existing) {
        return status(404, { error: "Model not found" });
      }
      const model = await updateModel(id, body);
      return model;
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      body: t.Object({
        systemName: t.Optional(t.String({ minLength: 1, maxLength: 63 })),
        remoteId: t.Optional(t.String({ maxLength: 63 })),
        modelType: t.Optional(t.Union([t.Literal("chat"), t.Literal("embedding")])),
        contextLength: t.Optional(t.Number()),
        inputPrice: t.Optional(t.Number()),
        outputPrice: t.Optional(t.Number()),
        weight: t.Optional(t.Number({ minimum: 0 })),
        comment: t.Optional(t.String()),
      }),
      detail: {
        description: "Update a model configuration",
        tags: ["Admin - Models"],
      },
    },
  )
  // Delete model
  .delete(
    "/:id",
    async ({ params: { id }, status }) => {
      const model = await deleteModel(id);
      if (!model) {
        return status(404, { error: "Model not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Delete a model configuration (soft delete)",
        tags: ["Admin - Models"],
      },
    },
  );

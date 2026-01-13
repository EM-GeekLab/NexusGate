import { Elysia, t } from "elysia";
import OpenAI from "openai";
import {
  deleteProvider,
  findProvider,
  insertProvider,
  listProviders,
  updateProvider,
  listModelsByProvider,
} from "@/db";
import type { ProviderTypeEnumType } from "@/db/schema";

// Valid provider types
const PROVIDER_TYPES: ProviderTypeEnumType[] = [
  "openai",
  "openai-responses",
  "anthropic",
  "azure",
  "ollama",
];

export const adminProviders = new Elysia({ prefix: "/providers" })
  // List all providers
  .get(
    "/",
    async () => {
      const providers = await listProviders();
      return providers;
    },
    {
      detail: {
        description: "List all providers",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Get single provider
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const provider = await findProvider(id);
      if (!provider) {
        return status(404, { error: "Provider not found" });
      }
      return provider;
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Get a provider by ID",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Create provider
  .post(
    "/",
    async ({ body, status }) => {
      const provider = await insertProvider(body);
      if (!provider) {
        return status(409, { error: "Provider with this name already exists" });
      }
      return provider;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 63 }),
        type: t.Optional(
          t.Union([
            t.Literal("openai"),
            t.Literal("openai-responses"),
            t.Literal("anthropic"),
            t.Literal("azure"),
            t.Literal("ollama"),
          ]),
        ),
        baseUrl: t.String({ minLength: 1, maxLength: 255 }),
        apiKey: t.Optional(t.String({ maxLength: 255 })),
        apiVersion: t.Optional(t.String({ maxLength: 31 })),
        comment: t.Optional(t.String()),
      }),
      detail: {
        description: "Create a new provider",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Update provider
  .put(
    "/:id",
    async ({ params: { id }, body, status }) => {
      const existing = await findProvider(id);
      if (!existing) {
        return status(404, { error: "Provider not found" });
      }
      const provider = await updateProvider(id, body);
      return provider;
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 63 })),
        type: t.Optional(
          t.Union([
            t.Literal("openai"),
            t.Literal("openai-responses"),
            t.Literal("anthropic"),
            t.Literal("azure"),
            t.Literal("ollama"),
          ]),
        ),
        baseUrl: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        apiKey: t.Optional(t.String({ maxLength: 255 })),
        apiVersion: t.Optional(t.String({ maxLength: 31 })),
        comment: t.Optional(t.String()),
      }),
      detail: {
        description: "Update a provider",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Delete provider
  .delete(
    "/:id",
    async ({ params: { id }, status }) => {
      const provider = await deleteProvider(id);
      if (!provider) {
        return status(404, { error: "Provider not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Delete a provider (soft delete)",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Test provider connection
  .post(
    "/:id/test",
    async ({ params: { id }, status }) => {
      const provider = await findProvider(id);
      if (!provider) {
        return status(404, { error: "Provider not found" });
      }

      try {
        const client = new OpenAI({
          baseURL: provider.baseUrl,
          apiKey: provider.apiKey || "not-required",
        });

        const models = await client.models.list();
        return {
          success: true,
          models: models.data.map((m) => ({
            id: m.id,
            owned_by: m.owned_by,
          })),
        };
      } catch (e) {
        return status(502, {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Test provider connection and list available models",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Get remote models list from provider
  .get(
    "/:id/remote-models",
    async ({ params: { id }, status }) => {
      const provider = await findProvider(id);
      if (!provider) {
        return status(404, { error: "Provider not found" });
      }

      try {
        const client = new OpenAI({
          baseURL: provider.baseUrl,
          apiKey: provider.apiKey || "not-required",
        });

        const models = await client.models.list();
        return {
          models: models.data.map((m) => ({
            id: m.id,
            owned_by: m.owned_by,
            created: m.created,
          })),
        };
      } catch (e) {
        return status(502, {
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "Fetch available models from upstream provider",
        tags: ["Admin - Providers"],
      },
    },
  )
  // Get models configured for this provider
  .get(
    "/:id/models",
    async ({ params: { id }, status }) => {
      const provider = await findProvider(id);
      if (!provider) {
        return status(404, { error: "Provider not found" });
      }

      const models = await listModelsByProvider(id);
      return models;
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
      detail: {
        description: "List models configured for this provider",
        tags: ["Admin - Providers"],
      },
    },
  );

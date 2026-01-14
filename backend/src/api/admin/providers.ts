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
        // For Anthropic, send a minimal messages request to test the connection
        if (provider.type === "anthropic") {
          const baseUrl = provider.baseUrl.endsWith("/")
            ? provider.baseUrl.slice(0, -1)
            : provider.baseUrl;

          const response = await fetch(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "anthropic-version": provider.apiVersion || "2023-06-01",
              ...(provider.apiKey && { "x-api-key": provider.apiKey }),
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307", // Use a common model for testing
              messages: [{ role: "user", content: "Hi" }],
              max_tokens: 1,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            // Check if the error is just about invalid model (which means auth is working)
            if (response.status === 400 && text.includes("model")) {
              return {
                success: true,
                message: "Connection successful (API key valid)",
                models: [],
              };
            }
            throw new Error(`API error: ${response.status} ${text}`);
          }

          return {
            success: true,
            message: "Connection successful",
            models: [],
          };
        }

        // For openai-responses, try the standard /models endpoint first
        // since most deployments share the same OpenAI account
        if (provider.type === "openai-responses") {
          const client = new OpenAI({
            baseURL: provider.baseUrl,
            apiKey: provider.apiKey || "not-required",
          });

          try {
            const models = await client.models.list();
            return {
              success: true,
              models: models.data.map((m) => ({
                id: m.id,
                owned_by: m.owned_by,
              })),
            };
          } catch {
            // If /models doesn't work, just report success for connection test
            return {
              success: true,
              message: "Connection configured (models endpoint not available)",
              models: [],
            };
          }
        }

        // For other types (openai, azure, ollama), use the standard approach
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

      // Anthropic does not have a models list endpoint
      if (provider.type === "anthropic") {
        return status(400, {
          error: "Anthropic API does not support listing models. Please configure models manually.",
          unsupported: true,
        });
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
        // For openai-responses, the /models endpoint might not be available
        if (provider.type === "openai-responses") {
          return status(400, {
            error: "Models list endpoint not available for this provider. Please configure models manually.",
            unsupported: true,
          });
        }
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

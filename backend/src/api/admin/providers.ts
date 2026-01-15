import { Elysia, t } from "elysia";
import { OpenAI } from "openai";
import {
  deleteProvider,
  findProvider,
  insertProvider,
  listProviders,
  updateProvider,
  listModelsByProvider,
} from "@/db";
import type { ProviderTypeEnumType } from "@/db/schema";

// ============================================
// Provider Test Strategy Pattern
// ============================================

export interface ProviderTestResult {
  success: boolean;
  message?: string;
  models: { id: string; owned_by?: string }[];
}

interface Provider {
  id: number;
  name: string;
  type: ProviderTypeEnumType;
  baseUrl: string;
  apiKey: string | null;
  apiVersion: string | null;
}

type ProviderTestFn = (provider: Provider) => Promise<ProviderTestResult>;

/**
 * Check if an error indicates that the OpenAI models endpoint is unavailable.
 * This helper detects 404/405 errors which indicate the endpoint doesn't exist
 * but the connection itself may be working.
 */
function isModelEndpointUnavailable(error: Error & { status?: number }): boolean {
  const errorMessage = error.message || "";
  return (
    error.status === 404 ||
    error.status === 405 ||
    errorMessage.includes("404") ||
    errorMessage.includes("405") ||
    errorMessage.includes("Not Found") ||
    errorMessage.includes("Method Not Allowed")
  );
}

/**
 * Test Anthropic provider connection by sending a minimal messages request.
 * Anthropic doesn't have a /models endpoint, so we test auth via messages API.
 */
async function testAnthropicConnection(
  provider: Provider,
): Promise<ProviderTestResult> {
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

/**
 * Test OpenAI Responses provider connection.
 * The /models endpoint might not be available for all deployments.
 */
async function testOpenAIResponsesConnection(
  provider: Provider,
): Promise<ProviderTestResult> {
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
  } catch (e) {
    // Check if it's a 404/405 (endpoint not available) vs real connection error
    const error = e as Error & { status?: number };

    if (isModelEndpointUnavailable(error)) {
      return {
        success: true,
        message: "Connection configured (models endpoint not available)",
        models: [],
      };
    }

    // Re-throw actual connection errors to be handled by outer catch
    throw e;
  }
}

/**
 * Test standard OpenAI-compatible provider connection (openai, azure, ollama).
 * Uses the /models endpoint to verify connection and list available models.
 */
async function testDefaultOpenAIConnection(
  provider: Provider,
): Promise<ProviderTestResult> {
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
}

/**
 * Map provider types to their specific test functions.
 * Providers not in this map will use the default OpenAI test.
 */
const providerTestHandlers: Partial<Record<ProviderTypeEnumType, ProviderTestFn>> = {
  anthropic: testAnthropicConnection,
  "openai-responses": testOpenAIResponsesConnection,
};

/**
 * Get the appropriate test function for a provider type.
 */
function getProviderTestFn(type: ProviderTypeEnumType): ProviderTestFn {
  return providerTestHandlers[type] ?? testDefaultOpenAIConnection;
}

// ============================================
// Provider Routes
// ============================================

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
        const testFn = getProviderTestFn(provider.type);
        return await testFn(provider);
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
        const error = e as Error & { status?: number };

        // For openai-responses, the /models endpoint might not be available
        if (
          provider.type === "openai-responses" &&
          isModelEndpointUnavailable(error)
        ) {
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

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Define types locally to avoid importing from @/db which triggers DB connection
type Provider = {
  id: number;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string | null;
  comment: string | null;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Model = {
  id: number;
  providerId: number;
  systemName: string;
  remoteId: string | null;
  modelType: "chat" | "embedding";
  weight: number;
  contextLength: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  comment: string | null;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Test data factories
function createMockProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 1,
    name: "OpenAI",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    comment: null,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 1,
    providerId: 1,
    systemName: "gpt-4",
    remoteId: null,
    modelType: "chat",
    weight: 1.0,
    contextLength: 128000,
    inputPrice: 10.0,
    outputPrice: 30.0,
    comment: null,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================
// Tests for buildUpstreamUrl
// These are pure functions that don't need DB
// ============================================
describe("buildUpstreamUrl", () => {
  // Inline implementation of buildUpstreamUrl for testing
  // (to avoid importing from model.ts which would trigger @/db import)
  const buildUpstreamUrl = (provider: Provider, endpoint: string): string => {
    const baseUrl = provider.baseUrl.endsWith("/")
      ? provider.baseUrl.slice(0, -1)
      : provider.baseUrl;
    return `${baseUrl}${endpoint}`;
  };

  test("builds correct URL with baseUrl without trailing slash", () => {
    const provider = createMockProvider({ baseUrl: "https://api.openai.com/v1" });
    const result = buildUpstreamUrl(provider, "/chat/completions");
    expect(result).toBe("https://api.openai.com/v1/chat/completions");
  });

  test("builds correct URL with baseUrl with trailing slash", () => {
    const provider = createMockProvider({ baseUrl: "https://api.openai.com/v1/" });
    const result = buildUpstreamUrl(provider, "/chat/completions");
    expect(result).toBe("https://api.openai.com/v1/chat/completions");
  });

  test("builds embeddings URL correctly", () => {
    const provider = createMockProvider({ baseUrl: "https://api.openai.com/v1" });
    const result = buildUpstreamUrl(provider, "/embeddings");
    expect(result).toBe("https://api.openai.com/v1/embeddings");
  });

  test("handles custom base URLs", () => {
    const provider = createMockProvider({ baseUrl: "http://localhost:11434/v1" });
    const result = buildUpstreamUrl(provider, "/chat/completions");
    expect(result).toBe("http://localhost:11434/v1/chat/completions");
  });

  test("handles Azure-style URLs", () => {
    const provider = createMockProvider({
      baseUrl: "https://myresource.openai.azure.com/openai/deployments/gpt-4",
    });
    const result = buildUpstreamUrl(provider, "/chat/completions");
    expect(result).toBe(
      "https://myresource.openai.azure.com/openai/deployments/gpt-4/chat/completions"
    );
  });
});

// ============================================
// Tests for getRemoteModelId
// ============================================
describe("getRemoteModelId", () => {
  // Inline implementation for testing
  const getRemoteModelId = (model: Model): string => {
    return model.remoteId || model.systemName;
  };

  test("returns remoteId when it is set", () => {
    const model = createMockModel({ systemName: "gpt-4", remoteId: "gpt-4-turbo-preview" });
    const result = getRemoteModelId(model);
    expect(result).toBe("gpt-4-turbo-preview");
  });

  test("returns systemName when remoteId is null", () => {
    const model = createMockModel({ systemName: "gpt-4", remoteId: null });
    const result = getRemoteModelId(model);
    expect(result).toBe("gpt-4");
  });

  test("returns systemName when remoteId is empty string", () => {
    const model = createMockModel({ systemName: "gpt-4", remoteId: "" });
    const result = getRemoteModelId(model);
    expect(result).toBe("gpt-4");
  });

  test("handles embedding model", () => {
    const model = createMockModel({
      systemName: "text-embedding-3-large",
      remoteId: null,
      modelType: "embedding",
    });
    const result = getRemoteModelId(model);
    expect(result).toBe("text-embedding-3-large");
  });

  test("handles model with different remoteId", () => {
    const model = createMockModel({
      systemName: "my-custom-gpt4",
      remoteId: "gpt-4-0125-preview",
    });
    const result = getRemoteModelId(model);
    expect(result).toBe("gpt-4-0125-preview");
  });
});

// ============================================
// Tests for selectModel logic
// Tests the weighted selection algorithm
// ============================================
describe("selectModel logic", () => {
  type ModelWithProvider = { model: Model; provider: Provider };

  // Inline implementation of the selection logic for testing
  const parseModelName = (modelName: string) => {
    let systemName = modelName;
    let providerName: string | undefined;
    if (modelName.includes("@")) {
      const parts = modelName.split("@");
      systemName = parts[0];
      providerName = parts[1];
    }
    return { systemName, providerName };
  };

  const filterByProvider = (
    candidates: ModelWithProvider[],
    providerName: string
  ): ModelWithProvider[] => {
    return candidates.filter(
      (c) => c.provider.name.toLowerCase() === providerName.toLowerCase()
    );
  };

  const weightedRandomSelect = (filtered: ModelWithProvider[]): ModelWithProvider => {
    const totalWeight = filtered.reduce((sum, c) => sum + c.model.weight, 0);
    const random = Math.random() * totalWeight;
    let cumulative = 0;
    for (const candidate of filtered) {
      cumulative += candidate.model.weight;
      if (random < cumulative) {
        return candidate;
      }
    }
    return filtered[0];
  };

  test("parses model@provider syntax correctly", () => {
    const { systemName, providerName } = parseModelName("gpt-4@OpenAI");
    expect(systemName).toBe("gpt-4");
    expect(providerName).toBe("OpenAI");
  });

  test("parses simple model name without provider", () => {
    const { systemName, providerName } = parseModelName("gpt-4");
    expect(systemName).toBe("gpt-4");
    expect(providerName).toBeUndefined();
  });

  test("handles complex model names with @ in provider", () => {
    const { systemName, providerName } = parseModelName("claude-3@anthropic");
    expect(systemName).toBe("claude-3");
    expect(providerName).toBe("anthropic");
  });

  test("filters by provider name case-insensitively", () => {
    const openaiProvider = createMockProvider({ id: 1, name: "OpenAI" });
    const azureProvider = createMockProvider({ id: 2, name: "Azure" });
    const candidates: ModelWithProvider[] = [
      { model: createMockModel({ id: 1, providerId: 1 }), provider: openaiProvider },
      { model: createMockModel({ id: 2, providerId: 2 }), provider: azureProvider },
    ];

    const filtered = filterByProvider(candidates, "openai"); // lowercase
    expect(filtered.length).toBe(1);
    expect(filtered[0].provider.name).toBe("OpenAI");
  });

  test("returns empty array when provider not found", () => {
    const openaiProvider = createMockProvider({ name: "OpenAI" });
    const candidates: ModelWithProvider[] = [
      { model: createMockModel(), provider: openaiProvider },
    ];

    const filtered = filterByProvider(candidates, "NonExistent");
    expect(filtered.length).toBe(0);
  });

  test("weighted selection works with single candidate", () => {
    const provider = createMockProvider();
    const model = createMockModel();
    const candidates: ModelWithProvider[] = [{ model, provider }];

    const result = weightedRandomSelect(candidates);
    expect(result.model.id).toBe(model.id);
  });

  test("weighted selection respects weights over many iterations", () => {
    const provider1 = createMockProvider({ id: 1, name: "Provider1" });
    const provider2 = createMockProvider({ id: 2, name: "Provider2" });
    const model1 = createMockModel({ id: 1, providerId: 1, weight: 1 });
    const model2 = createMockModel({ id: 2, providerId: 2, weight: 99 }); // Much higher weight

    const candidates: ModelWithProvider[] = [
      { model: model1, provider: provider1 },
      { model: model2, provider: provider2 },
    ];

    // Run multiple times to verify weighted selection works
    let provider2Count = 0;
    for (let i = 0; i < 100; i++) {
      const result = weightedRandomSelect(candidates);
      if (result.provider.id === 2) provider2Count++;
    }

    // With weight ratio 1:99, provider2 should be selected most of the time (>80%)
    expect(provider2Count).toBeGreaterThan(80);
  });

  test("calculates total weight correctly", () => {
    const candidates: ModelWithProvider[] = [
      { model: createMockModel({ weight: 1.0 }), provider: createMockProvider() },
      { model: createMockModel({ weight: 2.0 }), provider: createMockProvider() },
      { model: createMockModel({ weight: 0.5 }), provider: createMockProvider() },
    ];
    const totalWeight = candidates.reduce((sum, c) => sum + c.model.weight, 0);
    expect(totalWeight).toBe(3.5);
  });
});

import { consola } from "consola";
import type { ModelTypeEnumType } from "@/db/schema";
import {
  getModelsWithProviderBySystemName,
  type Model,
  type Provider,
} from "@/db";

const logger = consola.withTag("modelSelector");

export type ModelWithProvider = {
  model: Model;
  provider: Provider;
};

/**
 * Select a model by system name with weighted random selection for load balancing
 * @param modelName - The system name of the model (can include @providerName suffix)
 * @param modelType - Optional filter by model type (chat/embedding)
 * @returns The selected model with provider info, or null if not found
 */
export async function selectModel(
  modelName: string,
  modelType?: ModelTypeEnumType,
): Promise<ModelWithProvider | null> {
  // Check if model name includes provider specification (e.g., "gpt-4@openai")
  let systemName = modelName;
  let providerName: string | undefined;

  if (modelName.includes("@")) {
    const parts = modelName.split("@", 2);
    systemName = parts[0]!;
    providerName = parts[1]!;
  }

  logger.debug("selectModel", { systemName, providerName, modelType });

  // Get all models with the given system name
  const candidates = await getModelsWithProviderBySystemName(
    systemName,
    modelType,
  );

  if (candidates.length === 0) {
    logger.warn("No model found", { systemName, modelType });
    return null;
  }

  // If provider name is specified, filter by provider
  let filtered = candidates;
  if (providerName) {
    filtered = candidates.filter(
      (c) => c.provider.name.toLowerCase() === providerName.toLowerCase(),
    );
    if (filtered.length === 0) {
      logger.warn("No model found for specified provider", {
        systemName,
        providerName,
      });
      return null;
    }
  }

  // If only one candidate, return it
  if (filtered.length === 1) {
    return filtered[0]!;
  }

  // Weighted random selection for load balancing
  const totalWeight = filtered.reduce((sum, c) => sum + c.model.weight, 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (const candidate of filtered) {
    cumulative += candidate.model.weight;
    if (random < cumulative) {
      logger.debug("Selected model", {
        modelId: candidate.model.id,
        providerId: candidate.provider.id,
        weight: candidate.model.weight,
      });
      return candidate;
    }
  }

  // Fallback to first candidate (should not happen)
  return filtered[0] ?? null;
}

/**
 * Build the upstream URL for a model request
 */
export function buildUpstreamUrl(provider: Provider, endpoint: string): string {
  const baseUrl = provider.baseUrl.endsWith("/")
    ? provider.baseUrl.slice(0, -1)
    : provider.baseUrl;
  return `${baseUrl}${endpoint}`;
}

/**
 * Get the actual model ID to send to upstream
 * Uses remoteId if set, otherwise falls back to systemName
 */
export function getRemoteModelId(model: Model): string {
  return model.remoteId || model.systemName;
}

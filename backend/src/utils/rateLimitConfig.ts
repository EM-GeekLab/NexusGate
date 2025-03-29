import { consola } from "consola";

const logger = consola.withTag("rateLimitConfig");

export interface RateLimitConfig {
  limit: number;
  refill: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  limit: 10,
  refill: 1,
};

const MODEL_CONFIGS: Record<string, RateLimitConfig> = {};

/**
 * Get all rate limit configurations
 * @returns Object with all rate limit configurations
 */
export function getAllRateLimits(): Record<string, RateLimitConfig> {
  return {
    default: DEFAULT_RATE_LIMIT_CONFIG,
    ...MODEL_CONFIGS,
  };
}

/**
 * Get rate limit configuration for a specific identifier
 * @param identifier The resource identifier (model name, API endpoint, etc.)
 * @returns The appropriate rate limit configuration or null if not found
 */
export function getRateLimitConfig(identifier: string): RateLimitConfig | null {
  if (identifier in MODEL_CONFIGS && MODEL_CONFIGS[identifier]) {
    return MODEL_CONFIGS[identifier];
  }
  return null;
}

/**
 * Set a rate limit configuration
 * @param identifier The resource identifier
 * @param config The rate limit configuration
 * @returns Success status
 */
export function setRateLimitConfig(identifier: string, config: RateLimitConfig): boolean {
  try {
    MODEL_CONFIGS[identifier] = { ...config };
    logger.debug(`Rate limit configuration set for ${identifier}`);
    return true;
  } catch (error) {
    logger.error(`Error setting rate limit config for ${identifier}:`, error);
    return false;
  }
}

/**
 * Delete a rate limit configuration
 * @param identifier The resource identifier
 * @returns Success status
 */
export function deleteRateLimitConfig(identifier: string): boolean {
  if (!(identifier in MODEL_CONFIGS)) {
    logger.debug(`No rate limit config found to delete for ${identifier}`);
    return false;
  }

  try {
    delete MODEL_CONFIGS[identifier];
    logger.debug(`Rate limit configuration deleted for ${identifier}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting rate limit config for ${identifier}:`, error);
    return false;
  }
}

// TODO: Migarate to a database-backed solution

import { consola } from "consola";
import { getSetting, setSetting, deleteSetting } from "@/utils/settings";

const logger = consola.withTag("rateLimitConfig");

export interface RateLimitConfig {
  limit: number;
  refill: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  limit: 10,
  refill: 1,
};

const RATE_LIMIT_PREFIX = "rate_limit_";

/**
 * Get storage key for a model identifier
 * @param identifier The resource identifier
 * @returns The key used in settings table
 */
function getSettingsKey(identifier: string): string {
  return `${RATE_LIMIT_PREFIX}${identifier}`;
}

/**
 * Get all rate limit configurations
 * @returns Object with all rate limit configurations
 */
export async function getAllRateLimits(): Promise<Record<string, RateLimitConfig>> {
  try {
    const allSettings = await getSetting<Record<string, RateLimitConfig>>(
      `${RATE_LIMIT_PREFIX}all`,
      {},
    );
    return {
      default: DEFAULT_RATE_LIMIT_CONFIG,
      ...allSettings,
    };
  } catch (error) {
    logger.error("Error getting all rate limits:", error);
    return { default: DEFAULT_RATE_LIMIT_CONFIG };
  }
}

/**
 * Get rate limit configuration for a specific identifier
 * @param identifier The resource identifier (model name, API endpoint, etc.)
 * @returns The appropriate rate limit configuration or null if not found
 */
export async function getRateLimitConfig(identifier: string): Promise<RateLimitConfig | null> {
  try {
    const key = getSettingsKey(identifier);
    const config = await getSetting<RateLimitConfig | null>(key, null);
    return config;
  } catch (error) {
    logger.error(`Error getting rate limit config for ${identifier}:`, error);
    return null;
  }
}

/**
 * Set a rate limit configuration
 * @param identifier The resource identifier
 * @param config The rate limit configuration
 * @returns Success status
 */
export async function setRateLimitConfig(
  identifier: string,
  config: RateLimitConfig,
): Promise<boolean> {
  try {
    const key = getSettingsKey(identifier);
    await setSetting(key, config);

    // Also update the all rate limits cache
    const allLimits = await getAllRateLimits();
    allLimits[identifier] = config;
    await setSetting(`${RATE_LIMIT_PREFIX}all`, allLimits);

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
export async function deleteRateLimitConfig(identifier: string): Promise<boolean> {
  try {
    const key = getSettingsKey(identifier);
    const config = await getRateLimitConfig(identifier);

    if (!config) {
      logger.debug(`No rate limit config found to delete for ${identifier}`);
      return false;
    }

    await deleteSetting(key);

    // Update the all rate limits cache
    const allLimits = await getAllRateLimits();
    delete allLimits[identifier];
    await setSetting(`${RATE_LIMIT_PREFIX}all`, allLimits);

    logger.debug(`Rate limit configuration deleted for ${identifier}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting rate limit config for ${identifier}:`, error);
    return false;
  }
}

import { consola } from "consola";
import Redis from "ioredis";
import { REDIS_URL } from "@/utils/config";

const logger = consola.withTag("redisClient");

/**
 * Redis client utility class for handling Redis operations
 */
class RedisClient {
  private client: Redis;

  constructor() {
    this.client = new Redis(REDIS_URL);

    // Set up event listeners
    this.client.on("connect", () => {
      logger.success(`Connected to Redis at ${REDIS_URL}`);
    });

    this.client.on("error", (err) => {
      logger.error(`RedisError: ${err.message}`);
    });

    this.client.on("close", () => {
      logger.warn("Redis connection closed");
    });

    this.client.on("reconnecting", () => {
      logger.info("Attempting to reconnect to Redis...");
    });
  }

  /**
   * Check if Redis is connected
   * @returns {boolean} Connection status
   */
  public isConnected(): boolean {
    return this.client.status === "ready";
  }

  /**
   * Get Redis client instance (for advanced usage)
   * @returns {Redis} Redis client instance
   */
  public getClient(): Redis {
    return this.client;
  }

  /**
   * Get a value from Redis
   * @param {string} key - Key to retrieve
   * @returns {Promise<string | null>} Value or null if not found
   */
  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis get error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Set a value in Redis
   * @param {string} key - Key to set
   * @param {string | number} value - Value to store
   * @param {object} options - Optional settings (expiry, etc)
   * @returns {Promise<string | null>} Operation result
   */
  public async set(
    key: string,
    value: string | number,
    options?: { EX?: number },
  ): Promise<string | null> {
    try {
      if (options?.EX) {
        return await this.client.set(key, value.toString(), "EX", options.EX);
      }
      return await this.client.set(key, value.toString());
    } catch (error) {
      logger.error(`Redis set error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Delete a key from Redis
   * @param {string} key - Key to delete
   * @returns {Promise<number>} Number of keys deleted
   */
  public async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error(`Redis del error: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Close the Redis connection
   */
  public async close(): Promise<void> {
    await this.client.quit();
    logger.info("Redis connection closed");
  }
}

// Export singleton instance
export const redisClient = new RedisClient();

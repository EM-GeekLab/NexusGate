import * as db from "@/db";
import { getSetting, upsertSetting } from "@/db";
import { createLogger } from "@/utils/logger";
import {
  ENABLE_INIT_CONFIG,
  FORCILY_ADD_API_KEYS,
  INIT_CONFIG_JSON,
  INIT_CONFIG_PATH,
  initConfigJsonSchema,
  type InitConfigJson,
} from "./config";

const logger = createLogger("init");

export async function initConfig(): Promise<void> {
  logger.debug("Initializing configuration...");
  if (!ENABLE_INIT_CONFIG) {
    logger.info("Initialization configuration is disabled");
    return;
  }
  const initFlag = await getSetting("INIT_CONFIG_FLAG");
  if (initFlag?.value === true) {
    logger.info("Initialization configuration has already been applied");
    return;
  }
  const config = await loadInitConfig();
  if (!config) {
    return;
  }

  for (const upstream of config.upstreams) {
    try {
      const result = await db.insertUpstream({
        ...upstream,
      });

      if (result) {
        logger.info(
          `Created upstream: ${upstream.name} (${upstream.model})(${upstream.url})`,
        );
      } else {
        logger.warn(
          `Upstream already exists: ${upstream.name} (${upstream.model})(${upstream.url})`,
        );
      }
    } catch (error) {
      logger.error(
        `Failed to create upstream ${upstream.name}: ${(error as Error).message}`,
      );
    }
  }

  if (FORCILY_ADD_API_KEYS !== undefined && FORCILY_ADD_API_KEYS.length > 0) {
    logger.info("Adding presetted API keys");
    logger.warn(
      "Setting API keys via FORCILY_ADD_API_KEYS is not recommended! Use with caution!",
    );
    for (const key of FORCILY_ADD_API_KEYS) {
      try {
        const result = await db.upsertApiKey({ key });
        if (result) {
          logger.info(`Created API key: ${key}`);
        } else {
          logger.warn(`Failed to insert API key: ${key}`);
        }
      } catch (error) {
        logger.error(
          `Failed to create API key ${key}: ${(error as Error).message}`,
        );
      }
    }
  }

  await upsertSetting({ key: "INIT_CONFIG_FLAG", value: true });
}

async function loadInitConfig(): Promise<InitConfigJson | null> {
  // First try to load from env if set
  if (INIT_CONFIG_JSON) {
    return INIT_CONFIG_JSON;
  }

  const configFile = Bun.file(INIT_CONFIG_PATH);
  if (await configFile.exists()) {
    try {
      logger.info(
        `Loading initialization configuration from file: ${INIT_CONFIG_PATH}`,
      );
      const configData = await configFile.text();
      const config = JSON.parse(configData) as unknown;
      const parsed = await initConfigJsonSchema.safeParseAsync(config);
      if (parsed.success) {
        return parsed.data;
      }
      logger.error(
        `Invalid initialization configuration: ${JSON.stringify(parsed.error)}`,
      );
      return null;
    } catch (error) {
      logger.error(
        `Failed to load initialization configuration from file ${INIT_CONFIG_PATH}:`,
        error,
      );
      return null;
    }
  }

  logger.error("No initialization configuration found");
  return null;
}

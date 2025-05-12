import consola from "consola";
import * as db from "@/db";
import { getSetting, upsertSetting } from "@/db";
import {
  ENABLE_INIT_CONFIG,
  INIT_CONFIG_JSON,
  INIT_CONFIG_PATH,
  initConfigJsonSchema,
  type InitConfigJson,
} from "./config";

const logger = consola.withTag("init");

export async function initConfig(): Promise<void> {
  logger.debug("Initializing configuration...");
  if (!ENABLE_INIT_CONFIG) {
    logger.info("Initialization configuration is disabled");
    return;
  }
  const initFlag = await getSetting("INIT_CONFIG_FLAG");
  if (initFlag && initFlag.value === true) {
    logger.info("Initialization configuration has already been applied");
    return;
  }
  const config = await loadInitConfig();
  if (!config) {
    return;
  }

  if (config.upstreams.length > 0) {
    for (const upstream of config.upstreams) {
      try {
        const result = await db.insertUpstream({
          ...upstream,
        });

        if (result) {
          logger.success(`Created upstream: ${upstream.name} (${upstream.model})(${upstream.url})`);
        } else {
          logger.warn(
            `Upstream already exists: ${upstream.name} (${upstream.model})(${upstream.url})`,
          );
        }
      } catch (error) {
        logger.error(`Failed to create upstream ${upstream.name}: ${(error as Error).message}`);
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
      logger.info(`Loading initialization configuration from file: ${INIT_CONFIG_PATH}`);
      const configData = await configFile.text();
      const config = JSON.parse(configData);
      const parsed = await initConfigJsonSchema.safeParseAsync(config);
      if (parsed.success) {
        return parsed.data;
      }
      logger.error(`Invalid initialization configuration: ${parsed.error}`);
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

import consola from "consola";
import * as db from "@/db";
import { getSetting, upsertSetting, type UpstreamInsert } from "@/db";
import { ENABLE_INIT_CONFIG, INIT_CONFIG_PATH } from "./config";

const logger = consola.withTag("init");
const INIT_CONFIG_JSON = process.env.INIT_CONFIG_JSON || "";

interface InitConfig {
  upstreams?: Partial<UpstreamInsert>[];
}

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

  if (config.upstreams && config.upstreams.length > 0) {
    for (const upstream of config.upstreams) {
      try {
        if (!upstream.name || !upstream.url || !upstream.model) {
          throw new Error(`Missing required fields for upstream: ${JSON.stringify(upstream)}`);
        }

        const result = await db.insertUpstream({
          name: upstream.name,
          url: upstream.url,
          model: upstream.model,
          upstreamModel: upstream.upstreamModel,
          apiKey: upstream.apiKey,
          weight: upstream.weight,
          comment: upstream.comment,
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

async function loadInitConfig(): Promise<InitConfig | null> {
  // First try to load from env if set
  if (INIT_CONFIG_JSON) {
    try {
      logger.info("Attempting to load configuration from environment variable");
      const config = JSON.parse(INIT_CONFIG_JSON);
      logger.success("Successfully loaded configuration from environment variable");
      return config;
    } catch (error) {
      logger.error("Failed to parse configuration from environment variable:", error);
    }
  }

  const configPath = INIT_CONFIG_PATH;
  const configFile = Bun.file(configPath);

  if (await configFile.exists()) {
    try {
      logger.info(`Loading initialization configuration from file: ${configPath}`);
      const configData = await configFile.text();
      const config = JSON.parse(configData);
      logger.success("Successfully loaded initialization configuration from file");
      return config;
    } catch (error) {
      logger.error(`Failed to load initialization configuration from file ${configPath}:`, error);
      return null;
    }
  }

  logger.error("No initialization configuration found");
  return null;
}

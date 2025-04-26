import consola from "consola";
import * as db from "@/db";
import { getSetting, upsertSetting, type UpstreamInsert } from "@/db";
import { ENABLE_INIT_CONFIG, INIT_CONFIG_PATH } from "./config";

const logger = consola.withTag("init");

interface InitConfig {
  upstreams?: Partial<UpstreamInsert>[];
}

export async function initConfig(): Promise<void> {
  logger.debug("Initializing configuration...");
  if (!ENABLE_INIT_CONFIG) {
    return;
  }
  const initFlag = await getSetting("INIT_CONFIG_FLAG");
  if (initFlag && initFlag.value === true) {
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
  const configPath = INIT_CONFIG_PATH;
  const configFile = Bun.file(configPath);

  if (await configFile.exists()) {
    try {
      const configData = await configFile.text();
      return JSON.parse(configData);
    } catch (error) {
      logger.error(`Failed to load configuration from file ${configPath}:`, error);
      return null;
    }
  }

  logger.error("No initialization configuration found");
  return null;
}

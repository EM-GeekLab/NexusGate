import { createLogger } from "@/utils/logger";
import {
  GrafanaClient,
  type GrafanaAlertRulePayload,
  type GrafanaContactPointPayload,
} from "@/utils/grafanaClient";
import {
  listAlertRules,
  listAlertChannels,
  getSetting,
  updateAlertRuleGrafanaSync,
  updateAlertChannelGrafanaSync,
  type AlertRule,
  type AlertChannel,
} from "@/db";
import type {
  BudgetCondition,
  ErrorRateCondition,
  LatencyCondition,
  QuotaCondition,
  WebhookChannelConfig,
  EmailChannelConfig,
  FeishuChannelConfig,
} from "@/db/schema";

const logger = createLogger("grafanaSync");

const NEXUSGATE_FOLDER = "NexusGate";
const NEXUSGATE_RULE_GROUP = "nexusgate-alerts";
const GRAFANA_CONNECTION_KEY = "grafana_connection";

interface GrafanaConnection {
  apiUrl: string;
  authToken: string;
  datasourceUid?: string;
  verified: boolean;
  verifiedAt: string | null;
}

// ============================================
// Get Grafana Client
// ============================================

async function getGrafanaClient(): Promise<{
  client: GrafanaClient;
  datasourceUid: string;
} | null> {
  const setting = await getSetting(GRAFANA_CONNECTION_KEY);
  if (!setting?.value) {
    return null;
  }

  const config = setting.value as GrafanaConnection;
  if (!config.verified || !config.datasourceUid) {
    return null;
  }

  return {
    client: new GrafanaClient(config.apiUrl, config.authToken),
    datasourceUid: config.datasourceUid,
  };
}

// ============================================
// PromQL Mapping
// ============================================

function buildPromQL(rule: AlertRule): {
  expr: string;
  threshold: number;
  forDuration: string;
} {
  switch (rule.type) {
    case "budget": {
      const c = rule.condition as BudgetCondition;
      return {
        expr: `sum(nexusgate_cost_total_usd_total) > ${c.thresholdUsd}`,
        threshold: c.thresholdUsd,
        forDuration: "1m",
      };
    }
    case "error_rate": {
      const c = rule.condition as ErrorRateCondition;
      const labels: string[] = [];
      if (c.model) {
        labels.push(`model="${c.model}"`);
      }
      const baseSelector = labels.join(",");
      const failedSelector = [...labels, `status="failed"`].join(",");
      return {
        expr: `(sum(rate(nexusgate_completions_total{${failedSelector}}[${c.windowMinutes}m])) / clamp_min(sum(rate(nexusgate_completions_total{${baseSelector}}[${c.windowMinutes}m])), 1e-10)) * 100 > ${c.thresholdPercent}`,
        threshold: c.thresholdPercent,
        forDuration: "1m",
      };
    }
    case "latency": {
      const c = rule.condition as LatencyCondition;
      const labels: string[] = [];
      if (c.model) {
        labels.push(`model="${c.model}"`);
      }
      const labelSelector = labels.join(",");
      const thresholdSec = c.thresholdMs / 1000;
      return {
        expr: `histogram_quantile(${c.percentile / 100}, sum(rate(nexusgate_completion_duration_seconds_bucket{${labelSelector}}[${c.windowMinutes}m])) by (le)) > ${thresholdSec}`,
        threshold: c.thresholdMs,
        forDuration: "1m",
      };
    }
    case "quota": {
      const c = rule.condition as QuotaCondition;
      let expr: string;
      if (c.limitType === "rpm") {
        expr = `(nexusgate_api_key_rpm_usage / clamp_min(nexusgate_api_key_rpm_limit, 1)) * 100 > ${c.thresholdPercent}`;
      } else if (c.limitType === "tpm") {
        expr = `(nexusgate_api_key_tpm_usage / clamp_min(nexusgate_api_key_tpm_limit, 1)) * 100 > ${c.thresholdPercent}`;
      } else {
        expr = `max((nexusgate_api_key_rpm_usage / clamp_min(nexusgate_api_key_rpm_limit, 1)) * 100, (nexusgate_api_key_tpm_usage / clamp_min(nexusgate_api_key_tpm_limit, 1)) * 100) > ${c.thresholdPercent}`;
      }
      return {
        expr,
        threshold: c.thresholdPercent,
        forDuration: "1m",
      };
    }
    default:
      return {
        expr: "vector(0) > 1",
        threshold: 0,
        forDuration: "1m",
      };
  }
}

function buildGrafanaAlertRule(
  rule: AlertRule,
  datasourceUid: string,
  folderUid: string,
): GrafanaAlertRulePayload {
  const { expr, forDuration } = buildPromQL(rule);

  return {
    title: `[NexusGate] ${rule.name}`,
    ruleGroup: NEXUSGATE_RULE_GROUP,
    folderUID: folderUid,
    condition: "B",
    data: [
      {
        refId: "A",
        relativeTimeRange: { from: 600, to: 0 },
        datasourceUid,
        model: {
          expr,
          refId: "A",
          intervalMs: 15000,
          maxDataPoints: 43200,
        },
      },
      {
        refId: "B",
        relativeTimeRange: { from: 600, to: 0 },
        datasourceUid: "-100",
        model: {
          conditions: [
            {
              evaluator: { params: [0], type: "gt" },
              operator: { type: "and" },
              query: { params: ["A"] },
              reducer: { params: [], type: "last" },
              type: "query",
            },
          ],
          datasource: { type: "__expr__", uid: "-100" },
          expression: "A",
          type: "threshold",
          refId: "B",
        },
      },
    ],
    noDataState: "OK",
    execErrState: "OK",
    for: forDuration,
    labels: {
      source: "nexusgate",
      rule_type: rule.type,
      nexusgate_rule_id: String(rule.id),
    },
    annotations: {
      summary: `NexusGate ${rule.type} alert: ${rule.name}`,
    },
  };
}

// ============================================
// Channel to Contact Point Mapping
// ============================================

function buildContactPoint(
  channel: AlertChannel,
): GrafanaContactPointPayload {
  switch (channel.type) {
    case "webhook": {
      const c = channel.config as WebhookChannelConfig;
      return {
        name: `[NexusGate] ${channel.name}`,
        type: "webhook",
        settings: {
          url: c.url,
          httpMethod: "POST",
          ...(c.headers ? { httpHeaders: JSON.stringify(c.headers) } : {}),
        },
      };
    }
    case "email": {
      const c = channel.config as EmailChannelConfig;
      return {
        name: `[NexusGate] ${channel.name}`,
        type: "email",
        settings: {
          addresses: c.to.join(";"),
          singleEmail: false,
        },
      };
    }
    case "feishu": {
      const c = channel.config as FeishuChannelConfig;
      return {
        name: `[NexusGate] ${channel.name}`,
        type: "webhook",
        settings: {
          url: c.webhookUrl,
          httpMethod: "POST",
        },
      };
    }
  }
}

// ============================================
// Sync Functions
// ============================================

export interface SyncResult {
  synced: number;
  failed: number;
  errors: Array<{ id: number; name: string; error: string }>;
}

export async function syncRulesToGrafana(): Promise<SyncResult> {
  const connection = await getGrafanaClient();
  if (!connection) {
    throw new Error("Grafana connection not configured or not verified");
  }

  const { client, datasourceUid } = connection;
  const folderUid = await client.ensureFolder(NEXUSGATE_FOLDER);
  const rules = await listAlertRules();
  const enabledRules = rules.filter((r) => r.enabled);

  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  for (const rule of enabledRules) {
    try {
      const payload = buildGrafanaAlertRule(rule, datasourceUid, folderUid);

      if (rule.grafanaUid) {
        await client.updateAlertRule(rule.grafanaUid, payload);
      } else {
        const created = await client.createAlertRule(payload);
        await updateAlertRuleGrafanaSync(rule.id, {
          grafanaUid: created.uid,
        });
      }

      await updateAlertRuleGrafanaSync(rule.id, {
        grafanaSyncedAt: new Date(),
        grafanaSyncError: null,
      });

      result.synced++;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      await updateAlertRuleGrafanaSync(rule.id, {
        grafanaSyncError: errorMsg.slice(0, 500),
      });

      result.failed++;
      result.errors.push({ id: rule.id, name: rule.name, error: errorMsg });
      logger.error("Failed to sync rule to Grafana", {
        ruleId: rule.id,
        error: errorMsg,
      });
    }
  }

  return result;
}

export async function syncChannelsToGrafana(): Promise<SyncResult> {
  const connection = await getGrafanaClient();
  if (!connection) {
    throw new Error("Grafana connection not configured or not verified");
  }

  const { client } = connection;
  const channels = await listAlertChannels();
  const enabledChannels = channels.filter((c) => c.enabled);

  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  for (const channel of enabledChannels) {
    try {
      const payload = buildContactPoint(channel);

      if (channel.grafanaUid) {
        await client.updateContactPoint(channel.grafanaUid, payload);
      } else {
        const created = await client.createContactPoint(payload);
        await updateAlertChannelGrafanaSync(channel.id, {
          grafanaUid: created.uid,
        });
      }

      await updateAlertChannelGrafanaSync(channel.id, {
        grafanaSyncedAt: new Date(),
        grafanaSyncError: null,
      });

      result.synced++;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      await updateAlertChannelGrafanaSync(channel.id, {
        grafanaSyncError: errorMsg.slice(0, 500),
      });

      result.failed++;
      result.errors.push({
        id: channel.id,
        name: channel.name,
        error: errorMsg,
      });
      logger.error("Failed to sync channel to Grafana", {
        channelId: channel.id,
        error: errorMsg,
      });
    }
  }

  return result;
}

export async function syncAllToGrafana(): Promise<{
  rules: SyncResult;
  channels: SyncResult;
}> {
  const channels = await syncChannelsToGrafana();
  const rules = await syncRulesToGrafana();
  return { rules, channels };
}

/**
 * Check if Grafana connection is verified.
 * Used by the alert engine to decide whether to skip built-in evaluation.
 */
export async function isGrafanaConnected(): Promise<boolean> {
  const setting = await getSetting(GRAFANA_CONNECTION_KEY);
  if (!setting?.value) {
    return false;
  }
  const config = setting.value as GrafanaConnection;
  return config.verified;
}

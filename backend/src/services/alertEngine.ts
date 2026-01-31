import { createLogger } from "@/utils/logger";
import { redisClient } from "@/utils/redisClient";
import {
  listAlertRules,
  listAlertChannels,
  insertAlertHistory,
  getCompletionCostInPeriod,
  getCompletionErrorRate,
  getCompletionLatencyPercentile,
  listApiKeys,
  type AlertRule,
  type AlertChannel,
} from "@/db";
import type {
  AlertPayload,
  BudgetCondition,
  ErrorRateCondition,
  LatencyCondition,
  QuotaCondition,
} from "@/db/schema";
import { getRateLimitStatus } from "@/utils/apiKeyRateLimit";
import { dispatchToChannel } from "./alertDispatcher";
import { isGrafanaConnected } from "./grafanaSync";

const logger = createLogger("alertEngine");

const ALERT_CHECK_INTERVAL_MS = 60_000; // 60 seconds
const COOLDOWN_KEY_PREFIX = "nexusgate:alert:cooldown";

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check if a rule is currently in cooldown
 */
async function isInCooldown(ruleId: number): Promise<boolean> {
  const key = `${COOLDOWN_KEY_PREFIX}:${ruleId}`;
  const result = await redisClient.get(key);
  return result !== null;
}

/**
 * Set cooldown for a rule
 */
async function setCooldown(
  ruleId: number,
  cooldownMinutes: number,
): Promise<void> {
  const key = `${COOLDOWN_KEY_PREFIX}:${ruleId}`;
  await redisClient.set(key, "1", { EX: cooldownMinutes * 60 });
}

/**
 * Evaluate a budget alert condition
 */
async function evaluateBudget(
  condition: BudgetCondition,
): Promise<{ triggered: boolean; currentValue: number }> {
  const cost = await getCompletionCostInPeriod(
    condition.periodDays,
    condition.apiKeyId,
  );
  return {
    triggered: cost >= condition.thresholdUsd,
    currentValue: cost,
  };
}

/**
 * Evaluate an error rate alert condition
 */
async function evaluateErrorRate(
  condition: ErrorRateCondition,
): Promise<{ triggered: boolean; currentValue: number }> {
  const { rate } = await getCompletionErrorRate(
    condition.windowMinutes,
    condition.model,
  );
  return {
    triggered: rate >= condition.thresholdPercent,
    currentValue: rate,
  };
}

/**
 * Evaluate a latency alert condition
 */
async function evaluateLatency(
  condition: LatencyCondition,
): Promise<{ triggered: boolean; currentValue: number }> {
  const latency = await getCompletionLatencyPercentile(
    condition.windowMinutes,
    condition.percentile,
    condition.model,
  );
  return {
    triggered: latency >= condition.thresholdMs,
    currentValue: latency,
  };
}

/**
 * Evaluate a quota alert condition
 */
async function evaluateQuota(
  condition: QuotaCondition,
): Promise<{ triggered: boolean; currentValue: number }> {
  // If a specific API key is specified, check just that one
  if (condition.apiKeyId) {
    // Need to get the key's limits from the DB
    const apiKeys = await listApiKeys();
    const apiKey = apiKeys.find((k) => k.id === condition.apiKeyId);
    if (!apiKey) {
      return { triggered: false, currentValue: 0 };
    }

    const status = await getRateLimitStatus(apiKey.id, {
      rpmLimit: apiKey.rpmLimit,
      tpmLimit: apiKey.tpmLimit,
    });

    let usagePercent = 0;
    if (condition.limitType === "rpm") {
      usagePercent =
        status.rpm.limit > 0
          ? (status.rpm.current / status.rpm.limit) * 100
          : 0;
    } else if (condition.limitType === "tpm") {
      usagePercent =
        status.tpm.limit > 0
          ? (status.tpm.current / status.tpm.limit) * 100
          : 0;
    } else {
      // both: use the higher of the two
      const rpmPct =
        status.rpm.limit > 0
          ? (status.rpm.current / status.rpm.limit) * 100
          : 0;
      const tpmPct =
        status.tpm.limit > 0
          ? (status.tpm.current / status.tpm.limit) * 100
          : 0;
      usagePercent = Math.max(rpmPct, tpmPct);
    }

    return {
      triggered: usagePercent >= condition.thresholdPercent,
      currentValue: usagePercent,
    };
  }

  // Check all active API keys, trigger if any exceed threshold
  const apiKeys = await listApiKeys();
  let maxUsagePercent = 0;

  for (const key of apiKeys) {
    const status = await getRateLimitStatus(key.id, {
      rpmLimit: key.rpmLimit,
      tpmLimit: key.tpmLimit,
    });

    let usagePercent = 0;
    if (condition.limitType === "rpm") {
      usagePercent =
        status.rpm.limit > 0
          ? (status.rpm.current / status.rpm.limit) * 100
          : 0;
    } else if (condition.limitType === "tpm") {
      usagePercent =
        status.tpm.limit > 0
          ? (status.tpm.current / status.tpm.limit) * 100
          : 0;
    } else {
      const rpmPct =
        status.rpm.limit > 0
          ? (status.rpm.current / status.rpm.limit) * 100
          : 0;
      const tpmPct =
        status.tpm.limit > 0
          ? (status.tpm.current / status.tpm.limit) * 100
          : 0;
      usagePercent = Math.max(rpmPct, tpmPct);
    }

    if (usagePercent > maxUsagePercent) {
      maxUsagePercent = usagePercent;
    }
  }

  return {
    triggered: maxUsagePercent >= condition.thresholdPercent,
    currentValue: maxUsagePercent,
  };
}

/**
 * Build alert payload based on rule type and evaluation result
 */
function buildPayload(
  rule: AlertRule,
  currentValue: number,
): AlertPayload {
  const condition = rule.condition;
  let threshold: number;
  let message: string;

  switch (rule.type) {
    case "budget": {
      const c = condition as BudgetCondition;
      threshold = c.thresholdUsd;
      message = `Budget alert: $${currentValue.toFixed(4)} spent in last ${c.periodDays} days (threshold: $${threshold})`;
      break;
    }
    case "error_rate": {
      const c = condition as ErrorRateCondition;
      threshold = c.thresholdPercent;
      message = `Error rate alert: ${currentValue.toFixed(1)}% in last ${c.windowMinutes} minutes (threshold: ${threshold}%)`;
      break;
    }
    case "latency": {
      const c = condition as LatencyCondition;
      threshold = c.thresholdMs;
      message = `Latency alert: P${c.percentile} = ${currentValue.toFixed(0)}ms in last ${c.windowMinutes} minutes (threshold: ${threshold}ms)`;
      break;
    }
    case "quota": {
      const c = condition as QuotaCondition;
      threshold = c.thresholdPercent;
      message = `Quota alert: ${currentValue.toFixed(1)}% ${c.limitType} usage (threshold: ${threshold}%)`;
      break;
    }
    default:
      threshold = 0;
      message = "Unknown alert type";
  }

  return {
    ruleType: rule.type,
    ruleName: rule.name,
    message,
    currentValue,
    threshold,
  };
}

/**
 * Dispatch alert to all configured channels for a rule
 */
async function dispatchAlert(
  rule: AlertRule,
  channels: AlertChannel[],
  payload: AlertPayload,
): Promise<void> {
  const ruleChannels = channels.filter((ch) =>
    rule.channelIds.includes(ch.id),
  );

  for (const channel of ruleChannels) {
    if (!channel.enabled) {
      continue;
    }

    try {
      await dispatchToChannel(channel.type, channel.config, payload);
      await insertAlertHistory({
        ruleId: rule.id,
        payload,
        status: "sent",
      });
    } catch (error) {
      await insertAlertHistory({
        ruleId: rule.id,
        payload,
        status: "failed",
      });
      logger.error("Alert dispatch failed", {
        channelId: channel.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await setCooldown(rule.id, rule.cooldownMinutes);
}

/**
 * Evaluate a single alert rule
 */
async function evaluateRule(
  rule: AlertRule,
): Promise<{ triggered: boolean; currentValue: number }> {
  switch (rule.type) {
    case "budget":
      return evaluateBudget(rule.condition as BudgetCondition);
    case "error_rate":
      return evaluateErrorRate(rule.condition as ErrorRateCondition);
    case "latency":
      return evaluateLatency(rule.condition as LatencyCondition);
    case "quota":
      return evaluateQuota(rule.condition as QuotaCondition);
    default:
      return { triggered: false, currentValue: 0 };
  }
}

/**
 * Main evaluation loop - checks all enabled alert rules
 */
async function evaluateAlerts(): Promise<void> {
  try {
    // Skip built-in evaluation when Grafana handles alerting
    if (await isGrafanaConnected()) {
      return;
    }

    const rules = await listAlertRules();
    const channels = await listAlertChannels();
    const enabledRules = rules.filter((r) => r.enabled);

    for (const rule of enabledRules) {
      try {
        const inCooldown = await isInCooldown(rule.id);
        const { triggered, currentValue } = await evaluateRule(rule);

        if (triggered) {
          const payload = buildPayload(rule, currentValue);

          if (inCooldown) {
            await insertAlertHistory({
              ruleId: rule.id,
              payload,
              status: "suppressed",
            });
          } else {
            await dispatchAlert(rule, channels, payload);
          }
        }
      } catch (error) {
        logger.error("Error evaluating alert rule", {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error("Error in alert evaluation loop", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start the alert evaluation engine
 */
export function startAlertEngine(): void {
  if (intervalId) {
    logger.warn("Alert engine already running");
    return;
  }

  logger.info(
    `Starting alert engine (interval: ${ALERT_CHECK_INTERVAL_MS}ms)`,
  );
  intervalId = setInterval(() => {
    void evaluateAlerts();
  }, ALERT_CHECK_INTERVAL_MS);
}

/**
 * Stop the alert evaluation engine
 */
export function stopAlertEngine(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Alert engine stopped");
  }
}

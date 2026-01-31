import {
  getCompletionMetricsByModelAndStatus,
  getEmbeddingMetricsByModelAndStatus,
  getCompletionDurationHistogram,
  getCompletionTTFTHistogram,
  getEmbeddingDurationHistogram,
  getActiveEntityCounts,
  getApiKeyRateLimitConfig,
  LATENCY_BUCKETS_MS,
} from "@/db";
import { getRateLimitRejections } from "@/plugins/apiKeyRateLimitPlugin";
import { getRateLimitStatus } from "@/utils/apiKeyRateLimit";
import { COMMIT_SHA, METRICS_CACHE_TTL_SECONDS } from "@/utils/config";
import { createLogger } from "@/utils/logger";
import { redisClient } from "@/utils/redisClient";

const logger = createLogger("prometheus");

// Redis cache key for metrics
const METRICS_CACHE_KEY = "nexusgate:metrics:cache";

// Convert milliseconds to seconds for Prometheus (standard unit)
const LATENCY_BUCKETS_SEC = LATENCY_BUCKETS_MS.map((ms) => ms / 1000);

/**
 * Escape label values according to Prometheus format
 * Backslash, double-quote, and newline must be escaped
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Format labels as Prometheus label string
 */
function formatLabels(
  labels: Record<string, string | number | null | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(labels)) {
    if (value !== null && value !== undefined && value !== "") {
      parts.push(`${key}="${escapeLabelValue(String(value))}"`);
    }
  }
  return parts.length > 0 ? `{${parts.join(",")}}` : "";
}

interface MetricValue {
  labels: Record<string, string | number | null | undefined>;
  value: number;
}

/**
 * Format a counter metric in Prometheus exposition format
 */
function formatCounter(
  name: string,
  help: string,
  values: MetricValue[],
): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
  for (const { labels, value } of values) {
    lines.push(`${name}${formatLabels(labels)} ${value}`);
  }
  return lines.join("\n");
}

/**
 * Format a gauge metric in Prometheus exposition format
 */
function formatGauge(
  name: string,
  help: string,
  values: MetricValue[],
): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  for (const { labels, value } of values) {
    lines.push(`${name}${formatLabels(labels)} ${value}`);
  }
  return lines.join("\n");
}

interface HistogramValue {
  labels: Record<string, string | number | null | undefined>;
  buckets: Map<number, number>; // le (in seconds) -> cumulative count
  sum: number;
  count: number;
}

/**
 * Format a histogram metric in Prometheus exposition format
 */
function formatHistogram(
  name: string,
  help: string,
  buckets: number[],
  values: HistogramValue[],
): string {
  const lines: string[] = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} histogram`,
  ];
  for (const { labels, buckets: bucketCounts, sum, count } of values) {
    // Output bucket lines
    for (const le of buckets) {
      const bucketCount = bucketCounts.get(le) ?? 0;
      lines.push(
        `${name}_bucket${formatLabels({ ...labels, le })} ${bucketCount}`,
      );
    }
    // +Inf bucket (total count)
    lines.push(
      `${name}_bucket${formatLabels({ ...labels, le: "+Inf" })} ${count}`,
    );
    // Sum and count
    lines.push(`${name}_sum${formatLabels(labels)} ${sum}`);
    lines.push(`${name}_count${formatLabels(labels)} ${count}`);
  }
  return lines.join("\n");
}

/**
 * Generate all Prometheus metrics
 */
export async function generatePrometheusMetrics(): Promise<string> {
  try {
    // Try to get cached metrics first
    const cachedMetrics = await redisClient.get(METRICS_CACHE_KEY);
    if (cachedMetrics) {
      logger.debug("Returning cached metrics");
      return cachedMetrics;
    }

    // Generate fresh metrics
    const metrics = await generateMetricsInternal();

    // Cache the metrics
    await redisClient.set(METRICS_CACHE_KEY, metrics, {
      EX: METRICS_CACHE_TTL_SECONDS,
    });

    return metrics;
  } catch (error) {
    logger.error("Error generating metrics:", error);
    // Return minimal fallback metrics on error
    return generateFallbackMetrics();
  }
}

/**
 * Generate fallback metrics when main generation fails
 */
function generateFallbackMetrics(): string {
  const sections: string[] = [];

  // Info metric always works
  sections.push(
    formatGauge("nexusgate_info", "NexusGate build information", [
      { labels: { version: COMMIT_SHA }, value: 1 },
    ]),
  );

  // Error indicator
  sections.push(
    formatGauge(
      "nexusgate_metrics_error",
      "Indicates metrics generation failed",
      [{ labels: {}, value: 1 }],
    ),
  );

  return sections.join("\n\n") + "\n";
}

/**
 * Internal metrics generation (the actual work)
 */
async function generateMetricsInternal(): Promise<string> {
  // Fetch all metrics data in parallel
  const [
    completionMetrics,
    embeddingMetrics,
    completionDurationHist,
    completionTTFTHist,
    embeddingDurationHist,
    entityCounts,
    apiKeyConfigs,
    rateLimitRejections,
  ] = await Promise.all([
    getCompletionMetricsByModelAndStatus(),
    getEmbeddingMetricsByModelAndStatus(),
    getCompletionDurationHistogram(),
    getCompletionTTFTHistogram(),
    getEmbeddingDurationHistogram(),
    getActiveEntityCounts(),
    getApiKeyRateLimitConfig(),
    getRateLimitRejections(),
  ]);

  const sections: string[] = [];

  // Info metric
  sections.push(
    formatGauge("nexusgate_info", "NexusGate build information", [
      { labels: { version: COMMIT_SHA }, value: 1 },
    ]),
  );

  // Completion counter metrics
  const completionCounts: MetricValue[] = [];
  const promptTokenCounts: Map<string, number> = new Map();
  const completionTokenCounts: Map<string, number> = new Map();

  for (const row of completionMetrics) {
    completionCounts.push({
      labels: {
        model: row.model,
        status: row.status,
        api_format: row.api_format,
        api_key_comment: row.api_key_comment,
      },
      value: Number(row.count),
    });

    // Aggregate tokens by model
    const currentPrompt = promptTokenCounts.get(row.model) ?? 0;
    promptTokenCounts.set(row.model, currentPrompt + Number(row.prompt_tokens));

    const currentCompletion = completionTokenCounts.get(row.model) ?? 0;
    completionTokenCounts.set(
      row.model,
      currentCompletion + Number(row.completion_tokens),
    );
  }

  if (completionCounts.length > 0) {
    sections.push(
      formatCounter(
        "nexusgate_completions_total",
        "Total number of completion requests",
        completionCounts,
      ),
    );
  }

  // Prompt token counter
  const promptTokenValues: MetricValue[] = [];
  for (const [model, tokens] of promptTokenCounts) {
    promptTokenValues.push({ labels: { model }, value: tokens });
  }
  if (promptTokenValues.length > 0) {
    sections.push(
      formatCounter(
        "nexusgate_tokens_prompt_total",
        "Total prompt tokens processed",
        promptTokenValues,
      ),
    );
  }

  // Completion token counter
  const completionTokenValues: MetricValue[] = [];
  for (const [model, tokens] of completionTokenCounts) {
    completionTokenValues.push({ labels: { model }, value: tokens });
  }
  if (completionTokenValues.length > 0) {
    sections.push(
      formatCounter(
        "nexusgate_tokens_completion_total",
        "Total completion tokens generated",
        completionTokenValues,
      ),
    );
  }

  // Embedding counter metrics
  const embeddingCounts: MetricValue[] = [];
  const embeddingTokenCounts: Map<string, number> = new Map();

  for (const row of embeddingMetrics) {
    embeddingCounts.push({
      labels: {
        model: row.model,
        status: row.status,
        api_key_comment: row.api_key_comment,
      },
      value: Number(row.count),
    });

    const currentTokens = embeddingTokenCounts.get(row.model) ?? 0;
    embeddingTokenCounts.set(
      row.model,
      currentTokens + Number(row.input_tokens),
    );
  }

  if (embeddingCounts.length > 0) {
    sections.push(
      formatCounter(
        "nexusgate_embeddings_total",
        "Total number of embedding requests",
        embeddingCounts,
      ),
    );
  }

  // Embedding token counter
  const embeddingTokenValues: MetricValue[] = [];
  for (const [model, tokens] of embeddingTokenCounts) {
    embeddingTokenValues.push({ labels: { model }, value: tokens });
  }
  if (embeddingTokenValues.length > 0) {
    sections.push(
      formatCounter(
        "nexusgate_tokens_embedding_total",
        "Total embedding tokens processed",
        embeddingTokenValues,
      ),
    );
  }

  // Completion duration histogram
  const durationHistValues = parseHistogramData(
    completionDurationHist,
    "duration",
  );
  if (durationHistValues.length > 0) {
    sections.push(
      formatHistogram(
        "nexusgate_completion_duration_seconds",
        "Completion request duration in seconds",
        LATENCY_BUCKETS_SEC,
        durationHistValues,
      ),
    );
  }

  // Completion TTFT histogram
  const ttftHistValues = parseHistogramData(completionTTFTHist, "ttft");
  if (ttftHistValues.length > 0) {
    sections.push(
      formatHistogram(
        "nexusgate_completion_ttft_seconds",
        "Time to first token in seconds",
        LATENCY_BUCKETS_SEC,
        ttftHistValues,
      ),
    );
  }

  // Embedding duration histogram
  const embeddingDurationHistValues = parseHistogramData(
    embeddingDurationHist,
    "duration",
  );
  if (embeddingDurationHistValues.length > 0) {
    sections.push(
      formatHistogram(
        "nexusgate_embedding_duration_seconds",
        "Embedding request duration in seconds",
        LATENCY_BUCKETS_SEC,
        embeddingDurationHistValues,
      ),
    );
  }

  // Gauge metrics for active entities
  sections.push(
    formatGauge(
      "nexusgate_active_api_keys",
      "Number of active (non-revoked) API keys",
      [{ labels: {}, value: entityCounts.apiKeys }],
    ),
  );

  sections.push(
    formatGauge("nexusgate_active_providers", "Number of active providers", [
      { labels: {}, value: entityCounts.providers },
    ]),
  );

  sections.push(
    formatGauge("nexusgate_active_models", "Number of active models", [
      { labels: { type: "chat" }, value: entityCounts.chatModels },
      { labels: { type: "embedding" }, value: entityCounts.embeddingModels },
    ]),
  );

  // API Key Rate Limit Metrics
  // Fetch current usage from Redis for each API key in parallel for better performance
  const rpmUsageValues: MetricValue[] = [];
  const rpmLimitValues: MetricValue[] = [];
  const tpmUsageValues: MetricValue[] = [];
  const tpmLimitValues: MetricValue[] = [];

  const rateLimitStatuses = await Promise.all(
    apiKeyConfigs.map(async (apiKey) =>
      getRateLimitStatus(apiKey.id, {
        rpmLimit: apiKey.rpmLimit,
        tpmLimit: apiKey.tpmLimit,
      }),
    ),
  );

  for (let i = 0; i < apiKeyConfigs.length; i++) {
    const apiKey = apiKeyConfigs[i];
    const status = rateLimitStatuses[i];
    if (!apiKey || !status) {
      continue;
    }

    const comment = apiKey.comment ?? "unknown";

    rpmUsageValues.push({
      labels: { api_key_comment: comment },
      value: status.rpm.current,
    });
    rpmLimitValues.push({
      labels: { api_key_comment: comment },
      value: status.rpm.limit,
    });
    tpmUsageValues.push({
      labels: { api_key_comment: comment },
      value: status.tpm.current,
    });
    tpmLimitValues.push({
      labels: { api_key_comment: comment },
      value: status.tpm.limit,
    });
  }

  if (rpmUsageValues.length > 0) {
    sections.push(
      formatGauge(
        "nexusgate_api_key_rpm_usage",
        "Current RPM usage per API key",
        rpmUsageValues,
      ),
    );
    sections.push(
      formatGauge(
        "nexusgate_api_key_rpm_limit",
        "RPM limit per API key",
        rpmLimitValues,
      ),
    );
    sections.push(
      formatGauge(
        "nexusgate_api_key_tpm_usage",
        "Current TPM usage per API key",
        tpmUsageValues,
      ),
    );
    sections.push(
      formatGauge(
        "nexusgate_api_key_tpm_limit",
        "TPM limit per API key",
        tpmLimitValues,
      ),
    );
  }

  // Rate Limit Rejection Counter
  // Field format is "apiKeyComment:limitType" where apiKeyComment may contain colons
  const rejectionValues: MetricValue[] = [];
  for (const [field, count] of Object.entries(rateLimitRejections)) {
    const parts = field.split(":");
    const limitType = parts.pop(); // Last part is always the limit type (rpm/tpm)
    const apiKeyComment = parts.join(":"); // Rejoin in case comment contained colons

    if (apiKeyComment && limitType) {
      rejectionValues.push({
        labels: { api_key_comment: apiKeyComment, limit_type: limitType },
        value: Number(count),
      });
    }
  }

  if (rejectionValues.length > 0) {
    sections.push(
      formatCounter(
        "nexusgate_rate_limit_rejections_total",
        "Total number of rate limit rejections (429 responses)",
        rejectionValues,
      ),
    );
  }

  return sections.join("\n\n") + "\n";
}

/**
 * Parse histogram data from database results
 */
function parseHistogramData(
  data: Record<string, string>[],
  sumField: "duration" | "ttft",
): HistogramValue[] {
  const values: HistogramValue[] = [];

  for (const row of data) {
    const model = row.model;
    const buckets = new Map<number, number>();

    // Parse bucket counts and convert to seconds
    for (const ms of LATENCY_BUCKETS_MS) {
      const bucketKey = `bucket_${ms}`;
      const count = Number(row[bucketKey] ?? 0);
      // Convert ms bucket boundary to seconds
      buckets.set(ms / 1000, count);
    }

    // Sum is in milliseconds in DB, convert to seconds
    const sum = Number(row[`${sumField}_sum`] ?? 0) / 1000;
    const count = Number(row.total_count ?? 0);

    values.push({
      labels: { model },
      buckets,
      sum,
      count,
    });
  }

  return values;
}

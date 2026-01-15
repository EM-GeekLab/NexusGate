import { Elysia, t } from "elysia";
import {
  getCompletionsModelDistribution,
  getCompletionsStats,
  getCompletionsTimeSeries,
  getEmbeddingsModelDistribution,
  getEmbeddingsStats,
  getEmbeddingsTimeSeries,
} from "@/db";

const RANGE_CONFIG: Record<
  string,
  { seconds: number; bucketSeconds: number }
> = {
  "1m": { seconds: 60, bucketSeconds: 5 },
  "5m": { seconds: 300, bucketSeconds: 15 },
  "10m": { seconds: 600, bucketSeconds: 30 },
  "30m": { seconds: 1800, bucketSeconds: 60 },
  "1h": { seconds: 3600, bucketSeconds: 120 },
  "4h": { seconds: 14400, bucketSeconds: 480 },
  "12h": { seconds: 43200, bucketSeconds: 1440 },
};

export const adminStats = new Elysia().group("/stats", (app) =>
  app.get(
    "/overview",
    async ({ query }) => {
      const rangeKey = query.range || "1h";
      const config = RANGE_CONFIG[rangeKey];

      if (!config) {
        throw new Error(`Invalid range: ${rangeKey}`);
      }

      // Pass rangeSeconds to database functions which will use NOW() - INTERVAL internally
      // This avoids timezone issues with 'timestamp without time zone' columns
      const rangeSeconds = config.seconds;

      // Fetch all data in parallel
      const [
        completionsStats,
        embeddingsStats,
        completionsModelDist,
        embeddingsModelDist,
        completionsTimeSeries,
        embeddingsTimeSeries,
      ] = await Promise.all([
        getCompletionsStats(rangeSeconds),
        getEmbeddingsStats(rangeSeconds),
        getCompletionsModelDistribution(rangeSeconds),
        getEmbeddingsModelDistribution(rangeSeconds),
        getCompletionsTimeSeries(rangeSeconds, config.bucketSeconds),
        getEmbeddingsTimeSeries(rangeSeconds, config.bucketSeconds),
      ]);

      // Calculate success rates
      const completionsTotal =
        Number(completionsStats.completed) + Number(completionsStats.failed);
      const embeddingsTotal =
        Number(embeddingsStats.completed) + Number(embeddingsStats.failed);

      const completionsSuccessRate =
        completionsTotal > 0
          ? (Number(completionsStats.completed) / completionsTotal) * 100
          : 100;

      const embeddingsSuccessRate =
        embeddingsTotal > 0
          ? (Number(embeddingsStats.completed) / embeddingsTotal) * 100
          : 100;

      // Merge model distributions
      const modelDistribution = [
        ...completionsModelDist.map((m) => ({
          model: m.model,
          count: m.count,
          type: "chat" as const,
        })),
        ...embeddingsModelDist.map((m) => ({
          model: m.model,
          count: m.count,
          type: "embedding" as const,
        })),
      ];

      // Merge time series data
      const timeSeriesMap = new Map<
        string,
        {
          timestamp: string;
          completionsCount: number;
          embeddingsCount: number;
          completionsFailed: number;
          embeddingsFailed: number;
          avgDuration: number;
          avgTTFT: number;
        }
      >();

      // Generate all buckets within the time range
      // Align start time to the bucket boundary to match DB bucketing and prevent mismatches
      // The DB uses: to_timestamp(floor(extract(epoch from created_at) / bucketSeconds) * bucketSeconds)
      const bucketMillis = config.bucketSeconds * 1000;
      const now = Date.now();
      // Align start time to bucket boundary (floor to nearest bucket)
      const alignedStart =
        Math.floor((now - config.seconds * 1000) / bucketMillis) * bucketMillis;
      const bucketCount = Math.ceil(config.seconds / config.bucketSeconds);

      for (let i = 0; i < bucketCount; i++) {
        const bucketTime = new Date(alignedStart + i * bucketMillis);
        const key = bucketTime.toISOString();
        timeSeriesMap.set(key, {
          timestamp: key,
          completionsCount: 0,
          embeddingsCount: 0,
          completionsFailed: 0,
          embeddingsFailed: 0,
          avgDuration: 0,
          avgTTFT: 0,
        });
      }

      // Fill in completions data
      for (const row of completionsTimeSeries) {
        const key = new Date(row.bucket).toISOString();
        const existing = timeSeriesMap.get(key);
        if (existing) {
          existing.completionsCount = Number(row.total);
          existing.completionsFailed = Number(row.failed);
          existing.avgDuration = Number(row.avg_duration);
          existing.avgTTFT = Number(row.avg_ttft);
        }
      }

      // Fill in embeddings data
      for (const row of embeddingsTimeSeries) {
        const key = new Date(row.bucket).toISOString();
        const existing = timeSeriesMap.get(key);
        if (existing) {
          const embeddingsCount = Number(row.total);
          existing.embeddingsCount = embeddingsCount;
          existing.embeddingsFailed = Number(row.failed);

          // Calculate weighted average duration if both completions and embeddings have data
          // Using weighted average: (avg1 * count1 + avg2 * count2) / (count1 + count2)
          const embeddingsDuration = Number(row.avg_duration);
          const completionsCount = existing.completionsCount;

          if (completionsCount > 0 && embeddingsCount > 0 && embeddingsDuration > 0) {
            // Both have data - calculate weighted average
            const totalDuration =
              existing.avgDuration * completionsCount +
              embeddingsDuration * embeddingsCount;
            const totalCount = completionsCount + embeddingsCount;
            existing.avgDuration = totalDuration / totalCount;
          } else if (embeddingsCount > 0 && embeddingsDuration > 0) {
            // Only embeddings have data for this bucket
            existing.avgDuration = embeddingsDuration;
          }
          // If only completions have data, keep existing.avgDuration as is
        }
      }

      const timeSeries = Array.from(timeSeriesMap.values()).sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      return {
        summary: {
          totalRequests: completionsStats.total + embeddingsStats.total,
          completionsCount: completionsStats.total,
          embeddingsCount: embeddingsStats.total,
          completionsSuccessRate: Math.round(completionsSuccessRate * 100) / 100,
          embeddingsSuccessRate: Math.round(embeddingsSuccessRate * 100) / 100,
          avgDuration: Math.round(Number(completionsStats.avgDuration)),
          avgTTFT: Math.round(Number(completionsStats.avgTTFT)),
        },
        tokenUsage: {
          promptTokens: Number(completionsStats.totalPromptTokens),
          completionTokens: Number(completionsStats.totalCompletionTokens),
          embeddingTokens: Number(embeddingsStats.totalInputTokens),
          totalTokens:
            Number(completionsStats.totalPromptTokens) +
            Number(completionsStats.totalCompletionTokens) +
            Number(embeddingsStats.totalInputTokens),
        },
        modelDistribution,
        timeSeries,
      };
    },
    {
      query: t.Object({
        range: t.Optional(
          t.Union([
            t.Literal("1m"),
            t.Literal("5m"),
            t.Literal("10m"),
            t.Literal("30m"),
            t.Literal("1h"),
            t.Literal("4h"),
            t.Literal("12h"),
          ]),
        ),
      }),
      detail: {
        description:
          "Get overview statistics for the dashboard including request counts, success rates, latency, and time series data.",
      },
    },
  ),
);

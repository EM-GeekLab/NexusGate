import { Elysia, t } from "elysia";
import {
  searchCompletions,
  aggregateCompletions,
  searchCompletionsTimeSeries,
  getDistinctFieldValues,
} from "@/db";
import { parseKql, compileSearch, getSearchableFields } from "@/search";
import { createLogger } from "@/utils/logger";

const logger = createLogger("search");

function parseTimeRange(
  from?: string,
  to?: string,
): { from: Date; to: Date } | undefined {
  if (!from || !to) {
    return undefined;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error("Invalid timeRange date");
  }
  if (fromDate > toDate) {
    throw new Error("timeRange.from must be <= timeRange.to");
  }
  return { from: fromDate, to: toDate };
}

function escapeCsvField(value: unknown): string {
  if (value == null) {
    return "";
  }
  const str =
    typeof value === "object"
      ? JSON.stringify(value)
      : String(value as string | number | boolean);
  if (
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r") ||
    str.includes('"')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const adminSearch = new Elysia()
  // Search completions
  .post(
    "/search",
    async ({ body, status }) => {
      const result = parseKql(body.query);
      if (!result.success) {
        return status(400, {
          error: "Invalid query",
          details: result.error,
        });
      }

      let timeRange: { from: Date; to: Date } | undefined;
      try {
        timeRange = parseTimeRange(body.timeRange?.from, body.timeRange?.to);
      } catch (err) {
        return status(400, {
          error: err instanceof Error ? err.message : "Invalid timeRange",
        });
      }
      let compiled;
      try {
        compiled = compileSearch(result.query, { timeRange });
      } catch (err) {
        return status(400, {
          error: "Invalid query",
          details: err instanceof Error ? err.message : "Compilation failed",
        });
      }

      // If the query has aggregation, return aggregation results
      if (compiled.aggregation) {
        try {
          const results = await aggregateCompletions(compiled);
          return { type: "aggregation" as const, results };
        } catch (err) {
          logger.error("Aggregation failed", { error: err });
          return status(500, {
            error: "Aggregation failed",
          });
        }
      }

      // Otherwise, return paginated document results
      try {
        const data = await searchCompletions(
          compiled,
          body.offset ?? 0,
          body.limit ?? 100,
        );
        // Truncate model names that contain '@'
        data.data.forEach((row) => {
          if (row.model && row.model.includes("@")) {
            row.model = row.model.split("@", 2)[0]!;
          }
        });
        return { type: "documents" as const, ...data };
      } catch (err) {
        logger.error("Search failed", { error: err });
        return status(500, {
          error: "Search failed",
        });
      }
    },
    {
      body: t.Object({
        query: t.String({ maxLength: 2000 }),
        timeRange: t.Optional(
          t.Object({
            from: t.Optional(t.String()),
            to: t.Optional(t.String()),
          }),
        ),
        offset: t.Optional(t.Integer({ minimum: 0 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
      }),
    },
  )
  // Search histogram (time series)
  .post(
    "/search/histogram",
    async ({ body, status }) => {
      const result = parseKql(body.query);
      if (!result.success) {
        return status(400, {
          error: "Invalid query",
          details: result.error,
        });
      }

      let timeRange: { from: Date; to: Date } | undefined;
      try {
        timeRange = parseTimeRange(body.timeRange?.from, body.timeRange?.to);
      } catch (err) {
        return status(400, {
          error: err instanceof Error ? err.message : "Invalid timeRange",
        });
      }
      let compiled;
      try {
        compiled = compileSearch(result.query, { timeRange });
      } catch (err) {
        return status(400, {
          error: "Invalid query",
          details: err instanceof Error ? err.message : "Compilation failed",
        });
      }

      try {
        const buckets = await searchCompletionsTimeSeries(
          compiled,
          body.bucketSeconds ?? 60,
        );
        return { buckets };
      } catch (err) {
        logger.error("Histogram query failed", { error: err });
        return status(500, {
          error: "Histogram query failed",
        });
      }
    },
    {
      body: t.Object({
        query: t.String({ maxLength: 2000 }),
        timeRange: t.Optional(
          t.Object({
            from: t.Optional(t.String()),
            to: t.Optional(t.String()),
          }),
        ),
        bucketSeconds: t.Optional(t.Integer({ minimum: 1 })),
      }),
    },
  )
  // Get searchable fields (for autocomplete)
  .get("/search/fields", async () => {
    const fields = getSearchableFields();

    // Enrich with distinct values for key fields
    const modelValues = await getDistinctFieldValues("model");

    return {
      fields: fields.map((f) => {
        if (f.name === "model") {
          return Object.assign({}, f, { values: modelValues });
        }
        return f;
      }),
    };
  })
  // Export search results
  .post(
    "/search/export",
    async ({ body, status, set }) => {
      const result = parseKql(body.query);
      if (!result.success) {
        return status(400, {
          error: "Invalid query",
          details: result.error,
        });
      }

      let timeRange: { from: Date; to: Date } | undefined;
      try {
        timeRange = parseTimeRange(body.timeRange?.from, body.timeRange?.to);
      } catch (err) {
        return status(400, {
          error: err instanceof Error ? err.message : "Invalid timeRange",
        });
      }
      let compiled;
      try {
        compiled = compileSearch(result.query, { timeRange });
      } catch (err) {
        return status(400, {
          error: "Invalid query",
          details: err instanceof Error ? err.message : "Compilation failed",
        });
      }

      try {
        // Fetch all results (up to 10000 for export)
        const data = await searchCompletions(compiled, 0, 10000);

        if (body.format === "csv") {
          set.headers["content-type"] = "text/csv";
          set.headers["content-disposition"] =
            'attachment; filename="search-results.csv"';

          const headers = [
            "id",
            "model",
            "status",
            "duration",
            "ttft",
            "prompt_tokens",
            "completion_tokens",
            "created_at",
            "provider_name",
            "api_format",
            "rating",
          ];
          const rows = data.data.map((row) =>
            [
              escapeCsvField(row.id),
              escapeCsvField(row.model),
              escapeCsvField(row.status),
              escapeCsvField(row.duration),
              escapeCsvField(row.ttft),
              escapeCsvField(row.prompt_tokens),
              escapeCsvField(row.completion_tokens),
              escapeCsvField(row.created_at),
              escapeCsvField(row.provider_name),
              escapeCsvField(row.api_format),
              escapeCsvField(row.rating),
            ].join(","),
          );
          return [headers.join(","), ...rows].join("\n");
        }

        // JSON format
        set.headers["content-type"] = "application/json";
        set.headers["content-disposition"] =
          'attachment; filename="search-results.json"';
        return JSON.stringify(data.data, null, 2);
      } catch (err) {
        logger.error("Export failed", { error: err });
        return status(500, {
          error: "Export failed",
        });
      }
    },
    {
      body: t.Object({
        query: t.String({ maxLength: 2000 }),
        timeRange: t.Optional(
          t.Object({
            from: t.Optional(t.String()),
            to: t.Optional(t.String()),
          }),
        ),
        format: t.Union([t.Literal("csv"), t.Literal("json")]),
      }),
    },
  );

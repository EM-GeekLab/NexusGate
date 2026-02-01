import { Elysia, t } from "elysia";
import {
  parseKql,
  compileSearch,
  getSearchableFields,
} from "@/search";
import {
  searchCompletions,
  aggregateCompletions,
  searchCompletionsTimeSeries,
  getDistinctFieldValues,
} from "@/db";

function parseTimeRange(
  from?: string,
  to?: string,
): { from: Date; to: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }
  return {
    from: from ? new Date(from) : new Date(Date.now() - 3600_000), // default: 1h ago
    to: to ? new Date(to) : new Date(),
  };
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

      const timeRange = parseTimeRange(body.timeRange?.from, body.timeRange?.to);
      const compiled = compileSearch(result.query, { timeRange });

      // If the query has aggregation, return aggregation results
      if (compiled.aggregation) {
        try {
          const results = await aggregateCompletions(compiled);
          return { type: "aggregation" as const, results };
        } catch (err) {
          return status(500, {
            error: "Aggregation failed",
            details: String(err),
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
        return status(500, {
          error: "Search failed",
          details: String(err),
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

      const timeRange = parseTimeRange(body.timeRange?.from, body.timeRange?.to);
      const compiled = compileSearch(result.query, { timeRange });

      try {
        const buckets = await searchCompletionsTimeSeries(
          compiled,
          body.bucketSeconds ?? 60,
        );
        return { buckets };
      } catch (err) {
        return status(500, {
          error: "Histogram query failed",
          details: String(err),
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

      const timeRange = parseTimeRange(body.timeRange?.from, body.timeRange?.to);
      const compiled = compileSearch(result.query, { timeRange });

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
              row.id,
              `"${(row.model || "").replace(/"/g, '""')}"`,
              row.status,
              row.duration,
              row.ttft,
              row.prompt_tokens,
              row.completion_tokens,
              row.created_at,
              `"${(row.provider_name || "").replace(/"/g, '""')}"`,
              row.api_format || "",
              row.rating ?? "",
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
        return status(500, {
          error: "Export failed",
          details: String(err),
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

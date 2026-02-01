import { describe, expect, test } from "bun:test";
import { parseKql } from "../parser";
import { compileSearch } from "../compiler";

function compile(input: string, options?: { timeRange?: { from: Date; to: Date } }) {
  const result = parseKql(input);
  if (!result.success) {
    throw new Error(`Parse error: ${result.error.message}`);
  }
  return compileSearch(result.query, options);
}

describe("SQL Compiler", () => {
  describe("basic filters", () => {
    test("empty query produces only deleted=false filter", () => {
      const compiled = compileSearch({});
      expect(compiled.whereClause).toBe("c.deleted = false");
      expect(compiled.params).toEqual([]);
    });

    test('model: "gpt-4" compiles to equality', () => {
      const compiled = compile('model: "gpt-4"');
      expect(compiled.whereClause).toBe("c.deleted = false AND c.model = $1");
      expect(compiled.params).toEqual(["gpt-4"]);
    });

    test("duration >= 1000 compiles to range comparison", () => {
      const compiled = compile("duration >= 1000");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.duration >= $1",
      );
      expect(compiled.params).toEqual([1000]);
    });

    test("status: completed validates enum value", () => {
      const compiled = compile("status: completed");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.status = $1",
      );
      expect(compiled.params).toEqual(["completed"]);
    });

    test("status with invalid enum value throws", () => {
      expect(() => compile("status: invalid")).toThrow("Invalid value");
    });

    test("wildcard compiles to ILIKE", () => {
      const compiled = compile("model: *gpt*");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.model ILIKE $1",
      );
      expect(compiled.params).toEqual(["%gpt%"]);
    });

    test("enum wildcard casts to text", () => {
      const compiled = compile("status: *fail*");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.status::text ILIKE $1",
      );
      expect(compiled.params).toEqual(["%fail%"]);
    });
  });

  describe("boolean operators", () => {
    test("AND combines with AND", () => {
      const compiled = compile(
        'model: "gpt-4" AND status: completed',
      );
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND (c.model = $1 AND c.status = $2)",
      );
      expect(compiled.params).toEqual(["gpt-4", "completed"]);
    });

    test("OR combines with OR", () => {
      const compiled = compile(
        'status: failed OR status: aborted',
      );
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND (c.status = $1 OR c.status = $2)",
      );
      expect(compiled.params).toEqual(["failed", "aborted"]);
    });

    test("NOT wraps with NOT", () => {
      const compiled = compile("NOT status: pending");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND NOT (c.status = $1)",
      );
      expect(compiled.params).toEqual(["pending"]);
    });

    test("grouped expression", () => {
      const compiled = compile(
        '(status: completed OR status: cache_hit) AND model: *gpt*',
      );
      expect(compiled.whereClause).toContain("(c.status = $1 OR c.status = $2)");
      expect(compiled.whereClause).toContain("c.model ILIKE $3");
      expect(compiled.params).toEqual(["completed", "cache_hit", "%gpt%"]);
    });
  });

  describe("timestamp fields", () => {
    test("createdAt >= compiles with ::timestamp cast", () => {
      const compiled = compile('createdAt >= "2024-01-01"');
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.created_at >= $1::timestamp",
      );
      expect(compiled.params).toEqual(["2024-01-01"]);
    });
  });

  describe("JSONB fields", () => {
    test('extraHeaders.x-experiment compiles to JSONB path', () => {
      const compiled = compile(
        'extraHeaders.x-experiment: "group_a"',
      );
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND (c.prompt #>> '{}')::jsonb->'extraHeaders'->>'x-experiment' = $1",
      );
      expect(compiled.params).toEqual(["group_a"]);
    });

    test("JSONB wildcard compiles to ILIKE", () => {
      const compiled = compile("extraHeaders.x-experiment: *group*");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND (c.prompt #>> '{}')::jsonb->'extraHeaders'->>'x-experiment' ILIKE $1",
      );
      expect(compiled.params).toEqual(["%group%"]);
    });

    test("bare JSONB field without path throws", () => {
      expect(() => compile('extraHeaders: "value"')).toThrow(
        "requires a nested path",
      );
    });

    test("unknown field throws", () => {
      expect(() => compile('unknownField: "value"')).toThrow("Unknown field");
    });
  });

  describe("time range option", () => {
    test("time range adds created_at bounds", () => {
      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-01-31T23:59:59Z");
      const compiled = compile('model: "gpt-4"', {
        timeRange: { from, to },
      });
      expect(compiled.whereClause).toContain("c.created_at >= $1");
      expect(compiled.whereClause).toContain("c.created_at <= $2");
      expect(compiled.whereClause).toContain("c.model = $3");
      expect(compiled.params).toEqual([from, to, "gpt-4"]);
    });

    test("time range is skipped when query has explicit createdAt filter", () => {
      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-01-31T23:59:59Z");
      const compiled = compile('createdAt < "2026-01-30 22:12:18"', {
        timeRange: { from, to },
      });
      // Should NOT contain automatic time range params
      expect(compiled.whereClause).not.toContain("c.created_at >= ");
      expect(compiled.whereClause).not.toContain("c.created_at <= ");
      // Should contain only the user's explicit filter
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.created_at < $1::timestamp",
      );
      expect(compiled.params).toEqual(["2026-01-30 22:12:18"]);
    });

    test("time range is skipped when createdAt is inside AND/OR", () => {
      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-01-31T23:59:59Z");
      const compiled = compile(
        'createdAt >= "2025-01-01" AND createdAt < "2025-02-01"',
        { timeRange: { from, to } },
      );
      expect(compiled.whereClause).not.toContain("c.created_at <= ");
      expect(compiled.params).toEqual(["2025-01-01", "2025-02-01"]);
    });
  });

  describe("aggregation", () => {
    test("count() compiles to COUNT(*)", () => {
      const compiled = compile("| stats count()");
      expect(compiled.aggregation).toBeDefined();
      expect(compiled.aggregation!.selectExpressions).toEqual([
        { sql: "COUNT(*)", alias: "count" },
      ]);
    });

    test("avg(duration) compiles to AVG()", () => {
      const compiled = compile("| stats avg(duration)");
      expect(compiled.aggregation!.selectExpressions).toEqual([
        { sql: "AVG(c.duration)", alias: "avg_duration" },
      ]);
    });

    test("p95(ttft) compiles to percentile_cont", () => {
      const compiled = compile("| stats p95(ttft)");
      expect(compiled.aggregation!.selectExpressions).toEqual([
        {
          sql: "percentile_cont(0.95) WITHIN GROUP (ORDER BY c.ttft)",
          alias: "p95_ttft",
        },
      ]);
    });

    test("multiple aggregations", () => {
      const compiled = compile(
        "| stats avg(duration), count(), p95(ttft)",
      );
      expect(compiled.aggregation!.selectExpressions).toHaveLength(3);
    });

    test("GROUP BY compiles correctly", () => {
      const compiled = compile("| stats count() by status");
      expect(compiled.aggregation!.groupByColumn).toBe("c.status");
      expect(compiled.aggregation!.groupByField).toBe("status");
    });

    test("filter + aggregation + group by", () => {
      const compiled = compile(
        'model: "gpt-4" | stats avg(duration), count() by status',
      );
      expect(compiled.whereClause).toContain("c.model = $1");
      expect(compiled.params).toEqual(["gpt-4"]);
      expect(compiled.aggregation!.selectExpressions).toHaveLength(2);
      expect(compiled.aggregation!.groupByColumn).toBe("c.status");
    });

    test("aggregation on unknown field throws", () => {
      expect(() => compile("| stats avg(unknown)")).toThrow("Unknown field");
    });
  });

  describe("parameter ordering", () => {
    test("parameters are numbered sequentially", () => {
      const compiled = compile(
        'model: "gpt-4" AND duration >= 1000 AND status: completed',
      );
      // Should have $1, $2, $3
      expect(compiled.params).toEqual(["gpt-4", 1000, "completed"]);
      expect(compiled.whereClause).toContain("$1");
      expect(compiled.whereClause).toContain("$2");
      expect(compiled.whereClause).toContain("$3");
    });
  });

  describe("provider field", () => {
    test("provider compiles to joined p.name", () => {
      const compiled = compile('provider: "openai"');
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND p.name = $1",
      );
      expect(compiled.params).toEqual(["openai"]);
    });
  });

  describe("EXISTS expressions", () => {
    test("JSONB root field EXISTS compiles to IS NOT NULL", () => {
      const compiled = compile("extraBody EXISTS");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND (c.prompt #>> '{}')::jsonb->'extraBody' IS NOT NULL",
      );
      expect(compiled.params).toEqual([]);
    });

    test("toolCalls EXISTS compiles with array element search", () => {
      const compiled = compile("toolCalls EXISTS");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND EXISTS (SELECT 1 FROM jsonb_array_elements((c.completion #>> '{}')::jsonb) _elem WHERE _elem->'tool_calls' IS NOT NULL)",
      );
      expect(compiled.params).toEqual([]);
    });

    test("nested JSONB EXISTS compiles to path IS NOT NULL", () => {
      const compiled = compile("extraHeaders.x-app EXISTS");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND (c.prompt #>> '{}')::jsonb->'extraHeaders'->>'x-app' IS NOT NULL",
      );
      expect(compiled.params).toEqual([]);
    });

    test("non-JSONB field EXISTS compiles to IS NOT NULL", () => {
      const compiled = compile("rating EXISTS");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND c.rating IS NOT NULL",
      );
      expect(compiled.params).toEqual([]);
    });

    test("NOT EXISTS compiles correctly", () => {
      const compiled = compile("NOT extraBody EXISTS");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND NOT ((c.prompt #>> '{}')::jsonb->'extraBody' IS NOT NULL)",
      );
      expect(compiled.params).toEqual([]);
    });

    test("EXISTS combined with other filters", () => {
      const compiled = compile(
        'toolCalls EXISTS AND model: "claude-haiku-*"',
      );
      expect(compiled.whereClause).toContain(
        "jsonb_array_elements",
      );
      expect(compiled.whereClause).toContain("c.model");
    });
  });

  describe("array-rooted JSONB comparisons", () => {
    test("toolCalls.function.name equality", () => {
      const compiled = compile('toolCalls.function.name: "calculate"');
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND EXISTS (SELECT 1 FROM jsonb_array_elements((c.completion #>> '{}')::jsonb) _msg, jsonb_array_elements(_msg->'tool_calls') _tc WHERE _tc->'function'->>'name' = $1)",
      );
      expect(compiled.params).toEqual(["calculate"]);
    });

    test("toolCalls.function.name wildcard", () => {
      const compiled = compile("toolCalls.function.name: *calc*");
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND EXISTS (SELECT 1 FROM jsonb_array_elements((c.completion #>> '{}')::jsonb) _msg, jsonb_array_elements(_msg->'tool_calls') _tc WHERE _tc->'function'->>'name' ILIKE $1)",
      );
      expect(compiled.params).toEqual(["%calc%"]);
    });

    test("toolCalls.type single-level path", () => {
      const compiled = compile('toolCalls.type: "function"');
      expect(compiled.whereClause).toBe(
        "c.deleted = false AND EXISTS (SELECT 1 FROM jsonb_array_elements((c.completion #>> '{}')::jsonb) _msg, jsonb_array_elements(_msg->'tool_calls') _tc WHERE _tc->>'type' = $1)",
      );
      expect(compiled.params).toEqual(["function"]);
    });

    test("bare toolCalls comparison throws", () => {
      expect(() => compile('toolCalls: "value"')).toThrow(
        "requires a nested path",
      );
    });

    test("combined with other filters", () => {
      const compiled = compile(
        'toolCalls.function.name: "calculate" AND status: completed',
      );
      expect(compiled.whereClause).toContain("jsonb_array_elements");
      expect(compiled.whereClause).toContain("c.status = $2");
      expect(compiled.params).toEqual(["calculate", "completed"]);
    });
  });
});

import { describe, expect, test } from "bun:test";
import { parseKql } from "../parser";

describe("KQL Parser", () => {
  describe("empty/whitespace input", () => {
    test("empty string returns empty query", () => {
      const result = parseKql("");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query).toEqual({});
      }
    });

    test("whitespace-only returns empty query", () => {
      const result = parseKql("   ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query).toEqual({});
      }
    });
  });

  describe("simple comparisons", () => {
    test('model: "gpt-4"', () => {
      const result = parseKql('model: "gpt-4"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "model",
          operator: ":",
          value: { type: "string", value: "gpt-4" },
        });
      }
    });

    test("status: completed (unquoted value)", () => {
      const result = parseKql("status: completed");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "status",
          operator: ":",
          value: { type: "string", value: "completed" },
        });
      }
    });

    test("duration >= 1000", () => {
      const result = parseKql("duration >= 1000");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "duration",
          operator: ">=",
          value: { type: "number", value: 1000 },
        });
      }
    });

    test("promptTokens < 5000", () => {
      const result = parseKql("promptTokens < 5000");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "promptTokens",
          operator: "<",
          value: { type: "number", value: 5000 },
        });
      }
    });

    test("rating = 4.5", () => {
      const result = parseKql("rating = 4.5");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "rating",
          operator: "=",
          value: { type: "number", value: 4.5 },
        });
      }
    });

    test("status != failed", () => {
      const result = parseKql('status != "failed"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "status",
          operator: "!=",
          value: { type: "string", value: "failed" },
        });
      }
    });
  });

  describe("wildcard values", () => {
    test("model: *gpt*", () => {
      const result = parseKql("model: *gpt*");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "model",
          operator: ":",
          value: { type: "wildcard", pattern: "*gpt*" },
        });
      }
    });

    test("model: gpt-*", () => {
      const result = parseKql("model: gpt-*");
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter;
        expect(filter?.type).toBe("comparison");
        if (filter?.type === "comparison") {
          expect(filter.value).toEqual({ type: "wildcard", pattern: "gpt-*" });
        }
      }
    });
  });

  describe("boolean operators", () => {
    test('model: "gpt-4" AND status: "completed"', () => {
      const result = parseKql('model: "gpt-4" AND status: "completed"');
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter!;
        expect(filter.type).toBe("and");
        if (filter.type === "and") {
          expect(filter.left).toEqual({
            type: "comparison",
            field: "model",
            operator: ":",
            value: { type: "string", value: "gpt-4" },
          });
          expect(filter.right).toEqual({
            type: "comparison",
            field: "status",
            operator: ":",
            value: { type: "string", value: "completed" },
          });
        }
      }
    });

    test('status: "failed" OR status: "aborted"', () => {
      const result = parseKql('status: "failed" OR status: "aborted"');
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter!;
        expect(filter.type).toBe("or");
      }
    });

    test("NOT status: pending", () => {
      const result = parseKql("NOT status: pending");
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter!;
        expect(filter.type).toBe("not");
        if (filter.type === "not") {
          expect(filter.expression.type).toBe("comparison");
        }
      }
    });

    test("AND has higher precedence than OR", () => {
      // a OR b AND c should parse as a OR (b AND c)
      const result = parseKql(
        'status: failed OR model: "gpt-4" AND duration >= 1000',
      );
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter!;
        expect(filter.type).toBe("or");
        if (filter.type === "or") {
          expect(filter.left.type).toBe("comparison");
          expect(filter.right.type).toBe("and");
        }
      }
    });
  });

  describe("grouping with parentheses", () => {
    test('(status: "completed" OR status: "cache_hit") AND model: *gpt*', () => {
      const result = parseKql(
        '(status: "completed" OR status: "cache_hit") AND model: *gpt*',
      );
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter!;
        expect(filter.type).toBe("and");
        if (filter.type === "and") {
          expect(filter.left.type).toBe("group");
          if (filter.left.type === "group") {
            expect(filter.left.expression.type).toBe("or");
          }
          expect(filter.right.type).toBe("comparison");
        }
      }
    });
  });

  describe("nested JSONB fields", () => {
    test('extraHeaders.x-experiment: "group_a"', () => {
      const result = parseKql('extraHeaders.x-experiment: "group_a"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "comparison",
          field: "extraHeaders.x-experiment",
          operator: ":",
          value: { type: "string", value: "group_a" },
        });
      }
    });

    test('extraBody.temperature: "0.7"', () => {
      const result = parseKql('extraBody.temperature: "0.7"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter?.type).toBe("comparison");
      }
    });
  });

  describe("aggregation", () => {
    test("| stats count()", () => {
      const result = parseKql("| stats count()");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toBeUndefined();
        expect(result.query.aggregation).toEqual({
          functions: [{ fn: "count", field: undefined }],
          groupBy: undefined,
        });
      }
    });

    test('model: "gpt-4" | stats avg(duration), count(), p95(ttft) by status', () => {
      const result = parseKql(
        'model: "gpt-4" | stats avg(duration), count(), p95(ttft) by status',
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter?.type).toBe("comparison");
        expect(result.query.aggregation).toEqual({
          functions: [
            { fn: "avg", field: "duration" },
            { fn: "count", field: undefined },
            { fn: "p95", field: "ttft" },
          ],
          groupBy: ["status"],
        });
      }
    });

    test("| stats sum(promptTokens), max(duration) by model", () => {
      const result = parseKql(
        "| stats sum(promptTokens), max(duration) by model",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.aggregation?.functions).toHaveLength(2);
        expect(result.query.aggregation?.groupBy).toEqual(["model"]);
      }
    });
  });

  describe("complex queries", () => {
    test('(model: "gpt-4" OR model: "claude-3") AND status: "failed"', () => {
      const result = parseKql(
        '(model: "gpt-4" OR model: "claude-3") AND status: "failed"',
      );
      expect(result.success).toBe(true);
    });

    test("duration >= 1000 AND promptTokens < 5000 AND status: completed", () => {
      const result = parseKql(
        "duration >= 1000 AND promptTokens < 5000 AND status: completed",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        // Should produce nested AND nodes
        const filter = result.query.filter!;
        expect(filter.type).toBe("and");
      }
    });

    test("filter with aggregation", () => {
      const result = parseKql(
        "status: completed AND duration >= 500 | stats avg(duration), p95(ttft), count() by model",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toBeDefined();
        expect(result.query.aggregation).toBeDefined();
        expect(result.query.aggregation?.functions).toHaveLength(3);
        expect(result.query.aggregation?.groupBy).toEqual(["model"]);
      }
    });
  });

  describe("error cases", () => {
    test("missing value after operator", () => {
      const result = parseKql("model:");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Expected value");
      }
    });

    test("unclosed parenthesis", () => {
      const result = parseKql('(status: "failed"');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("RPAREN");
      }
    });

    test("unterminated string", () => {
      const result = parseKql('model: "gpt-4');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Unterminated string");
      }
    });

    test("missing operator after field", () => {
      const result = parseKql('model "gpt-4"');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("operator");
      }
    });

    test("unknown aggregate function", () => {
      const result = parseKql("| stats unknown(field)");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Unknown aggregate function");
      }
    });

    test("count() with field argument", () => {
      const result = parseKql("| stats count(duration)");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("does not take a field");
      }
    });

    test("avg() without field argument", () => {
      const result = parseKql("| stats avg()");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("requires a field");
      }
    });

    test("unexpected token after valid query", () => {
      const result = parseKql('model: "gpt-4" extra');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Unexpected");
      }
    });
  });

  describe("quoted strings with escapes", () => {
    test("escaped quote in string", () => {
      const result = parseKql('model: "gpt-\\"4\\""');
      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.query.filter;
        if (filter?.type === "comparison") {
          expect(filter.value).toEqual({
            type: "string",
            value: 'gpt-"4"',
          });
        }
      }
    });
  });

  describe("EXISTS expressions", () => {
    test("simple EXISTS parses correctly", () => {
      const result = parseKql("extraBody EXISTS");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "exists",
          field: "extraBody",
        });
      }
    });

    test("nested field EXISTS parses correctly", () => {
      const result = parseKql("extraHeaders.x-app EXISTS");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter).toEqual({
          type: "exists",
          field: "extraHeaders.x-app",
        });
      }
    });

    test("EXISTS combined with AND", () => {
      const result = parseKql('extraBody EXISTS AND model: "gpt-4"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter?.type).toBe("and");
      }
    });

    test("NOT EXISTS", () => {
      const result = parseKql("NOT toolCalls EXISTS");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.query.filter?.type).toBe("not");
      }
    });
  });
});

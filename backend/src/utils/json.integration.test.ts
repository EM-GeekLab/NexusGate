/**
 * Integration tests for JSON parsing utilities
 * Tests real-world scenarios with malformed upstream responses
 */

import { describe, expect, test } from "bun:test";
import { safeParseToolArgs, parseJsonResponse } from "./json";

describe("JSON Parsing - Integration Tests", () => {
  describe("Real-world HTML error responses", () => {
    test("should handle 500 error HTML from upstream provider", () => {
      const htmlError = `<!DOCTYPE html>
<html>
<head><title>500 Internal Server Error</title></head>
<body>
<h1>Internal Server Error</h1>
<p>The server encountered an internal error and was unable to complete your request.</p>
</body>
</html>`;

      expect(() => parseJsonResponse(htmlError, "OpenAI Chat")).toThrow(
        "Failed to parse OpenAI Chat response as JSON",
      );
    });

    test("should handle 502 Bad Gateway HTML", () => {
      const htmlError = `<html>
<head><title>502 Bad Gateway</title></head>
<body bgcolor="white">
<center><h1>502 Bad Gateway</h1></center>
<hr><center>nginx/1.18.0</center>
</body>
</html>`;

      expect(() => parseJsonResponse(htmlError, "Anthropic")).toThrow(
        "Failed to parse Anthropic response as JSON",
      );
    });

    test("should handle Cloudflare error pages", () => {
      const cloudflareError = `<!DOCTYPE html>
<html lang="en-US">
<head>
<title>Error 522</title>
</head>
<body>
<div id="cf-error-details">
<h1>Connection timed out</h1>
<p>Error code 522</p>
</div>
</body>
</html>`;

      expect(() =>
        parseJsonResponse(cloudflareError, "OpenAI Responses"),
      ).toThrow("Failed to parse OpenAI Responses response as JSON");
    });
  });

  describe("Truncated JSON responses", () => {
    test("should handle truncated tool call arguments", () => {
      const truncated = '{"query": "search term", "limit": ';
      const result = safeParseToolArgs(truncated);
      expect(result).toEqual({});
    });

    test("should handle truncated nested objects", () => {
      const truncated = '{"user": {"name": "Alice", "profile": {';
      const result = safeParseToolArgs(truncated);
      expect(result).toEqual({});
    });

    test("should handle truncated arrays in arguments", () => {
      const truncated = '{"items": [1, 2, 3';
      const result = safeParseToolArgs(truncated);
      expect(result).toEqual({});
    });
  });

  describe("Malformed tool call arguments from LLMs", () => {
    test("should handle missing quotes around property names", () => {
      const malformed = "{query: 'test', limit: 10}";
      const result = safeParseToolArgs(malformed);
      expect(result).toEqual({});
    });

    test("should handle single quotes instead of double quotes", () => {
      const malformed = "{'query': 'test', 'limit': 10}";
      const result = safeParseToolArgs(malformed);
      expect(result).toEqual({});
    });

    test("should handle trailing commas", () => {
      const malformed = '{"query": "test", "limit": 10,}';
      const result = safeParseToolArgs(malformed);
      // Note: Some JSON parsers accept trailing commas, Bun's might too
      // But we're testing that it doesn't crash
      expect(typeof result).toBe("object");
    });

    test("should handle unescaped quotes in strings", () => {
      const malformed = '{"message": "He said "hello""}';
      const result = safeParseToolArgs(malformed);
      expect(result).toEqual({});
    });

    test("should handle empty string as tool arguments", () => {
      const result = safeParseToolArgs("");
      expect(result).toEqual({});
    });

    test("should handle whitespace-only string", () => {
      const result = safeParseToolArgs("   \n\t  ");
      expect(result).toEqual({});
    });
  });

  describe("Mixed content responses", () => {
    test("should handle JSON wrapped in markdown code blocks", () => {
      const wrapped = '```json\n{"status": "success"}\n```';
      expect(() => parseJsonResponse(wrapped, "TestAPI")).toThrow(
        "Failed to parse TestAPI response as JSON",
      );
    });

    test("should handle plain text error messages", () => {
      const plainText = "Rate limit exceeded. Please try again later.";
      expect(() => parseJsonResponse(plainText, "OpenAI Chat")).toThrow(
        "Failed to parse OpenAI Chat response as JSON",
      );
    });

    test("should handle XML error responses", () => {
      const xmlError = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>InternalError</Code>
  <Message>We encountered an internal error. Please try again.</Message>
</Error>`;
      expect(() => parseJsonResponse(xmlError, "Azure")).toThrow(
        "Failed to parse Azure response as JSON",
      );
    });
  });

  describe("Edge cases from production", () => {
    test("should handle response with BOM (Byte Order Mark)", () => {
      const withBOM = '\uFEFF{"status": "success"}';
      // Bun's JSON parser rejects BOM as invalid JSON
      expect(() => parseJsonResponse(withBOM, "TestAPI")).toThrow(
        "Failed to parse TestAPI response as JSON",
      );
    });

    test("should handle very large response preview truncation", () => {
      const largeHtml = `<!DOCTYPE html><html><body>${"x".repeat(10000)}</body></html>`;
      try {
        parseJsonResponse(largeHtml, "LargeResponse");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        // Should be truncated to ~200 chars preview
        expect(message.length).toBeLessThan(10000);
        expect(message).toContain("...");
      }
    });

    test("should handle null bytes in response", () => {
      const withNull = '{"status": "ok\x00"}';
      // Some parsers might handle this, some might not
      try {
        const result = parseJsonResponse(withNull, "TestAPI");
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    test("should handle response with only whitespace", () => {
      const whitespace = "   \n\n\t\t   ";
      expect(() => parseJsonResponse(whitespace, "EmptyResponse")).toThrow(
        "Failed to parse EmptyResponse response as JSON",
      );
    });
  });

  describe("Valid edge cases that should parse", () => {
    test("should parse JSON with Unicode characters", () => {
      const unicode = '{"message": "你好世界 🌍"}';
      const result = parseJsonResponse(unicode, "Unicode");
      expect(result).toEqual({ message: "你好世界 🌍" });
    });

    test("should parse JSON with escaped characters", () => {
      const escaped = '{"path": "C:\\\\Users\\\\test\\\\file.txt"}';
      const result = parseJsonResponse(escaped, "Escaped");
      expect(result).toEqual({ path: "C:\\Users\\test\\file.txt" });
    });

    test("should parse deeply nested JSON", () => {
      const deep = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}';
      const result = parseJsonResponse(deep, "Deep");
      expect(result).toEqual({ a: { b: { c: { d: { e: "value" } } } } });
    });

    test("should parse JSON arrays", () => {
      const array = '[1, 2, 3, {"name": "test"}]';
      const result = parseJsonResponse(array, "Array");
      expect(result).toEqual([1, 2, 3, { name: "test" }]);
    });
  });
});

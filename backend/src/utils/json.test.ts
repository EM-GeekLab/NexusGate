/**
 * Unit tests for JSON parsing utilities
 */

import { describe, expect, test } from "bun:test";
import { safeParseToolArgs, parseJsonResponse } from "./json";

describe("safeParseToolArgs", () => {
  test("should parse valid JSON object", () => {
    const input = '{"name": "test", "value": 42}';
    const result = safeParseToolArgs(input);
    expect(result).toEqual({ name: "test", value: 42 });
  });

  test("should parse empty JSON object", () => {
    const input = "{}";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should parse JSON with nested objects", () => {
    const input = '{"user": {"name": "Alice", "age": 30}}';
    const result = safeParseToolArgs(input);
    expect(result).toEqual({ user: { name: "Alice", age: 30 } });
  });

  test("should return empty object for malformed JSON", () => {
    const input = '{"name": "test", invalid}';
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for HTML content", () => {
    const input = "<html><body>Error 500</body></html>";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for truncated JSON", () => {
    const input = '{"name": "test", "value": ';
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for empty string", () => {
    const input = "";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for plain text", () => {
    const input = "This is not JSON";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for scalar number", () => {
    const input = "123";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for scalar boolean", () => {
    const input = "true";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for scalar string", () => {
    const input = '"hello"';
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for null", () => {
    const input = "null";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for array", () => {
    const input = "[1, 2, 3]";
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });

  test("should return empty object for array of objects", () => {
    const input = '[{"name": "test"}]';
    const result = safeParseToolArgs(input);
    expect(result).toEqual({});
  });
});

describe("parseJsonResponse", () => {
  test("should parse valid JSON object", () => {
    const input = '{"status": "success", "data": [1, 2, 3]}';
    const result = parseJsonResponse<{ status: string; data: number[] }>(
      input,
      "TestAPI",
    );
    expect(result).toEqual({ status: "success", data: [1, 2, 3] });
  });

  test("should parse complex nested JSON", () => {
    const input = '{"user": {"id": 1, "profile": {"name": "Bob"}}}';
    const result = parseJsonResponse(input, "UserAPI");
    expect(result).toEqual({ user: { id: 1, profile: { name: "Bob" } } });
  });

  test("should throw error for malformed JSON with context", () => {
    const input = '{"status": "error", invalid}';
    expect(() => parseJsonResponse(input, "ErrorAPI")).toThrow(
      "Failed to parse ErrorAPI response as JSON",
    );
  });

  test("should throw error for HTML content with context", () => {
    const input =
      "<html><body><h1>500 Internal Server Error</h1></body></html>";
    expect(() => parseJsonResponse(input, "OpenAI Chat")).toThrow(
      "Failed to parse OpenAI Chat response as JSON",
    );
  });

  test("should throw error for truncated JSON", () => {
    const input = '{"status": "success", "data": [1, 2, ';
    expect(() => parseJsonResponse(input, "Anthropic")).toThrow(
      "Failed to parse Anthropic response as JSON",
    );
  });

  test("should include preview in error message for short text", () => {
    const input = "Not JSON at all";
    try {
      parseJsonResponse(input, "TestAPI");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Not JSON at all");
    }
  });

  test("should truncate preview at 200 characters for long text", () => {
    const input = "x".repeat(500);
    try {
      parseJsonResponse(input, "TestAPI");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      // Should contain preview with "..." at the end
      expect(message).toContain("...");
      // Preview should be around 200 chars (+ some overhead for message text)
      const previewMatch = message.match(/xxx+\.\.\./);
      expect(previewMatch).toBeTruthy();
      if (previewMatch) {
        // The preview portion should be close to 200 chars
        const preview = previewMatch[0].replace("...", "");
        expect(preview.length).toBeLessThanOrEqual(200);
      }
    }
  });

  test("should throw error for empty string", () => {
    const input = "";
    expect(() => parseJsonResponse(input, "EmptyAPI")).toThrow(
      "Failed to parse EmptyAPI response as JSON",
    );
  });

  test("should preserve cause in thrown error", () => {
    const input = "invalid json";
    try {
      parseJsonResponse(input, "TestAPI");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      // @ts-ignore - cause is standard in Error but TS doesn't always recognize it
      expect((error as Error).cause).toBeDefined();
    }
  });
});

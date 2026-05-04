/**
 * Unit tests for api-helpers utilities
 */

import { describe, expect, test } from "bun:test";
import { acceptsEventStream } from "./api-helpers";

const h = (value?: string) => new Headers(value ? { accept: value } : {});

describe("acceptsEventStream", () => {
  test("plain text/event-stream", () => {
    expect(acceptsEventStream(h("text/event-stream"))).toBe(true);
  });

  test("missing Accept header", () => {
    expect(acceptsEventStream(h())).toBe(false);
  });

  test("unrelated media type", () => {
    expect(acceptsEventStream(h("application/json"))).toBe(false);
  });

  test("wildcard does not opt in", () => {
    expect(acceptsEventStream(h("*/*"))).toBe(false);
  });

  test("case-insensitive media type", () => {
    expect(acceptsEventStream(h("TEXT/EVENT-STREAM"))).toBe(true);
  });

  test("tolerates internal whitespace", () => {
    expect(acceptsEventStream(h("text/event-stream ; q = 0.5 "))).toBe(true);
  });

  test("weighted list with positive q is accepted", () => {
    expect(
      acceptsEventStream(h("application/json, text/event-stream;q=0.5")),
    ).toBe(true);
  });

  test("explicit q=0 rejects SSE (RFC 7231 §5.3.1)", () => {
    expect(acceptsEventStream(h("text/event-stream;q=0"))).toBe(false);
  });

  test("q=0.0 also rejects SSE", () => {
    expect(acceptsEventStream(h("text/event-stream;q=0.0"))).toBe(false);
  });

  test("q = 0 with whitespace around = rejects SSE", () => {
    expect(acceptsEventStream(h("text/event-stream ; q = 0"))).toBe(false);
  });

  test("q = 0.5 with whitespace around = is accepted", () => {
    expect(acceptsEventStream(h("text/event-stream ; q = 0.5"))).toBe(true);
  });

  test("malformed empty q value is treated as not acceptable", () => {
    expect(acceptsEventStream(h("text/event-stream;q="))).toBe(false);
  });

  test("q=0 in a weighted list rejects SSE", () => {
    expect(
      acceptsEventStream(h("text/event-stream;q=0, application/json")),
    ).toBe(false);
  });

  test("structured-suffix match is rejected", () => {
    expect(acceptsEventStream(h("text/event-stream+json"))).toBe(false);
  });

  test("malformed q value is treated as not acceptable", () => {
    expect(acceptsEventStream(h("text/event-stream;q=NaN"))).toBe(false);
  });
});

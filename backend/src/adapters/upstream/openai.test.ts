import { describe, expect, test } from "bun:test";
import { openaiUpstreamAdapter } from "./openai";

describe("openaiUpstreamAdapter reasoning compatibility", () => {
  test("parses non-stream reasoning field into thinking block", async () => {
    const response = new Response(
      JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 1700000000,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "final answer",
              reasoning: "chain of thought summary",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
      }),
    );

    const parsed = await openaiUpstreamAdapter.parseResponse(response);
    expect(parsed.content).toEqual([
      { type: "thinking", thinking: "chain of thought summary" },
      { type: "text", text: "final answer" },
    ]);
  });

  test("prefers reasoning_content over reasoning when both exist", async () => {
    const response = new Response(
      JSON.stringify({
        id: "chatcmpl-2",
        object: "chat.completion",
        created: 1700000001,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "final answer",
              reasoning_content: "preferred reasoning content",
              reasoning: "fallback reasoning",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
      }),
    );

    const parsed = await openaiUpstreamAdapter.parseResponse(response);
    expect(parsed.content).toEqual([
      { type: "thinking", thinking: "preferred reasoning content" },
      { type: "text", text: "final answer" },
    ]);
  });

  test("parses stream delta reasoning field into thinking_delta", async () => {
    const stream = [
      'data: {"id":"chatcmpl-3","object":"chat.completion.chunk","created":1700000002,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","reasoning":"stream reasoning"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-3","object":"chat.completion.chunk","created":1700000002,"model":"test-model","choices":[{"index":0,"delta":{"content":"stream text"},"finish_reason":"stop"}]}',
      "data: [DONE]",
    ].join("\n");

    const response = new Response(stream);
    const chunks: Array<unknown> = [];
    for await (const chunk of openaiUpstreamAdapter.parseStreamResponse(
      response,
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "stream reasoning" },
    });
    expect(chunks).toContainEqual({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "stream text" },
    });
  });
});

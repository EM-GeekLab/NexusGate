/**
 * Streaming Context for Abort Handling
 * Ensures completion records are saved even when client disconnects
 */

import type {
  CompletionsStatusEnumType,
  ToolCallType,
} from "@/db/schema";
import { addCompletions, type Completion } from "@/utils/completions";
import { consumeTokens } from "@/plugins/apiKeyRateLimitPlugin";
import type { ApiKey } from "@/plugins/apiKeyPlugin";

/**
 * StreamingContext manages the state of a streaming response.
 * It ensures completion records are saved even when client disconnects.
 */
export class StreamingContext {
  private completion: Completion;
  private bearer: string;
  private apiKeyRecord: ApiKey | null;
  private begin: number;
  private saved = false;
  private signal?: AbortSignal;

  // Accumulated data during streaming
  textParts: string[] = [];
  thinkingParts: string[] = [];
  inputTokens = -1;
  outputTokens = -1;
  ttft = -1;
  streamToolCalls: Map<string, ToolCallType> = new Map();
  toolCallArguments: Map<string, string[]> = new Map();
  indexToIdMap: Map<number, string> = new Map();
  nextToolCallIndex = 0;
  isFirstChunk = true;

  constructor(
    completion: Completion,
    bearer: string,
    apiKeyRecord: ApiKey | null,
    begin: number,
    signal?: AbortSignal,
  ) {
    this.completion = completion;
    this.bearer = bearer;
    this.apiKeyRecord = apiKeyRecord;
    this.begin = begin;
    this.signal = signal;

    // Note: We don't save immediately on abort anymore.
    // Instead, we continue processing chunks from upstream and save the full
    // response when the stream ends. This ensures we capture all data even
    // when the client disconnects mid-stream.
    // The abort status is checked via isAborted() and the final save uses
    // "aborted" status if the client disconnected.
  }

  /**
   * Record time to first token
   */
  recordTTFT(): void {
    if (this.isFirstChunk) {
      this.isFirstChunk = false;
      this.ttft = Date.now() - this.begin;
    }
  }

  /**
   * Check if client has aborted
   */
  isAborted(): boolean {
    return this.signal?.aborted ?? false;
  }

  /**
   * Save the completion record to database
   */
  async saveCompletion(
    status: CompletionsStatusEnumType,
    error?: string,
  ): Promise<void> {
    // Prevent double-save
    if (this.saved) {
      return;
    }
    this.saved = true;

    // Collect final tool calls
    const finalToolCalls: ToolCallType[] | undefined =
      this.streamToolCalls.size > 0
        ? Array.from(this.streamToolCalls.values())
        : undefined;

    // Build content text
    const contentText =
      (this.thinkingParts.length > 0
        ? `<think>${this.thinkingParts.join("")}</think>\n`
        : "") + this.textParts.join("");

    // Update completion record
    this.completion.completion = [
      {
        role: "assistant",
        content: contentText || null,
        tool_calls: finalToolCalls,
      },
    ];
    this.completion.promptTokens = this.inputTokens;
    this.completion.completionTokens = this.outputTokens;
    this.completion.status = status;
    this.completion.ttft = this.ttft;
    this.completion.duration = Date.now() - this.begin;

    // Save to database
    if (error) {
      await addCompletions(this.completion, this.bearer, {
        level: status === "aborted" ? "info" : "error",
        message: `Stream ${status}: ${error}`,
        details: {
          type: "completionError",
          data: { type: status, msg: error },
        },
      });
    } else {
      await addCompletions(this.completion, this.bearer);
    }

    // Consume tokens for TPM rate limiting
    // Use Math.max(0, ...) to handle -1 (unknown) values and ensure partial usage is charged
    const inputTokens = Math.max(0, this.inputTokens);
    const outputTokens = Math.max(0, this.outputTokens);
    const totalTokens = inputTokens + outputTokens;
    if (this.apiKeyRecord && totalTokens > 0) {
      await consumeTokens(this.apiKeyRecord.id, this.apiKeyRecord.tpmLimit, totalTokens);
    }
  }

  /**
   * Check if completion has already been saved
   */
  isSaved(): boolean {
    return this.saved;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // No-op now since we don't register abort handlers anymore
    // Kept for API compatibility
  }
}

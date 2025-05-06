import { findApiKey, insertCompletion, insertLog } from "@/db";
import type {
  CompletionsCompletionType,
  CompletionsPromptType,
  CompletionsStatusEnumType,
  SrvLogsLevelEnumType,
} from "@/db/schema";
import consola from "consola";
import { requestsCounter, ttftGauge } from "@/utils/metrics";

export type Completion = {
  model: string;
  upstreamId: number;
  prompt: CompletionsPromptType;
  promptTokens: number;
  completion: CompletionsCompletionType;
  completionTokens: number;
  status: CompletionsStatusEnumType;
  ttft: number;
  duration: number;
};

/**
 * add a new completion to the database and update metrics
 * @param c the completion to add. tokens usage should be -1 if not provided by the upstream API
 * @param apiKey the key to use
 * @returns the new completion
 */
export async function addCompletions(
  c: Completion,
  apiKey: string,
  log?: {
    level: SrvLogsLevelEnumType;
    message: string;
    details?: {
      type: "completionError";
      data: {
        type: string;
        msg?: string;
        status?: number;
      };
    };
  },
) {
  const keyId = apiKey === undefined ? -1 : ((await findApiKey(apiKey))?.id ?? -1);
  const completion = await insertCompletion({
    apiKeyId: keyId,
    ...c,
  });

  // Update metrics
  if (apiKey) {
    requestsCounter.labels(c.status, c.model, apiKey).inc();
    if (c.ttft > 0) {
      ttftGauge.labels(apiKey).set(c.ttft);
    }
  }

  if (log !== undefined) {
    if (completion === null) {
      consola.error("Failed to insert completion");
      return null;
    }
    await insertLog({
      relatedApiKeyId: keyId,
      relatedUpstreamId: completion.upstreamId,
      relatedCompletionId: completion.id,
      ...log,
    });
  }
  return completion;
}

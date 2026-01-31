import type {
  CompletionsCompletionType,
  CompletionsPromptType,
  CompletionsStatusEnumType,
  SrvLogsLevelEnumType,
} from "@/db/schema";
import { findApiKey, insertCompletion, insertLog } from "@/db";
import { createLogger } from "@/utils/logger";

const logger = createLogger("completions");

export type Completion = {
  model: string;
  upstreamId?: number;
  modelId?: number;
  prompt: CompletionsPromptType;
  promptTokens: number;
  completion: CompletionsCompletionType;
  completionTokens: number;
  status: CompletionsStatusEnumType;
  ttft: number;
  duration: number;
};

/**
 * add a new completion to the database
 * @param c the completion to add. tokens usage should be -1 if not provided by the upstream API
 * @param apiKey the key to use
 * @returns the new completion
 */
export async function addCompletions(
  c: Completion,
  apiKey: string,
  logEntry?: {
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
  const keyId =
    apiKey === undefined ? -1 : ((await findApiKey(apiKey))?.id ?? -1);
  const completion = await insertCompletion({
    apiKeyId: keyId,
    ...c,
  });
  if (logEntry !== undefined) {
    if (completion === null) {
      logger.error("Failed to insert completion");
      return null;
    }
    await insertLog({
      relatedApiKeyId: keyId,
      relatedUpstreamId: completion.upstreamId,
      relatedCompletionId: completion.id,
      ...logEntry,
    });
  }
  return completion;
}

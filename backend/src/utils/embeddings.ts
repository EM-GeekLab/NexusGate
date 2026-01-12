import { consola } from "consola";
import type {
  CompletionsStatusEnumType,
  EmbeddingsInputType,
  SrvLogsLevelEnumType,
} from "@/db/schema";
import { findApiKey, insertEmbedding, insertLog } from "@/db";

export type EmbeddingRecord = {
  model: string;
  modelId: number | null;
  input: EmbeddingsInputType;
  inputTokens: number;
  embedding: number[][];
  dimensions: number;
  status: CompletionsStatusEnumType;
  duration: number;
};

/**
 * Add a new embedding record to the database
 * @param e the embedding record to add
 * @param apiKey the key that was used for the request
 * @param log optional log entry if there was an error
 */
export async function addEmbedding(
  e: EmbeddingRecord,
  apiKey: string,
  log?: {
    level: SrvLogsLevelEnumType;
    message: string;
    details?: {
      type: "embeddingError";
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

  const embedding = await insertEmbedding({
    apiKeyId: keyId,
    modelId: e.modelId,
    model: e.model,
    input: e.input,
    inputTokens: e.inputTokens,
    embedding: e.embedding,
    dimensions: e.dimensions,
    status: e.status,
    duration: e.duration,
  });

  if (log !== undefined) {
    if (embedding === null) {
      consola.error("Failed to insert embedding");
      return null;
    }
    await insertLog({
      relatedApiKeyId: keyId,
      relatedUpstreamId: null,
      relatedCompletionId: null,
      ...log,
    });
  }

  return embedding;
}

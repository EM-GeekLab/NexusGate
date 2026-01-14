import { consola } from "consola";
import { and, asc, count, desc, eq, like, not, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { DATABASE_URL } from "@/utils/config";
import type { ModelTypeEnumType } from "./schema";
import * as schema from "./schema";

const globalThis_ = globalThis as typeof globalThis & {
  db: ReturnType<typeof drizzle>;
};

const logger = consola.withTag("database");

const db = (() => {
  if (!globalThis_.db) {
    globalThis_.db = drizzle({
      connection: DATABASE_URL,
      schema: schema,
    });
    logger.success("connection created");
  }
  return globalThis_.db;
})();
await migrate(db, {
  migrationsFolder: "drizzle",
});

export type ApiKey = typeof schema.ApiKeysTable.$inferSelect;
export type ApiKeyInsert = typeof schema.ApiKeysTable.$inferInsert;
export type Upstream = typeof schema.UpstreamTable.$inferSelect;
export type UpstreamInsert = typeof schema.UpstreamTable.$inferInsert;
export type Completion = typeof schema.CompletionsTable.$inferSelect;
export type CompletionInsert = typeof schema.CompletionsTable.$inferInsert;
export type SrvLog = typeof schema.SrvLogsTable.$inferSelect;
export type SrvLogInsert = typeof schema.SrvLogsTable.$inferInsert;
export type Setting = typeof schema.SettingsTable.$inferSelect;
export type SettingInsert = typeof schema.SettingsTable.$inferInsert;

// New Provider + Model architecture types
export type Provider = typeof schema.ProvidersTable.$inferSelect;
export type ProviderInsert = typeof schema.ProvidersTable.$inferInsert;
export type Model = typeof schema.ModelsTable.$inferSelect;
export type ModelInsert = typeof schema.ModelsTable.$inferInsert;
export type Embedding = typeof schema.EmbeddingsTable.$inferSelect;
export type EmbeddingInsert = typeof schema.EmbeddingsTable.$inferInsert;

export type PartialList<T> = {
  data: T[];
  total: number;
  from: number;
};

/**
 * find api key in database
 * @param key api key
 * @returns db record of api key, null if not found
 */
export async function findApiKey(key: string): Promise<ApiKey | null> {
  logger.debug("findApiKey", key);
  const r = await db
    .select()
    .from(schema.ApiKeysTable)
    .where(eq(schema.ApiKeysTable.key, key));
  const [first] = r;
  return first ?? null;
}

export async function updateApiKey(c: ApiKeyInsert) {
  logger.debug("updateApiKey", c);
  const r = await db
    .update(schema.ApiKeysTable)
    .set(c)
    .where(eq(schema.ApiKeysTable.key, c.key))
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * list ALL api keys in database
 * @returns db records of api keys
 */
export async function listApiKeys(all = false): Promise<ApiKey[]> {
  logger.debug("listApiKeys");
  return await db
    .select()
    .from(schema.ApiKeysTable)
    .where(all ? undefined : not(schema.ApiKeysTable.revoked))
    .orderBy(asc(schema.ApiKeysTable.id));
}

/**
 * insert api key into database, or update if already exists
 * @param c parameters of api key to insert or update
 * @returns db record of api key
 */
export async function upsertApiKey(c: ApiKeyInsert): Promise<ApiKey | null> {
  logger.debug("upsertApiKey", c);
  const r = await db
    .insert(schema.ApiKeysTable)
    .values(c)
    .onConflictDoUpdate({
      target: schema.ApiKeysTable.key,
      set: c,
    })
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * find upstream in database
 * @param model model name
 * @param upstream upstream name
 * @returns db records of upstream, null if not found
 */
export async function findUpstreams(
  model: string,
  upstream?: string,
): Promise<Upstream[]> {
  logger.debug("findUpstreams", model, upstream);
  const r = await db
    .select()
    .from(schema.UpstreamTable)
    .where(
      and(
        eq(schema.UpstreamTable.model, model),
        upstream !== undefined
          ? eq(schema.UpstreamTable.name, upstream)
          : undefined,
        not(schema.UpstreamTable.deleted),
      ),
    );
  return r;
}

/**
 * list ALL upstreams in database, not including deleted ones
 * @returns db records of upstreams
 */
export async function listUpstreams() {
  logger.debug("listUpstreams");
  const r = await db
    .select()
    .from(schema.UpstreamTable)
    .where(not(schema.UpstreamTable.deleted));
  return r;
}

/**
 * list ALL upstream names in database
 * @returns list of upstream names
 */
export async function listUpstreamNames() {
  logger.debug("listUpstreamNames");
  const r = await db
    .select({
      name: schema.UpstreamTable.name,
    })
    .from(schema.UpstreamTable)
    .where(not(schema.UpstreamTable.deleted));
  return r.map((x) => x.name);
}

/**
 * list ALL upstream models in database
 * @returns list of upstream models
 */
export async function listUpstreamModels() {
  logger.debug("listUpstreamModels");
  const r = await db
    .select({
      model: schema.UpstreamTable.model,
    })
    .from(schema.UpstreamTable)
    .where(not(schema.UpstreamTable.deleted));
  return r.map((x) => x.model);
}

/**
 * insert upstream into database
 * @param c parameters of upstream to insert
 * @returns record of the new upstream, null if already exists
 */
export async function insertUpstream(
  c: UpstreamInsert,
): Promise<Upstream | null> {
  logger.debug("insertUpstream", c);
  const r = await db
    .insert(schema.UpstreamTable)
    .values(c)
    .onConflictDoNothing()
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * mark an upstream as deleted
 * @param id upstream id
 * @returns delete record of upstream, null if not found
 */
export async function deleteUpstream(id: number) {
  logger.debug("deleteUpstream", id);
  const r = await db
    .update(schema.UpstreamTable)
    .set({ deleted: true })
    .where(eq(schema.UpstreamTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

export type UpstreamAggregatedByModel = {
  model: string;
  upstreams: Upstream[];
}[];

/**
 * group upstreams by model
 * @returns list of upstreams, grouped by model
 */
export async function groupUpstreamByModel() {
  logger.debug("groupUpstreamByModel");
  const r = await db
    .select({
      model: schema.UpstreamTable.model,
      upstreams: sql`json_agg(${schema.UpstreamTable})`,
    })
    .from(schema.UpstreamTable)
    .where(not(schema.UpstreamTable.deleted))
    .groupBy(schema.UpstreamTable.model);
  return r as UpstreamAggregatedByModel;
}

export type UpstreamAggregatedByName = {
  name: string;
  upstreams: Upstream[];
}[];

/**
 * group upstreams by name
 * @returns list of upstreams, grouped by name
 */
export async function groupUpstreamByName() {
  logger.debug("groupUpstreamByName");
  const r = await db
    .select({
      name: schema.UpstreamTable.name,
      upstreams: sql`json_agg(${schema.UpstreamTable})`,
    })
    .from(schema.UpstreamTable)
    .where(not(schema.UpstreamTable.deleted))
    .groupBy(schema.UpstreamTable.name);
  return r as UpstreamAggregatedByName;
}

/**
 * insert completion into database
 * @param c parameters of completion to insert
 * @returns db record of completion, null if already exists
 */
export async function insertCompletion(
  c: CompletionInsert,
): Promise<Completion | null> {
  logger.debug("insertCompletion", c.model);
  const r = await db
    .insert(schema.CompletionsTable)
    .values(c)
    .onConflictDoNothing()
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * count total prompt tokens and completion tokens used by the api key
 * @param apiKeyId key id, referencing to id colume in api keys table
 * @returns total prompt tokens and completion tokens used by the api key
 */
export async function sumCompletionTokenUsage(apiKeyId?: number) {
  logger.debug("sumCompletionTokenUsage", apiKeyId);
  const r = await db
    .select({
      total_prompt_tokens: sum(schema.CompletionsTable.promptTokens),
      total_completion_tokens: sum(schema.CompletionsTable.completionTokens),
    })
    .from(schema.CompletionsTable)
    .where(
      apiKeyId !== undefined
        ? eq(schema.CompletionsTable.apiKeyId, apiKeyId)
        : undefined,
    );
  const [first] = r;
  return first ?? null;
}

// Type for completion with provider info
export type CompletionWithProvider = Completion & {
  providerName?: string | null;
};

/**
 * list completions in database
 * @param offset offset from first record
 * @param limit number of records to return
 * @param apiKeyId optional, filter by api key id
 * @param upstreamId optional, filter by upstream id
 * @returns list of completions with provider info
 */
export async function listCompletions(
  offset: number,
  limit: number,
  apiKeyId?: number,
  upstreamId?: number,
  model?: string,
): Promise<PartialList<CompletionWithProvider>> {
  const sq = db
    .select({
      id: schema.CompletionsTable.id,
    })
    .from(schema.CompletionsTable)
    .where(
      and(
        not(schema.CompletionsTable.deleted),
        apiKeyId !== undefined
          ? eq(schema.CompletionsTable.apiKeyId, apiKeyId)
          : undefined,
        upstreamId !== undefined
          ? eq(schema.CompletionsTable.upstreamId, upstreamId)
          : undefined,
        model !== undefined
          ? like(schema.CompletionsTable.model, `${model}%`)
          : undefined,
      ),
    )
    .orderBy(desc(schema.CompletionsTable.id))
    .offset(offset)
    .limit(limit)
    .as("sq");
  const r = await db
    .select({
      completion: schema.CompletionsTable,
      providerName: schema.ProvidersTable.name,
    })
    .from(schema.CompletionsTable)
    .innerJoin(sq, eq(schema.CompletionsTable.id, sq.id))
    .leftJoin(
      schema.ModelsTable,
      eq(schema.CompletionsTable.modelId, schema.ModelsTable.id),
    )
    .leftJoin(
      schema.ProvidersTable,
      eq(schema.ModelsTable.providerId, schema.ProvidersTable.id),
    )
    .orderBy(desc(schema.CompletionsTable.id));
  const [total] = await db
    .select({
      total: count(schema.CompletionsTable.id),
    })
    .from(schema.CompletionsTable);
  if (!total) {
    throw new Error("total count failed");
  }
  return {
    data: r.map((x) => ({
      ...x.completion,
      providerName: x.providerName,
    })),
    total: total.total,
    from: offset,
  };
}
/**
 * delete completion from database
 * @param id completion id
 * @returns deleted record of completion, null if not found
 */
export async function deleteCompletion(id: number) {
  logger.debug("deleteCompletion", id);
  const r = await db
    .update(schema.CompletionsTable)
    .set({ deleted: true })
    .where(eq(schema.CompletionsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * find completion in database by id
 * @param id completion id
 * @returns db record of completion with provider info, null if not found
 */
export async function findCompletion(
  id: number,
): Promise<CompletionWithProvider | null> {
  logger.debug("findCompletion", id);
  const r = await db
    .select({
      completion: schema.CompletionsTable,
      providerName: schema.ProvidersTable.name,
    })
    .from(schema.CompletionsTable)
    .leftJoin(
      schema.ModelsTable,
      eq(schema.CompletionsTable.modelId, schema.ModelsTable.id),
    )
    .leftJoin(
      schema.ProvidersTable,
      eq(schema.ModelsTable.providerId, schema.ProvidersTable.id),
    )
    .where(
      and(
        eq(schema.CompletionsTable.id, id),
        not(schema.CompletionsTable.deleted),
      ),
    );
  const [first] = r;
  if (!first) return null;
  return {
    ...first.completion,
    providerName: first.providerName,
  };
}

/**
 * list logs in database, latest first
 * @param offset offset from first record
 * @param limit number of records to return
 * @param apiKeyId optional, filter by api key id
 * @param upstreamId optional, filter by upstream id
 * @param completionId optional, filter by completion id
 * @returns list of logs
 */
export async function listLogs(
  offset: number,
  limit: number,
  apiKeyId?: number,
  upstreamId?: number,
  completionId?: number,
): Promise<PartialList<SrvLog>> {
  logger.debug("listLogs", offset, limit, apiKeyId, upstreamId, completionId);
  const sq = db
    .select({ id: schema.SrvLogsTable.id })
    .from(schema.SrvLogsTable)
    .where(
      and(
        apiKeyId !== undefined
          ? eq(schema.SrvLogsTable.relatedApiKeyId, apiKeyId)
          : undefined,
        upstreamId !== undefined
          ? eq(schema.SrvLogsTable.relatedCompletionId, upstreamId)
          : undefined,
        completionId !== undefined
          ? eq(schema.SrvLogsTable.relatedCompletionId, completionId)
          : undefined,
      ),
    )
    .orderBy(desc(schema.SrvLogsTable.id))
    .offset(offset)
    .limit(limit)
    .as("sq");
  const r = await db
    .select()
    .from(schema.SrvLogsTable)
    .innerJoin(sq, eq(schema.SrvLogsTable.id, sq.id))
    .orderBy(desc(schema.SrvLogsTable.id));
  const [total] = await db
    .select({
      total: count(schema.SrvLogsTable.id),
    })
    .from(schema.SrvLogsTable);
  if (!total) {
    throw new Error("total count failed");
  }
  return {
    data: r.map((x) => x.srv_logs),
    total: total.total,
    from: offset,
  };
}

/**
 *
 * @param c log to insert
 * @returns db record of log, null if already exists
 */
export async function insertLog(c: SrvLogInsert): Promise<SrvLog | null> {
  logger.debug("insertLog");
  const r = await db
    .insert(schema.SrvLogsTable)
    .values(c)
    .onConflictDoNothing()
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * get single log record
 * @param logId log id
 * @returns single log record, with related api key, upstream, and completion
 */
export async function getLog(logId: number): Promise<{
  log: SrvLog;
  upstream: Upstream | null;
  apiKey: ApiKey | null;
  completion: Completion | null;
} | null> {
  logger.debug("getLog", logId);
  const r = await db
    .select({
      log: schema.SrvLogsTable,
      apiKey: schema.ApiKeysTable,
      upstream: schema.UpstreamTable,
      completion: schema.CompletionsTable,
    })
    .from(schema.SrvLogsTable)
    .leftJoin(
      schema.ApiKeysTable,
      eq(schema.SrvLogsTable.relatedApiKeyId, schema.ApiKeysTable.id),
    )
    .leftJoin(
      schema.UpstreamTable,
      eq(schema.SrvLogsTable.relatedUpstreamId, schema.UpstreamTable.id),
    )
    .leftJoin(
      schema.CompletionsTable,
      eq(schema.SrvLogsTable.relatedCompletionId, schema.CompletionsTable.id),
    )
    .where(eq(schema.SrvLogsTable.id, logId));
  const [first] = r;
  return first ?? null;
}

/**
 * get all settings in database
 * @returns list of settings
 */
export async function getAllSettings() {
  logger.debug("getAllSettings");
  const r = await db
    .select()
    .from(schema.SettingsTable)
    .orderBy(asc(schema.SettingsTable.key));
  return r;
}

/**
 * get specific setting by key
 * @param key setting key
 * @returns setting record, null if not found
 */
export async function getSetting(key: string): Promise<Setting | null> {
  logger.debug("getSetting");
  const r = await db
    .select()
    .from(schema.SettingsTable)
    .where(eq(schema.SettingsTable.key, key))
    .limit(1);
  const [first] = r;
  return first ?? null;
}

/**
 * update setting in database
 * @param c setting to insert or update
 * @returns updated setting record, null if error
 */
export async function upsertSetting(c: SettingInsert): Promise<Setting | null> {
  logger.debug("upsertSetting", c);
  const r = await db
    .insert(schema.SettingsTable)
    .values(c)
    .onConflictDoUpdate({
      target: schema.SettingsTable.key,
      set: c,
    })
    .returning();
  const [first] = r;
  return first ?? null; // should always not null
}

/**
 * delete setting from database
 * @param key setting key
 * @returns deleted setting record, null if not found
 */
export async function deleteSetting(key: string): Promise<Setting | null> {
  logger.debug("deleteSetting", key);
  const r = await db
    .delete(schema.SettingsTable)
    .where(eq(schema.SettingsTable.key, key))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Provider CRUD Operations
// ============================================

/**
 * list all providers (not deleted)
 */
export async function listProviders(): Promise<Provider[]> {
  logger.debug("listProviders");
  return await db
    .select()
    .from(schema.ProvidersTable)
    .where(not(schema.ProvidersTable.deleted))
    .orderBy(asc(schema.ProvidersTable.id));
}

/**
 * find provider by id
 */
export async function findProvider(id: number): Promise<Provider | null> {
  logger.debug("findProvider", id);
  const r = await db
    .select()
    .from(schema.ProvidersTable)
    .where(
      and(eq(schema.ProvidersTable.id, id), not(schema.ProvidersTable.deleted)),
    );
  const [first] = r;
  return first ?? null;
}

/**
 * find provider by name
 */
export async function findProviderByName(
  name: string,
): Promise<Provider | null> {
  logger.debug("findProviderByName", name);
  const r = await db
    .select()
    .from(schema.ProvidersTable)
    .where(
      and(
        eq(schema.ProvidersTable.name, name),
        not(schema.ProvidersTable.deleted),
      ),
    );
  const [first] = r;
  return first ?? null;
}

/**
 * insert provider into database
 */
export async function insertProvider(
  p: ProviderInsert,
): Promise<Provider | null> {
  logger.debug("insertProvider", p.name);
  const r = await db
    .insert(schema.ProvidersTable)
    .values(p)
    .onConflictDoNothing()
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * update provider
 */
export async function updateProvider(
  id: number,
  p: Partial<ProviderInsert>,
): Promise<Provider | null> {
  logger.debug("updateProvider", id);
  const r = await db
    .update(schema.ProvidersTable)
    .set({ ...p, updatedAt: new Date() })
    .where(eq(schema.ProvidersTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * soft delete provider
 */
export async function deleteProvider(id: number): Promise<Provider | null> {
  logger.debug("deleteProvider", id);
  const r = await db
    .update(schema.ProvidersTable)
    .set({ deleted: true, updatedAt: new Date() })
    .where(eq(schema.ProvidersTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Model CRUD Operations
// ============================================

/**
 * list all models for a provider
 */
export async function listModelsByProvider(
  providerId: number,
): Promise<Model[]> {
  logger.debug("listModelsByProvider", providerId);
  return await db
    .select()
    .from(schema.ModelsTable)
    .where(
      and(
        eq(schema.ModelsTable.providerId, providerId),
        not(schema.ModelsTable.deleted),
      ),
    )
    .orderBy(asc(schema.ModelsTable.systemName));
}

/**
 * list all models (optionally filtered by type)
 */
export async function listModels(
  modelType?: ModelTypeEnumType,
): Promise<Model[]> {
  logger.debug("listModels", modelType);
  return await db
    .select()
    .from(schema.ModelsTable)
    .where(
      and(
        not(schema.ModelsTable.deleted),
        modelType ? eq(schema.ModelsTable.modelType, modelType) : undefined,
      ),
    )
    .orderBy(asc(schema.ModelsTable.systemName));
}

/**
 * find model by id
 */
export async function findModel(id: number): Promise<Model | null> {
  logger.debug("findModel", id);
  const r = await db
    .select()
    .from(schema.ModelsTable)
    .where(and(eq(schema.ModelsTable.id, id), not(schema.ModelsTable.deleted)));
  const [first] = r;
  return first ?? null;
}

/**
 * find models by system name (for load balancing)
 */
export async function findModelsBySystemName(
  systemName: string,
  modelType?: ModelTypeEnumType,
): Promise<Model[]> {
  logger.debug("findModelsBySystemName", systemName, modelType);
  return await db
    .select()
    .from(schema.ModelsTable)
    .where(
      and(
        eq(schema.ModelsTable.systemName, systemName),
        not(schema.ModelsTable.deleted),
        modelType ? eq(schema.ModelsTable.modelType, modelType) : undefined,
      ),
    );
}

/**
 * insert model into database
 */
export async function insertModel(m: ModelInsert): Promise<Model | null> {
  logger.debug("insertModel", m.systemName);
  const r = await db
    .insert(schema.ModelsTable)
    .values(m)
    .onConflictDoNothing()
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * update model
 */
export async function updateModel(
  id: number,
  m: Partial<ModelInsert>,
): Promise<Model | null> {
  logger.debug("updateModel", id);
  const r = await db
    .update(schema.ModelsTable)
    .set({ ...m, updatedAt: new Date() })
    .where(eq(schema.ModelsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * soft delete model
 */
export async function deleteModel(id: number): Promise<Model | null> {
  logger.debug("deleteModel", id);
  const r = await db
    .update(schema.ModelsTable)
    .set({ deleted: true, updatedAt: new Date() })
    .where(eq(schema.ModelsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * get model with its provider info
 */
export async function getModelWithProvider(id: number): Promise<{
  model: Model;
  provider: Provider;
} | null> {
  logger.debug("getModelWithProvider", id);
  const r = await db
    .select({
      model: schema.ModelsTable,
      provider: schema.ProvidersTable,
    })
    .from(schema.ModelsTable)
    .innerJoin(
      schema.ProvidersTable,
      eq(schema.ModelsTable.providerId, schema.ProvidersTable.id),
    )
    .where(and(eq(schema.ModelsTable.id, id), not(schema.ModelsTable.deleted)));
  const [first] = r;
  return first ?? null;
}

/**
 * get models with provider info by system name (for load balancing selection)
 */
export async function getModelsWithProviderBySystemName(
  systemName: string,
  modelType?: ModelTypeEnumType,
): Promise<{ model: Model; provider: Provider }[]> {
  logger.debug("getModelsWithProviderBySystemName", systemName, modelType);
  return await db
    .select({
      model: schema.ModelsTable,
      provider: schema.ProvidersTable,
    })
    .from(schema.ModelsTable)
    .innerJoin(
      schema.ProvidersTable,
      eq(schema.ModelsTable.providerId, schema.ProvidersTable.id),
    )
    .where(
      and(
        eq(schema.ModelsTable.systemName, systemName),
        not(schema.ModelsTable.deleted),
        not(schema.ProvidersTable.deleted),
        modelType ? eq(schema.ModelsTable.modelType, modelType) : undefined,
      ),
    );
}

/**
 * list unique system names (for global model registry)
 */
export async function listUniqueSystemNames(
  modelType?: ModelTypeEnumType,
): Promise<string[]> {
  logger.debug("listUniqueSystemNames", modelType);
  const r = await db
    .selectDistinct({ systemName: schema.ModelsTable.systemName })
    .from(schema.ModelsTable)
    .where(
      and(
        not(schema.ModelsTable.deleted),
        modelType ? eq(schema.ModelsTable.modelType, modelType) : undefined,
      ),
    )
    .orderBy(asc(schema.ModelsTable.systemName));
  return r.map((x) => x.systemName);
}

/**
 * update weights for models with same system name (batch update for load balancing)
 */
export async function updateModelWeights(
  weights: { modelId: number; weight: number }[],
): Promise<void> {
  logger.debug("updateModelWeights", weights);
  for (const { modelId, weight } of weights) {
    await db
      .update(schema.ModelsTable)
      .set({ weight, updatedAt: new Date() })
      .where(eq(schema.ModelsTable.id, modelId));
  }
}

// ============================================
// Embedding CRUD Operations
// ============================================

/**
 * insert embedding record
 */
export async function insertEmbedding(
  e: EmbeddingInsert,
): Promise<Embedding | null> {
  logger.debug("insertEmbedding", e.model);
  const r = await db
    .insert(schema.EmbeddingsTable)
    .values(e)
    .onConflictDoNothing()
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * list embeddings (paginated)
 */
export async function listEmbeddings(
  offset: number,
  limit: number,
  apiKeyId?: number,
  modelId?: number,
  model?: string,
): Promise<PartialList<Embedding>> {
  logger.debug("listEmbeddings", offset, limit, apiKeyId, modelId, model);
  const sq = db
    .select({ id: schema.EmbeddingsTable.id })
    .from(schema.EmbeddingsTable)
    .where(
      and(
        not(schema.EmbeddingsTable.deleted),
        apiKeyId ? eq(schema.EmbeddingsTable.apiKeyId, apiKeyId) : undefined,
        modelId ? eq(schema.EmbeddingsTable.modelId, modelId) : undefined,
        model ? like(schema.EmbeddingsTable.model, `${model}%`) : undefined,
      ),
    )
    .orderBy(desc(schema.EmbeddingsTable.id))
    .offset(offset)
    .limit(limit)
    .as("sq");

  const r = await db
    .select()
    .from(schema.EmbeddingsTable)
    .innerJoin(sq, eq(schema.EmbeddingsTable.id, sq.id))
    .orderBy(desc(schema.EmbeddingsTable.id));

  const [total] = await db
    .select({ total: count(schema.EmbeddingsTable.id) })
    .from(schema.EmbeddingsTable)
    .where(
      and(
        not(schema.EmbeddingsTable.deleted),
        apiKeyId ? eq(schema.EmbeddingsTable.apiKeyId, apiKeyId) : undefined,
        modelId ? eq(schema.EmbeddingsTable.modelId, modelId) : undefined,
        model ? like(schema.EmbeddingsTable.model, `${model}%`) : undefined,
      ),
    );

  if (!total) {
    throw new Error("total count failed");
  }

  return {
    data: r.map((x) => x.embeddings),
    total: total.total,
    from: offset,
  };
}

/**
 * find embedding by id
 */
export async function findEmbedding(id: number): Promise<Embedding | null> {
  logger.debug("findEmbedding", id);
  const r = await db
    .select()
    .from(schema.EmbeddingsTable)
    .where(
      and(
        eq(schema.EmbeddingsTable.id, id),
        not(schema.EmbeddingsTable.deleted),
      ),
    );
  const [first] = r;
  return first ?? null;
}

/**
 * soft delete embedding
 */
export async function deleteEmbedding(id: number): Promise<Embedding | null> {
  logger.debug("deleteEmbedding", id);
  const r = await db
    .update(schema.EmbeddingsTable)
    .set({ deleted: true, updatedAt: new Date() })
    .where(eq(schema.EmbeddingsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

/**
 * sum embedding token usage
 */
export async function sumEmbeddingTokenUsage(apiKeyId?: number) {
  logger.debug("sumEmbeddingTokenUsage", apiKeyId);
  const r = await db
    .select({
      total_input_tokens: sum(schema.EmbeddingsTable.inputTokens),
    })
    .from(schema.EmbeddingsTable)
    .where(
      apiKeyId ? eq(schema.EmbeddingsTable.apiKeyId, apiKeyId) : undefined,
    );
  const [first] = r;
  return first ?? null;
}

// ============================================
// Overview Statistics Operations
// ============================================

/**
 * Get completions statistics for a time range
 */
export async function getCompletionsStats(startTime: Date, endTime: Date) {
  logger.debug("getCompletionsStats", startTime, endTime);
  const r = await db
    .select({
      total: count(schema.CompletionsTable.id),
      completed: sql<number>`SUM(CASE WHEN ${schema.CompletionsTable.status} = 'completed' THEN 1 ELSE 0 END)::int`,
      failed: sql<number>`SUM(CASE WHEN ${schema.CompletionsTable.status} = 'failed' THEN 1 ELSE 0 END)::int`,
      avgDuration: sql<number>`COALESCE(AVG(CASE WHEN ${schema.CompletionsTable.duration} > 0 THEN ${schema.CompletionsTable.duration} END), 0)`,
      avgTTFT: sql<number>`COALESCE(AVG(CASE WHEN ${schema.CompletionsTable.status} = 'completed' AND ${schema.CompletionsTable.ttft} > 0 THEN ${schema.CompletionsTable.ttft} END), 0)`,
      totalPromptTokens: sql<number>`COALESCE(SUM(CASE WHEN ${schema.CompletionsTable.promptTokens} > 0 THEN ${schema.CompletionsTable.promptTokens} ELSE 0 END), 0)::bigint`,
      totalCompletionTokens: sql<number>`COALESCE(SUM(CASE WHEN ${schema.CompletionsTable.completionTokens} > 0 THEN ${schema.CompletionsTable.completionTokens} ELSE 0 END), 0)::bigint`,
    })
    .from(schema.CompletionsTable)
    .where(
      and(
        not(schema.CompletionsTable.deleted),
        sql`${schema.CompletionsTable.createdAt} >= ${startTime}`,
        sql`${schema.CompletionsTable.createdAt} < ${endTime}`,
      ),
    );
  const [first] = r;
  return first ?? {
    total: 0,
    completed: 0,
    failed: 0,
    avgDuration: 0,
    avgTTFT: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  };
}

/**
 * Get embeddings statistics for a time range
 */
export async function getEmbeddingsStats(startTime: Date, endTime: Date) {
  logger.debug("getEmbeddingsStats", startTime, endTime);
  const r = await db
    .select({
      total: count(schema.EmbeddingsTable.id),
      completed: sql<number>`SUM(CASE WHEN ${schema.EmbeddingsTable.status} = 'completed' THEN 1 ELSE 0 END)::int`,
      failed: sql<number>`SUM(CASE WHEN ${schema.EmbeddingsTable.status} = 'failed' THEN 1 ELSE 0 END)::int`,
      avgDuration: sql<number>`COALESCE(AVG(CASE WHEN ${schema.EmbeddingsTable.duration} > 0 THEN ${schema.EmbeddingsTable.duration} END), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(CASE WHEN ${schema.EmbeddingsTable.inputTokens} > 0 THEN ${schema.EmbeddingsTable.inputTokens} ELSE 0 END), 0)::bigint`,
    })
    .from(schema.EmbeddingsTable)
    .where(
      and(
        not(schema.EmbeddingsTable.deleted),
        sql`${schema.EmbeddingsTable.createdAt} >= ${startTime}`,
        sql`${schema.EmbeddingsTable.createdAt} < ${endTime}`,
      ),
    );
  const [first] = r;
  return first ?? {
    total: 0,
    completed: 0,
    failed: 0,
    avgDuration: 0,
    totalInputTokens: 0,
  };
}

/**
 * Get completions model distribution for a time range
 */
export async function getCompletionsModelDistribution(
  startTime: Date,
  endTime: Date,
) {
  logger.debug("getCompletionsModelDistribution", startTime, endTime);
  return await db
    .select({
      model: schema.CompletionsTable.model,
      count: count(schema.CompletionsTable.id),
    })
    .from(schema.CompletionsTable)
    .where(
      and(
        not(schema.CompletionsTable.deleted),
        sql`${schema.CompletionsTable.createdAt} >= ${startTime}`,
        sql`${schema.CompletionsTable.createdAt} < ${endTime}`,
      ),
    )
    .groupBy(schema.CompletionsTable.model)
    .orderBy(desc(count(schema.CompletionsTable.id)))
    .limit(10);
}

/**
 * Get embeddings model distribution for a time range
 */
export async function getEmbeddingsModelDistribution(
  startTime: Date,
  endTime: Date,
) {
  logger.debug("getEmbeddingsModelDistribution", startTime, endTime);
  return await db
    .select({
      model: schema.EmbeddingsTable.model,
      count: count(schema.EmbeddingsTable.id),
    })
    .from(schema.EmbeddingsTable)
    .where(
      and(
        not(schema.EmbeddingsTable.deleted),
        sql`${schema.EmbeddingsTable.createdAt} >= ${startTime}`,
        sql`${schema.EmbeddingsTable.createdAt} < ${endTime}`,
      ),
    )
    .groupBy(schema.EmbeddingsTable.model)
    .orderBy(desc(count(schema.EmbeddingsTable.id)))
    .limit(10);
}

/**
 * Get completions time series data for a time range
 */
export async function getCompletionsTimeSeries(
  startTime: Date,
  endTime: Date,
  bucketSeconds: number,
) {
  logger.debug("getCompletionsTimeSeries", startTime, endTime, bucketSeconds);
  const result = await db.execute(sql`
    SELECT
      to_timestamp(floor(extract(epoch from created_at) / ${bucketSeconds}) * ${bucketSeconds}) AS bucket,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      COALESCE(AVG(CASE WHEN duration > 0 THEN duration END), 0) AS avg_duration,
      COALESCE(AVG(CASE WHEN status = 'completed' AND ttft > 0 THEN ttft END), 0) AS avg_ttft
    FROM completions
    WHERE deleted = false
      AND created_at >= ${startTime}
      AND created_at < ${endTime}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);
  return result as unknown as {
    bucket: Date;
    total: string;
    completed: string;
    failed: string;
    avg_duration: string;
    avg_ttft: string;
  }[];
}

/**
 * Get embeddings time series data for a time range
 */
export async function getEmbeddingsTimeSeries(
  startTime: Date,
  endTime: Date,
  bucketSeconds: number,
) {
  logger.debug("getEmbeddingsTimeSeries", startTime, endTime, bucketSeconds);
  const result = await db.execute(sql`
    SELECT
      to_timestamp(floor(extract(epoch from created_at) / ${bucketSeconds}) * ${bucketSeconds}) AS bucket,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      COALESCE(AVG(CASE WHEN duration > 0 THEN duration END), 0) AS avg_duration
    FROM embeddings
    WHERE deleted = false
      AND created_at >= ${startTime}
      AND created_at < ${endTime}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);
  return result as unknown as {
    bucket: Date;
    total: string;
    completed: string;
    failed: string;
    avg_duration: string;
  }[];
}

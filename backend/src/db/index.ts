import { and, asc, count, desc, eq, like, not, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { DATABASE_URL } from "@/utils/config";
import { createLogger } from "@/utils/logger";
import type {
  ModelTypeEnumType,
  AlertChannelConfig,
  AlertCondition,
  AlertPayload,
  AlertHistoryStatusEnumType,
} from "./schema";
import * as schema from "./schema";

const globalThis_ = globalThis as typeof globalThis & {
  db: ReturnType<typeof drizzle>;
};

const logger = createLogger("database");

const db = (() => {
  if (!globalThis_.db) {
    globalThis_.db = drizzle({
      connection: DATABASE_URL,
      schema: schema,
    });
    logger.info("connection created");
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

// Alert system types
export type AlertChannel = typeof schema.AlertChannelsTable.$inferSelect;
export type AlertChannelInsert = typeof schema.AlertChannelsTable.$inferInsert;
export type AlertRule = typeof schema.AlertRulesTable.$inferSelect;
export type AlertRuleInsert = typeof schema.AlertRulesTable.$inferInsert;
export type AlertHistory = typeof schema.AlertHistoryTable.$inferSelect;
export type AlertHistoryInsert = typeof schema.AlertHistoryTable.$inferInsert;

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
 * find api key by external id (for K8s Operator integration)
 * @param externalId external system identifier (e.g., k8s/cluster/namespace/appName)
 * @returns db record of api key, null if not found
 */
export async function findApiKeyByExternalId(
  externalId: string,
): Promise<ApiKey | null> {
  logger.debug("findApiKeyByExternalId", externalId);
  const r = await db
    .select()
    .from(schema.ApiKeysTable)
    .where(eq(schema.ApiKeysTable.externalId, externalId));
  const [first] = r;
  return first ?? null;
}

/**
 * list api keys by source (e.g., 'operator' for K8s managed keys)
 * @param source the source of api keys to filter by
 * @param includeRevoked whether to include revoked keys
 * @returns db records of api keys
 */
export async function listApiKeysBySource(
  source: schema.ApiKeySourceEnumType,
  includeRevoked = false,
): Promise<ApiKey[]> {
  logger.debug("listApiKeysBySource", source, includeRevoked);
  return await db
    .select()
    .from(schema.ApiKeysTable)
    .where(
      and(
        eq(schema.ApiKeysTable.source, source),
        includeRevoked ? undefined : not(schema.ApiKeysTable.revoked),
      ),
    )
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
    data: r.map((x) =>
      Object.assign(x.completion, { providerName: x.providerName }),
    ),
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
  if (!first) {
    return null;
  }
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
  const existing = await findProviderByName(p.name);
  if (existing) {
    logger.debug(
      "already exists a non-deleted provider with same name",
      p.name,
    );
    return null;
  }
  const r = await db.insert(schema.ProvidersTable).values(p).returning();
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
 * If a soft-deleted model with the same (providerId, systemName) exists, re-activate it with the new values.
 */
export async function insertModel(m: ModelInsert): Promise<Model | null> {
  logger.debug("insertModel", m.systemName);

  // Atomically re-activate a soft-deleted model with the same key if it exists
  const [reactivated] = await db
    .update(schema.ModelsTable)
    .set({ ...m, deleted: false, updatedAt: new Date() })
    .where(
      and(
        eq(schema.ModelsTable.providerId, m.providerId),
        eq(schema.ModelsTable.systemName, m.systemName),
        eq(schema.ModelsTable.deleted, true),
      ),
    )
    .returning();

  if (reactivated) {
    return reactivated;
  }

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
 * @param rangeSeconds number of seconds to look back from NOW()
 */
export async function getCompletionsStats(rangeSeconds: number) {
  logger.debug("getCompletionsStats", rangeSeconds);
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
        sql`${schema.CompletionsTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(rangeSeconds))} seconds'`,
      ),
    );
  const [first] = r;
  return (
    first ?? {
      total: 0,
      completed: 0,
      failed: 0,
      avgDuration: 0,
      avgTTFT: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
    }
  );
}

/**
 * Get embeddings statistics for a time range
 * @param rangeSeconds number of seconds to look back from NOW()
 */
export async function getEmbeddingsStats(rangeSeconds: number) {
  logger.debug("getEmbeddingsStats", rangeSeconds);
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
        sql`${schema.EmbeddingsTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(rangeSeconds))} seconds'`,
      ),
    );
  const [first] = r;
  return (
    first ?? {
      total: 0,
      completed: 0,
      failed: 0,
      avgDuration: 0,
      totalInputTokens: 0,
    }
  );
}

/**
 * Get completions model distribution for a time range
 * @param rangeSeconds number of seconds to look back from NOW()
 */
export async function getCompletionsModelDistribution(rangeSeconds: number) {
  logger.debug("getCompletionsModelDistribution", rangeSeconds);
  return await db
    .select({
      model: schema.CompletionsTable.model,
      count: count(schema.CompletionsTable.id),
    })
    .from(schema.CompletionsTable)
    .where(
      and(
        not(schema.CompletionsTable.deleted),
        sql`${schema.CompletionsTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(rangeSeconds))} seconds'`,
      ),
    )
    .groupBy(schema.CompletionsTable.model)
    .orderBy(desc(count(schema.CompletionsTable.id)))
    .limit(10);
}

/**
 * Get embeddings model distribution for a time range
 * @param rangeSeconds number of seconds to look back from NOW()
 */
export async function getEmbeddingsModelDistribution(rangeSeconds: number) {
  logger.debug("getEmbeddingsModelDistribution", rangeSeconds);
  return await db
    .select({
      model: schema.EmbeddingsTable.model,
      count: count(schema.EmbeddingsTable.id),
    })
    .from(schema.EmbeddingsTable)
    .where(
      and(
        not(schema.EmbeddingsTable.deleted),
        sql`${schema.EmbeddingsTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(rangeSeconds))} seconds'`,
      ),
    )
    .groupBy(schema.EmbeddingsTable.model)
    .orderBy(desc(count(schema.EmbeddingsTable.id)))
    .limit(10);
}

/**
 * Get completions time series data for a time range
 * @param rangeSeconds number of seconds to look back from NOW()
 * @param bucketSeconds size of each time bucket in seconds
 */
export async function getCompletionsTimeSeries(
  rangeSeconds: number,
  bucketSeconds: number,
) {
  logger.debug("getCompletionsTimeSeries", rangeSeconds, bucketSeconds);
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
      AND created_at >= NOW() - INTERVAL '${sql.raw(String(rangeSeconds))} seconds'
    GROUP BY bucket
    ORDER BY bucket ASC
  `);
  // Drizzle's db.execute() returns QueryResult with unknown row type for raw SQL queries.
  // We use type assertion here because the SQL query structure is well-defined and
  // the returned columns match the expected interface. PostgreSQL aggregate functions
  // return numeric values as strings to preserve precision.
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
 * @param rangeSeconds number of seconds to look back from NOW()
 * @param bucketSeconds size of each time bucket in seconds
 */
export async function getEmbeddingsTimeSeries(
  rangeSeconds: number,
  bucketSeconds: number,
) {
  logger.debug("getEmbeddingsTimeSeries", rangeSeconds, bucketSeconds);
  const result = await db.execute(sql`
    SELECT
      to_timestamp(floor(extract(epoch from created_at) / ${bucketSeconds}) * ${bucketSeconds}) AS bucket,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      COALESCE(AVG(CASE WHEN duration > 0 THEN duration END), 0) AS avg_duration
    FROM embeddings
    WHERE deleted = false
      AND created_at >= NOW() - INTERVAL '${sql.raw(String(rangeSeconds))} seconds'
    GROUP BY bucket
    ORDER BY bucket ASC
  `);
  // Drizzle's db.execute() returns QueryResult with unknown row type for raw SQL queries.
  // We use type assertion here because the SQL query structure is well-defined and
  // the returned columns match the expected interface. PostgreSQL aggregate functions
  // return numeric values as strings to preserve precision.
  return result as unknown as {
    bucket: Date;
    total: string;
    completed: string;
    failed: string;
    avg_duration: string;
  }[];
}

// ============================================
// ReqId Deduplication Operations
// ============================================

/**
 * Find a completion by ReqId (for cache hit detection)
 * Only returns completions that are not pending (completed, failed, aborted, cache_hit)
 * @param apiKeyId the API key ID (ReqId is scoped per API key)
 * @param reqId the client-provided request ID
 * @returns completion record if found and not pending, null otherwise
 */
export async function findCompletionByReqId(
  apiKeyId: number,
  reqId: string,
): Promise<Completion | null> {
  logger.debug("findCompletionByReqId", apiKeyId, reqId);
  const r = await db
    .select()
    .from(schema.CompletionsTable)
    .where(
      and(
        eq(schema.CompletionsTable.apiKeyId, apiKeyId),
        eq(schema.CompletionsTable.reqId, reqId),
        not(schema.CompletionsTable.deleted),
        // Only return non-pending completions (completed, failed, aborted, cache_hit)
        not(eq(schema.CompletionsTable.status, "pending")),
      ),
    )
    .limit(1);
  const [first] = r;
  return first ?? null;
}

/**
 * Create a pending completion record with ReqId
 * Used to reserve the ReqId before making the upstream request
 * @param c completion data including reqId
 * @returns the created completion record, null if ReqId already exists (unique constraint violation)
 */
export async function createPendingCompletion(
  c: CompletionInsert,
): Promise<Completion | null> {
  logger.debug("createPendingCompletion", c.model, c.reqId);
  try {
    const r = await db.insert(schema.CompletionsTable).values(c).returning();
    const [first] = r;
    return first ?? null;
  } catch (error) {
    // Handle unique constraint violation (duplicate ReqId)
    // PostgreSQL error code 23505 = unique_violation
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      logger.warn("Duplicate ReqId detected", c.reqId);
      return null;
    }
    throw error;
  }
}

/**
 * Update a completion record
 * Used to update pending completions after upstream request completes
 * @param id completion ID
 * @param updates partial completion data to update
 * @returns updated completion record, null if not found
 */
export async function updateCompletion(
  id: number,
  updates: Partial<CompletionInsert>,
): Promise<Completion | null> {
  logger.debug("updateCompletion", id);
  const r = await db
    .update(schema.CompletionsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(schema.CompletionsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Prometheus Metrics Operations
// ============================================

/**
 * Get completion metrics grouped by model, status, and api_format
 * Returns all-time totals for Prometheus counters
 * Joins with api_keys table to get api_key_comment for meaningful aggregation
 */
export async function getCompletionMetricsByModelAndStatus() {
  logger.debug("getCompletionMetricsByModelAndStatus");
  const result = await db.execute(sql`
    SELECT
      c.model,
      c.status,
      c.api_format,
      COALESCE(ak.comment, 'unknown') AS api_key_comment,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN c.prompt_tokens > 0 THEN c.prompt_tokens ELSE 0 END), 0) AS prompt_tokens,
      COALESCE(SUM(CASE WHEN c.completion_tokens > 0 THEN c.completion_tokens ELSE 0 END), 0) AS completion_tokens
    FROM completions c
    LEFT JOIN api_keys ak ON c.api_key_id = ak.id
    WHERE c.deleted = false
    GROUP BY c.model, c.status, c.api_format, ak.comment
  `);
  return result as unknown as {
    model: string;
    status: string;
    api_format: string | null;
    api_key_comment: string;
    count: string;
    prompt_tokens: string;
    completion_tokens: string;
  }[];
}

/**
 * Get embedding metrics grouped by model and status
 * Returns all-time totals for Prometheus counters
 * Joins with api_keys table to get api_key_comment for meaningful aggregation
 */
export async function getEmbeddingMetricsByModelAndStatus() {
  logger.debug("getEmbeddingMetricsByModelAndStatus");
  const result = await db.execute(sql`
    SELECT
      e.model,
      e.status,
      COALESCE(ak.comment, 'unknown') AS api_key_comment,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN e.input_tokens > 0 THEN e.input_tokens ELSE 0 END), 0) AS input_tokens
    FROM embeddings e
    LEFT JOIN api_keys ak ON e.api_key_id = ak.id
    WHERE e.deleted = false
    GROUP BY e.model, e.status, ak.comment
  `);
  return result as unknown as {
    model: string;
    status: string;
    api_key_comment: string;
    count: string;
    input_tokens: string;
  }[];
}

// Histogram bucket boundaries in milliseconds (for LLM latency)
export const LATENCY_BUCKETS_MS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000,
];

// Pre-computed bucket case SQL fragments (constant, computed once at module load)
const DURATION_BUCKET_CASES = LATENCY_BUCKETS_MS.map(
  (b) => `SUM(CASE WHEN duration <= ${b} THEN 1 ELSE 0 END) AS bucket_${b}`,
).join(",\n      ");

const TTFT_BUCKET_CASES = LATENCY_BUCKETS_MS.map(
  (b) => `SUM(CASE WHEN ttft <= ${b} THEN 1 ELSE 0 END) AS bucket_${b}`,
).join(",\n      ");

/**
 * Get completion duration histogram data grouped by model
 * Duration is stored in milliseconds in the database
 *
 * Note: We use SUM(duration) not AVG because Prometheus histogram format requires
 * the total sum of all observations (_sum metric). Average can be computed by
 * Prometheus as sum/count when needed.
 */
export async function getCompletionDurationHistogram() {
  logger.debug("getCompletionDurationHistogram");
  const result = await db.execute(
    sql.raw(`
    SELECT
      model,
      ${DURATION_BUCKET_CASES},
      COUNT(*) AS total_count,
      COALESCE(SUM(duration), 0) AS duration_sum
    FROM completions
    WHERE deleted = false AND duration > 0
    GROUP BY model
  `),
  );
  return result as unknown as Record<string, string>[];
}

/**
 * Get completion TTFT (Time To First Token) histogram data grouped by model
 * TTFT is stored in milliseconds in the database
 */
export async function getCompletionTTFTHistogram() {
  logger.debug("getCompletionTTFTHistogram");
  const result = await db.execute(
    sql.raw(`
    SELECT
      model,
      ${TTFT_BUCKET_CASES},
      COUNT(*) AS total_count,
      COALESCE(SUM(ttft), 0) AS ttft_sum
    FROM completions
    WHERE deleted = false AND ttft > 0 AND status = 'completed'
    GROUP BY model
  `),
  );
  return result as unknown as Record<string, string>[];
}

/**
 * Get embedding duration histogram data grouped by model
 * Duration is stored in milliseconds in the database
 */
export async function getEmbeddingDurationHistogram() {
  logger.debug("getEmbeddingDurationHistogram");
  const result = await db.execute(
    sql.raw(`
    SELECT
      model,
      ${DURATION_BUCKET_CASES},
      COUNT(*) AS total_count,
      COALESCE(SUM(duration), 0) AS duration_sum
    FROM embeddings
    WHERE deleted = false AND duration > 0
    GROUP BY model
  `),
  );
  return result as unknown as Record<string, string>[];
}

/**
 * Get API key rate limit configuration for Prometheus metrics
 * Returns all active (non-revoked) API keys with their rate limits
 */
export async function getApiKeyRateLimitConfig() {
  logger.debug("getApiKeyRateLimitConfig");
  return await db
    .select({
      id: schema.ApiKeysTable.id,
      comment: schema.ApiKeysTable.comment,
      rpmLimit: schema.ApiKeysTable.rpmLimit,
      tpmLimit: schema.ApiKeysTable.tpmLimit,
    })
    .from(schema.ApiKeysTable)
    .where(not(schema.ApiKeysTable.revoked));
}

/**
 * Get counts of active entities for Prometheus gauges
 * Uses a single query with subqueries for efficiency (one DB round-trip)
 */
export async function getActiveEntityCounts() {
  logger.debug("getActiveEntityCounts");

  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM api_keys WHERE NOT revoked) AS api_keys,
      (SELECT COUNT(*) FROM providers WHERE NOT deleted) AS providers,
      (SELECT COUNT(*) FROM models WHERE NOT deleted AND model_type = 'chat') AS chat_models,
      (SELECT COUNT(*) FROM models WHERE NOT deleted AND model_type = 'embedding') AS embedding_models
  `);

  const row = (result as unknown as Record<string, string>[])[0];
  return {
    apiKeys: Number(row?.api_keys ?? 0),
    providers: Number(row?.providers ?? 0),
    chatModels: Number(row?.chat_models ?? 0),
    embeddingModels: Number(row?.embedding_models ?? 0),
  };
}

/**
 * Get completion cost metrics grouped by model, provider, and api_key_comment
 * Calculates costs based on model pricing: (prompt_tokens / 1M) * input_price + (completion_tokens / 1M) * output_price
 * Returns all-time totals for Prometheus counters
 */
export async function getCompletionCostMetrics() {
  logger.debug("getCompletionCostMetrics");
  const result = await db.execute(sql`
    SELECT
      c.model,
      COALESCE(p.name, 'unknown') AS provider,
      COALESCE(ak.comment, 'unknown') AS api_key_comment,
      COALESCE(SUM(
        CASE WHEN c.prompt_tokens > 0 AND m.input_price IS NOT NULL
          THEN (c.prompt_tokens::numeric / 1000000) * m.input_price
          ELSE 0
        END
      ), 0) AS prompt_cost_usd,
      COALESCE(SUM(
        CASE WHEN c.completion_tokens > 0 AND m.output_price IS NOT NULL
          THEN (c.completion_tokens::numeric / 1000000) * m.output_price
          ELSE 0
        END
      ), 0) AS completion_cost_usd,
      COALESCE(SUM(
        CASE WHEN c.prompt_tokens > 0 AND m.input_price IS NOT NULL
          THEN (c.prompt_tokens::numeric / 1000000) * m.input_price
          ELSE 0
        END +
        CASE WHEN c.completion_tokens > 0 AND m.output_price IS NOT NULL
          THEN (c.completion_tokens::numeric / 1000000) * m.output_price
          ELSE 0
        END
      ), 0) AS total_cost_usd
    FROM completions c
    LEFT JOIN models m ON c.model_id = m.id
    LEFT JOIN providers p ON m.provider_id = p.id
    LEFT JOIN api_keys ak ON c.api_key_id = ak.id
    WHERE c.deleted = false
    GROUP BY c.model, p.name, ak.comment
  `);
  return result as unknown as {
    model: string;
    provider: string;
    api_key_comment: string;
    prompt_cost_usd: string;
    completion_cost_usd: string;
    total_cost_usd: string;
  }[];
}

// ============================================
// Alert Channel CRUD Operations
// ============================================

export async function listAlertChannels(): Promise<AlertChannel[]> {
  logger.debug("listAlertChannels");
  return await db
    .select()
    .from(schema.AlertChannelsTable)
    .orderBy(asc(schema.AlertChannelsTable.id));
}

export async function findAlertChannel(
  id: number,
): Promise<AlertChannel | null> {
  logger.debug("findAlertChannel", id);
  const r = await db
    .select()
    .from(schema.AlertChannelsTable)
    .where(eq(schema.AlertChannelsTable.id, id));
  const [first] = r;
  return first ?? null;
}

export async function insertAlertChannel(c: {
  name: string;
  type: schema.AlertChannelTypeEnumType;
  config: AlertChannelConfig;
  enabled?: boolean;
}): Promise<AlertChannel | null> {
  logger.debug("insertAlertChannel", c.name);
  const r = await db.insert(schema.AlertChannelsTable).values(c).returning();
  const [first] = r;
  return first ?? null;
}

export async function updateAlertChannel(
  id: number,
  c: Partial<{
    name: string;
    type: schema.AlertChannelTypeEnumType;
    config: AlertChannelConfig;
    enabled: boolean;
  }>,
): Promise<AlertChannel | null> {
  logger.debug("updateAlertChannel", id);
  const r = await db
    .update(schema.AlertChannelsTable)
    .set({ ...c, updatedAt: new Date() })
    .where(eq(schema.AlertChannelsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function deleteAlertChannel(
  id: number,
): Promise<AlertChannel | null> {
  logger.debug("deleteAlertChannel", id);
  const r = await db
    .delete(schema.AlertChannelsTable)
    .where(eq(schema.AlertChannelsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Alert Rule CRUD Operations
// ============================================

export async function listAlertRules(): Promise<AlertRule[]> {
  logger.debug("listAlertRules");
  return await db
    .select()
    .from(schema.AlertRulesTable)
    .orderBy(asc(schema.AlertRulesTable.id));
}

export async function findAlertRule(id: number): Promise<AlertRule | null> {
  logger.debug("findAlertRule", id);
  const r = await db
    .select()
    .from(schema.AlertRulesTable)
    .where(eq(schema.AlertRulesTable.id, id));
  const [first] = r;
  return first ?? null;
}

export async function insertAlertRule(c: {
  name: string;
  type: schema.AlertRuleTypeEnumType;
  condition: AlertCondition;
  channelIds: number[];
  cooldownMinutes?: number;
  enabled?: boolean;
}): Promise<AlertRule | null> {
  logger.debug("insertAlertRule", c.name);
  const r = await db.insert(schema.AlertRulesTable).values(c).returning();
  const [first] = r;
  return first ?? null;
}

export async function updateAlertRule(
  id: number,
  c: Partial<{
    name: string;
    type: schema.AlertRuleTypeEnumType;
    condition: AlertCondition;
    channelIds: number[];
    cooldownMinutes: number;
    enabled: boolean;
  }>,
): Promise<AlertRule | null> {
  logger.debug("updateAlertRule", id);
  const r = await db
    .update(schema.AlertRulesTable)
    .set({ ...c, updatedAt: new Date() })
    .where(eq(schema.AlertRulesTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function deleteAlertRule(id: number): Promise<AlertRule | null> {
  logger.debug("deleteAlertRule", id);
  const r = await db
    .delete(schema.AlertRulesTable)
    .where(eq(schema.AlertRulesTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Alert History Operations
// ============================================

export async function listAlertHistory(
  offset: number,
  limit: number,
  ruleId?: number,
): Promise<PartialList<AlertHistory>> {
  logger.debug("listAlertHistory", offset, limit, ruleId);
  const whereClause = ruleId
    ? eq(schema.AlertHistoryTable.ruleId, ruleId)
    : undefined;

  const r = await db
    .select()
    .from(schema.AlertHistoryTable)
    .where(whereClause)
    .orderBy(desc(schema.AlertHistoryTable.id))
    .offset(offset)
    .limit(limit);

  const [total] = await db
    .select({ total: count(schema.AlertHistoryTable.id) })
    .from(schema.AlertHistoryTable)
    .where(whereClause);

  if (!total) {
    throw new Error("total count failed");
  }

  return {
    data: r,
    total: total.total,
    from: offset,
  };
}

export async function insertAlertHistory(c: {
  ruleId: number;
  payload: AlertPayload;
  status: AlertHistoryStatusEnumType;
}): Promise<AlertHistory | null> {
  logger.debug("insertAlertHistory", c.ruleId, c.status);
  const r = await db.insert(schema.AlertHistoryTable).values(c).returning();
  const [first] = r;
  return first ?? null;
}

export async function getLastAlertForRule(
  ruleId: number,
): Promise<AlertHistory | null> {
  logger.debug("getLastAlertForRule", ruleId);
  const r = await db
    .select()
    .from(schema.AlertHistoryTable)
    .where(
      and(
        eq(schema.AlertHistoryTable.ruleId, ruleId),
        eq(schema.AlertHistoryTable.status, "sent"),
      ),
    )
    .orderBy(desc(schema.AlertHistoryTable.triggeredAt))
    .limit(1);
  const [first] = r;
  return first ?? null;
}

// ============================================
// Alert Aggregation Queries
// ============================================

/**
 * Get total cost in a given period (for budget alerts)
 * @param periodDays number of days to look back
 * @param apiKeyId optional, filter by specific API key
 */
export async function getCompletionCostInPeriod(
  periodDays: number,
  apiKeyId?: number,
): Promise<number> {
  logger.debug("getCompletionCostInPeriod", periodDays, apiKeyId);
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(
      CASE WHEN c.prompt_tokens > 0 AND m.input_price IS NOT NULL
        THEN (c.prompt_tokens::numeric / 1000000) * m.input_price
        ELSE 0
      END +
      CASE WHEN c.completion_tokens > 0 AND m.output_price IS NOT NULL
        THEN (c.completion_tokens::numeric / 1000000) * m.output_price
        ELSE 0
      END
    ), 0) AS total_cost
    FROM completions c
    LEFT JOIN models m ON c.model_id = m.id
    WHERE c.deleted = false
      AND c.created_at >= NOW() - INTERVAL '${sql.raw(String(periodDays))} days'
      ${apiKeyId ? sql`AND c.api_key_id = ${apiKeyId}` : sql``}
  `);
  const row = (result as unknown as { total_cost: string }[])[0];
  return Number(row?.total_cost ?? 0);
}

/**
 * Get error rate in a given window (for error rate alerts)
 * @param windowMinutes number of minutes to look back
 * @param model optional, filter by model name
 */
export async function getCompletionErrorRate(
  windowMinutes: number,
  model?: string,
): Promise<{ total: number; failed: number; rate: number }> {
  logger.debug("getCompletionErrorRate", windowMinutes, model);
  const result = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM completions
    WHERE deleted = false
      AND created_at >= NOW() - INTERVAL '${sql.raw(String(windowMinutes))} minutes'
      ${model ? sql`AND model = ${model}` : sql``}
  `);
  const row = (result as unknown as { total: string; failed: string }[])[0];
  const total = Number(row?.total ?? 0);
  const failed = Number(row?.failed ?? 0);
  return {
    total,
    failed,
    rate: total > 0 ? (failed / total) * 100 : 0,
  };
}

/**
 * Get latency percentile in a given window (for latency alerts)
 * @param windowMinutes number of minutes to look back
 * @param percentile the percentile to calculate (e.g. 95 for P95)
 * @param model optional, filter by model name
 */
export async function getCompletionLatencyPercentile(
  windowMinutes: number,
  percentile: number,
  model?: string,
): Promise<number> {
  logger.debug(
    "getCompletionLatencyPercentile",
    windowMinutes,
    percentile,
    model,
  );
  const pValue = percentile / 100;
  const result = await db.execute(sql`
    SELECT COALESCE(
      percentile_cont(${pValue}) WITHIN GROUP (ORDER BY duration), 0
    ) AS latency_percentile
    FROM completions
    WHERE deleted = false
      AND status = 'completed'
      AND duration > 0
      AND created_at >= NOW() - INTERVAL '${sql.raw(String(windowMinutes))} minutes'
      ${model ? sql`AND model = ${model}` : sql``}
  `);
  const row = (result as unknown as { latency_percentile: string }[])[0];
  return Number(row?.latency_percentile ?? 0);
}

// ============================================
// Grafana Sync Helpers
// ============================================

export async function updateAlertRuleGrafanaSync(
  id: number,
  fields: {
    grafanaUid?: string | null;
    grafanaSyncedAt?: Date | null;
    grafanaSyncError?: string | null;
  },
): Promise<void> {
  await db
    .update(schema.AlertRulesTable)
    .set(fields)
    .where(eq(schema.AlertRulesTable.id, id));
}

export async function updateAlertChannelGrafanaSync(
  id: number,
  fields: {
    grafanaUid?: string | null;
    grafanaSyncedAt?: Date | null;
    grafanaSyncError?: string | null;
  },
): Promise<void> {
  await db
    .update(schema.AlertChannelsTable)
    .set(fields)
    .where(eq(schema.AlertChannelsTable.id, id));
}

// ============================================
// KQL Search Operations
// ============================================

import type { CompiledQuery } from "@/search/types";

/**
 * Convert a compiled KQL query (string with $N placeholders + params array)
 * into a Drizzle SQL object with proper parameterization.
 */
function buildDrizzleSql(template: string, params: unknown[]) {
  // Split on $N placeholders, interleave raw SQL with parameterized values
  const parts = template.split(/\$(\d+)/);
  const chunks: ReturnType<typeof sql>[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 0) {
      // Raw SQL structure (from trusted field whitelist)
      if (part) {
        chunks.push(sql.raw(part));
      }
    } else if (part) {
      // Parameter value (user-provided, properly parameterized)
      const paramIdx = parseInt(part) - 1;
      const value = params[paramIdx];
      chunks.push(sql`${value}`);
    }
  }
  return sql.join(chunks, sql.raw(""));
}

export type SearchCompletionRow = {
  id: number;
  api_key_id: number;
  model: string;
  status: string;
  duration: number;
  ttft: number;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: Date;
  updated_at: Date;
  rating: number | null;
  req_id: string | null;
  api_format: string | null;
  prompt: unknown;
  completion: unknown;
  provider_name: string | null;
};

/**
 * Execute a compiled KQL search query with pagination.
 */
export async function searchCompletions(
  compiled: CompiledQuery,
  offset: number,
  limit: number,
): Promise<{ data: SearchCompletionRow[]; total: number; from: number }> {
  logger.debug("searchCompletions", compiled.whereClause, offset, limit);

  const whereSql = buildDrizzleSql(compiled.whereClause, compiled.params);

  // Get paginated results with provider join
  const result = await db.execute(sql`
    SELECT
      c.id, c.api_key_id, c.model, c.status, c.duration, c.ttft,
      c.prompt_tokens, c.completion_tokens, c.created_at, c.updated_at,
      c.rating, c.req_id, c.api_format, c.prompt, c.completion,
      p.name AS provider_name
    FROM completions c
    LEFT JOIN models m ON c.model_id = m.id
    LEFT JOIN providers p ON m.provider_id = p.id
    WHERE ${whereSql}
    ORDER BY c.id DESC
    OFFSET ${offset}
    LIMIT ${limit}
  `);

  // Get total count
  const countResult = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM completions c
    LEFT JOIN models m ON c.model_id = m.id
    LEFT JOIN providers p ON m.provider_id = p.id
    WHERE ${whereSql}
  `);

  const total = Number(
    (countResult as unknown as { total: string }[])[0]?.total ?? 0,
  );

  return {
    data: result as unknown as SearchCompletionRow[],
    total,
    from: offset,
  };
}

/**
 * Execute a compiled KQL aggregation query.
 */
export async function aggregateCompletions(
  compiled: CompiledQuery,
): Promise<Record<string, unknown>[]> {
  if (!compiled.aggregation) {
    throw new Error("No aggregation defined in compiled query");
  }

  logger.debug("aggregateCompletions", compiled.whereClause);

  const whereSql = buildDrizzleSql(compiled.whereClause, compiled.params);
  const { selectExpressions, groupByColumn, groupByField } =
    compiled.aggregation;

  // Build SELECT clause
  // SAFETY: selectExpressions and groupByColumn are produced by the compiler
  // from the trusted FIELD_REGISTRY whitelist — they never contain user input.
  const selectParts: string[] = [];
  if (groupByColumn && groupByField) {
    selectParts.push(`${groupByColumn} AS "${groupByField}"`);
  }
  for (const expr of selectExpressions) {
    selectParts.push(`${expr.sql} AS "${expr.alias}"`);
  }
  const selectClause = selectParts.join(", ");
  const groupBySql = groupByColumn
    ? sql.raw(`GROUP BY ${groupByColumn} ORDER BY COUNT(*) DESC NULLS LAST`)
    : sql.raw("");

  const result = await db.execute(
    sql`SELECT ${sql.raw(selectClause)}
    FROM completions c
    LEFT JOIN models m ON c.model_id = m.id
    LEFT JOIN providers p ON m.provider_id = p.id
    WHERE ${whereSql}
    ${groupBySql}
    LIMIT 1000`,
  );

  return result as unknown as Record<string, unknown>[];
}

/**
 * Execute a compiled KQL search query and return time-bucketed histogram data.
 */
export async function searchCompletionsTimeSeries(
  compiled: CompiledQuery,
  bucketSeconds: number,
): Promise<
  {
    bucket: Date;
    total: string;
    completed: string;
    failed: string;
  }[]
> {
  logger.debug(
    "searchCompletionsTimeSeries",
    compiled.whereClause,
    bucketSeconds,
  );

  const whereSql = buildDrizzleSql(compiled.whereClause, compiled.params);

  const result = await db.execute(sql`
    SELECT
      to_timestamp(floor(extract(epoch from c.created_at) / ${bucketSeconds}) * ${bucketSeconds}) AS bucket,
      COUNT(*) AS total,
      SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN c.status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM completions c
    LEFT JOIN models m ON c.model_id = m.id
    LEFT JOIN providers p ON m.provider_id = p.id
    WHERE ${whereSql}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  return result as unknown as {
    bucket: Date;
    total: string;
    completed: string;
    failed: string;
  }[];
}

/**
 * Get distinct values for a field (for autocomplete suggestions).
 */
export async function getDistinctFieldValues(
  column: string,
  maxResults = 50,
): Promise<string[]> {
  // Only allow known safe column expressions
  const SAFE_COLUMNS: Record<string, string> = {
    model: "model",
    status: "status",
    api_format: "api_format",
  };

  const safeColumn = SAFE_COLUMNS[column];
  if (!safeColumn) {
    return [];
  }

  const result = await db.execute(sql`
    SELECT DISTINCT ${sql.raw(safeColumn)} AS value
    FROM completions
    WHERE deleted = false AND ${sql.raw(safeColumn)} IS NOT NULL
    ORDER BY value ASC
    LIMIT ${maxResults}
  `);

  return (result as unknown as { value: string }[]).map((r) => r.value);
}

// ============================================
// Playground Types
// ============================================

export type PlaygroundConversation =
  typeof schema.PlaygroundConversationsTable.$inferSelect;
export type PlaygroundConversationInsert =
  typeof schema.PlaygroundConversationsTable.$inferInsert;
export type PlaygroundMessage =
  typeof schema.PlaygroundMessagesTable.$inferSelect;
export type PlaygroundMessageInsert =
  typeof schema.PlaygroundMessagesTable.$inferInsert;
export type PlaygroundTestCase =
  typeof schema.PlaygroundTestCasesTable.$inferSelect;
export type PlaygroundTestCaseInsert =
  typeof schema.PlaygroundTestCasesTable.$inferInsert;
export type PlaygroundTestRun =
  typeof schema.PlaygroundTestRunsTable.$inferSelect;
export type PlaygroundTestRunInsert =
  typeof schema.PlaygroundTestRunsTable.$inferInsert;
export type PlaygroundTestResult =
  typeof schema.PlaygroundTestResultsTable.$inferSelect;
export type PlaygroundTestResultInsert =
  typeof schema.PlaygroundTestResultsTable.$inferInsert;

// ============================================
// Playground Conversation CRUD
// ============================================

export async function listPlaygroundConversations(
  offset: number,
  limit: number,
): Promise<PartialList<PlaygroundConversation>> {
  logger.debug("listPlaygroundConversations", offset, limit);
  const r = await db
    .select()
    .from(schema.PlaygroundConversationsTable)
    .where(not(schema.PlaygroundConversationsTable.deleted))
    .orderBy(desc(schema.PlaygroundConversationsTable.updatedAt))
    .offset(offset)
    .limit(limit);
  const [total] = await db
    .select({ total: count(schema.PlaygroundConversationsTable.id) })
    .from(schema.PlaygroundConversationsTable)
    .where(not(schema.PlaygroundConversationsTable.deleted));
  if (!total) throw new Error("total count failed");
  return { data: r, total: total.total, from: offset };
}

export async function findPlaygroundConversation(
  id: number,
): Promise<PlaygroundConversation | null> {
  logger.debug("findPlaygroundConversation", id);
  const r = await db
    .select()
    .from(schema.PlaygroundConversationsTable)
    .where(
      and(
        eq(schema.PlaygroundConversationsTable.id, id),
        not(schema.PlaygroundConversationsTable.deleted),
      ),
    );
  const [first] = r;
  return first ?? null;
}

export async function insertPlaygroundConversation(
  c: PlaygroundConversationInsert,
): Promise<PlaygroundConversation | null> {
  logger.debug("insertPlaygroundConversation", c.title);
  const r = await db
    .insert(schema.PlaygroundConversationsTable)
    .values(c)
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function updatePlaygroundConversation(
  id: number,
  c: Partial<PlaygroundConversationInsert>,
): Promise<PlaygroundConversation | null> {
  logger.debug("updatePlaygroundConversation", id);
  const r = await db
    .update(schema.PlaygroundConversationsTable)
    .set({ ...c, updatedAt: new Date() })
    .where(eq(schema.PlaygroundConversationsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function deletePlaygroundConversation(
  id: number,
): Promise<PlaygroundConversation | null> {
  logger.debug("deletePlaygroundConversation", id);
  const r = await db
    .update(schema.PlaygroundConversationsTable)
    .set({ deleted: true, updatedAt: new Date() })
    .where(eq(schema.PlaygroundConversationsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Playground Message CRUD
// ============================================

export async function listPlaygroundMessages(
  conversationId: number,
): Promise<PlaygroundMessage[]> {
  logger.debug("listPlaygroundMessages", conversationId);
  return await db
    .select()
    .from(schema.PlaygroundMessagesTable)
    .where(eq(schema.PlaygroundMessagesTable.conversationId, conversationId))
    .orderBy(asc(schema.PlaygroundMessagesTable.id));
}

export async function insertPlaygroundMessage(
  m: PlaygroundMessageInsert,
): Promise<PlaygroundMessage | null> {
  logger.debug("insertPlaygroundMessage", m.conversationId, m.role);
  const r = await db
    .insert(schema.PlaygroundMessagesTable)
    .values(m)
    .returning();
  const [first] = r;
  // Touch conversation updatedAt
  if (first) {
    await db
      .update(schema.PlaygroundConversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(schema.PlaygroundConversationsTable.id, m.conversationId));
  }
  return first ?? null;
}

export async function deletePlaygroundMessages(
  conversationId: number,
): Promise<void> {
  logger.debug("deletePlaygroundMessages", conversationId);
  await db
    .delete(schema.PlaygroundMessagesTable)
    .where(eq(schema.PlaygroundMessagesTable.conversationId, conversationId));
}

// ============================================
// Playground Test Case CRUD
// ============================================

export async function listPlaygroundTestCases(
  offset: number,
  limit: number,
): Promise<PartialList<PlaygroundTestCase>> {
  logger.debug("listPlaygroundTestCases", offset, limit);
  const r = await db
    .select()
    .from(schema.PlaygroundTestCasesTable)
    .where(not(schema.PlaygroundTestCasesTable.deleted))
    .orderBy(desc(schema.PlaygroundTestCasesTable.updatedAt))
    .offset(offset)
    .limit(limit);
  const [total] = await db
    .select({ total: count(schema.PlaygroundTestCasesTable.id) })
    .from(schema.PlaygroundTestCasesTable)
    .where(not(schema.PlaygroundTestCasesTable.deleted));
  if (!total) throw new Error("total count failed");
  return { data: r, total: total.total, from: offset };
}

export async function findPlaygroundTestCase(
  id: number,
): Promise<PlaygroundTestCase | null> {
  logger.debug("findPlaygroundTestCase", id);
  const r = await db
    .select()
    .from(schema.PlaygroundTestCasesTable)
    .where(
      and(
        eq(schema.PlaygroundTestCasesTable.id, id),
        not(schema.PlaygroundTestCasesTable.deleted),
      ),
    );
  const [first] = r;
  return first ?? null;
}

export async function insertPlaygroundTestCase(
  c: PlaygroundTestCaseInsert,
): Promise<PlaygroundTestCase | null> {
  logger.debug("insertPlaygroundTestCase", c.title);
  const r = await db
    .insert(schema.PlaygroundTestCasesTable)
    .values(c)
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function updatePlaygroundTestCase(
  id: number,
  c: Partial<PlaygroundTestCaseInsert>,
): Promise<PlaygroundTestCase | null> {
  logger.debug("updatePlaygroundTestCase", id);
  const r = await db
    .update(schema.PlaygroundTestCasesTable)
    .set({ ...c, updatedAt: new Date() })
    .where(eq(schema.PlaygroundTestCasesTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function deletePlaygroundTestCase(
  id: number,
): Promise<PlaygroundTestCase | null> {
  logger.debug("deletePlaygroundTestCase", id);
  const r = await db
    .update(schema.PlaygroundTestCasesTable)
    .set({ deleted: true, updatedAt: new Date() })
    .where(eq(schema.PlaygroundTestCasesTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Playground Test Run CRUD
// ============================================

export async function listPlaygroundTestRuns(
  offset: number,
  limit: number,
  testCaseId?: number,
): Promise<PartialList<PlaygroundTestRun>> {
  logger.debug("listPlaygroundTestRuns", offset, limit, testCaseId);
  const r = await db
    .select()
    .from(schema.PlaygroundTestRunsTable)
    .where(
      and(
        not(schema.PlaygroundTestRunsTable.deleted),
        testCaseId !== undefined
          ? eq(schema.PlaygroundTestRunsTable.testCaseId, testCaseId)
          : undefined,
      ),
    )
    .orderBy(desc(schema.PlaygroundTestRunsTable.createdAt))
    .offset(offset)
    .limit(limit);
  const [total] = await db
    .select({ total: count(schema.PlaygroundTestRunsTable.id) })
    .from(schema.PlaygroundTestRunsTable)
    .where(
      and(
        not(schema.PlaygroundTestRunsTable.deleted),
        testCaseId !== undefined
          ? eq(schema.PlaygroundTestRunsTable.testCaseId, testCaseId)
          : undefined,
      ),
    );
  if (!total) throw new Error("total count failed");
  return { data: r, total: total.total, from: offset };
}

export async function findPlaygroundTestRun(
  id: number,
): Promise<PlaygroundTestRun | null> {
  logger.debug("findPlaygroundTestRun", id);
  const r = await db
    .select()
    .from(schema.PlaygroundTestRunsTable)
    .where(
      and(
        eq(schema.PlaygroundTestRunsTable.id, id),
        not(schema.PlaygroundTestRunsTable.deleted),
      ),
    );
  const [first] = r;
  return first ?? null;
}

export async function insertPlaygroundTestRun(
  c: PlaygroundTestRunInsert,
): Promise<PlaygroundTestRun | null> {
  logger.debug("insertPlaygroundTestRun", c.testCaseId);
  const r = await db
    .insert(schema.PlaygroundTestRunsTable)
    .values(c)
    .returning();
  const [first] = r;
  return first ?? null;
}

export async function deletePlaygroundTestRun(
  id: number,
): Promise<PlaygroundTestRun | null> {
  logger.debug("deletePlaygroundTestRun", id);
  const r = await db
    .update(schema.PlaygroundTestRunsTable)
    .set({ deleted: true })
    .where(eq(schema.PlaygroundTestRunsTable.id, id))
    .returning();
  const [first] = r;
  return first ?? null;
}

// ============================================
// Playground Test Result CRUD
// ============================================

export async function listPlaygroundTestResults(
  testRunId: number,
): Promise<PlaygroundTestResult[]> {
  logger.debug("listPlaygroundTestResults", testRunId);
  return await db
    .select()
    .from(schema.PlaygroundTestResultsTable)
    .where(eq(schema.PlaygroundTestResultsTable.testRunId, testRunId))
    .orderBy(asc(schema.PlaygroundTestResultsTable.id));
}

export async function insertPlaygroundTestResult(
  r: PlaygroundTestResultInsert,
): Promise<PlaygroundTestResult | null> {
  logger.debug("insertPlaygroundTestResult", r.testRunId, r.model);
  const result = await db
    .insert(schema.PlaygroundTestResultsTable)
    .values(r)
    .returning();
  const [first] = result;
  return first ?? null;
}

export async function updatePlaygroundTestResult(
  id: number,
  r: Partial<PlaygroundTestResultInsert>,
): Promise<PlaygroundTestResult | null> {
  logger.debug("updatePlaygroundTestResult", id);
  const result = await db
    .update(schema.PlaygroundTestResultsTable)
    .set({ ...r, updatedAt: new Date() })
    .where(eq(schema.PlaygroundTestResultsTable.id, id))
    .returning();
  const [first] = result;
  return first ?? null;
}

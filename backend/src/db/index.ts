import { consola } from "consola";
import { and, asc, count, desc, eq, not, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { DATABASE_URL } from "@/utils/config";
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
  return r.length === 1 ? r[0] : null;
}

export async function updateApiKey(c: ApiKeyInsert) {
  logger.debug("updateApiKey", c);
  const r = await db
    .update(schema.ApiKeysTable)
    .set(c)
    .where(eq(schema.ApiKeysTable.key, c.key))
    .returning();
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
}

/**
 * list completions in database
 * @param offset offset from first record
 * @param limit number of records to return
 * @param apiKeyId optional, filter by api key id
 * @param upstreamId optional, filter by upstream id
 * @returns list of completions
 */
export async function listCompletions(
  offset: number,
  limit: number,
  apiKeyId?: number,
  upstreamId?: number,
): Promise<PartialList<Completion>> {
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
      ),
    )
    .orderBy(desc(schema.CompletionsTable.id))
    .offset(offset)
    .limit(limit)
    .as("sq");
  const r = await db
    .select()
    .from(schema.CompletionsTable)
    .innerJoin(sq, eq(schema.CompletionsTable.id, sq.id))
    .orderBy(desc(schema.CompletionsTable.id));
  const total = await db
    .select({
      total: count(schema.CompletionsTable.id),
    })
    .from(schema.CompletionsTable);
  if (total.length !== 1) {
    throw new Error("total count failed");
  }
  return {
    data: r.map((x) => x.completions),
    total: total[0].total,
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
  return r.length === 1 ? r[0] : null;
}

/**
 * find completion in database by id
 * @param id completion id
 * @returns db record of completion, null if not found
 */
export async function findCompletion(id: number): Promise<Completion | null> {
  logger.debug("findCompletion", id);
  const r = await db
    .select()
    .from(schema.CompletionsTable)
    .where(
      and(
        eq(schema.CompletionsTable.id, id),
        not(schema.CompletionsTable.deleted),
      ),
    );
  return r.length === 1 ? r[0] : null;
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
  const total = await db
    .select({
      total: count(schema.SrvLogsTable.id),
    })
    .from(schema.SrvLogsTable);
  if (total.length !== 1) {
    throw new Error("total count failed");
  }
  return {
    data: r.map((x) => x.srv_logs),
    total: total[0].total,
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null;
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
  return r.length === 1 ? r[0] : null; // should always not null
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
  return r.length === 1 ? r[0] : null;
}

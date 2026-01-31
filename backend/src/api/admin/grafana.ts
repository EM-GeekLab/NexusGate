import { Elysia, t } from "elysia";
import {
  getSetting,
  upsertSetting,
  deleteSetting,
  listAlertRules,
  listAlertChannels,
} from "@/db";
import { createLogger } from "@/utils/logger";
import {
  syncRulesToGrafana,
  syncChannelsToGrafana,
  syncAllToGrafana,
} from "@/services/grafanaSync";

const logger = createLogger("adminGrafana");

const GRAFANA_CONNECTION_KEY = "grafana_connection";

interface GrafanaConnection {
  apiUrl: string;
  authToken: string;
  datasourceUid?: string;
  verified: boolean;
  verifiedAt: string | null;
}

async function getGrafanaConnection(): Promise<GrafanaConnection | null> {
  const setting = await getSetting(GRAFANA_CONNECTION_KEY);
  if (!setting?.value) {
    return null;
  }
  return setting.value as GrafanaConnection;
}

export const adminGrafana = new Elysia({ prefix: "/grafana" })
  // ============================================
  // Connection Configuration
  // ============================================
  .get(
    "/connection",
    async () => {
      const config = await getGrafanaConnection();
      if (!config) {
        return {
          configured: false,
          apiUrl: null,
          hasToken: false,
          verified: false,
          verifiedAt: null,
          datasourceUid: null,
        };
      }
      return {
        configured: true,
        apiUrl: config.apiUrl,
        hasToken: !!config.authToken,
        verified: config.verified,
        verifiedAt: config.verifiedAt,
        datasourceUid: config.datasourceUid ?? null,
      };
    },
    {
      detail: {
        description:
          "Get Grafana connection configuration. Never returns the auth token.",
        tags: ["Admin - Grafana"],
      },
    },
  )
  .put(
    "/connection",
    async ({ body }) => {
      await upsertSetting({
        key: GRAFANA_CONNECTION_KEY,
        value: {
          apiUrl: body.apiUrl,
          authToken: body.authToken,
          verified: false,
          verifiedAt: null,
        } satisfies GrafanaConnection,
      });
      return { success: true };
    },
    {
      body: t.Object({
        apiUrl: t.String({ format: "uri" }),
        authToken: t.String({ minLength: 1 }),
      }),
      detail: {
        description: "Save Grafana API connection configuration.",
        tags: ["Admin - Grafana"],
      },
    },
  )
  .post(
    "/connection/test",
    async ({ status }) => {
      const config = await getGrafanaConnection();
      if (!config) {
        return status(404, { error: "Grafana connection not configured" });
      }

      try {
        // Step 1: Test health endpoint
        const healthRes = await fetch(`${config.apiUrl}/api/health`, {
          headers: { Authorization: `Bearer ${config.authToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!healthRes.ok) {
          throw new Error(
            `Grafana health check failed: ${healthRes.status} ${await healthRes.text()}`,
          );
        }

        // Step 2: Discover Prometheus datasource
        let datasourceUid: string | undefined;
        try {
          const dsRes = await fetch(`${config.apiUrl}/api/datasources`, {
            headers: { Authorization: `Bearer ${config.authToken}` },
            signal: AbortSignal.timeout(10_000),
          });
          if (dsRes.ok) {
            const datasources = (await dsRes.json()) as Array<{
              uid: string;
              type: string;
              name: string;
            }>;
            const promDs = datasources.find((ds) => ds.type === "prometheus");
            if (promDs) {
              datasourceUid = promDs.uid;
            }
          }
        } catch {
          logger.warn("Failed to discover Prometheus datasource");
        }

        // Step 3: Update verified status
        await upsertSetting({
          key: GRAFANA_CONNECTION_KEY,
          value: {
            ...config,
            datasourceUid,
            verified: true,
            verifiedAt: new Date().toISOString(),
          } satisfies GrafanaConnection,
        });

        return {
          success: true,
          message: "Connection verified",
          datasourceUid: datasourceUid ?? null,
        };
      } catch (e) {
        // Mark as not verified
        await upsertSetting({
          key: GRAFANA_CONNECTION_KEY,
          value: {
            ...config,
            datasourceUid: undefined,
            verified: false,
            verifiedAt: null,
          } satisfies GrafanaConnection,
        });

        return status(502, {
          success: false,
          error: e instanceof Error ? e.message : "Connection failed",
        });
      }
    },
    {
      detail: {
        description:
          "Test Grafana connection and discover Prometheus datasource.",
        tags: ["Admin - Grafana"],
      },
    },
  )
  .delete(
    "/connection",
    async () => {
      await deleteSetting(GRAFANA_CONNECTION_KEY);
      return { success: true };
    },
    {
      detail: {
        description: "Remove Grafana connection configuration.",
        tags: ["Admin - Grafana"],
      },
    },
  )

  // ============================================
  // Sync Operations
  // ============================================
  .post(
    "/sync",
    async ({ status }) => {
      try {
        const result = await syncAllToGrafana();
        return result;
      } catch (e) {
        return status(502, {
          error: e instanceof Error ? e.message : "Sync failed",
        });
      }
    },
    {
      detail: {
        description:
          "Sync all alert rules and channels to Grafana.",
        tags: ["Admin - Grafana"],
      },
    },
  )
  .post(
    "/sync/rules",
    async ({ status }) => {
      try {
        const result = await syncRulesToGrafana();
        return result;
      } catch (e) {
        return status(502, {
          error: e instanceof Error ? e.message : "Sync failed",
        });
      }
    },
    {
      detail: {
        description: "Sync alert rules to Grafana.",
        tags: ["Admin - Grafana"],
      },
    },
  )
  .post(
    "/sync/channels",
    async ({ status }) => {
      try {
        const result = await syncChannelsToGrafana();
        return result;
      } catch (e) {
        return status(502, {
          error: e instanceof Error ? e.message : "Sync failed",
        });
      }
    },
    {
      detail: {
        description: "Sync alert channels to Grafana as contact points.",
        tags: ["Admin - Grafana"],
      },
    },
  )
  .get(
    "/sync/status",
    async () => {
      const rules = await listAlertRules();
      const channels = await listAlertChannels();

      return {
        rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          grafanaUid: r.grafanaUid ?? null,
          grafanaSyncedAt: r.grafanaSyncedAt
            ? r.grafanaSyncedAt.toISOString()
            : null,
          grafanaSyncError: r.grafanaSyncError ?? null,
        })),
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          enabled: c.enabled,
          grafanaUid: c.grafanaUid ?? null,
          grafanaSyncedAt: c.grafanaSyncedAt
            ? c.grafanaSyncedAt.toISOString()
            : null,
          grafanaSyncError: c.grafanaSyncError ?? null,
        })),
      };
    },
    {
      detail: {
        description:
          "Get Grafana sync status for all rules and channels.",
        tags: ["Admin - Grafana"],
      },
    },
  );

/**
 * Helper to get the current verified Grafana connection.
 * Returns null if not configured or not verified.
 */
export async function getVerifiedGrafanaConnection(): Promise<GrafanaConnection | null> {
  const config = await getGrafanaConnection();
  if (!config?.verified) {
    return null;
  }
  return config;
}

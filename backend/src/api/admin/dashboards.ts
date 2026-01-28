import { Elysia, t } from "elysia";
import { grafanaDashboardsSchema } from "@/utils/config";
import {
  isEnvOverrideActive,
  getGrafanaDashboards,
  setGrafanaDashboards,
  clearGrafanaDashboards,
} from "@/utils/dashboards";

const dashboardSchema = t.Object({
  id: t.String(),
  label: t.String(),
  url: t.String({ format: "uri" }),
});

const dashboardsArraySchema = t.Array(dashboardSchema);

export const adminDashboards = new Elysia().group("/dashboards", (app) =>
  app
    .get(
      "/",
      async () => {
        const dashboards = await getGrafanaDashboards();
        return {
          dashboards,
          envOverride: isEnvOverrideActive(),
        };
      },
      {
        detail: {
          description:
            "Get Grafana dashboards configuration. Returns envOverride=true if GRAFANA_DASHBOARDS env var is set.",
        },
      },
    )
    .put(
      "/",
      async ({ body, status }) => {
        // Validate with Zod for extra safety
        const parsed = grafanaDashboardsSchema.safeParse(body.dashboards);
        if (!parsed.success) {
          return status(400, { error: "Invalid dashboards format" });
        }

        try {
          await setGrafanaDashboards(parsed.data);
          return {
            dashboards: parsed.data,
            envOverride: false,
          };
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("GRAFANA_DASHBOARDS")
          ) {
            return status(409, {
              error:
                "Cannot modify dashboards when GRAFANA_DASHBOARDS environment variable is set",
            });
          }
          throw error;
        }
      },
      {
        body: t.Object({
          dashboards: dashboardsArraySchema,
        }),
        detail: {
          description:
            "Update Grafana dashboards configuration. Returns 409 if GRAFANA_DASHBOARDS env var is set.",
        },
      },
    )
    .delete(
      "/",
      async ({ status }) => {
        try {
          await clearGrafanaDashboards();
          return { success: true };
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("GRAFANA_DASHBOARDS")
          ) {
            return status(409, {
              error:
                "Cannot modify dashboards when GRAFANA_DASHBOARDS environment variable is set",
            });
          }
          throw error;
        }
      },
      {
        detail: {
          description:
            "Clear Grafana dashboards configuration. Returns 409 if GRAFANA_DASHBOARDS env var is set.",
        },
      },
    ),
);

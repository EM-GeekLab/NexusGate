import { Elysia, t } from "elysia";
import {
  isEnvOverrideActive,
  getGrafanaDashboards,
  setGrafanaDashboards,
  clearGrafanaDashboards,
  EnvOverrideError,
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
        try {
          await setGrafanaDashboards(body.dashboards);
          return {
            dashboards: body.dashboards,
            envOverride: false,
          };
        } catch (error) {
          if (error instanceof EnvOverrideError) {
            return status(409, { error: error.message });
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
          if (error instanceof EnvOverrideError) {
            return status(409, { error: error.message });
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

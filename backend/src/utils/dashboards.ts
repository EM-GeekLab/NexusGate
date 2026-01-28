import { getSetting, upsertSetting, deleteSetting } from "@/db";
import {
  GRAFANA_DASHBOARDS,
  grafanaDashboardsSchema,
  type GrafanaDashboard,
} from "./config";

const DASHBOARDS_KEY = "grafana_dashboards";
const LEGACY_KEY = "grafana_dashboard_url";

/**
 * Check if the GRAFANA_DASHBOARDS environment variable is set
 * When set, it overrides database settings
 */
export function isEnvOverrideActive(): boolean {
  return GRAFANA_DASHBOARDS !== undefined && GRAFANA_DASHBOARDS.length > 0;
}

/**
 * Get Grafana dashboards from environment variable or database
 * Environment variable takes precedence over database settings
 */
export async function getGrafanaDashboards(): Promise<GrafanaDashboard[]> {
  // Environment variable takes precedence
  if (isEnvOverrideActive()) {
    return GRAFANA_DASHBOARDS!;
  }

  // Try to get from database (new format)
  const setting = await getSetting(DASHBOARDS_KEY);
  if (setting?.value) {
    const parsed = grafanaDashboardsSchema.safeParse(setting.value);
    if (parsed.success) {
      return parsed.data;
    }
  }

  // Try legacy format and migrate if found
  const legacySetting = await getSetting(LEGACY_KEY);
  if (legacySetting?.value && typeof legacySetting.value === "string") {
    const migrated: GrafanaDashboard[] = [
      {
        id: "grafana",
        label: "Grafana",
        url: legacySetting.value,
      },
    ];
    // Migrate to new format
    await upsertSetting({ key: DASHBOARDS_KEY, value: migrated });
    // Remove legacy key
    await deleteSetting(LEGACY_KEY);
    return migrated;
  }

  return [];
}

/**
 * Set Grafana dashboards in database
 * Throws error if environment variable override is active
 */
export async function setGrafanaDashboards(
  dashboards: GrafanaDashboard[],
): Promise<void> {
  if (isEnvOverrideActive()) {
    throw new Error(
      "Cannot modify dashboards when GRAFANA_DASHBOARDS environment variable is set",
    );
  }

  await upsertSetting({ key: DASHBOARDS_KEY, value: dashboards });
}

/**
 * Clear Grafana dashboards from database
 * Throws error if environment variable override is active
 */
export async function clearGrafanaDashboards(): Promise<void> {
  if (isEnvOverrideActive()) {
    throw new Error(
      "Cannot modify dashboards when GRAFANA_DASHBOARDS environment variable is set",
    );
  }

  await deleteSetting(DASHBOARDS_KEY);
}

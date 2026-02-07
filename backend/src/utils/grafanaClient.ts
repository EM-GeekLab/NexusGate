import { createLogger } from "./logger";

const logger = createLogger("grafanaClient");

interface GrafanaAlertRulePayload {
  uid?: string;
  title: string;
  ruleGroup: string;
  folderUID: string;
  condition: string;
  data: Array<{
    refId: string;
    relativeTimeRange: { from: number; to: number };
    datasourceUid: string;
    model: Record<string, unknown>;
  }>;
  noDataState: "NoData" | "Alerting" | "OK";
  execErrState: "Alerting" | "OK";
  for: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface GrafanaAlertRule extends GrafanaAlertRulePayload {
  uid: string;
  id: number;
  updated: string;
  provenance: string;
}

interface GrafanaContactPointPayload {
  uid?: string;
  name: string;
  type: string;
  settings: Record<string, unknown>;
  disableResolveMessage?: boolean;
}

interface GrafanaContactPoint extends GrafanaContactPointPayload {
  uid: string;
}

interface GrafanaFolder {
  uid: string;
  title: string;
}

export type {
  GrafanaAlertRulePayload,
  GrafanaAlertRule,
  GrafanaContactPointPayload,
  GrafanaContactPoint,
};

export class GrafanaClient {
  constructor(
    private apiUrl: string,
    private authToken: string,
  ) {}

  private async request<T>(
    path: string,
    options: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
        "X-Disable-Provenance": "true",
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Grafana API ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // Folders
  // ============================================

  async ensureFolder(title: string): Promise<string> {
    // List existing folders and check if one with the title exists
    const folders = await this.request<GrafanaFolder[]>("/api/folders");
    const existing = folders.find(
      (f) => f.title.toLowerCase() === title.toLowerCase(),
    );
    if (existing) {
      return existing.uid;
    }

    // Create new folder
    const folder = await this.request<GrafanaFolder>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    logger.info(`Created Grafana folder: ${title} (${folder.uid})`);
    return folder.uid;
  }

  // ============================================
  // Alert Rules
  // ============================================

  async listAlertRules(): Promise<GrafanaAlertRule[]> {
    return this.request<GrafanaAlertRule[]>("/api/v1/provisioning/alert-rules");
  }

  async createAlertRule(
    rule: GrafanaAlertRulePayload,
  ): Promise<GrafanaAlertRule> {
    return this.request<GrafanaAlertRule>("/api/v1/provisioning/alert-rules", {
      method: "POST",
      body: JSON.stringify(rule),
    });
  }

  async updateAlertRule(
    uid: string,
    rule: GrafanaAlertRulePayload,
  ): Promise<void> {
    await this.request<void>(`/api/v1/provisioning/alert-rules/${uid}`, {
      method: "PUT",
      body: JSON.stringify(rule),
    });
  }

  async deleteAlertRule(uid: string): Promise<void> {
    await this.request<void>(`/api/v1/provisioning/alert-rules/${uid}`, {
      method: "DELETE",
    });
  }

  // ============================================
  // Contact Points
  // ============================================

  async listContactPoints(): Promise<GrafanaContactPoint[]> {
    return this.request<GrafanaContactPoint[]>(
      "/api/v1/provisioning/contact-points",
    );
  }

  async createContactPoint(
    cp: GrafanaContactPointPayload,
  ): Promise<GrafanaContactPoint> {
    return this.request<GrafanaContactPoint>(
      "/api/v1/provisioning/contact-points",
      {
        method: "POST",
        body: JSON.stringify(cp),
      },
    );
  }

  async updateContactPoint(
    uid: string,
    cp: GrafanaContactPointPayload,
  ): Promise<void> {
    await this.request<void>(`/api/v1/provisioning/contact-points/${uid}`, {
      method: "PUT",
      body: JSON.stringify(cp),
    });
  }

  async deleteContactPoint(uid: string): Promise<void> {
    await this.request<void>(`/api/v1/provisioning/contact-points/${uid}`, {
      method: "DELETE",
    });
  }

  // ============================================
  // Datasources
  // ============================================

  async findPrometheusDatasource(): Promise<string | null> {
    const datasources = await this.request<
      Array<{ uid: string; type: string; name: string }>
    >("/api/datasources");
    const prom = datasources.find((ds) => ds.type === "prometheus");
    return prom?.uid ?? null;
  }
}

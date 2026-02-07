import { Elysia, t } from "elysia";
import type { AlertChannelConfig, AlertCondition } from "@/db/schema";
import {
  deleteAlertChannel,
  deleteAlertRule,
  findAlertChannel,
  findAlertRule,
  insertAlertChannel,
  insertAlertRule,
  listAlertChannels,
  listAlertHistory,
  listAlertRules,
  updateAlertChannel,
  updateAlertRule,
} from "@/db";
import { sendTestNotification } from "@/services/alertDispatcher";

export const adminAlerts = new Elysia({ prefix: "/alerts" })
  // ============================================
  // Alert Channels
  // ============================================
  .get(
    "/channels",
    async () => {
      return await listAlertChannels();
    },
    {
      detail: {
        description: "List all alert channels",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .get(
    "/channels/:id",
    async ({ params: { id }, status }) => {
      const channel = await findAlertChannel(id);
      if (!channel) {
        return status(404, { error: "Alert channel not found" });
      }
      return channel;
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Get an alert channel by ID",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .post(
    "/channels",
    async ({ body }) => {
      const channel = await insertAlertChannel({
        name: body.name,
        type: body.type,
        config: body.config as AlertChannelConfig,
        enabled: body.enabled,
      });
      return channel;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        type: t.Union([
          t.Literal("webhook"),
          t.Literal("email"),
          t.Literal("feishu"),
        ]),
        config: t.Unknown(),
        enabled: t.Optional(t.Boolean()),
      }),
      detail: {
        description: "Create a new alert channel",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .put(
    "/channels/:id",
    async ({ params: { id }, body, status }) => {
      const existing = await findAlertChannel(id);
      if (!existing) {
        return status(404, { error: "Alert channel not found" });
      }
      const channel = await updateAlertChannel(id, {
        name: body.name,
        type: body.type,
        config: body.config as AlertChannelConfig | undefined,
        enabled: body.enabled,
      });
      return channel;
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        type: t.Optional(
          t.Union([
            t.Literal("webhook"),
            t.Literal("email"),
            t.Literal("feishu"),
          ]),
        ),
        config: t.Optional(t.Unknown()),
        enabled: t.Optional(t.Boolean()),
      }),
      detail: {
        description: "Update an alert channel",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .delete(
    "/channels/:id",
    async ({ params: { id }, status }) => {
      const channel = await deleteAlertChannel(id);
      if (!channel) {
        return status(404, { error: "Alert channel not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Delete an alert channel",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .post(
    "/channels/:id/test",
    async ({ params: { id }, status }) => {
      const channel = await findAlertChannel(id);
      if (!channel) {
        return status(404, { error: "Alert channel not found" });
      }

      try {
        await sendTestNotification(channel.type, channel.config);
        return { success: true, message: "Test notification sent" };
      } catch (e) {
        return status(502, {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Send a test notification to an alert channel",
        tags: ["Admin - Alerts"],
      },
    },
  )
  // ============================================
  // Alert Rules
  // ============================================
  .get(
    "/rules",
    async () => {
      return await listAlertRules();
    },
    {
      detail: {
        description: "List all alert rules",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .get(
    "/rules/:id",
    async ({ params: { id }, status }) => {
      const rule = await findAlertRule(id);
      if (!rule) {
        return status(404, { error: "Alert rule not found" });
      }
      return { ...rule, channelIds: [...rule.channelIds] };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Get an alert rule by ID",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .post(
    "/rules",
    async ({ body }) => {
      const rule = await insertAlertRule({
        name: body.name,
        type: body.type,
        condition: body.condition as AlertCondition,
        channelIds: body.channelIds,
        cooldownMinutes: body.cooldownMinutes,
        enabled: body.enabled,
      });
      if (!rule) {
        return rule;
      }
      return { ...rule, channelIds: [...rule.channelIds] };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        type: t.Union([
          t.Literal("budget"),
          t.Literal("error_rate"),
          t.Literal("latency"),
          t.Literal("quota"),
        ]),
        condition: t.Unknown(),
        channelIds: t.Array(t.Number()),
        cooldownMinutes: t.Optional(t.Number({ minimum: 1 })),
        enabled: t.Optional(t.Boolean()),
      }),
      detail: {
        description: "Create a new alert rule",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .put(
    "/rules/:id",
    async ({ params: { id }, body, status }) => {
      const existing = await findAlertRule(id);
      if (!existing) {
        return status(404, { error: "Alert rule not found" });
      }
      const rule = await updateAlertRule(id, {
        name: body.name,
        type: body.type,
        condition: body.condition as AlertCondition | undefined,
        channelIds: body.channelIds,
        cooldownMinutes: body.cooldownMinutes,
        enabled: body.enabled,
      });
      if (!rule) {
        return rule;
      }
      return { ...rule, channelIds: [...rule.channelIds] };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        type: t.Optional(
          t.Union([
            t.Literal("budget"),
            t.Literal("error_rate"),
            t.Literal("latency"),
            t.Literal("quota"),
          ]),
        ),
        condition: t.Optional(t.Unknown()),
        channelIds: t.Optional(t.Array(t.Number())),
        cooldownMinutes: t.Optional(t.Number({ minimum: 1 })),
        enabled: t.Optional(t.Boolean()),
      }),
      detail: {
        description: "Update an alert rule",
        tags: ["Admin - Alerts"],
      },
    },
  )
  .delete(
    "/rules/:id",
    async ({ params: { id }, status }) => {
      const rule = await deleteAlertRule(id);
      if (!rule) {
        return status(404, { error: "Alert rule not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Delete an alert rule",
        tags: ["Admin - Alerts"],
      },
    },
  )
  // ============================================
  // Alert History
  // ============================================
  .get(
    "/history",
    async ({ query }) => {
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 50;
      const ruleId = query.ruleId;
      return await listAlertHistory(offset, limit, ruleId);
    },
    {
      query: t.Object({
        offset: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
        ruleId: t.Optional(t.Numeric()),
      }),
      detail: {
        description:
          "List alert history (paginated, optionally filtered by rule)",
        tags: ["Admin - Alerts"],
      },
    },
  );

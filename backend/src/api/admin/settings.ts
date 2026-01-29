import { Elysia, t } from "elysia";
import { deleteSetting, getAllSettings, getSetting, upsertSetting } from "@/db";

export const adminSettings = new Elysia().group("/settings", (app) =>
  app
    .get(
      "/",
      async () => {
        return await getAllSettings();
      },
      {
        detail: { description: "List all settings" },
      },
    )
    .get(
      "/:key",
      async ({ params, status }) => {
        const setting = await getSetting(params.key);
        if (!setting) {
          return status(404, "Setting not found");
        }
        return setting;
      },
      {
        params: t.Object({ key: t.String() }),
        detail: { description: "Get a setting by key" },
      },
    )
    .put(
      "/:key",
      async ({ params, body }) => {
        const result = await upsertSetting({
          key: params.key,
          value: body.value,
        });
        return result;
      },
      {
        params: t.Object({ key: t.String() }),
        body: t.Object({ value: t.Any() }),
        detail: { description: "Create or update a setting" },
      },
    )
    .delete(
      "/:key",
      async ({ params, status }) => {
        const result = await deleteSetting(params.key);
        if (!result) {
          return status(404, "Setting not found");
        }
        return result;
      },
      {
        params: t.Object({ key: t.String() }),
        detail: { description: "Delete a setting" },
      },
    ),
);

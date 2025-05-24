import { deleteCompletion, findCompletion, listCompletions } from "@/db";
import { Elysia, t } from "elysia";

export const adminCompletions = new Elysia()
  .get(
    "/completions",
    async ({ query }) => {
      const result = await listCompletions(
        query.offset ?? 0,
        query.limit ?? 100,
        query.apiKeyId,
        query.upstreamId,
      );
      // 如果 model 字段存在且包含 '@'，则截断
      for (const completion of result.data) {
        if (completion.model?.includes("@")) {
          completion.model = completion.model.split("@")[0];
        }
      }
      return result;
    },
    {
      query: t.Object({
        offset: t.Optional(t.Integer()),
        limit: t.Optional(t.Integer()),
        apiKeyId: t.Optional(t.Integer()),
        upstreamId: t.Optional(t.Integer()),
      }),
    },
  )
  .get(
    "/completions/:id",
    async ({ error, params }) => {
      const { id } = params;
      const r = await findCompletion(id);
      if (r === null) {
        return error(404, "Completion not found");
      }
      // 如果 model 字段存在且包含 '@'，则截断
      if (r.model && r.model.includes("@")) {
        r.model = r.model.split("@")[0];
      }
      return r;
    },
    {
      params: t.Object({
        id: t.Integer(),
      }),
    },
  )
  .delete(
    "/completions/:id",
    async ({ error, params }) => {
      const { id } = params;
      const r = await deleteCompletion(id);
      if (r === null) {
        return error(404, "Completion not found");
      }
      return r;
    },
    {
      params: t.Object({
        id: t.Integer(),
      }),
    },
  );

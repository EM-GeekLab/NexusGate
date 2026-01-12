import { Elysia } from "elysia";
import { checkApiKey } from "@/utils/apiKey.ts";
import { ADMIN_SUPER_SECRET } from "@/utils/config.ts";

export const apiKeyPlugin = new Elysia({ name: "apiKeyPlugin" })
  .derive({ as: "global" }, ({ headers }) => {
    if (!headers.authorization) {return;}
    const [method, key] = headers.authorization.split(" ");
    if (method !== "Bearer") {return;}

    return {
      bearer: key,
    };
  })
  // NOTE: Using function form instead of property shorthand due to Elysia 1.4.x bug
  // where `error` is undefined in macro beforeHandle when using property shorthand.
  // See: https://elysiajs.com/patterns/macro.html#property-shorthand
  .macro(() => ({
    checkApiKey(enabled: boolean) {
      if (!enabled) return;
      return {
        async beforeHandle({ bearer, error }: { bearer?: string; error: (status: number, message: string) => Response }) {
          if (!bearer || !(await checkApiKey(bearer))) {
            return error(401, "Invalid API key");
          }
        },
      };
    },
    checkAdminApiKey(enabled: boolean) {
      if (!enabled) return;
      return {
        async beforeHandle({ bearer, error }: { bearer?: string; error: (status: number, message: string) => Response }) {
          if (!bearer || bearer !== ADMIN_SUPER_SECRET) {
            return error(401, "Invalid admin secret");
          }
        },
      };
    },
  }));

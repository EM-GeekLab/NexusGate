import { z } from "zod";

export const PRODUCTION = process.env.NODE_ENV?.toLowerCase() === "production";

function env<TSchema extends z.ZodSchema, TValue = z.infer<TSchema>>(
  name: string,
  schema: TSchema,
  defaultValue: string | undefined = undefined,
): TValue {
  const envName = name.replaceAll(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  const envValue = process.env[envName] ?? defaultValue;
  const parsed = schema.safeParse(envValue);
  if (parsed.success) {
    if (!PRODUCTION) {
      console.log(`Environment variable ${envName} = ${parsed.data}`);
    }
    return parsed.data;
  }
  throw new Error(
    `Environment variable ${envName} is not valid: ${parsed.error}`,
  );
}

function zBoolean(): z.ZodPipeline<
  z.ZodEffects<z.ZodOptional<z.ZodString>, boolean, string | undefined>,
  z.ZodBoolean
> {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return false;
      if (Number.isSafeInteger(v)) {
        return Number(v) > 0;
      }
      const v2 = v?.toLowerCase();
      if (v2 === "true") return true;
      if (v2 === "false") return false;
      return Boolean(v2);
    })
    .pipe(z.boolean());
}

function zObject<TSchema extends z.ZodSchema>(
  schema: TSchema,
): z.ZodPipeline<
  z.ZodEffects<
    z.ZodOptional<z.ZodString>,
    z.infer<TSchema>,
    string | undefined
  >,
  TSchema
> {
  return z
    .string()
    .optional()
    .transform((v) => {
      try {
        if (v) {
          return JSON.parse(v);
        }
      } catch (e) {
        console.error("Failed to parse init config json", e);
      }
    })
    .pipe(schema);
}

export const PORT = env("port", z.coerce.number().int().positive(), "3000");
export const ADMIN_SUPER_SECRET = env(
  "admin super secret",
  z.coerce.string(),
  "admin",
);
export const ALLOWED_ORIGINS = env("allowed origins", z.coerce.string(), "*");
export const DATABASE_URL = env(
  "database url",
  z.coerce.string().url(),
  "postgres://localhost:5432",
);
export const REDIS_URL = env(
  "redis url",
  z.coerce.string().url(),
  "redis://localhost:6379",
);
export const DEFAULT_RATE_LIMIT = env(
  "default rate limit",
  z.coerce.number().int().positive(),
  "10",
);
export const DEFAULT_REFILL_RATE = env(
  "default refill rate",
  z.coerce.number().int().positive(),
  "1",
);
export const COMMIT_SHA = env("commit sha", z.coerce.string(), "unknown");
export const INIT_CONFIG_PATH = env(
  "init config path",
  z.coerce.string(),
  "./init.json",
);
export const ENABLE_INIT_CONFIG = env(
  "enable init config",
  zBoolean(),
  "false",
);

export const initConfigJsonSchema = z.object({
  upstreams: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      model: z.string(),
      upstreamModel: z.string().nullish(),
      apiKey: z.string().nullish(),
      weight: z.number().optional(),
      comment: z.string().nullish(),
    }),
  ),
});
export type InitConfigJson = z.infer<typeof initConfigJsonSchema>;
export const INIT_CONFIG_JSON = env(
  "init config json",
  zObject(initConfigJsonSchema.optional()),
);

export const forcilyAddApiKeysSchema = z.array(
  z.string().regex(/sk-[0-9a-f]{32}/),
);
export type ForcilyAddApiKeys = z.infer<typeof forcilyAddApiKeysSchema>;
export const FORCILY_ADD_API_KEYS = env(
  "forcily add api keys",
  zObject(forcilyAddApiKeysSchema.optional()),
);

export const FRONTEND_DIR = env("frontend dir", z.coerce.string(), "dist");

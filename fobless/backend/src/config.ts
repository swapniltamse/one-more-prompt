import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().default(8787),
    AUTH_MODE: z.enum(["dev", "cognito"]).default("dev"),
    DEV_JWT_SECRET: z.string().optional(),
    DEV_PIN: z.string().optional(),
    COGNITO_REGION: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    /** Comma-separated user ids (Cognito `sub`) allowed to control the vehicle. Empty = any authenticated user. */
    ALLOWED_USER_IDS: z.string().default(""),
    VEHICLE_PROVIDER: z.enum(["simulator", "toyota"]).default("simulator"),
    SIMULATOR_LATENCY_MS: z.coerce.number().default(1500),
    SIMULATOR_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
    /** Keep below API Gateway's 29s integration timeout when deployed behind it. */
    VEHICLE_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
    COMMANDS_TABLE: z.string().optional(),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
  })
  .superRefine((c, ctx) => {
    if (c.AUTH_MODE === "dev" && (!c.DEV_JWT_SECRET || !c.DEV_PIN)) {
      ctx.addIssue({ code: "custom", message: "AUTH_MODE=dev requires DEV_JWT_SECRET and DEV_PIN" });
    }
    if (c.AUTH_MODE === "cognito" && (!c.COGNITO_REGION || !c.COGNITO_USER_POOL_ID || !c.COGNITO_CLIENT_ID)) {
      ctx.addIssue({ code: "custom", message: "AUTH_MODE=cognito requires COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID" });
    }
    if (c.AUTH_MODE === "cognito" && !c.ALLOWED_USER_IDS) {
      ctx.addIssue({ code: "custom", message: "AUTH_MODE=cognito requires ALLOWED_USER_IDS (the vehicle owner's Cognito sub)" });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error("Invalid configuration:\n" + parsed.error.issues.map((i) => ` - ${i.message}`).join("\n"));
  }
  return parsed.data;
}

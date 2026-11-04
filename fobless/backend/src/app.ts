import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CognitoVerifier, DevTokenAuthority, requireAuth, type TokenVerifier } from "./auth/auth.js";
import { CommandService, DEFAULT_POLICY, type CommandPolicy } from "./commands/commandService.js";
import type { Config } from "./config.js";
import { AppError, COMMAND_TYPES } from "./domain.js";
import { log } from "./log.js";
import { InMemoryCommandStore, type CommandStore } from "./store/commandStore.js";
import { DynamoCommandStore } from "./store/dynamoCommandStore.js";
import type { VehicleProvider } from "./vehicles/provider.js";
import { SimulatedVehicleProvider } from "./vehicles/simulatedProvider.js";
import { ToyotaConnectedProvider } from "./vehicles/toyotaProvider.js";

export interface Deps {
  provider: VehicleProvider;
  store: CommandStore;
  verifier: TokenVerifier;
  devAuthority?: DevTokenAuthority;
  policy?: CommandPolicy;
}

export function depsFromConfig(config: Config): Deps {
  const provider =
    config.VEHICLE_PROVIDER === "toyota"
      ? new ToyotaConnectedProvider(async () => {
          throw new AppError(501, "provider_not_implemented", "Wire Toyota credentials to Secrets Manager first");
        })
      : new SimulatedVehicleProvider({ latencyMs: config.SIMULATOR_LATENCY_MS, failureRate: config.SIMULATOR_FAILURE_RATE });
  const policy: CommandPolicy = { ...DEFAULT_POLICY, vehicleTimeoutMs: config.VEHICLE_TIMEOUT_MS };
  const store = config.COMMANDS_TABLE ? new DynamoCommandStore(config.COMMANDS_TABLE) : new InMemoryCommandStore();
  if (config.AUTH_MODE === "dev") {
    const devAuthority = new DevTokenAuthority(config.DEV_JWT_SECRET!, config.DEV_PIN!);
    return { provider, store, policy, verifier: devAuthority, devAuthority };
  }
  return { provider, store, policy, verifier: new CognitoVerifier(config.COGNITO_REGION!, config.COGNITO_USER_POOL_ID!, config.COGNITO_CLIENT_ID!) };
}

const commandBody = z.object({ type: z.enum(COMMAND_TYPES) });
const vinParam = z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/i, "Invalid VIN");

export function createApp(config: Pick<Config, "ALLOWED_USER_IDS" | "CORS_ORIGIN">, deps: Deps) {
  const app = express();
  const commands = new CommandService(deps.provider, deps.store, deps.policy ?? DEFAULT_POLICY);
  const allowed = new Set(config.ALLOWED_USER_IDS.split(",").map((s) => s.trim()).filter(Boolean));
  const auth = requireAuth(deps.verifier, allowed);

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "4kb" }));

  // Security headers + request id. (API Gateway handles CORS in AWS; this covers local dev.)
  app.use((req, res, next) => {
    const requestId = req.get("x-request-id") ?? randomUUID();
    res.locals.requestId = requestId;
    res.set({
      "x-request-id": requestId,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": config.CORS_ORIGIN,
      "access-control-allow-headers": "authorization, content-type, idempotency-key",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, provider: deps.provider.name });
  });

  if (deps.devAuthority) {
    const authority = deps.devAuthority;
    app.post("/api/auth/dev-login", async (req, res, next) => {
      try {
        const pin = z.object({ pin: z.string().max(64) }).parse(req.body).pin;
        if (!authority.checkPin(pin)) throw new AppError(401, "invalid_pin", "Wrong PIN");
        res.json({ accessToken: await authority.issue("dev-owner"), expiresIn: 3600 });
      } catch (err) {
        next(err);
      }
    });
  }

  app.get("/api/me", auth, (req, res) => {
    res.json({ userId: req.principal!.userId, authTime: req.principal!.authTime });
  });

  app.get("/api/vehicles", auth, async (_req, res, next) => {
    try {
      res.json({ vehicles: await deps.provider.listVehicles() });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/vehicles/:vin/status", auth, async (req, res, next) => {
    try {
      res.json(await deps.provider.getStatus(vinParam.parse(req.params.vin)));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/vehicles/:vin/commands", auth, async (req, res, next) => {
    try {
      const { record, replayed } = await commands.execute({
        principal: req.principal!,
        vin: vinParam.parse(req.params.vin),
        type: commandBody.parse(req.body).type,
        idempotencyKey: req.get("idempotency-key") ?? "",
        sourceIp: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      });
      res.status(replayed ? 200 : 201).set("idempotent-replayed", String(replayed)).json(record);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/vehicles/:vin/commands", auth, async (req, res, next) => {
    try {
      const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit);
      res.json({ commands: await deps.store.listByVin(vinParam.parse(req.params.vin), limit) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/commands/:id", auth, async (req, res, next) => {
    try {
      const rec = await deps.store.get(z.string().uuid().parse(req.params.id));
      if (!rec || rec.userId !== req.principal!.userId) throw new AppError(404, "not_found", "Command not found");
      res.json(rec);
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, _res, next) => next(new AppError(404, "not_found", "Route not found")));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: "bad_request", message: err.issues.map((i) => i.message).join("; ") } });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if ((err as { type?: string }).type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "bad_request", message: "Malformed JSON" } });
    }
    log("error", "unhandled_error", { requestId: res.locals.requestId, error: String(err) });
    res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
  });

  return app;
}

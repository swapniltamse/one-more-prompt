import { randomUUID } from "node:crypto";
import { AppError, type CommandRecord, type CommandType } from "../domain.js";
import type { Principal } from "../auth/auth.js";
import type { CommandStore } from "../store/commandStore.js";
import type { VehicleProvider } from "../vehicles/provider.js";
import { log } from "../log.js";

export interface CommandPolicy {
  /** Commands that need a recent interactive login (step-up), not just a valid token. */
  stepUpCommands: ReadonlySet<CommandType>;
  stepUpMaxAgeSec: number;
  /** Max commands per user per rolling minute. Stops a stolen token or a buggy client hammering the car. */
  maxCommandsPerMinute: number;
  /** Give up waiting for the vehicle after this long. */
  vehicleTimeoutMs: number;
}

export const DEFAULT_POLICY: CommandPolicy = {
  stepUpCommands: new Set<CommandType>(["unlock"]),
  stepUpMaxAgeSec: 5 * 60,
  maxCommandsPerMinute: 6,
  vehicleTimeoutMs: 25_000,
};

export interface CommandRequest {
  principal: Principal;
  vin: string;
  type: CommandType;
  idempotencyKey: string;
  sourceIp: string | null;
  userAgent: string | null;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError(504, "vehicle_timeout", "Vehicle did not respond in time")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export class CommandService {
  constructor(
    private readonly provider: VehicleProvider,
    private readonly store: CommandStore,
    private readonly policy: CommandPolicy = DEFAULT_POLICY,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(req: CommandRequest): Promise<{ record: CommandRecord; replayed: boolean }> {
    const { principal, vin, type, idempotencyKey } = req;

    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError(400, "invalid_idempotency_key", "Idempotency-Key header must be 8-128 chars of [A-Za-z0-9_-]");
    }

    const vehicles = await this.provider.listVehicles();
    if (!vehicles.some((v) => v.vin === vin)) throw new AppError(404, "vehicle_not_found", "Unknown vehicle");

    if (this.policy.stepUpCommands.has(type)) {
      const ageSec = Math.floor(this.now() / 1000) - principal.authTime;
      if (ageSec > this.policy.stepUpMaxAgeSec) {
        log("warn", "command.step_up_required", { userId: principal.userId, vin, type, ageSec });
        throw new AppError(401, "step_up_required", `Sign in again to ${type} (last sign-in was ${Math.round(ageSec / 60)} min ago)`);
      }
    }

    const nowIso = new Date(this.now()).toISOString();
    const candidate: CommandRecord = {
      id: randomUUID(),
      vin,
      type,
      status: "pending",
      userId: principal.userId,
      idempotencyKey,
      createdAt: nowIso,
      completedAt: null,
      error: null,
      sourceIp: req.sourceIp,
      userAgent: req.userAgent,
    };

    // Replays are answered before rate limiting so a client retrying a flaky request is never penalised.
    const { record, created } = await this.claim(candidate);
    if (!created) {
      if (record.type !== type || record.vin !== vin) {
        throw new AppError(409, "idempotency_conflict", "Idempotency-Key was already used for a different command");
      }
      log("info", "command.replayed", { commandId: record.id, userId: principal.userId });
      return { record, replayed: true };
    }

    log("info", "command.accepted", { commandId: record.id, userId: principal.userId, vin, type, sourceIp: req.sourceIp });

    try {
      await withTimeout(this.provider.sendCommand(vin, type), this.policy.vehicleTimeoutMs);
      const done = await this.store.update(record.id, { status: "succeeded", completedAt: new Date(this.now()).toISOString() });
      log("info", "command.succeeded", { commandId: record.id, vin, type });
      return { record: done, replayed: false };
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Vehicle provider error";
      await this.store.update(record.id, { status: "failed", completedAt: new Date(this.now()).toISOString(), error: message });
      log("error", "command.failed", { commandId: record.id, vin, type, error: String(err) });
      throw err instanceof AppError ? err : new AppError(502, "provider_error", message);
    }
  }

  private async claim(candidate: CommandRecord) {
    const since = new Date(this.now() - 60_000).toISOString();
    const recent = await this.store.countByUserSince(candidate.userId, since);
    const result = await this.store.createOrGet(candidate);
    if (result.created && recent >= this.policy.maxCommandsPerMinute) {
      await this.store.update(candidate.id, { status: "failed", completedAt: candidate.createdAt, error: "rate_limited" });
      log("warn", "command.rate_limited", { userId: candidate.userId, recent });
      throw new AppError(429, "rate_limited", "Too many commands. Wait a minute and try again.");
    }
    return result;
  }
}

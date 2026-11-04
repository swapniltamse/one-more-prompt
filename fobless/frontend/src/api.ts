import { tokenStore } from "./auth";
import type { AppConfig } from "./config";

export type CommandType = "lock" | "unlock" | "start" | "stop";

export interface Vehicle {
  vin: string;
  nickname: string;
  model: string;
  year: number;
}

export interface VehicleStatus {
  vin: string;
  locked: boolean;
  engineRunning: boolean;
  engineStartedAt: string | null;
  remoteStartMaxMinutes: number;
  cabinTempF: number;
  outsideTempF: number;
  fuelPercent: number;
  odometerMiles: number;
  updatedAt: string;
}

export interface CommandRecord {
  id: string;
  type: CommandType;
  status: "pending" | "succeeded" | "failed";
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function createApi(config: AppConfig) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenStore.get()}`, ...init.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, body.error?.code ?? "unknown", body.error?.message ?? res.statusText);
    return body as T;
  }

  return {
    vehicles: () => call<{ vehicles: Vehicle[] }>("/api/vehicles").then((r) => r.vehicles),
    status: (vin: string) => call<VehicleStatus>(`/api/vehicles/${vin}/status`),
    history: (vin: string) => call<{ commands: CommandRecord[] }>(`/api/vehicles/${vin}/commands?limit=10`).then((r) => r.commands),
    /** The caller supplies the idempotency key so a retry of the same tap can never fire twice. */
    send: (vin: string, type: CommandType, idempotencyKey: string) =>
      call<CommandRecord>(`/api/vehicles/${vin}/commands`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({ type }),
      }),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Remote commands the app supports. Kept deliberately small: every new verb is new attack surface. */
export const COMMAND_TYPES = ["lock", "unlock", "start", "stop"] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export type CommandStatus = "pending" | "succeeded" | "failed";

export interface VehicleSummary {
  vin: string;
  nickname: string;
  model: string;
  year: number;
}

export interface VehicleStatus {
  vin: string;
  locked: boolean;
  engineRunning: boolean;
  /** ISO timestamp the remote start began; the car auto-stops after `remoteStartMaxMinutes`. */
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
  vin: string;
  type: CommandType;
  status: CommandStatus;
  userId: string;
  idempotencyKey: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  /** Request metadata kept for the audit trail. */
  sourceIp: string | null;
  userAgent: string | null;
}

/** Errors that map cleanly onto an HTTP response. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

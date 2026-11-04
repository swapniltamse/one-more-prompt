import { AppError, type CommandType, type VehicleStatus, type VehicleSummary } from "../domain.js";
import type { VehicleProvider } from "./provider.js";

export interface SimulatorOptions {
  /** Round-trip latency to "the car". Real telematics commands take 5-30s. */
  latencyMs?: number;
  /** 0..1 probability a command fails, to exercise the error paths in the UI. */
  failureRate?: number;
  now?: () => number;
  random?: () => number;
}

interface TwinState {
  summary: VehicleSummary;
  locked: boolean;
  engineStartedAtMs: number | null;
  cabinTempF: number;
  outsideTempF: number;
  fuelPercent: number;
  odometerMiles: number;
  updatedAtMs: number;
}

const REMOTE_START_MAX_MINUTES = 10;
const CLIMATE_TARGET_F = 70;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A small digital twin of a hybrid sedan. It models the behaviours the UI cares about:
 * lock state, a 10-minute remote-start window with auto-shutoff, and cabin temperature
 * moving toward the climate target while the engine runs.
 */
export class SimulatedVehicleProvider implements VehicleProvider {
  readonly name = "simulator";
  private readonly vehicles = new Map<string, TwinState>();
  private readonly latencyMs: number;
  private readonly failureRate: number;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(opts: SimulatorOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 1500;
    this.failureRate = opts.failureRate ?? 0;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;

    const vin = "4T1DEMXCAMRYHYB01";
    this.vehicles.set(vin, {
      summary: { vin, nickname: "Camry Hybrid", model: "Camry Hybrid (simulated)", year: 2025 },
      locked: true,
      engineStartedAtMs: null,
      cabinTempF: 34,
      outsideTempF: 34,
      fuelPercent: 72,
      odometerMiles: 18_342,
      updatedAtMs: this.now(),
    });
  }

  async listVehicles(): Promise<VehicleSummary[]> {
    return [...this.vehicles.values()].map((v) => v.summary);
  }

  async getStatus(vin: string): Promise<VehicleStatus> {
    const v = this.advance(this.twin(vin));
    return {
      vin,
      locked: v.locked,
      engineRunning: v.engineStartedAtMs !== null,
      engineStartedAt: v.engineStartedAtMs ? new Date(v.engineStartedAtMs).toISOString() : null,
      remoteStartMaxMinutes: REMOTE_START_MAX_MINUTES,
      cabinTempF: Math.round(v.cabinTempF),
      outsideTempF: v.outsideTempF,
      fuelPercent: v.fuelPercent,
      odometerMiles: v.odometerMiles,
      updatedAt: new Date(v.updatedAtMs).toISOString(),
    };
  }

  async sendCommand(vin: string, command: CommandType): Promise<void> {
    const v = this.twin(vin);
    if (this.latencyMs > 0) await sleep(this.latencyMs);
    if (this.random() < this.failureRate) {
      throw new AppError(504, "vehicle_unreachable", "Vehicle did not acknowledge the command (no cellular signal?)");
    }
    this.advance(v);
    switch (command) {
      case "lock":
        v.locked = true;
        break;
      case "unlock":
        v.locked = false;
        break;
      case "start":
        // Real cars refuse remote start when unlocked; mirror that so the UX handles it.
        if (!v.locked) throw new AppError(409, "doors_unlocked", "Lock the doors before remote start");
        v.engineStartedAtMs ??= this.now();
        break;
      case "stop":
        v.engineStartedAtMs = null;
        break;
    }
    v.updatedAtMs = this.now();
  }

  private twin(vin: string): TwinState {
    const v = this.vehicles.get(vin);
    if (!v) throw new AppError(404, "vehicle_not_found", "Unknown vehicle");
    return v;
  }

  /** Move the simulation forward to "now": auto-shutoff and cabin temperature. */
  private advance(v: TwinState): TwinState {
    const now = this.now();
    if (v.engineStartedAtMs !== null) {
      const stopAt = v.engineStartedAtMs + REMOTE_START_MAX_MINUTES * 60_000;
      const runUntil = Math.min(now, stopAt);
      const minutes = Math.max(0, (runUntil - Math.max(v.updatedAtMs, v.engineStartedAtMs)) / 60_000);
      // Close ~35% of the gap to target per minute.
      v.cabinTempF = CLIMATE_TARGET_F - (CLIMATE_TARGET_F - v.cabinTempF) * Math.pow(0.65, minutes);
      if (now >= stopAt) v.engineStartedAtMs = null;
    } else {
      const minutes = Math.max(0, (now - v.updatedAtMs) / 60_000);
      v.cabinTempF = v.outsideTempF - (v.outsideTempF - v.cabinTempF) * Math.pow(0.9, minutes);
    }
    v.updatedAtMs = now;
    return v;
  }
}

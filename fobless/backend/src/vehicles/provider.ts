import type { CommandType, VehicleStatus, VehicleSummary } from "../domain.js";

/**
 * The seam between this app and whatever actually talks to the car.
 *
 * Implementations:
 *  - SimulatedVehicleProvider: an in-process digital twin (default, safe for demos).
 *  - ToyotaConnectedProvider: adapter slot for Toyota's connected-services cloud.
 *
 * `sendCommand` resolves once the vehicle has confirmed the command, and rejects if
 * the vehicle (or the vendor cloud) reports failure or times out.
 */
export interface VehicleProvider {
  readonly name: string;
  listVehicles(): Promise<VehicleSummary[]>;
  getStatus(vin: string): Promise<VehicleStatus>;
  sendCommand(vin: string, command: CommandType): Promise<void>;
}

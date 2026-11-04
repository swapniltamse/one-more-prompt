import { AppError, type CommandType, type VehicleStatus, type VehicleSummary } from "../domain.js";
import type { VehicleProvider } from "./provider.js";

/**
 * Adapter slot for Toyota's connected-services cloud (the backend the official Toyota app uses).
 *
 * Toyota publishes no public API for this. Community projects have reverse-engineered the
 * protocol, but it is undocumented, changes without notice, and using it is likely outside
 * Toyota's terms of service. For those reasons this repo does NOT ship endpoint URLs, API keys
 * or command strings. Implement the three methods below against an integration you are
 * entitled to use, and keep everything else in the app unchanged.
 *
 * Contract expectations (the rest of the app relies on these):
 *  - Credentials come from the injected `credentials` loader (Secrets Manager in AWS), never env vars.
 *  - Cache the vendor access token in memory and refresh it on 401.
 *  - `sendCommand` must not resolve until the vendor confirms the command reached the car
 *    (poll the vendor's command-status endpoint with a bounded timeout, ~60s).
 *  - Map vendor failures to AppError(502/504, ...) so the UI can show a useful message.
 */
export interface ToyotaCredentials {
  username: string;
  password: string;
}

export class ToyotaConnectedProvider implements VehicleProvider {
  readonly name = "toyota";

  constructor(private readonly credentials: () => Promise<ToyotaCredentials>) {}

  async listVehicles(): Promise<VehicleSummary[]> {
    return this.notImplemented();
  }

  async getStatus(_vin: string): Promise<VehicleStatus> {
    return this.notImplemented();
  }

  async sendCommand(_vin: string, _command: CommandType): Promise<void> {
    return this.notImplemented();
  }

  private notImplemented(): never {
    throw new AppError(
      501,
      "provider_not_implemented",
      "The Toyota adapter is a stub. See backend/src/vehicles/toyotaProvider.ts, or set VEHICLE_PROVIDER=simulator.",
    );
  }
}

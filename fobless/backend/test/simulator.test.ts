import { describe, expect, it } from "vitest";
import { SimulatedVehicleProvider } from "../src/vehicles/simulatedProvider.js";

const VIN = "4T1DEMXCAMRYHYB01";

describe("SimulatedVehicleProvider", () => {
  it("warms the cabin while running and auto-stops after 10 minutes", async () => {
    let t = Date.parse("2026-01-15T07:00:00Z");
    const sim = new SimulatedVehicleProvider({ latencyMs: 0, now: () => t });
    const cold = await sim.getStatus(VIN);
    await sim.sendCommand(VIN, "start");

    t += 5 * 60_000;
    const warming = await sim.getStatus(VIN);
    expect(warming.engineRunning).toBe(true);
    expect(warming.cabinTempF).toBeGreaterThan(cold.cabinTempF + 20);

    t += 6 * 60_000;
    expect((await sim.getStatus(VIN)).engineRunning).toBe(false);
  });
});

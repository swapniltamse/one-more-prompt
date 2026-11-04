import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DevTokenAuthority } from "../src/auth/auth.js";
import { DEFAULT_POLICY } from "../src/commands/commandService.js";
import { InMemoryCommandStore } from "../src/store/commandStore.js";
import { SimulatedVehicleProvider } from "../src/vehicles/simulatedProvider.js";

const VIN = "4T1DEMXCAMRYHYB01";
const SECRET = "x".repeat(40);
let key = 0;
const idem = () => `test-key-${++key}-${Date.now()}`;

function setup(opts: { failureRate?: number; allowed?: string; maxPerMinute?: number } = {}) {
  const authority = new DevTokenAuthority(SECRET, "4242");
  const store = new InMemoryCommandStore();
  const app = createApp(
    { ALLOWED_USER_IDS: opts.allowed ?? "dev-owner", CORS_ORIGIN: "http://localhost:5173" },
    {
      provider: new SimulatedVehicleProvider({ latencyMs: 0, failureRate: opts.failureRate ?? 0 }),
      store,
      verifier: authority,
      devAuthority: authority,
      policy: { ...DEFAULT_POLICY, maxCommandsPerMinute: opts.maxPerMinute ?? DEFAULT_POLICY.maxCommandsPerMinute },
    },
  );
  return { app, authority, store };
}

async function login(app: ReturnType<typeof setup>["app"]) {
  const res = await request(app).post("/api/auth/dev-login").send({ pin: "4242" }).expect(200);
  return `Bearer ${res.body.accessToken}`;
}

describe("auth", () => {
  it("rejects requests without a token", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/vehicles").expect(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("rejects a wrong PIN", async () => {
    const { app } = setup();
    await request(app).post("/api/auth/dev-login").send({ pin: "0000" }).expect(401);
  });

  it("rejects a tampered token", async () => {
    const { app } = setup();
    const token = await login(app);
    await request(app).get("/api/vehicles").set("authorization", token.slice(0, -2) + "xx").expect(401);
  });

  it("rejects valid users who are not on the owner allowlist", async () => {
    const { app } = setup({ allowed: "someone-else" });
    const token = await login(app);
    await request(app).get("/api/vehicles").set("authorization", token).expect(403);
  });
});

describe("vehicle commands", () => {
  let ctx: ReturnType<typeof setup>;
  let token: string;
  beforeEach(async () => {
    ctx = setup();
    token = await login(ctx.app);
  });

  const send = (type: string, key = idem()) =>
    request(ctx.app).post(`/api/vehicles/${VIN}/commands`).set("authorization", token).set("idempotency-key", key).send({ type });

  it("unlocks and locks the car, reflected in status", async () => {
    const res = await send("unlock").expect(201);
    expect(res.body).toMatchObject({ type: "unlock", status: "succeeded", userId: "dev-owner" });
    let status = await request(ctx.app).get(`/api/vehicles/${VIN}/status`).set("authorization", token).expect(200);
    expect(status.body.locked).toBe(false);

    await send("lock").expect(201);
    status = await request(ctx.app).get(`/api/vehicles/${VIN}/status`).set("authorization", token).expect(200);
    expect(status.body.locked).toBe(true);
  });

  it("remote-starts and stops the engine", async () => {
    await send("start").expect(201);
    const status = await request(ctx.app).get(`/api/vehicles/${VIN}/status`).set("authorization", token);
    expect(status.body.engineRunning).toBe(true);
    await send("stop").expect(201);
  });

  it("refuses remote start while unlocked, like the real car", async () => {
    await send("unlock").expect(201);
    const res = await send("start").expect(409);
    expect(res.body.error.code).toBe("doors_unlocked");
  });

  it("replays the original result for a repeated Idempotency-Key instead of sending twice", async () => {
    const k = idem();
    const first = await send("unlock", k).expect(201);
    const second = await send("unlock", k).expect(200);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.id).toBe(first.body.id);
    const history = await request(ctx.app).get(`/api/vehicles/${VIN}/commands`).set("authorization", token);
    expect(history.body.commands).toHaveLength(1);
  });

  it("rejects reuse of an Idempotency-Key for a different command", async () => {
    const k = idem();
    await send("lock", k).expect(201);
    const res = await send("unlock", k).expect(409);
    expect(res.body.error.code).toBe("idempotency_conflict");
  });

  it("requires an Idempotency-Key", async () => {
    const res = await request(ctx.app).post(`/api/vehicles/${VIN}/commands`).set("authorization", token).send({ type: "lock" }).expect(400);
    expect(res.body.error.code).toBe("invalid_idempotency_key");
  });

  it("rejects unknown commands and VINs", async () => {
    await send("honk").expect(400);
    await request(ctx.app)
      .post(`/api/vehicles/1HGCM82633A004352/commands`)
      .set("authorization", token)
      .set("idempotency-key", idem())
      .send({ type: "lock" })
      .expect(404);
  });

  it("requires a recent sign-in (step-up) to unlock, but not to lock", async () => {
    const stale = await ctx.authority.issue("dev-owner", Math.floor(Date.now() / 1000) - 10 * 60);
    const unlock = await request(ctx.app)
      .post(`/api/vehicles/${VIN}/commands`)
      .set("authorization", `Bearer ${stale}`)
      .set("idempotency-key", idem())
      .send({ type: "unlock" })
      .expect(401);
    expect(unlock.body.error.code).toBe("step_up_required");
    await request(ctx.app)
      .post(`/api/vehicles/${VIN}/commands`)
      .set("authorization", `Bearer ${stale}`)
      .set("idempotency-key", idem())
      .send({ type: "lock" })
      .expect(201);
  });

  it("records an audit trail, newest first", async () => {
    await send("unlock");
    await new Promise((r) => setTimeout(r, 5));
    await send("lock");
    const res = await request(ctx.app).get(`/api/vehicles/${VIN}/commands`).set("authorization", token).expect(200);
    expect(res.body.commands.map((c: { type: string }) => c.type)).toEqual(["lock", "unlock"]);
    expect(res.body.commands[0].sourceIp).toBeTruthy();
  });
});

describe("resilience", () => {
  it("rate-limits command floods", async () => {
    const ctx = setup({ maxPerMinute: 2 });
    const token = await login(ctx.app);
    const send = () =>
      request(ctx.app).post(`/api/vehicles/${VIN}/commands`).set("authorization", token).set("idempotency-key", idem()).send({ type: "lock" });
    await send().expect(201);
    await send().expect(201);
    const res = await send().expect(429);
    expect(res.body.error.code).toBe("rate_limited");
  });

  it("marks the command failed when the vehicle is unreachable", async () => {
    const ctx = setup({ failureRate: 1 });
    const token = await login(ctx.app);
    const res = await request(ctx.app)
      .post(`/api/vehicles/${VIN}/commands`)
      .set("authorization", token)
      .set("idempotency-key", idem())
      .send({ type: "lock" })
      .expect(504);
    expect(res.body.error.code).toBe("vehicle_unreachable");
    const history = await request(ctx.app).get(`/api/vehicles/${VIN}/commands`).set("authorization", token);
    expect(history.body.commands[0]).toMatchObject({ status: "failed" });
  });
});

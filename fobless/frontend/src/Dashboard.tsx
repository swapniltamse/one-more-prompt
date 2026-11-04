import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type Api, type CommandRecord, type CommandType, type Vehicle, type VehicleStatus } from "./api";
import { CommandButton } from "./CommandButton";

const POLL_MS = 15_000;

interface Props {
  api: Api;
  onSignOut: () => void;
  onStepUp: () => void;
}

const LABELS: Record<CommandType, { verb: string; done: string }> = {
  lock: { verb: "Locking", done: "Locked" },
  unlock: { verb: "Unlocking", done: "Unlocked" },
  start: { verb: "Starting", done: "Engine running" },
  stop: { verb: "Stopping", done: "Engine off" },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Dashboard({ api, onSignOut, onStepUp }: Props) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [status, setStatus] = useState<VehicleStatus | null>(null);
  const [history, setHistory] = useState<CommandRecord[]>([]);
  const [pending, setPending] = useState<CommandType | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string; action?: () => void } | null>(null);
  const toastTimer = useRef<number>(undefined);

  const notify = useCallback((t: typeof toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    if (t && !t.action) toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.code === "invalid_token" || err.code === "unauthenticated")) onStepUp();
    },
    [onStepUp],
  );

  const refresh = useCallback(
    async (vin: string) => {
      try {
        const [s, h] = await Promise.all([api.status(vin), api.history(vin)]);
        setStatus(s);
        setHistory(h);
      } catch (err) {
        handleAuthError(err);
      }
    },
    [api, handleAuthError],
  );

  useEffect(() => {
    api
      .vehicles()
      .then(([v]) => {
        setVehicle(v ?? null);
        if (v) refresh(v.vin);
      })
      .catch((err) => {
        handleAuthError(err);
        notify({ kind: "error", text: (err as Error).message });
      });
  }, [api, refresh, handleAuthError, notify]);

  useEffect(() => {
    if (!vehicle) return;
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(vehicle.vin), POLL_MS);
    return () => window.clearInterval(id);
  }, [vehicle, refresh]);

  async function send(type: CommandType) {
    if (!vehicle || pending) return;
    setPending(type);
    // One key per tap. Network retries reuse it, so the backend executes the command at most once.
    const key = crypto.randomUUID();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const rec = await api.send(vehicle.vin, type, key);
          if (rec.status === "failed") throw new ApiError(502, "failed", rec.error ?? "Command failed");
          notify({ kind: "ok", text: LABELS[type].done });
          break;
        } catch (err) {
          const transient = err instanceof TypeError; // fetch network failure
          if (!transient || attempt >= 2) throw err;
          await sleep(1000 * 2 ** attempt);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "step_up_required") {
        notify({ kind: "error", text: err.message, action: onStepUp });
      } else {
        handleAuthError(err);
        notify({ kind: "error", text: (err as Error).message });
      }
    } finally {
      setPending(null);
      refresh(vehicle.vin);
    }
  }

  return (
    <main className="dashboard">
      <header>
        <div>
          <h1>{vehicle?.nickname ?? "…"}</h1>
          <p className="muted small">{vehicle ? `${vehicle.year} ${vehicle.model}` : "Loading vehicle"}</p>
        </div>
        <button className="ghost" onClick={onSignOut}>Sign out</button>
      </header>

      <StatusPanel status={status} pending={pending} />

      <section className="controls" aria-label="Vehicle controls">
        <CommandButton icon="🔒" label="Lock" disabled={!!pending} busy={pending === "lock"} onFire={() => send("lock")} />
        <CommandButton icon="🔓" label="Unlock" hold disabled={!!pending} busy={pending === "unlock"} onFire={() => send("unlock")} />
        {status?.engineRunning ? (
          <CommandButton icon="⏹" label="Stop engine" wide disabled={!!pending} busy={pending === "stop"} onFire={() => send("stop")} />
        ) : (
          <CommandButton icon="⚡" label="Remote start" wide disabled={!!pending} busy={pending === "start"} onFire={() => send("start")} />
        )}
      </section>

      <section className="history" aria-label="Recent activity">
        <h2>Activity</h2>
        {history.length === 0 && <p className="muted small">No commands yet.</p>}
        <ul>
          {history.map((c) => (
            <li key={c.id}>
              <span className={`dot ${c.status}`} aria-label={c.status} />
              <span className="cap">{c.type}</span>
              <span className="muted small">{c.error ?? c.status}</span>
              <time className="muted small">{new Date(c.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
            </li>
          ))}
        </ul>
      </section>

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <span>{toast.text}</span>
          {toast.action && <button onClick={toast.action}>Sign in</button>}
        </div>
      )}
      {pending && <div className="sr-only" role="status">{LABELS[pending].verb}…</div>}
    </main>
  );
}

function StatusPanel({ status, pending }: { status: VehicleStatus | null; pending: CommandType | null }) {
  // Re-render every second while the engine runs; the countdown itself always reads the live clock.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!status?.engineRunning) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [status?.engineRunning]);

  if (!status) return <section className="status skeleton" />;

  let remaining = "";
  if (status.engineRunning && status.engineStartedAt) {
    const max = status.remoteStartMaxMinutes * 60_000;
    const ms = Math.min(max, Math.max(0, Date.parse(status.engineStartedAt) + max - Date.now()));
    remaining = `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;
  }

  return (
    <section className={`status ${status.engineRunning ? "running" : ""}`}>
      <div className="hero">
        <div className={`lock-ring ${status.locked ? "locked" : "unlocked"} ${pending ? "pulsing" : ""}`}>
          <span>{status.locked ? "🔒" : "🔓"}</span>
        </div>
        <div>
          <p className="big">{status.locked ? "Locked" : "Unlocked"}</p>
          <p className="muted">{status.engineRunning ? `Engine running · auto-off in ${remaining}` : "Engine off"}</p>
        </div>
      </div>
      <dl className="stats">
        <div><dt>Cabin</dt><dd>{status.cabinTempF}°F</dd></div>
        <div><dt>Outside</dt><dd>{status.outsideTempF}°F</dd></div>
        <div><dt>Fuel</dt><dd>{status.fuelPercent}%</dd></div>
        <div><dt>Odometer</dt><dd>{status.odometerMiles.toLocaleString()} mi</dd></div>
      </dl>
      <p className="muted small updated">Updated {new Date(status.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
    </section>
  );
}

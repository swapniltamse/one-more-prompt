import { useState, type FormEvent } from "react";
import { cognitoLogin, devLogin } from "./auth";
import type { AppConfig } from "./config";

export function Login({ config, onSignedIn }: { config: AppConfig; onSignedIn: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await devLogin(config, pin);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center login">
      <img src="/icon.svg" alt="" width={72} height={72} />
      <h1>Fobless</h1>
      <p className="muted">Your car, from your phone.</p>
      {config.authMode === "cognito" ? (
        <button className="primary" onClick={() => cognitoLogin(config)}>Sign in</button>
      ) : (
        <form onSubmit={submit}>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="PIN"
            aria-label="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <button className="primary" disabled={busy || !pin}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="muted small">Local dev mode. In AWS this is Cognito with MFA.</p>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

import type { AppConfig } from "./config";

const TOKEN = "fobless.token";
const VERIFIER = "fobless.pkce";
const STATE = "fobless.state";

/**
 * Tokens live in sessionStorage: they die with the tab and are never written to disk long-term.
 * No refresh tokens are kept on the device; after an hour you sign in again. For an app that
 * unlocks a car, that's the right trade.
 */
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN),
  set: (t: string) => sessionStorage.setItem(TOKEN, t),
  clear: () => sessionStorage.removeItem(TOKEN),
};

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function randomString(len = 48) {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

export async function devLogin(config: AppConfig, pin: string) {
  const res = await fetch(`${config.apiBaseUrl}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error((await res.json()).error?.message ?? "Login failed");
  tokenStore.set((await res.json()).accessToken);
}

/** Cognito Hosted UI, Authorization Code + PKCE. `forceReauth` is used for step-up before unlock. */
export async function cognitoLogin(config: AppConfig, forceReauth = false) {
  const c = config.cognito!;
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(STATE, state);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    scope: "openid email",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  if (forceReauth) params.set("prompt", "login");
  location.assign(`https://${c.domain}/oauth2/authorize?${params}`);
}

/** Completes the PKCE flow if we've just been redirected back from Cognito. */
export async function handleCognitoRedirect(config: AppConfig): Promise<boolean> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  if (!code || config.authMode !== "cognito") return false;
  const expectedState = sessionStorage.getItem(STATE);
  const verifier = sessionStorage.getItem(VERIFIER);
  sessionStorage.removeItem(STATE);
  sessionStorage.removeItem(VERIFIER);
  history.replaceState(null, "", url.pathname);
  if (!verifier || url.searchParams.get("state") !== expectedState) throw new Error("Sign-in state mismatch, please try again");

  const c = config.cognito!;
  const res = await fetch(`https://${c.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("Could not complete sign-in");
  tokenStore.set((await res.json()).access_token);
  return true;
}

export function logout(config: AppConfig) {
  tokenStore.clear();
  if (config.authMode === "cognito" && config.cognito) {
    const c = config.cognito;
    location.assign(`https://${c.domain}/logout?${new URLSearchParams({ client_id: c.clientId, logout_uri: c.redirectUri })}`);
  } else {
    location.reload();
  }
}

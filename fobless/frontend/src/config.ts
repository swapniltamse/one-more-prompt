export interface AppConfig {
  apiBaseUrl: string;
  authMode: "dev" | "cognito";
  cognito?: { domain: string; clientId: string; redirectUri: string };
}

/** Runtime config (written by CDK at deploy time) so one build works in every environment. */
export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load /config.json");
  return res.json();
}

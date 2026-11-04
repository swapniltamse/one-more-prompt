import { useEffect, useState } from "react";
import { cognitoLogin, handleCognitoRedirect, logout, tokenStore } from "./auth";
import { createApi } from "./api";
import { loadConfig, type AppConfig } from "./config";
import { Dashboard } from "./Dashboard";
import { Login } from "./Login";

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      await handleCognitoRedirect(cfg);
      setConfig(cfg);
      setSignedIn(!!tokenStore.get());
    })().catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <main className="center"><p className="error">{error}</p></main>;
  if (!config) return <main className="center"><div className="spinner" /></main>;

  if (!signedIn) {
    return <Login config={config} onSignedIn={() => setSignedIn(true)} />;
  }

  return (
    <Dashboard
      api={createApi(config)}
      onSignOut={() => logout(config)}
      onStepUp={async () => {
        tokenStore.clear();
        if (config.authMode === "cognito") await cognitoLogin(config, true);
        else setSignedIn(false);
      }}
    />
  );
}

import { createApp, depsFromConfig } from "./app.js";
import { loadConfig } from "./config.js";
import { log } from "./log.js";

const config = loadConfig();
const deps = depsFromConfig(config);
createApp(config, deps).listen(config.PORT, () => {
  log("info", "server.started", { port: config.PORT, provider: deps.provider.name, auth: config.AUTH_MODE });
});

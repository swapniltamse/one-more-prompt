import serverless from "serverless-http";
import { createApp, depsFromConfig } from "./app.js";
import { loadConfig } from "./config.js";

// Built once per Lambda container (outside the handler) so warm invocations reuse the JWKS cache.
const config = loadConfig();
export const handler = serverless(createApp(config, depsFromConfig(config)));

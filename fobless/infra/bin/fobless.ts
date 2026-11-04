#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { FoblessStack } from "../lib/fobless-stack.js";

const app = new App();
new FoblessStack(app, "Fobless", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
  ownerUserId: app.node.tryGetContext("ownerUserId") ?? "",
  cognitoDomainPrefix: app.node.tryGetContext("cognitoDomainPrefix") || undefined,
  vehicleProvider: app.node.tryGetContext("vehicleProvider") ?? "simulator",
  alertEmail: app.node.tryGetContext("alertEmail") || undefined,
});

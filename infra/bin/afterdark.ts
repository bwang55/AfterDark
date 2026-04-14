#!/usr/bin/env node
import path from "node:path";
import { config as loadEnv } from "dotenv";
import "source-map-support/register";
import { App } from "aws-cdk-lib";

import { AfterDarkStack } from "../lib/afterdark-stack";

// Load secrets from project root .env.local so we don't have to export them manually.
loadEnv({ path: path.join(__dirname, "../../.env.local") });

// Backend uses non-prefixed names; fall back to the NEXT_PUBLIC_* versions from the frontend env.
if (!process.env.MAPBOX_ACCESS_TOKEN && process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
  process.env.MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
}

const app = new App();

new AfterDarkStack(app, "AfterDarkStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});

#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import waitOn from "wait-on";
import { bootstrapEnv } from "../build/bootstrap-env.mjs";
import { resolveRuntimePorts } from "../build/runtime-env.mjs";

export function resolveElectronDashboardUrl(env = process.env) {
  const { dashboardPort } = resolveRuntimePorts(env);
  return `http://127.0.0.1:${dashboardPort}`;
}

async function main() {
  const bootstrapped = bootstrapEnv({ quiet: true });
  const dashboardUrl = resolveElectronDashboardUrl(bootstrapped);
  await waitOn({ resources: [dashboardUrl], timeout: 120_000 });

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "dev"], {
    cwd: new URL("../../electron/", import.meta.url),
    stdio: "inherit",
    env: process.env,
  });

  child.once("error", (error) => {
    console.error("[Electron dev]", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  await main();
}

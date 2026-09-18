#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  resolveRuntimePorts,
  withRuntimePortEnv,
  resolveMaxOldSpaceMb,
  warnConflictingHeapLimits,
  buildStandaloneNodeOptions,
} from "../build/runtime-env.mjs";
import { bootstrapEnv } from "../build/bootstrap-env.mjs";
import {
  ensureRustCoreInternalToken,
  isRustCoreEnabled,
  startRustCore,
  stopRustCore,
} from "./rust-core-supervisor.mjs";

const env = bootstrapEnv();
const runtimePorts = resolveRuntimePorts(env);
const childEnv = withRuntimePortEnv(env, runtimePorts);
const rustCoreEnabled = isRustCoreEnabled(childEnv);
if (rustCoreEnabled) ensureRustCoreInternalToken(childEnv);

// #2939 / #10353: AGENTPROXY_MEMORY_MB is the Docker/standalone heap knob.
const maxOldSpaceMb = resolveMaxOldSpaceMb(childEnv.AGENTPROXY_MEMORY_MB);
warnConflictingHeapLimits(childEnv, maxOldSpaceMb);
childEnv.NODE_OPTIONS = buildStandaloneNodeOptions(childEnv, maxOldSpaceMb);

const entry = existsSync("server-ws.mjs") ? "server-ws.mjs" : "server.js";
const nextChild = spawn("node", [entry], { stdio: "inherit", env: childEnv });
let rustCoreHandle = null;
let shuttingDown = false;

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function stopNext(signal = "SIGTERM", graceMs = 5_000) {
  if (childExited(nextChild)) return;
  nextChild.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => nextChild.once("exit", () => resolve(true))),
    delay(graceMs).then(() => false),
  ]);
  if (!exited && !childExited(nextChild)) {
    nextChild.kill("SIGKILL");
    await new Promise((resolve) => nextChild.once("exit", resolve));
  }
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (rustCoreHandle?.child) await stopRustCore(rustCoreHandle.child);
    await stopNext(signal);
  } catch (error) {
    console.error(`[AgentProxy] shutdown failed (${signal}):`, error);
    exitCode = exitCode || 1;
  } finally {
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

nextChild.on("error", (error) => {
  console.error("[AgentProxy] standalone Next process failed to spawn:", error);
  void shutdown("NEXT_SPAWN_ERROR", 1);
});
nextChild.on("exit", (code, signal) => {
  if (shuttingDown) return;
  const exitCode = code ?? (signal ? 1 : 0);
  void shutdown("NEXT_EXIT", exitCode);
});

if (rustCoreEnabled) {
  try {
    rustCoreHandle = await startRustCore({
      cwd: process.cwd(),
      env: childEnv,
      apiPort: runtimePorts.apiPort,
      dashboardPort: runtimePorts.dashboardPort,
      dashboardHost: childEnv.HOSTNAME,
      dev: false,
    });
    console.log(
      `[Rust Core] ready on API port ${runtimePorts.apiPort}; dashboard=${runtimePorts.dashboardPort}`
    );
    rustCoreHandle?.child?.once("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(
        `[FATAL] Rust core exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "none"})`
      );
      void shutdown("RUST_CORE_EXIT", 1);
    });
  } catch (error) {
    console.error("[FATAL] Rust core failed to become ready:", error);
    await shutdown("RUST_CORE_BOOT_FAILED", 1);
  }
}

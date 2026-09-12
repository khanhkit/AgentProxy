import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export function isRustCoreEnabled(env = process.env) {
  return String(env.AGENTPROXY_RUST_CORE || env.OMNIROUTE_RUST_CORE || "") === "1";
}

export function ensureRustCoreInternalToken(env = process.env) {
  const existing = String(env.AGENTPROXY_INTERNAL_SERVICE_TOKEN || env.OMNIROUTE_INTERNAL_SERVICE_TOKEN || "").trim();
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  env.AGENTPROXY_INTERNAL_SERVICE_TOKEN = token;
  env.OMNIROUTE_INTERNAL_SERVICE_TOKEN = token;
  return token;
}

export function supportsLoopbackControl(host) {
  const normalized = String(host || "").trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return ["0.0.0.0", "::", "127.0.0.1", "::1", "localhost"].includes(normalized);
}

export function resolveRustCoreBinary({ cwd = process.cwd(), env = process.env, dev = false }) {
  const override = String(env.AGENTPROXY_RUST_CORE_BINARY || env.OMNIROUTE_RUST_CORE_BINARY || "").trim();
  const candidates = override
    ? [path.resolve(cwd, override)]
    : dev
      ? [
          path.join(cwd, "rust", "target", "debug", "agentproxy-gateway"),
          path.join(cwd, "rust", "target", "release", "agentproxy-gateway"),
        ]
      : [path.join(cwd, "rust", "target", "release", "agentproxy-gateway")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Rust core binary not found. Build it first with: npm run rust-core:build (checked: ${candidates.join(", ")})`
  );
}

function readinessHost(bindHost) {
  const normalized = String(bindHost || "").trim().toLowerCase();
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]") return "127.0.0.1";
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") return "127.0.0.1";
  return normalized || "127.0.0.1";
}

async function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => child.once("exit", resolve));
}

export async function stopRustCore(child, graceMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    waitForChildExit(child).then(() => true),
    delay(graceMs).then(() => false),
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child);
  }
}

export async function waitForRustCoreReady({ child, apiPort, bindHost, timeoutMs = 30_000 }) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://${readinessHost(bindHost)}:${apiPort}/readyz`;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Rust core exited before readiness (code=${child.exitCode ?? "null"}, signal=${child.signalCode ?? "none"})`
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.status === 200) return;
    } catch {
      // Expected while the child binds or the first control snapshot is pending.
    }
    await delay(200);
  }

  throw new Error(`Rust core readiness timed out after ${timeoutMs}ms (${url})`);
}

export async function startRustCore({
  cwd = process.cwd(),
  env = process.env,
  apiPort,
  dashboardPort,
  dashboardHost,
  dev = false,
  readinessTimeoutMs = 30_000,
}) {
  if (!isRustCoreEnabled(env)) return null;
  if (!supportsLoopbackControl(dashboardHost)) {
    throw new Error(
      `Rust core requires the Next dashboard bind to accept loopback control traffic; HOST=${dashboardHost}`
    );
  }

  const token = ensureRustCoreInternalToken(env);
  const binary = resolveRustCoreBinary({ cwd, env, dev });
  const rustHost = String(env.AGENTPROXY_RUST_CORE_HOST || env.OMNIROUTE_RUST_CORE_HOST || env.API_HOST || "127.0.0.1").trim();
  const childEnv = {
    ...env,
    AGENTPROXY_INTERNAL_SERVICE_TOKEN: token,
    OMNIROUTE_INTERNAL_SERVICE_TOKEN: token,
    API_PORT: String(apiPort),
    DASHBOARD_PORT: String(dashboardPort),
    AGENTPROXY_RUST_CORE_HOST: rustHost,
    OMNIROUTE_RUST_CORE_HOST: rustHost,
    AGENTPROXY_RUST_CORE_SNAPSHOT_URL:
      env.AGENTPROXY_RUST_CORE_SNAPSHOT_URL ||
      env.OMNIROUTE_RUST_CORE_SNAPSHOT_URL ||
      `http://127.0.0.1:${dashboardPort}/api/internal/rust-core/snapshot`,
    OMNIROUTE_RUST_CORE_SNAPSHOT_URL:
      env.AGENTPROXY_RUST_CORE_SNAPSHOT_URL ||
      env.OMNIROUTE_RUST_CORE_SNAPSHOT_URL ||
      `http://127.0.0.1:${dashboardPort}/api/internal/rust-core/snapshot`,
  };

  const child = spawn(binary, [], {
    cwd,
    env: childEnv,
    stdio: "inherit",
  });

  try {
    await waitForRustCoreReady({
      child,
      apiPort,
      bindHost: rustHost,
      timeoutMs: readinessTimeoutMs,
    });
  } catch (error) {
    await stopRustCore(child);
    throw error;
  }

  return { child, binary };
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";

import { generateMitmCa } from "../../src/mitm/tproxy/dynamicCert.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverPath = path.join(repoRoot, "src", "mitm", "server.cjs");

async function getFreeLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

function findNonLoopbackIpv4(): string | null {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

async function canConnect(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function startMitmFixture(): Promise<{
  child: ChildProcessWithoutNullStreams;
  port: number;
  dataDir: string;
  output: () => string;
}> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-mitm-bind-"));
  const certDir = path.join(dataDir, "mitm");
  fs.mkdirSync(certDir, { recursive: true });
  const ca = await generateMitmCa("AgentProxy MITM confinement test");
  fs.writeFileSync(path.join(certDir, "server.key"), ca.key);
  fs.writeFileSync(path.join(certDir, "server.crt"), ca.cert);
  const port = await getFreeLoopbackPort();

  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      ROUTER_API_KEY: "test-router-key",
      MITM_LOCAL_PORT: String(port),
      MITM_CERT_MODE: "legacy",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));

  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`MITM readiness timeout: ${logs}`)), 5000);
    const inspect = () => {
      if (logs.includes("MITM ready on")) {
        clearTimeout(deadline);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code, signal) => {
      clearTimeout(deadline);
      reject(new Error(`MITM exited before ready (code=${code}, signal=${signal}): ${logs}`));
    });
  });

  return { child, port, dataDir, output: () => logs };
}

async function stopMitmFixture(fixture: { child: ChildProcessWithoutNullStreams; dataDir: string }) {
  if (fixture.child.exitCode === null && fixture.child.signalCode === null) {
    fixture.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        fixture.child.kill("SIGKILL");
        resolve();
      }, 1500);
      fixture.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  fs.rmSync(fixture.dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

test("TC-MITM-SEC-001 default MITM listener accepts loopback connection", async () => {
  const fixture = await startMitmFixture();
  try {
    assert.equal(
      await canConnect("127.0.0.1", fixture.port),
      true,
      `expected loopback listener connectivity; child output: ${fixture.output()}`
    );
  } finally {
    await stopMitmFixture(fixture);
  }
});

test("TC-MITM-SEC-002 default MITM listener rejects non-loopback local-interface connection", async (t) => {
  const nonLoopbackIp = findNonLoopbackIpv4();
  if (!nonLoopbackIp) {
    t.skip("test host has no non-loopback IPv4 interface");
    return;
  }

  const fixture = await startMitmFixture();
  try {
    assert.equal(
      await canConnect(nonLoopbackIp, fixture.port),
      false,
      `default MITM listener unexpectedly accepted a connection on non-loopback ${nonLoopbackIp}:${fixture.port}`
    );
  } finally {
    await stopMitmFixture(fixture);
  }
});

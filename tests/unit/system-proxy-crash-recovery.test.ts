import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function makeDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-system-proxy-recovery-"));
}

function runChild(dataDir: string, script: string) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx/esm", "--input-type=module", "--eval", script],
    {
      cwd: repoRoot,
      env: { ...process.env, DATA_DIR: dataDir },
      encoding: "utf8",
    }
  );
}

const linuxPreviousState = {
  platform: "linux" as const,
  gnomeMode: "'auto'",
  httpHost: "'old-http.local'",
  httpPort: "3128",
  httpsHost: "'old-https.local'",
  httpsPort: "4443",
};

function persistScript(previousState = linuxPreviousState): string {
  return `
    const capture = await import("./src/lib/inspector/captureState.ts");
    capture.setSystemProxyApplied(18080, ${JSON.stringify(previousState)}, 30);
    console.log(JSON.stringify(capture.getSystemProxyState()));
    process.exit(0);
  `;
}

const readScript = `
  const capture = await import("./src/lib/inspector/captureState.ts");
  console.log(JSON.stringify(capture.getSystemProxyState()));
  process.exit(0);
`;

test("system proxy apply exposes a recovery hook before the first OS mutation", async (t) => {
  const systemProxy = await import("../../src/mitm/inspector/systemProxyConfig.ts");
  const originalPlatform = os.platform;
  (os as { platform: () => NodeJS.Platform }).platform = () => "linux" as NodeJS.Platform;
  t.after(() => {
    (os as { platform: () => NodeJS.Platform }).platform = originalPlatform;
  });

  const order: string[] = [];
  const restoreExec = systemProxy.__setExec(async (_file, args) => {
    if (args[0] === "get") {
      if (args[2] === "mode") return { stdout: "'auto'\n", stderr: "" };
      if (args[2] === "host") return { stdout: "'old.local'\n", stderr: "" };
      if (args[2] === "port") return { stdout: "3128\n", stderr: "" };
    }
    if (args[0] === "set") order.push(`set:${args.slice(1).join(":")}`);
    return { stdout: "", stderr: "" };
  });
  t.after(restoreExec);

  const beforeMutate = async (result: unknown) => {
    order.push("recovery-persisted");
    assert.equal(
      (result as { previousState?: { platform?: string } }).previousState?.platform,
      "linux"
    );
  };

  await (
    systemProxy.apply as unknown as (port: number, hook: typeof beforeMutate) => Promise<unknown>
  )(18080, beforeMutate);

  const firstSet = order.findIndex((entry) => entry.startsWith("set:"));
  assert.ok(firstSet >= 0, "the fake Linux apply must reach a proxy mutation");
  assert.equal(
    order[0],
    "recovery-persisted",
    `recovery must be persisted before the first OS mutation; observed order=${order.join(",")}`
  );
});

test("hard process restart reloads the authenticated prior proxy state", () => {
  const dataDir = makeDataDir();
  try {
    const first = runChild(dataDir, persistScript());
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const recoveryPath = path.join(dataDir, "mitm", "system-proxy-recovery.json");
    const keyPath = path.join(dataDir, "mitm", ".system-proxy-recovery.key");
    assert.equal(
      fs.existsSync(recoveryPath),
      true,
      "apply must leave a crash-safe recovery record"
    );
    assert.equal(fs.existsSync(keyPath), true, "recovery authentication key must survive restart");

    if (process.platform !== "win32") {
      assert.equal(fs.statSync(recoveryPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
    }

    const restarted = runChild(dataDir, readScript);
    assert.equal(restarted.status, 0, restarted.stderr || restarted.stdout);
    const state = JSON.parse(restarted.stdout.trim()) as {
      applied: boolean;
      port: number | null;
      previousState: typeof linuxPreviousState | null;
    };
    assert.equal(state.applied, true);
    assert.equal(state.port, 18080);
    assert.deepEqual(state.previousState, linuxPreviousState);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("tampered recovery data is rejected and cannot be overwritten by a new apply", () => {
  const dataDir = makeDataDir();
  try {
    const first = runChild(dataDir, persistScript());
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const recoveryPath = path.join(dataDir, "mitm", "system-proxy-recovery.json");
    const envelope = JSON.parse(fs.readFileSync(recoveryPath, "utf8")) as {
      payload: string;
      hmac: string;
    };
    const payload = JSON.parse(envelope.payload) as {
      previousState: { httpHost: string };
    };
    payload.previousState.httpHost = "'attacker.local'";
    envelope.payload = JSON.stringify(payload);
    fs.writeFileSync(recoveryPath, JSON.stringify(envelope), "utf8");

    const restarted = runChild(dataDir, readScript);
    assert.equal(restarted.status, 0, restarted.stderr || restarted.stdout);
    const state = JSON.parse(restarted.stdout.trim()) as { applied: boolean };
    assert.equal(
      state.applied,
      false,
      "invalid HMAC must fail closed instead of loading proxy state"
    );

    const clearAttempt = runChild(
      dataDir,
      `
        const capture = await import("./src/lib/inspector/captureState.ts");
        try {
          capture.clearSystemProxy();
          console.log("unexpected-clear-success");
          process.exit(0);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(24);
        }
      `
    );
    assert.equal(
      clearAttempt.status,
      24,
      "tampered pending recovery data must require explicit repair/removal"
    );
    assert.equal(
      fs.existsSync(recoveryPath),
      true,
      "failed clear must preserve the tampered recovery artifact"
    );

    const overwrite = runChild(
      dataDir,
      `
        const capture = await import("./src/lib/inspector/captureState.ts");
        try {
          capture.setSystemProxyApplied(19090, ${JSON.stringify(linuxPreviousState)}, 30);
          console.log("unexpected-success");
          process.exit(0);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(23);
        }
      `
    );
    assert.equal(
      overwrite.status,
      23,
      "an unverifiable pending record must not be silently replaced"
    );
    assert.doesNotMatch(overwrite.stdout, /unexpected-success/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("repair consumes a restarted recovery record exactly once", async () => {
  const dataDir = makeDataDir();
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    const first = runChild(dataDir, persistScript());
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const systemProxy = await import("../../src/mitm/inspector/systemProxyConfig.ts");
    const calls: string[][] = [];
    const restoreExec = systemProxy.__setExec(async (_file, args) => {
      calls.push([...args]);
      return { stdout: "", stderr: "" };
    });
    try {
      const repairModule = (await import("../../src/mitm/repair.ts")) as Record<string, unknown>;
      assert.equal(
        typeof repairModule.revertSystemProxyIfApplied,
        "function",
        "repair must expose its system-proxy recovery step for deterministic verification"
      );
      const repair = repairModule.revertSystemProxyIfApplied as () => Promise<boolean>;

      assert.equal(
        await repair(),
        true,
        "first repair after restart must restore the durable state"
      );
      assert.ok(
        calls.some(
          (args) =>
            args[0] === "set" &&
            args[1] === "org.gnome.system.proxy" &&
            args[2] === "mode" &&
            args[3] === "'auto'"
        ),
        "repair must restore the recorded Linux proxy mode"
      );

      const recoveryPath = path.join(dataDir, "mitm", "system-proxy-recovery.json");
      assert.equal(fs.existsSync(recoveryPath), false, "successful repair must consume the record");
      const callCountAfterFirstRepair = calls.length;
      assert.equal(await repair(), false, "a consumed record must not replay on a second repair");
      assert.equal(
        calls.length,
        callCountAfterFirstRepair,
        "second repair must perform no proxy writes"
      );
    } finally {
      restoreExec();
    }
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MODULE_PATH = "../../packages/browser-pool/src/services/browserPool.ts";

test("browser pool exposes a fail-closed Chromium sandbox launch policy", async () => {
  const mod = (await import(MODULE_PATH)) as Record<string, unknown>;
  const resolver = mod.resolveBrowserLaunchSecurity;
  assert.equal(typeof resolver, "function", "browser pool must own one launch-security policy");
  if (typeof resolver !== "function") return;

  const resolve = resolver as (effectiveUid?: number) => {
    chromiumSandbox: boolean;
    args: string[];
  };

  assert.throws(() => resolve(0), /refuses to launch Chromium as root/i);

  const nonRoot = resolve(1000);
  assert.equal(nonRoot.chromiumSandbox, true);
  assert.equal(nonRoot.args.includes("--no-sandbox"), false);
  assert.ok(nonRoot.args.includes("--disable-dev-shm-usage"));
});

test("both browser-pool launch branches consume the shared sandbox policy", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "packages/browser-pool/src/services/browserPool.ts"),
    "utf8"
  );

  assert.equal(
    source.includes('"--no-sandbox"'),
    false,
    "package launch paths must not disable sandbox"
  );
  const uses = source.match(/resolveBrowserLaunchSecurity\(/g) ?? [];
  assert.ok(uses.length >= 2, "both cloak and Playwright launch paths must use the shared policy");
});

test("supported Docker web runtimes drop privileges before browser-pool execution", () => {
  const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
  const bunDockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile.bun"), "utf8");

  const nodeWeb = dockerfile.slice(dockerfile.indexOf("FROM runner-debian-base AS runner-web"));
  assert.match(nodeWeb, /USER node/);

  const bunWeb = bunDockerfile.slice(bunDockerfile.indexOf("FROM runner-base AS runner-web"));
  assert.match(bunWeb, /USER bun/);
});

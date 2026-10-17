import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

const root = process.cwd();
const shutdownStatePath = path.join(root, "src/lib/shutdownState.ts");
const chatAdmissionPath = path.join(root, "src/shared/middleware/chatBodyAdmission.ts");
const authzPipelinePath = path.join(root, "src/server/authz/pipeline.ts");

test("AP-ISS-0149 keeps request hot paths isolated from lifecycle composition", () => {
  assert.equal(
    existsSync(shutdownStatePath),
    true,
    "request shutdown state must live in a dependency-light module"
  );

  const shutdownState = readFileSync(shutdownStatePath, "utf8");
  const chatAdmission = readFileSync(chatAdmissionPath, "utf8");
  const authzPipeline = readFileSync(authzPipelinePath, "utf8");

  for (const [name, source] of [
    ["chatBodyAdmission", chatAdmission],
    ["authz pipeline", authzPipeline],
  ] as const) {
    assert.match(
      source,
      /lib\/shutdownState/,
      `${name} must import the lightweight shutdown state boundary`
    );
    assert.doesNotMatch(
      source,
      /lib\/gracefulShutdown/,
      `${name} must not pull main lifecycle composition into the request graph`
    );
  }

  assert.doesNotMatch(shutdownState, /lifecycle\/coordinator/);
  assert.doesNotMatch(
    shutdownState,
    /\bimport\s*\(/,
    "shutdown state must not introduce dynamic imports into the request graph"
  );
});

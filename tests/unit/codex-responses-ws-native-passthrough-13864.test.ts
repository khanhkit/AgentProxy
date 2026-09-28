import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Codex Responses WS marks native Responses input as passthrough", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/internal/codex-responses-ws/route.ts"),
    "utf8"
  );

  assert.match(
    route,
    /executor\.transformRequest\([\s\S]{0,160}\{ \.\.\.responseBodyWithMemory, _nativeCodexPassthrough: true \}/
  );
});

test("Codex executor consumes and strips the native passthrough marker", () => {
  const executor = fs.readFileSync(
    path.join(process.cwd(), "open-sse/executors/codex.ts"),
    "utf8"
  );

  assert.match(executor, /body\?\._nativeCodexPassthrough === true/);
  assert.match(executor, /delete body\._nativeCodexPassthrough/);
});

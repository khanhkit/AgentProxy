import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("semantic cache HIT finalizes the exact pending request scope", () => {
  const source = read("open-sse/handlers/chatCore/semanticCache.ts");
  assert.match(source, /finalizePendingScope\(pendingScope,/);
  assert.doesNotMatch(source, /trackPendingRequest\(model, provider, connectionId, false\)/);
  assert.match(source, /pendingScope:\s*PendingRequestScope/);
});

test("chatCore passes its request-id-backed pendingScope into semantic cache", () => {
  const source = read("open-sse/handlers/chatCore.ts");
  const call = source.match(/checkSemanticCache\(\{[\s\S]*?\}\);/m)?.[0] ?? "";
  assert.match(call, /pendingScope,/);
  assert.doesNotMatch(call, /connectionId,/);
});

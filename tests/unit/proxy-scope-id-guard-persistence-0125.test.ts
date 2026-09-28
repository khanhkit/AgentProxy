import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const proxies = fs.readFileSync(path.join(root, "src/lib/db/proxies.ts"), "utf8");
const mappers = fs.readFileSync(path.join(root, "src/lib/db/proxies/mappers.ts"), "utf8");
const subscriptions = fs.readFileSync(path.join(root, "src/lib/db/proxySubscriptions.ts"), "utf8");

test("TC-OMNIDB-PROXY-048A: one shared scopeId guard rejects blank non-global ids", () => {
  assert.match(mappers, /export function isScopeIdMissing\(scope: string, scopeId: string \| null \| undefined\): boolean/);
  assert.match(mappers, /return scope !== "global" && !scopeId\?\.trim\(\)/);
});

test("TC-OMNIDB-PROXY-048B: every stored proxy-assignment write uses the shared guard", () => {
  assert.match(proxies, /isScopeIdMissing,/);
  assert.ok((proxies.match(/if \(isScopeIdMissing\(normalizedScope, normalizedScopeId\)\)/g) ?? []).length >= 3);
  assert.match(subscriptions, /normalizeScope, normalizeAssignmentScopeId, isScopeIdMissing/);
  assert.match(subscriptions, /if \(isScopeIdMissing\(normalizedScope, normalizedScopeId\)\)/);
});

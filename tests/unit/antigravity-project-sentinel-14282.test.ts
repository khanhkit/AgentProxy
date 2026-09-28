import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(p: string): string { return fs.readFileSync(path.join(process.cwd(), p), "utf8"); }

test("manual-project sentinel is defined as unusable", () => {
  const source = read("open-sse/services/antigravityProjectBootstrap.ts");
  assert.match(source, /export function isUsableAntigravityProjectId\(value: unknown\): value is string/);
  assert.match(source, /trimmed !== "" && trimmed !== ANTIGRAVITY_REQUIRES_MANUAL_PROJECT/);
});

test("runtime executor never accepts the sentinel as a project id", () => {
  const source = read("open-sse/executors/antigravity.ts");
  assert.match(source, /if \(trimmedValue === ANTIGRAVITY_REQUIRES_MANUAL_PROJECT\) return null/);
  assert.match(source, /if \(projectId === ANTIGRAVITY_REQUIRES_MANUAL_PROJECT\) projectId = ""/);
  assert.match(source, /discovered && discovered !== ANTIGRAVITY_REQUIRES_MANUAL_PROJECT/);
});

test("persist, refresh, discovery and selection all use the usable-project predicate", () => {
  const persist = read("open-sse/services/antigravityProjectPersist.ts");
  const refresh = read("open-sse/services/tokenRefresh.ts");
  const discovery = read("src/app/api/providers/[id]/models/discovery/normalizers.ts");
  assert.match(persist, /isUsableAntigravityProjectId\(connection\.projectId\)/);
  assert.match(persist, /!isUsableAntigravityProjectId\(discoveredProjectId\)/);
  assert.match(refresh, /isUsableAntigravityProjectId\(credentials\.projectId\)/);
  assert.match(refresh, /if \(isUsableAntigravityProjectId\(discovered\)\)/);
  assert.match(discovery, /if \(isUsableAntigravityProjectId\(discovered\)\)/);
});

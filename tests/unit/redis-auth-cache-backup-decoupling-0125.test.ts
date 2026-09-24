import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/apiKeys.ts"), "utf8");

test("TC-OMNIDB-AUTH-038A: Redis auth-cache enablement ignores SQLite backup flag", () => {
  const start = source.indexOf("function isRedisAuthCacheEnabled");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end + 2);
  assert.match(body, /AGENTPROXY_DISABLE_REDIS_AUTH_CACHE/);
  assert.match(body, /NODE_ENV !== "test"/);
  assert.doesNotMatch(body, /DISABLE_SQLITE_AUTO_BACKUP/);
});

test("TC-OMNIDB-AUTH-038B: backup suppression remains independent from auth-cache policy", () => {
  const backupSource = fs.readFileSync(path.join(root, "src/lib/db/backup.ts"), "utf8");
  assert.match(backupSource, /DISABLE_SQLITE_AUTO_BACKUP/);
  const start = source.indexOf("function isRedisAuthCacheEnabled");
  const end = source.indexOf("\n}", start);
  assert.doesNotMatch(source.slice(start, end + 2), /DISABLE_SQLITE_AUTO_BACKUP/);
});

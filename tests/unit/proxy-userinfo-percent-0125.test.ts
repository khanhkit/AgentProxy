import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mappers = fs.readFileSync(path.join(root, "src/lib/db/proxies/mappers.ts"), "utf8");
const settings = fs.readFileSync(path.join(root, "src/lib/db/settings.ts"), "utf8");
const helperPath = path.join(root, "src/shared/utils/decodeUserinfo.ts");

test("TC-OMNIDB-PROXY-047A: DB proxy parsers use guarded userinfo decoding", () => {
  assert.match(mappers, /import \{ decodeUserinfo \} from "@\/shared\/utils\/decodeUserinfo"/);
  assert.match(settings, /import \{ decodeUserinfo \} from "@\/shared\/utils\/decodeUserinfo"/);
  assert.doesNotMatch(mappers, /decodeURIComponent\(parsed\.(username|password)\)/);
  assert.doesNotMatch(settings, /decodeURIComponent\(url\.(username|password)\)/);
});

test("TC-OMNIDB-PROXY-047B: guarded decoder preserves literal-percent credentials", () => {
  assert.ok(fs.existsSync(helperPath));
  const helper = fs.readFileSync(helperPath, "utf8");
  assert.match(helper, /return decodeURIComponent\(value\)/);
  assert.match(helper, /catch \{/);
  assert.match(helper, /return value/);
});

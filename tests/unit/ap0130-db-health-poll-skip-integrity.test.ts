import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/db/health/route.ts"), "utf8");

test("AP-ISS-0130 dashboard DB health polling skips integrity scans", () => {
  const getBody = source.slice(
    source.indexOf("export async function GET"),
    source.indexOf("export async function POST")
  );
  assert.match(
    getBody,
    /runManagedDbHealthCheck\(\{\s*autoRepair:\s*false,\s*skipIntegrityCheck:\s*true\s*\}\)/
  );
});

test("AP-ISS-0130 manual repair does not silently waive integrity scans", () => {
  const postBody = source.slice(source.indexOf("export async function POST"));
  assert.match(postBody, /runManagedDbHealthCheck\(\{\s*autoRepair:\s*true\s*\}\)/);
  assert.doesNotMatch(postBody, /skipIntegrityCheck:\s*true/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(HERE, "../../src/app/api/providers/[id]/models/route.ts");
const source = fs.readFileSync(routePath, "utf8");

test("Vertex Express route validates queryKey through aiplatform helper before Gemini live-list path", () => {
  const branch = source.indexOf("if (queryKey) {");
  const helper = source.indexOf("discoverVertexExpressModels", branch);
  const googleList = source.indexOf(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    branch
  );

  assert.ok(branch >= 0, "expected a dedicated Vertex Express queryKey branch");
  assert.ok(helper > branch, "queryKey branch must call discoverVertexExpressModels");
  assert.ok(
    googleList > helper,
    "Express branch must run before the bearer-only Generative Language live-list path"
  );
  assert.match(
    source.slice(branch, googleList),
    /curatedExpressModels/,
    "Express branch must return the curated Vertex Express catalog"
  );
});

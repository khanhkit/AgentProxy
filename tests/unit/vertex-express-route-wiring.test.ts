import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(HERE, "../../src/app/api/providers/[id]/models/vertexDiscovery.ts");
const source = fs.readFileSync(routePath, "utf8");

test("Vertex Express route validates queryKey through aiplatform helper before Gemini live-list path", () => {
  const branch = source.indexOf("if (queryKey) return handleVertexApiKeyCatalog");
  const helper = source.indexOf("handleVertexApiKeyCatalog", branch);
  const bearer = source.indexOf("discoverVertexModelsWithBearer", branch);

  assert.ok(branch >= 0, "expected a dedicated Vertex Express queryKey branch");
  assert.ok(helper > branch, "queryKey branch must call handleVertexApiKeyCatalog");
  assert.ok(
    bearer > helper,
    "Express branch must run before the bearer-only Vertex discovery path"
  );
});

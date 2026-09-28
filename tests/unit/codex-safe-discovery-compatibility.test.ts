import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyCodexDiscoveryModel,
  getCodexDiscoveryMode,
} from "../../src/shared/services/codexDiscoveryPolicy.ts";
import {
  normalizeCodexGithubCatalogResponse,
  reconcileCodexDiscoveryCatalog,
} from "../../src/app/api/providers/[id]/models/discovery/codex.ts";

test("Codex safe discovery quarantines unproven GitHub metadata and newer-client models", () => {
  assert.deepEqual(
    classifyCodexDiscoveryModel(
      { id: "future-codex" },
      { source: "github", mode: "safe", implementedClientVersion: "0.153.4" }
    ),
    { status: "candidate", reason: "missing-explicit-list-visibility" }
  );
  assert.deepEqual(
    classifyCodexDiscoveryModel(
      {
        id: "future-codex",
        visibility: "list",
        supportedInApi: true,
        minimalClientVersion: "999.0.0",
      },
      { source: "github", mode: "safe", implementedClientVersion: "0.153.4" }
    ),
    { status: "candidate", reason: "requires-newer-client" }
  );
  assert.deepEqual(
    classifyCodexDiscoveryModel(
      { id: "gpt-5.4-high", visibility: "list", supportedInApi: true },
      { source: "live", mode: "safe", implementedClientVersion: "0.153.4" }
    ),
    { status: "retired", reason: "denylisted" }
  );
});

test("Codex discovery mode keeps legacy autoFetchModels opt-in safe by default", () => {
  assert.equal(getCodexDiscoveryMode({}), "off");
  assert.equal(getCodexDiscoveryMode({ autoFetchModels: true }), "safe");
  assert.equal(getCodexDiscoveryMode({ codexDiscoveryMode: "all" }), "all");
});

test("Codex normalization preserves compatibility metadata and reasoning efforts", () => {
  const [model] = normalizeCodexGithubCatalogResponse({
    models: [
      {
        slug: "future-codex",
        visibility: "list",
        supported_in_api: true,
        minimal_client_version: "0.153.4",
        supported_reasoning_levels: ["low", "high", "xhigh"],
      },
    ],
  });
  assert.equal(model.visibility, "list");
  assert.equal(model.supportedInApi, true);
  assert.equal(model.minimalClientVersion, "0.153.4");
  assert.equal(model.discoverySource, "github");
  assert.deepEqual(model.supportedThinkingEfforts, ["low", "high", "xhigh"]);
});

test("Codex reconciliation keeps candidates out of active catalog", () => {
  const catalog = reconcileCodexDiscoveryCatalog(
    [
      {
        id: "future-codex",
        name: "Future Codex",
        owned_by: "codex",
        apiFormat: "responses",
        supportedEndpoints: ["responses"],
        discoverySource: "github",
      },
    ],
    [],
    "safe",
    "0.153.4"
  );
  assert.deepEqual(catalog.activeModels, []);
  assert.deepEqual(
    catalog.candidateModels.map(({ id, discoveryStatus, compatibilityReason }) => ({
      id,
      discoveryStatus,
      compatibilityReason,
    })),
    [
      {
        id: "future-codex",
        discoveryStatus: "candidate",
        compatibilityReason: "missing-explicit-list-visibility",
      },
    ]
  );
});

test("Codex provider-model route exposes mode and optional candidates without widening default response", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(
    path.resolve(here, "../../src/app/api/providers/[id]/models/route.ts"),
    "utf8"
  );
  assert.match(source, /getCodexDiscoveryMode/);
  assert.match(source, /includeCandidates/);
  assert.match(source, /candidateModels/);
  assert.match(source, /discovery:\s*\{\s*mode:\s*codexDiscoveryMode\s*\}/);
});

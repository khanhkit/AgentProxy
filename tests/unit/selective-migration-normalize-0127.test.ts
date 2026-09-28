import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  normalize9RouterJsonSource,
  normalize9RouterSqliteRows,
  normalizeOmniRouteSqliteRows,
} from "../../src/lib/migration/selectiveNormalize.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(here, "../fixtures/selective-migration");

function readJson(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

test("TC-MIG-NORM-016 normalizes pinned 9Router legacy JSON and strips credentials/runtime settings", () => {
  const source = readJson("9router-v0.5.86-legacy.json");
  const entities = normalize9RouterJsonSource(source);

  const connection = entities.find(
    (item) => item.category === "providerConnections" && item.sourceId === "9r-conn-1"
  );
  assert.equal(connection?.disposition, "REQUIRES_REAUTH");
  assert.equal(connection?.identity, "openai|apikey|owner@example.invalid");
  assert.deepEqual(connection?.data, {
    provider: "openai",
    authType: "apikey",
    name: "Primary",
    email: "owner@example.invalid",
    priority: 1,
    isActive: true,
  });
  assert.equal(JSON.stringify(connection).includes("fixture-secret"), false);
  assert.equal(JSON.stringify(connection).includes("rateLimitedUntil"), false);

  const settings = entities.find((item) => item.category === "settings");
  assert.deepEqual(settings?.data, {
    comboStrategy: "fallback",
    comboStickyRoundRobinLimit: 2,
    providerStrategies: { openai: "round-robin" },
  });
  assert.equal(JSON.stringify(settings).includes("oidcClientSecret"), false);
});

test("TC-MIG-NORM-017 normalizes pinned 9Router SQLite rows and extracts combo dependency", () => {
  const rows = readJson("9router-v0.5.86-sqlite-rows.json");
  const entities = normalize9RouterSqliteRows(rows);

  const connection = entities.find((item) => item.sourceId === "9r-sql-conn-1");
  assert.equal(connection?.disposition, "REQUIRES_REAUTH");
  assert.equal(JSON.stringify(connection).includes("accessToken"), false);
  assert.equal(JSON.stringify(connection).includes("refreshToken"), false);
  assert.equal(JSON.stringify(connection).includes("backoffLevel"), false);
  assert.deepEqual(connection?.data, {
    provider: "openai",
    authType: "oauth",
    name: "Work",
    email: "work@example.invalid",
    priority: 1,
    isActive: true,
    displayName: "Work account",
    defaultModel: "gpt-example",
  });

  const combo = entities.find((item) => item.sourceId === "9r-sql-combo-1");
  assert.deepEqual(combo?.dependencies, [
    { category: "providerConnections", sourceId: "9r-sql-conn-1" },
  ]);

  const settings = entities.find((item) => item.category === "settings");
  assert.equal(JSON.stringify(settings).includes("outboundProxyUrl"), false);
});

test("TC-MIG-NORM-018 normalizes pinned OmniRoute SQLite rows into the same entity contract", () => {
  const rows = readJson("omniroute-v3.8.51-sqlite-rows.json");
  const entities = normalizeOmniRouteSqliteRows(rows);

  const connection = entities.find((item) => item.sourceId === "omni-conn-1");
  assert.equal(connection?.disposition, "REQUIRES_REAUTH");
  assert.equal(connection?.identity, "openai|oauth|primary@example.invalid");
  assert.equal(JSON.stringify(connection).includes("access_token"), false);
  assert.equal(JSON.stringify(connection).includes("refresh_token"), false);
  assert.equal(JSON.stringify(connection).includes("rate_limited_until"), false);
  assert.deepEqual(connection?.data, {
    provider: "openai",
    authType: "oauth",
    name: "Primary",
    email: "primary@example.invalid",
    priority: 1,
    isActive: true,
    displayName: "Primary account",
    defaultModel: "gpt-example",
  });

  const node = entities.find((item) => item.sourceId === "omni-node-1");
  assert.deepEqual(node?.data, {
    type: "openai",
    name: "Custom",
    prefix: "custom",
    apiType: "openai",
    baseUrl: "https://omni.example.invalid",
    chatPath: "/v1/chat/completions",
    modelsPath: "/v1/models",
    customHeaders: {},
  });

  const combo = entities.find((item) => item.sourceId === "omni-combo-1");
  assert.deepEqual(combo?.dependencies, [
    { category: "providerConnections", sourceId: "omni-conn-1" },
  ]);

  const key = entities.find((item) => item.sourceId === "omni-key-1");
  assert.equal(key?.disposition, "REQUIRES_REAUTH");
  assert.deepEqual(key?.data, {
    name: "Client",
    allowedModels: ["gpt-example"],
    noLog: false,
  });
  assert.equal(JSON.stringify(key).includes("fixture-key"), false);
  assert.equal(JSON.stringify(key).includes("machine"), false);
});

test("TC-MIG-NORM-019 source primary keys survive only as source refs, never target ids", () => {
  const source = readJson("9router-v0.5.86-legacy.json");
  const entities = normalize9RouterJsonSource(source);

  assert.ok(entities.some((item) => item.sourceId === "9r-conn-1"));
  assert.ok(entities.every((item) => !("targetId" in item)));
  assert.ok(entities.every((item) => item.data?.id === undefined));
});

test("TC-MIG-NORM-049 normalizes 9Router JSON model aliases and pricing overrides", () => {
  const source = {
    _meta: { source: "9router", version: "0.5.86" },
    modelAliases: {
      fast: "openai/gpt-example",
      ignoredObject: { unexpected: true },
    },
    pricing: {
      openai: {
        "gpt-example": { input: 1, output: 2 },
      },
    },
  };

  const entities = normalize9RouterJsonSource(source);
  const alias = entities.find(
    (item) => item.category === "modelAliases" && item.sourceId === "fast"
  );
  assert.deepEqual(alias, {
    category: "modelAliases",
    sourceId: "fast",
    identity: "model-alias|fast",
    label: "fast",
    disposition: "CREATE",
    data: { alias: "fast", model: "openai/gpt-example" },
  });

  const pricing = entities.find(
    (item) =>
      item.category === "pricing" &&
      item.sourceId === "openai:gpt-example"
  );
  assert.deepEqual(pricing, {
    category: "pricing",
    sourceId: "openai:gpt-example",
    identity: "pricing|openai|gpt-example",
    label: "openai / gpt-example",
    disposition: "CREATE",
    data: {
      provider: "openai",
      model: "gpt-example",
      pricing: { input: 1, output: 2 },
    },
  });

  assert.equal(
    entities.some(
      (item) =>
        item.category === "modelAliases" &&
        item.sourceId === "ignoredObject"
    ),
    false
  );
});

test("TC-MIG-NORM-050 normalizes 9Router and OmniRoute SQLite KV aliases/pricing equally", () => {
  const nineRouter = normalize9RouterSqliteRows({
    modelAliases: [{ key: "fast", value: JSON.stringify("openai/gpt-example") }],
    pricing: [
      {
        key: "openai",
        value: JSON.stringify({
          "gpt-example": { input: 1, output: 2 },
        }),
      },
    ],
  });

  const omniRoute = normalizeOmniRouteSqliteRows({
    modelAliases: [{ key: "fast", value: JSON.stringify("openai/gpt-example") }],
    pricing: [
      {
        key: "openai",
        value: JSON.stringify({
          "gpt-example": { input: 1, output: 2 },
        }),
      },
    ],
  });

  assert.deepEqual(
    nineRouter.filter((item) =>
      ["modelAliases", "pricing"].includes(item.category)
    ),
    omniRoute.filter((item) =>
      ["modelAliases", "pricing"].includes(item.category)
    )
  );
});

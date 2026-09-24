import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { handleSelectiveMigrationPreview } from "../../src/lib/migration/selectivePreviewRequest.ts";

function authDeps(overrides: Record<string, unknown> = {}) {
  return {
    isAuthRequired: async () => true,
    isAuthenticated: async () => true,
    openDatabase: async () => {
      throw new Error("openDatabase should not be called");
    },
    ...overrides,
  };
}

test("TC-MIG-API-004 rejects unauthenticated preview before reading source", async () => {
  let opened = false;
  const response = await handleSelectiveMigrationPreview(
    new Request("http://localhost/api/settings/migration/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ _meta: { source: "9router" }, settings: {} }),
    }),
    authDeps({
      isAuthenticated: async () => false,
      openDatabase: async () => {
        opened = true;
        throw new Error("must not open source");
      },
    })
  );

  assert.equal(response.status, 401);
  assert.equal(opened, false);
});

test("TC-MIG-API-005 fails closed for malformed and unsupported JSON", async () => {
  for (const body of ["{broken", JSON.stringify({ hello: "world" })]) {
    const response = await handleSelectiveMigrationPreview(
      new Request("http://localhost/api/settings/migration/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      authDeps()
    );
    assert.equal(response.status, 400);
  }
});

test("TC-MIG-API-006 enforces the configured upload bound before source open", async () => {
  let opened = false;
  const response = await handleSelectiveMigrationPreview(
    new Request("http://localhost/api/settings/migration/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1024",
      },
      body: "{}",
    }),
    authDeps({
      maxUploadBytes: 32,
      openDatabase: async () => {
        opened = true;
        throw new Error("must not open source");
      },
    })
  );

  assert.equal(response.status, 400);
  assert.equal(opened, false);
});

test("TC-MIG-API-007 previews SQLite read-only and removes the temp file", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap0127-preview-test-"));
  const sqlSeen: string[] = [];
  let openedPath = "";
  let readonly = false;
  let closed = false;

  try {
    const form = new FormData();
    const sqliteBytes = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(64)]);
    form.set("file", new File([sqliteBytes], "source.sqlite", { type: "application/octet-stream" }));

    const response = await handleSelectiveMigrationPreview(
      new Request("http://localhost/api/settings/migration/preview", {
        method: "POST",
        body: form,
      }),
      authDeps({
        tempDir,
        openDatabase: async (filePath: string, options: { readonly?: boolean }) => {
          openedPath = filePath;
          readonly = options.readonly === true;
          assert.equal(fs.existsSync(filePath), true);
          return {
            pragma: () => [{ integrity_check: "ok" }],
            prepare(sql: string) {
              sqlSeen.push(sql);
              if (sql.includes("sqlite_master")) {
                return {
                  all: () =>
                    ["provider_connections", "provider_nodes", "combos", "api_keys", "usage_history"].map(
                      (name) => ({ name })
                    ),
                };
              }
              return { get: () => ({ count: 1 }) };
            },
            close() {
              closed = true;
            },
          };
        },
      })
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { source?: { family?: string; format?: string } };
    assert.equal(payload.source?.family, "omniroute");
    assert.equal(payload.source?.format, "sqlite");
    assert.equal(readonly, true);
    assert.equal(closed, true);
    assert.ok(openedPath.startsWith(tempDir));
    assert.ok(sqlSeen.every((sql) => /^SELECT\b/i.test(sql.trim())));
    assert.deepEqual(fs.readdirSync(tempDir), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("TC-MIG-API-008 previews 9Router JSON without creating a temp database", async () => {
  let opened = false;
  const form = new FormData();
  form.set(
    "file",
    new File(
      [
        JSON.stringify({
          _meta: { source: "9router", version: "0.4.41" },
          providerConnections: [{ id: "p1", provider: "openai", name: "Primary" }],
          combos: [{ id: "c1", name: "Default" }],
        }),
      ],
      "db.json",
      { type: "application/json" }
    )
  );

  const response = await handleSelectiveMigrationPreview(
    new Request("http://localhost/api/settings/migration/preview", { method: "POST", body: form }),
    authDeps({
      openDatabase: async () => {
        opened = true;
        throw new Error("JSON must not open SQLite");
      },
    })
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { source?: { family?: string; version?: string } };
  assert.equal(payload.source?.family, "9router");
  assert.equal(payload.source?.version, "0.4.41");
  assert.equal(opened, false);
});

test("TC-MIG-API-020 preview returns normalized JSON entities for item-level selection", async () => {
  const response = await handleSelectiveMigrationPreview(
    new Request("http://localhost/api/settings/migration/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        _meta: { source: "9router", version: "0.5.86" },
        providerConnections: [
          {
            id: "json-conn-1",
            provider: "openai",
            authType: "apikey",
            name: "Primary",
            apiKey: "fixture-secret-must-not-leak",
          },
        ],
      }),
    }),
    authDeps()
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    entities?: Array<{
      sourceId?: string;
      disposition?: string;
      data?: Record<string, unknown>;
    }>;
  };
  assert.equal(payload.entities?.[0]?.sourceId, "json-conn-1");
  assert.equal(payload.entities?.[0]?.disposition, "REQUIRES_REAUTH");
  assert.equal(JSON.stringify(payload.entities).includes("fixture-secret"), false);
});

test("TC-MIG-API-021 SQLite preview returns real normalized source ids using SELECT-only reads", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap0127-preview-rows-"));
  const sqlSeen: string[] = [];

  try {
    const form = new FormData();
    const sqliteBytes = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(64)]);
    form.set("file", new File([sqliteBytes], "source.sqlite"));

    const response = await handleSelectiveMigrationPreview(
      new Request("http://localhost/api/settings/migration/preview", {
        method: "POST",
        body: form,
      }),
      authDeps({
        tempDir,
        openDatabase: async () => ({
          pragma: () => [{ integrity_check: "ok" }],
          prepare(sql: string) {
            sqlSeen.push(sql);
            if (sql.includes("sqlite_master")) {
              return {
                all: () =>
                  ["provider_connections", "provider_nodes", "combos", "api_keys"].map(
                    (name) => ({ name })
                  ),
              };
            }
            if (/COUNT\(\*\).*provider_connections/i.test(sql)) return { get: () => ({ count: 1 }) };
            if (/COUNT\(\*\).*provider_nodes/i.test(sql)) return { get: () => ({ count: 0 }) };
            if (/COUNT\(\*\).*combos/i.test(sql)) return { get: () => ({ count: 1 }) };
            if (/COUNT\(\*\).*api_keys/i.test(sql)) return { get: () => ({ count: 0 }) };
            if (/FROM\s+provider_connections/i.test(sql)) {
              return {
                all: () => [
                  {
                    id: "omni-row-conn-1",
                    provider: "openai",
                    auth_type: "oauth",
                    name: "Primary",
                    email: "row@example.invalid",
                    access_token: "fixture-secret-must-not-leak",
                  },
                ],
              };
            }
            if (/FROM\s+provider_nodes/i.test(sql)) return { all: () => [] };
            if (/FROM\s+combos/i.test(sql)) {
              return {
                all: () => [
                  {
                    id: "omni-row-combo-1",
                    name: "Fallback",
                    data: JSON.stringify({
                      models: [{ connectionId: "omni-row-conn-1", model: "gpt-example" }],
                    }),
                  },
                ],
              };
            }
            if (/FROM\s+api_keys/i.test(sql)) return { all: () => [] };
            return { all: () => [], get: () => ({ count: 0 }) };
          },
          close() {},
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      entities?: Array<{
        sourceId?: string;
        dependencies?: Array<{ sourceId?: string }>;
      }>;
    };
    const ids = payload.entities?.map((entity) => entity.sourceId) ?? [];
    assert.deepEqual(ids.sort(), ["omni-row-combo-1", "omni-row-conn-1"]);
    const combo = payload.entities?.find((entity) => entity.sourceId === "omni-row-combo-1");
    assert.deepEqual(combo?.dependencies, [
      { category: "providerConnections", sourceId: "omni-row-conn-1" },
    ]);
    assert.equal(JSON.stringify(payload.entities).includes("fixture-secret"), false);
    assert.ok(sqlSeen.every((sql) => /^SELECT\b/i.test(sql.trim())));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

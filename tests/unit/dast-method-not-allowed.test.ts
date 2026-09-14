import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { maybeHandleDisallowedMethod } = require("../../scripts/dev/http-method-guard.cjs");
const { load: loadYaml } = require("js-yaml") as { load: (source: string) => unknown };

test("raw HTTP guard rejects high-risk unsupported methods before Next.js handles them", () => {
  const cases: Array<{
    label: string;
    method: string;
    url: string;
    allow: string;
  }> = [
    { label: "login TRACE", method: "TRACE", url: "/api/auth/login", allow: "POST" },
    { label: "login QUERY", method: "QUERY", url: "/api/auth/login", allow: "POST" },
    { label: "logout QUERY", method: "QUERY", url: "/api/auth/logout", allow: "POST" },
    { label: "keys QUERY", method: "QUERY", url: "/api/keys", allow: "GET, POST" },
    {
      // dast-smoke 2026-07-06: schemathesis's unsupported-methods check demands
      // 405 (method-first) for QUERY /api/keys/{id}/devices — the auth layer was
      // answering 401 first because the path had no HIGH_RISK rule.
      label: "key devices QUERY",
      method: "QUERY",
      url: "/api/keys/0/devices",
      allow: "GET",
    },
    {
      label: "key detail QUERY",
      method: "QUERY",
      url: "/api/keys/0",
      allow: "GET, PATCH, DELETE",
    },
    { label: "key groups QUERY", method: "QUERY", url: "/api/keys/groups", allow: "GET, POST" },
    {
      label: "key group detail QUERY",
      method: "QUERY",
      url: "/api/keys/groups/0",
      allow: "GET, PUT, DELETE",
    },
    {
      label: "key group members QUERY",
      method: "QUERY",
      url: "/api/keys/groups/0/keys",
      allow: "GET, POST, DELETE",
    },
    {
      label: "key group permissions QUERY",
      method: "QUERY",
      url: "/api/keys/groups/0/permissions",
      allow: "GET, POST, DELETE",
    },
  ];

  for (const testCase of cases) {
    let body = "";
    const headers = new Map<string, string>();
    const response = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
      end(chunk: string) {
        body += chunk;
      },
    };

    const handled = maybeHandleDisallowedMethod(
      { method: testCase.method, url: testCase.url },
      response
    );
    assert.equal(handled, true, testCase.label);
    assert.equal(response.statusCode, 405, testCase.label);
    assert.equal(headers.get("allow"), testCase.allow, testCase.label);
    assert.match(body, /METHOD_NOT_ALLOWED/, testCase.label);
  }
});

test("raw HTTP guard allows documented methods through", () => {
  const response = {
    setHeader() {
      throw new Error("allowed methods should not write headers");
    },
    end() {
      throw new Error("allowed methods should not end the response");
    },
  };

  assert.equal(
    maybeHandleDisallowedMethod({ method: "POST", url: "/api/auth/login" }, response),
    false
  );
  assert.equal(maybeHandleDisallowedMethod({ method: "GET", url: "/api/keys" }, response), false);
  assert.equal(
    maybeHandleDisallowedMethod({ method: "POST", url: "/api/keys/groups" }, response),
    false
  );
  assert.equal(
    maybeHandleDisallowedMethod({ method: "OPTIONS", url: "/api/keys" }, response),
    false
  );
  assert.equal(
    maybeHandleDisallowedMethod({ method: "QUERY", url: "/api/health/ping" }, response),
    false
  );
});

test("raw HTTP guard rejects undici-unsupported methods (TRACE/TRACK/CONNECT) on ANY path", () => {
  // Regression guard (release v3.8.44 dast-smoke): TRACE reached Next's
  // middleware adapter, which throws `TypeError: 'TRACE' HTTP method is
  // unsupported.` while constructing the fetch Request — an unhandled 500 on
  // EVERY route. The guard must answer a clean 405 before Next sees it.
  for (const method of ["TRACE", "TRACK", "CONNECT"]) {
    for (const url of ["/api/keys/0/devices", "/dashboard", "/v1/chat/completions"]) {
      const headers: Record<string, string> = {};
      const response = {
        statusCode: 0,
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        body: "",
        end(payload?: string) {
          this.body = payload || "";
        },
      };
      const handled = maybeHandleDisallowedMethod({ method, url }, response);
      assert.equal(handled, true, `${method} ${url} must be handled by the guard`);
      assert.equal(response.statusCode, 405, `${method} ${url} must yield 405`);
      assert.ok(headers.Allow, `${method} ${url} must set an Allow header`);
      assert.match(response.body, /METHOD_NOT_ALLOWED/);
    }
  }
});

test("OpenAPI documents high-risk route auth and setup responses", () => {
  const spec = readFileSync("docs/openapi.yaml", "utf8");
  const apiKeyDetailStart = spec.indexOf("  /api/keys/{id}:");
  const apiKeyDetailEnd = spec.indexOf("\n  /api/combos:", apiKeyDetailStart);
  const apiKeyDetail = spec.slice(apiKeyDetailStart, apiKeyDetailEnd);

  assert.match(apiKeyDetail, /\n    get:/);
  assert.match(apiKeyDetail, /\n    patch:/);
  assert.match(apiKeyDetail, /\n    delete:/);
  assert.match(apiKeyDetail, /"401":\n\s+description: Authentication required/);
  assert.match(apiKeyDetail, /"404":\n\s+description: Key not found/);

  const loginStart = spec.indexOf("  /api/auth/login:");
  const loginEnd = spec.indexOf("\n  /api/auth/logout:", loginStart);
  const login = spec.slice(loginStart, loginEnd);
  assert.match(login, /"400":\n\s+description: Invalid login request/);
  assert.match(login, /"401":\n\s+description: Invalid password/);
  assert.match(login, /"403":\n\s+description: Password setup required/);
  assert.match(login, /"429":\n\s+description: Too many failed attempts/);
});

test("OpenAPI key subresources declare path ids and group create matches runtime", () => {
  const spec = readFileSync("docs/openapi.yaml", "utf8");
  const paths = [
    "/api/keys/{id}/regenerate",
    "/api/keys/{id}/reveal",
    "/api/keys/{id}/usage-limits",
    "/api/keys/groups/{id}",
    "/api/keys/groups/{id}/keys",
    "/api/keys/groups/{id}/permissions",
  ];
  for (const routePath of paths) {
    const start = spec.indexOf(`  ${routePath}:`);
    assert.notEqual(start, -1, routePath);
    const end = spec.indexOf("\n  /", start + 3);
    const block = spec.slice(start, end === -1 ? spec.length : end);
    assert.match(
      block,
      /parameters:\n\s+- \$ref: "#\/components\/parameters\/ResourceId"/,
      routePath
    );
  }

  const groupsStart = spec.indexOf("  /api/keys/groups:");
  const groupsEnd = spec.indexOf("\n  /api/keys/groups/{id}:", groupsStart);
  const groups = spec.slice(groupsStart, groupsEnd);
  assert.match(groups, /\n    post:/);
  assert.match(groups, /"201":(?:\s*\{\s*description:|\n\s+description:)/);
});

test("OpenAPI key mutation bodies match runtime validation", () => {
  const spec = readFileSync("docs/openapi.yaml", "utf8");
  assert.doesNotThrow(() => loadYaml(spec), "OpenAPI YAML must parse before contract assertions");

  const keysStart = spec.indexOf("  /api/keys:");
  const keysEnd = spec.indexOf("\n  /api/keys/{id}:", keysStart);
  const keys = spec.slice(keysStart, keysEnd);
  assert.match(keys, /required: \[name\]/);
  assert.doesNotMatch(keys, /required: \[label\]/);
  assert.match(keys, /name:\n\s+type: string\n\s+minLength: 1\n\s+maxLength: 200/);
  assert.match(keys, /"400":(?:\s*\{\s*description:|\n\s+description:)/);

  const detailStart = spec.indexOf("  /api/keys/{id}:");
  const detailEnd = spec.indexOf("\n  /api/keys/{id}/devices:", detailStart);
  const detail = spec.slice(detailStart, detailEnd);
  const patchStart = detail.indexOf("\n    patch:");
  const deleteStart = detail.indexOf("\n    delete:", patchStart);
  const patch = detail.slice(patchStart, deleteStart);
  assert.match(patch, /requestBody:\n\s+required: true/);
  assert.match(patch, /type: object\n\s+minProperties: 1/);
  assert.match(
    patch,
    /properties:\n\s+name:\s+\{ type: string, minLength: 1, maxLength: 200, pattern: '\\S' \}/
  );
  assert.match(
    patch,
    /accessSchedule:\n\s+oneOf:\n\s+- type: object\n\s+required: \[enabled, from, until, days, tz\]/
  );
  assert.match(patch, /days:\n\s+type: array\n\s+minItems: 1\n\s+maxItems: 7/);
  assert.match(patch, /tz:\s+\{ type: string, minLength: 1, maxLength: 100 \}/);
  assert.match(
    patch,
    /limit:\s+\{ type: integer, minimum: 1, maximum: 9007199254740991 \}/,
    "rateLimits.limit must match Zod safe-integer bounds"
  );
  assert.match(
    patch,
    /window:\s+\{ type: integer, minimum: 1, maximum: 9007199254740991 \}/,
    "rateLimits.window must match Zod safe-integer bounds"
  );
  assert.match(patch, /anyOf:\n\s+- required: \[name\]/);
});

test("OpenAPI API-key trimmed strings and expiresAt match runtime validation", () => {
  const spec = readFileSync("docs/openapi.yaml", "utf8");
  assert.doesNotThrow(() => loadYaml(spec), "OpenAPI YAML must parse before string constraints");

  const createStart = spec.indexOf("  /api/keys:");
  const createEnd = spec.indexOf("\n  /api/keys/{id}:", createStart);
  const create = spec.slice(createStart, createEnd);
  assert.ok(
    create.includes(
      String.raw`items: { type: string, minLength: 1, maxLength: 64, pattern: '\S' }`
    ),
    "create scopes must reject whitespace-only strings like z.string().trim().min(1)"
  );
  assert.ok(
    create.includes(String.raw`items: { type: string, minLength: 1, pattern: '\S' }`),
    "create allowedModels must reject whitespace-only strings"
  );
  assert.ok(
    create.includes(
      String.raw`items: { type: string, minLength: 1, maxLength: 200, pattern: '\S' }`
    ),
    "create allowedCombos must reject whitespace-only strings"
  );

  const detailStart = spec.indexOf("  /api/keys/{id}:");
  const detailEnd = spec.indexOf("\n  /api/keys/{id}/devices:", detailStart);
  const patchStart = spec.indexOf("\n    patch:", detailStart);
  const deleteStart = spec.indexOf("\n    delete:", patchStart);
  const patch = spec.slice(patchStart, deleteStart > patchStart ? deleteStart : detailEnd);
  const parsedSpec = loadYaml(spec) as {
    paths?: {
      "/api/keys/{id}"?: {
        patch?: {
          requestBody?: {
            content?: {
              "application/json"?: {
                schema?: { properties?: { expiresAt?: { pattern?: string } } };
              };
            };
          };
        };
      };
    };
  };
  assert.equal(
    parsedSpec.paths?.["/api/keys/{id}"]?.patch?.requestBody?.content?.["application/json"]?.schema
      ?.properties?.expiresAt?.pattern,
    "Z$",
    "patch expiresAt must document the UTC-Z-only z.string().datetime() contract"
  );
  assert.ok(
    patch.includes(String.raw`name: { type: string, minLength: 1, maxLength: 200, pattern: '\S' }`),
    "patch name must reject whitespace-only strings"
  );
  assert.ok(
    patch.includes(String.raw`items: { type: string, minLength: 1, pattern: '\S' }`),
    "patch allowedModels must reject whitespace-only strings"
  );
  assert.ok(
    patch.includes(
      String.raw`items: { type: string, minLength: 1, maxLength: 200, pattern: '\S' }`
    ),
    "patch allowedCombos must reject whitespace-only strings"
  );
  const trimmed64 = String.raw`items: { type: string, minLength: 1, maxLength: 64, pattern: '\S' }`;
  assert.equal(
    patch.split(trimmed64).length - 1,
    2,
    "patch scopes and allowedEndpoints must both reject whitespace-only strings"
  );
});

test("OpenAPI API-key cross-field constraints match runtime refinements", () => {
  const spec = readFileSync("docs/openapi.yaml", "utf8");
  assert.doesNotThrow(
    () => loadYaml(spec),
    "OpenAPI YAML must parse before cross-field assertions"
  );

  const createStart = spec.indexOf("  /api/keys:");
  const createEnd = spec.indexOf("\n  /api/keys/{id}:", createStart);
  const create = spec.slice(createStart, createEnd);
  assert.match(
    create,
    /allOf:[\s\S]*const: all[\s\S]*allowedModels:[\s\S]*maxItems: 0/,
    "create schema must reject non-empty allowedModels when modelAccessMode=all"
  );

  const detailStart = spec.indexOf("  /api/keys/{id}:");
  const detailEnd = spec.indexOf("\n  /api/keys/{id}/devices:", detailStart);
  const patchStart = spec.indexOf("\n    patch:", detailStart);
  const deleteStart = spec.indexOf("\n    delete:", patchStart);
  const patch = spec.slice(patchStart, deleteStart > patchStart ? deleteStart : detailEnd);
  assert.match(
    patch,
    /allOf:[\s\S]*modelAccessMode:[\s\S]*const: all[\s\S]*allowedModels:[\s\S]*maxItems: 0/,
    "patch schema must reject non-empty allowedModels when modelAccessMode=all"
  );
  assert.match(
    patch,
    /connectionAccessMode:[\s\S]*const: all[\s\S]*allowedConnections:[\s\S]*maxItems: 0/,
    "patch schema must reject non-empty allowedConnections when connectionAccessMode=all"
  );
  assert.match(
    patch,
    /connectionAccessMode:[\s\S]*const: restricted[\s\S]*required: \[allowedConnections\][\s\S]*minItems: 1/,
    "patch schema must require non-empty allowedConnections when connectionAccessMode=restricted"
  );
});

test("DAST Schemathesis hook keeps API-key semantic filtering narrow and stateful enabled", () => {
  const workflow = readFileSync(".github/workflows/dast-smoke.yml", "utf8");
  const hookPath = "scripts/dast/schemathesis_hooks.py";

  assert.match(workflow, /SCHEMATHESIS_HOOKS:\s+scripts\/dast\/schemathesis_hooks\.py/);
  assert.match(workflow, /pip install schemathesis==4\.27\.1/);
  assert.match(workflow, /API-key cross-field validation smoke \(blocking\)/);
  assert.match(workflow, /node scripts\/dast\/check-api-key-cross-field\.mjs/);
  assert.match(workflow, /--checks all/);
  assert.doesNotMatch(workflow, /--exclude-checks[^\n]*(positive_data_acceptance|all)/);
  assert.doesNotMatch(workflow, /--phases[^\n]*((?!stateful).)*$/m);
  assert.ok(existsSync(hookPath), "DAST Schemathesis hook file must exist");
  assert.ok(
    existsSync("scripts/dast/check-api-key-cross-field.mjs"),
    "live API-key cross-field smoke script must exist"
  );

  const hook = readFileSync(hookPath, "utf8");
  assert.match(hook, /def before_load_schema\(/);
  assert.match(hook, /def filter_case\(/);
  assert.match(hook, /["']\/api\/keys["']/);
  assert.match(hook, /["']\/api\/keys\/\{id\}["']/);
  assert.match(hook, /["']post["']/i);
  assert.match(hook, /["']patch["']/i);
  assert.match(hook, /\.pop\(["']allOf["'], None\)/);
  assert.match(hook, /modelAccessMode/);
  assert.match(hook, /allowedModels/);
  assert.match(hook, /connectionAccessMode/);
  assert.match(hook, /allowedConnections/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  patchBasePathLiterals,
  patchJsonManifestFile,
  patchStandaloneBasePath,
  patchProcessEnvShim,
  patchBakedAssetUrls,
} from "../../scripts/docker/patch-standalone-base-path.mjs";

test("patchBasePathLiterals rewrites empty basePath literals", () => {
  const input = 'const cfg={basePath:"",assetPrefix:void 0};"basePath":""';
  const output = patchBasePathLiterals(input, "/agentproxy");
  assert.match(output, /basePath:"\/agentproxy"/);
  assert.match(output, /"basePath":"\/agentproxy"/);
});

test("patchJsonManifestFile updates nested basePath fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-basepath-"));
  const filePath = path.join(dir, "routes-manifest.json");
  fs.writeFileSync(filePath, JSON.stringify({ basePath: "", nested: { basePath: "" } }, null, 2));
  assert.equal(patchJsonManifestFile(filePath, "/agentproxy"), true);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(parsed.basePath, "/agentproxy");
  assert.equal(parsed.nested.basePath, "/agentproxy");
});

test("patchStandaloneBasePath rewrites a root-path standalone tree", () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-standalone-"));
  const distRoot = path.join(appRoot, ".build", "next");
  fs.mkdirSync(path.join(distRoot, "server"), { recursive: true });
  fs.writeFileSync(path.join(distRoot, "routes-manifest.json"), JSON.stringify({ basePath: "" }));
  fs.writeFileSync(path.join(distRoot, "server", "chunk.js"), 'export const config={basePath:""};');
  fs.writeFileSync(path.join(appRoot, "BUILD_AGENTPROXY_BASE_PATH"), "\n");

  const result = patchStandaloneBasePath({
    appRoot,
    fromBasePath: "",
    toBasePath: "/agentproxy",
  });

  assert.equal(result.changed, true);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(distRoot, "routes-manifest.json"), "utf8")).basePath,
    "/agentproxy"
  );
  assert.match(fs.readFileSync(path.join(distRoot, "server", "chunk.js"), "utf8"), /\/agentproxy/);
});

test("patchStandaloneBasePath rejects mismatched non-root builds", () => {
  assert.throws(
    () =>
      patchStandaloneBasePath({
        appRoot: process.cwd(),
        fromBasePath: "/custom",
        toBasePath: "/agentproxy",
      }),
    /does not match the image build/
  );
});

test("patchBasePathLiterals rewrites assetPrefix literals (Next 16 SSR asset URLs)", () => {
  // Next 16 app-router renders SSR asset URLs from assetPrefix ALONE.
  assert.equal(
    patchBasePathLiterals('{"assetPrefix":""}', "/agentproxy"),
    '{"assetPrefix":"/agentproxy"}'
  );
  assert.equal(patchBasePathLiterals('assetPrefix:""', "/agentproxy"), 'assetPrefix:"/agentproxy"');
  assert.equal(
    patchBasePathLiterals("assetPrefix:void 0", "/agentproxy"),
    'assetPrefix:"/agentproxy"'
  );
  // Asset prefix must mirror the basePath so both routing and assets align.
  const mixed = patchBasePathLiterals('{"basePath":"","assetPrefix":""}', "/agentproxy");
  assert.match(mixed, /"basePath":"\/agentproxy"/);
  assert.match(mixed, /"assetPrefix":"\/agentproxy"/);
});

test("patchBasePathLiterals rewrites the NEXT_PUBLIC env mirror", () => {
  assert.equal(
    patchBasePathLiterals('{"env":{"NEXT_PUBLIC_AGENTPROXY_BASE_PATH":""}}', "/agentproxy"),
    '{"env":{"NEXT_PUBLIC_AGENTPROXY_BASE_PATH":"/agentproxy"}}'
  );
  assert.equal(
    patchBasePathLiterals('NEXT_PUBLIC_AGENTPROXY_BASE_PATH:""', "/agentproxy"),
    'NEXT_PUBLIC_AGENTPROXY_BASE_PATH:"/agentproxy"'
  );
});

test("patchProcessEnvShim populates the Turbopack client process env", () => {
  assert.equal(
    patchProcessEnvShim("o.env={},o.argv=[]", "/agentproxy"),
    'o.env={AGENTPROXY_BASE_PATH:"/agentproxy",NEXT_PUBLIC_AGENTPROXY_BASE_PATH:"/agentproxy"},o.argv=[]'
  );
  // Non-empty env objects are left untouched (never clobber baked values).
  assert.equal(patchProcessEnvShim("o.env={A:1}", "/agentproxy"), "o.env={A:1}");
});

test("patchBakedAssetUrls prefixes absolute _next/static URLs", () => {
  assert.equal(
    patchBakedAssetUrls('"/_next/static/chunks/a.js"', "/agentproxy"),
    '"/agentproxy/_next/static/chunks/a.js"'
  );
  assert.equal(
    patchBakedAssetUrls("'/_next/static/media/m.png'", "/agentproxy"),
    "'/agentproxy/_next/static/media/m.png'"
  );
  // Already-prefixed URLs are stable.
  assert.equal(
    patchBakedAssetUrls('"/agentproxy/_next/static/a.js"', "/agentproxy"),
    '"/agentproxy/_next/static/a.js"'
  );
});

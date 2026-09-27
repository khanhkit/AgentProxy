import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "config/quality/native-legacy-route-policy-parity.json");
const DOC_PATH = path.join(ROOT, "docs/architecture/NATIVE_LEGACY_ROUTE_POLICY_PARITY.md");

const REQUIRED_CONTROLS = [
  "authentication",
  "endpoint_scope",
  "request_body",
  "redirects_headers",
  "errors",
  "rate_cooldown",
  "logging",
] as const;

const ALLOWED_DISPOSITIONS = new Set(["equivalent", "intentional_difference", "delegated"]);
const REQUIRED_PROTECTED_INVARIANTS = ["routing_selector_authority", "trusted_locality"] as const;

type Evidence = {
  path: string;
  needle: string;
  runner: string;
};

type SurfaceContract = {
  owner: string;
  contract: string;
  evidence: Evidence[];
};

type ControlContract = {
  id: string;
  disposition: string;
  rationale: string;
  native: SurfaceContract;
  legacy: SurfaceContract;
};

type SourceGuard = {
  path: string;
  needle: string;
};

type ProtectedInvariant = {
  id: string;
  contract: string;
  evidence: Evidence[];
};

type ParityManifest = {
  schemaVersion: number;
  routeFamily: string;
  canonicalPath: string;
  aliases: string[];
  requiredControls: string[];
  controls: ControlContract[];
  protectedInvariants: ProtectedInvariant[];
  sourceGuards: SourceGuard[];
};

function readManifest(): ParityManifest {
  assert.equal(
    fs.existsSync(MANIFEST_PATH),
    true,
    "AP-ISS-0091 requires a machine-readable native-vs-legacy parity manifest"
  );
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ParityManifest;
}

function assertEvidence(evidence: Evidence, surface: string, control: string): void {
  const absolutePath = path.join(ROOT, evidence.path);
  assert.equal(
    fs.existsSync(absolutePath),
    true,
    `${control}/${surface} evidence file must exist: ${evidence.path}`
  );
  const source = fs.readFileSync(absolutePath, "utf8");
  assert.equal(
    source.includes(evidence.needle),
    true,
    `${control}/${surface} evidence locator must remain executable/discoverable: ${evidence.needle}`
  );
  assert.ok(evidence.runner.trim().length > 0, `${control}/${surface} evidence needs a runner`);
}

test("AP-ISS-0091 parity manifest covers every required native-vs-legacy policy control", () => {
  const manifest = readManifest();

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.routeFamily, "responses");
  assert.equal(manifest.canonicalPath, "/v1/responses");
  assert.deepEqual(new Set(manifest.requiredControls), new Set(REQUIRED_CONTROLS));
  assert.deepEqual(
    new Set(manifest.controls.map((control) => control.id)),
    new Set(REQUIRED_CONTROLS),
    "every required control must have exactly one parity contract row"
  );

  for (const control of manifest.controls) {
    assert.equal(
      ALLOWED_DISPOSITIONS.has(control.disposition),
      true,
      `${control.id} must classify parity as equivalent, intentional_difference, or delegated`
    );
    assert.ok(
      control.rationale.trim().length > 0,
      `${control.id} must explain its parity disposition`
    );

    for (const [surface, contract] of [
      ["native", control.native],
      ["legacy", control.legacy],
    ] as const) {
      assert.ok(contract.owner.trim().length > 0, `${control.id}/${surface} needs an owner`);
      assert.ok(contract.contract.trim().length > 0, `${control.id}/${surface} needs a contract`);
      assert.ok(contract.evidence.length > 0, `${control.id}/${surface} needs executable evidence`);
      for (const evidence of contract.evidence) assertEvidence(evidence, surface, control.id);
    }
  }

  const controls = new Map(manifest.controls.map((control) => [control.id, control]));
  assert.equal(controls.get("authentication")?.disposition, "equivalent");
  assert.equal(controls.get("endpoint_scope")?.disposition, "equivalent");

  const body = controls.get("request_body");
  assert.equal(body?.disposition, "intentional_difference");
  assert.match(body?.native.contract ?? "", /16 MiB/);
  assert.match(body?.legacy.contract ?? "", /50 MiB/);

  const logging = controls.get("logging");
  assert.equal(logging?.disposition, "intentional_difference");
  assert.match(logging?.native.contract ?? "", /does not persist/i);
  assert.match(logging?.legacy.contract ?? "", /call_logs|usage_history/);
});

test("AP-ISS-0091 explicitly preserves routing-selector authority and trusted-locality invariants", () => {
  const manifest = readManifest();
  assert.deepEqual(
    new Set(manifest.protectedInvariants.map((invariant) => invariant.id)),
    new Set(REQUIRED_PROTECTED_INVARIANTS),
    "protected routing-selector/locality invariants must remain explicit in the parity contract"
  );

  for (const invariant of manifest.protectedInvariants) {
    assert.ok(invariant.contract.trim().length > 0, `${invariant.id} needs a contract`);
    assert.ok(invariant.evidence.length > 0, `${invariant.id} needs executable evidence`);
    for (const evidence of invariant.evidence) {
      assertEvidence(evidence, "protected", invariant.id);
    }
  }
});

test("AP-ISS-0091 parity contract pins the known Responses routing aliases and source seams", () => {
  const manifest = readManifest();

  for (const alias of ["/v1/responses", "/responses", "/codex", "/codex/*"]) {
    assert.equal(
      manifest.aliases.includes(alias),
      true,
      `missing Responses alias contract: ${alias}`
    );
  }

  for (const guard of manifest.sourceGuards) {
    const absolutePath = path.join(ROOT, guard.path);
    assert.equal(fs.existsSync(absolutePath), true, `source guard path must exist: ${guard.path}`);
    const source = fs.readFileSync(absolutePath, "utf8");
    assert.equal(
      source.includes(guard.needle),
      true,
      `route/security seam drifted: ${guard.path} no longer contains ${guard.needle}`
    );
  }
});

test("AP-ISS-0091 architecture documentation keeps intentional differences visible", () => {
  assert.equal(
    fs.existsSync(DOC_PATH),
    true,
    "AP-ISS-0091 requires an architecture parity document"
  );
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.match(doc, /native-legacy-route-policy-parity\.json/);
  assert.match(doc, /equivalent/i);
  assert.match(doc, /intentional difference/i);
  assert.match(doc, /delegated/i);
  for (const control of REQUIRED_CONTROLS) {
    assert.equal(doc.includes(`\`${control}\``), true, `documentation must cover ${control}`);
  }
});

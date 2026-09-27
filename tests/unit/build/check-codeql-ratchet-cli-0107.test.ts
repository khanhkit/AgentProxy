import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/check/check-codeql-ratchet.mjs");

type RunOptions = {
  enforce?: boolean;
  expectedSha?: string | null;
  expectedRef?: string | null;
  prNumber?: number | null;
  analysisSha?: string;
  analysisRef?: string;
  alerts?: unknown[];
  analysisApiError?: boolean;
};

function runCli(options: RunOptions = {}) {
  const fakeDir = mkdtempSync(join(tmpdir(), "ap0107-gh-"));
  const ghPath = join(fakeDir, "gh");
  const fakeGh = `#!/usr/bin/env node
const args = process.argv.slice(2);
const joined = args.join(" ");

if (args[0] === "repo" && args[1] === "view") {
  process.stdout.write("owner/repo\\n");
  process.exit(0);
}

if (args[0] === "api" && joined.includes("/code-scanning/analyses?")) {
  if (process.env.FAKE_ANALYSIS_API_ERROR === "1") {
    process.stderr.write("HTTP 503 synthetic analysis failure\\n");
    process.exit(1);
  }

  process.stdout.write(JSON.stringify([
    {
      tool: { name: "CodeQL" },
      ref: process.env.FAKE_ANALYSIS_REF,
      commit_sha: process.env.FAKE_ANALYSIS_SHA,
      category: "/language:javascript-typescript",
    },
  ]));
  process.exit(0);
}

if (args[0] === "api" && joined.includes("/code-scanning/alerts?")) {
  process.stdout.write(process.env.FAKE_ALERTS_JSON || "[]");
  process.exit(0);
}

process.stderr.write("unexpected fake gh invocation: " + joined + "\\n");
process.exit(2);
`;

  writeFileSync(ghPath, fakeGh, "utf8");
  chmodSync(ghPath, 0o755);

  const expectedSha = options.expectedSha === undefined ? "fresh-sha" : options.expectedSha;
  const expectedRef = options.expectedRef === undefined ? "refs/heads/main" : options.expectedRef;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${fakeDir}:${process.env.PATH ?? ""}`,
    FAKE_ANALYSIS_SHA: options.analysisSha ?? "fresh-sha",
    FAKE_ANALYSIS_REF: options.analysisRef ?? "refs/heads/main",
    FAKE_ALERTS_JSON: JSON.stringify(options.alerts ?? []),
    FAKE_ANALYSIS_API_ERROR: options.analysisApiError ? "1" : "0",
  };

  if (options.enforce) env.CODEQL_RATCHET_ENFORCE = "1";
  else delete env.CODEQL_RATCHET_ENFORCE;

  if (expectedSha) env.CODEQL_EXPECTED_SHA = expectedSha;
  else delete env.CODEQL_EXPECTED_SHA;

  if (expectedRef) env.CODEQL_EXPECTED_REF = expectedRef;
  else delete env.CODEQL_EXPECTED_REF;

  if (options.prNumber) env.CODEQL_PR_NUMBER = String(options.prNumber);
  else delete env.CODEQL_PR_NUMBER;

  try {
    return spawnSync(process.execPath, [SCRIPT, "--quiet"], {
      cwd: ROOT,
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
  } finally {
    rmSync(fakeDir, { recursive: true, force: true });
  }
}

test("AP-0107 CLI: exact fresh main analysis passes without global-debt blocking", () => {
  const result = runCli({ enforce: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codeqlFreshness=FRESH/);
  assert.match(result.stdout, /codeqlPrAlerts=SKIP reason=no-pr/);
  assert.match(result.stdout, /codeqlGate=PASS reason=ok/);
});

test("AP-0107 CLI: clean PR passes with zero PR-associated alerts", () => {
  const result = runCli({
    enforce: true,
    prNumber: 42,
    alerts: [],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codeqlPrAlerts=0 pr=42/);
  assert.match(result.stdout, /codeqlGate=PASS reason=ok/);
});

test("AP-0107 CLI: PR-associated CodeQL finding fails closed", () => {
  const result = runCli({
    enforce: true,
    prNumber: 42,
    alerts: [
      {
        state: "open",
        tool: { name: "CodeQL" },
        rule: {
          id: "js/request-forgery",
          severity: "error",
          security_severity_level: "high",
        },
      },
    ],
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /codeqlPrAlerts=1 pr=42/);
  assert.match(result.stdout, /codeqlGate=FAIL reason=pr-alerts/);
});

test("AP-0107 CLI: missing exact freshness context fails closed", () => {
  const result = runCli({
    enforce: true,
    expectedSha: null,
    expectedRef: null,
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /codeqlGate=FAIL reason=missing-freshness-context/);
});

test("AP-0107 CLI: analysis API failure fails closed in enforcement mode", () => {
  const result = runCli({
    enforce: true,
    analysisApiError: true,
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /codeqlGate=FAIL reason=api-error:503/);
});

test("AP-0107 CLI: repository-wide debt remains advisory telemetry", () => {
  const alerts = [
    {
      state: "open",
      tool: { name: "CodeQL" },
      rule: { id: "js/a", severity: "error", security_severity_level: "high" },
    },
    {
      state: "open",
      tool: { name: "CodeQL" },
      rule: { id: "js/b", severity: "warning", security_severity_level: "medium" },
    },
  ];

  const result = runCli({ alerts });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codeqlAlerts=2/);
  assert.match(result.stdout, /codeqlGate=ADVISORY reason=repository-telemetry/);
});

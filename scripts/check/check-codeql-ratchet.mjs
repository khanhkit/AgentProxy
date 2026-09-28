#!/usr/bin/env node
// scripts/check/check-codeql-ratchet.mjs
// AP-ISS-0107 CodeQL freshness / PR-regression gate.
//
// Default mode is repository-wide TELEMETRY only: it reports open, non-dismissed
// CodeQL debt but never treats the historical global count as a merge threshold.
//
// Authoritative enforcement is enabled only with CODEQL_RATCHET_ENFORCE=1 and is
// intended to run immediately after github/codeql-action/analyze in codeql.yml.
// It fails closed unless a CodeQL analysis matches CODEQL_EXPECTED_SHA +
// CODEQL_EXPECTED_REF exactly. On pull requests it additionally blocks any open
// CodeQL alerts associated with CODEQL_PR_NUMBER via GitHub's `pr=` API filter.
//
// Output examples:
//   codeqlAlerts=132
//   codeqlGate=ADVISORY reason=repository-telemetry
//   codeqlFreshness=FRESH expectedSha=<sha> expectedRef=<ref>
//   codeqlPrAlerts=0 pr=42
//   codeqlGate=PASS reason=ok
//
// Usage:
//   node scripts/check/check-codeql-ratchet.mjs
//   node scripts/check/check-codeql-ratchet.mjs --json
//   CODEQL_RATCHET_ENFORCE=1 CODEQL_EXPECTED_SHA=... CODEQL_EXPECTED_REF=... node scripts/check/check-codeql-ratchet.mjs

import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const QUIET = process.argv.includes("--quiet");
const PRINT_JSON = process.argv.includes("--json");
const ENFORCE = process.env.CODEQL_RATCHET_ENFORCE === "1";
const EXPECTED_SHA = process.env.CODEQL_EXPECTED_SHA?.trim() || null;
const EXPECTED_REF = process.env.CODEQL_EXPECTED_REF?.trim() || null;
const PULL_REQUEST_NUMBER = parsePullRequestNumber(process.env.CODEQL_PR_NUMBER);

// ---------------------------------------------------------------------------
// Pure parsing function (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Conta alertas CodeQL abertos e não-dismissed a partir do JSON da GitHub API.
 *
 * A GitHub API /code-scanning/alerts retorna um array de:
 * {
 *   number: number,
 *   state: "open" | "dismissed" | "fixed",
 *   dismissed_reason: string | null,
 *   dismissed_at: string | null,
 *   tool: { name: string, ... },
 *   rule: { id: string, severity: string, security_severity_level?: string, ... },
 *   ...
 * }
 *
 * Hard Rule #14: alertas com `state="dismissed"` NÃO contam, independente da razão.
 * Filtramos por state="open" E tool.name contendo "CodeQL" (case-insensitive).
 * Alertas de outras ferramentas (ex: Semgrep) são ignorados.
 *
 * @param {Array|null} alerts - Array de alertas da API GitHub
 * @returns {{ alertCount: number, bySeverity: Record<string, number>, byRule: Record<string, number> }}
 */
export function parseCodeQLAlerts(alerts) {
  if (!Array.isArray(alerts)) {
    return { alertCount: 0, bySeverity: {}, byRule: {} };
  }

  let alertCount = 0;
  const bySeverity = {};
  const byRule = {};

  for (const alert of alerts) {
    // Ignorar alertas não-CodeQL (outras ferramentas de code scanning)
    const toolName = alert?.tool?.name ?? "";
    if (!toolName.toLowerCase().includes("codeql")) continue;

    // Hard Rule #14: alertas dismissed não contam
    if (alert.state === "dismissed") continue;

    // Só alertas abertos
    if (alert.state !== "open") continue;

    alertCount++;

    // Coletar por severidade (security_severity_level ou severity da rule)
    const severity = (
      alert?.rule?.security_severity_level ??
      alert?.rule?.severity ??
      "unknown"
    ).toLowerCase();
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;

    // Coletar por rule ID
    const ruleId = alert?.rule?.id ?? "unknown";
    byRule[ruleId] = (byRule[ruleId] ?? 0) + 1;
  }

  return { alertCount, bySeverity, byRule };
}

/**
 * Return the exact CodeQL analysis proving the current workflow ref/SHA was scanned.
 * Repository-wide "latest" analysis is not sufficient because it can be stale.
 *
 * @param {Array|null} analyses
 * @param {string|null} expectedSha
 * @param {string|null} expectedRef
 * @returns {object|null}
 */
export function findFreshCodeqlAnalysis(analyses, expectedSha, expectedRef) {
  if (!Array.isArray(analyses) || !expectedSha || !expectedRef) return null;
  return (
    analyses.find((analysis) => {
      const toolName = analysis?.tool?.name ?? "";
      return (
        toolName.toLowerCase().includes("codeql") &&
        analysis?.commit_sha === expectedSha &&
        analysis?.ref === expectedRef
      );
    }) ?? null
  );
}

/**
 * Evaluate the authoritative post-analysis gate.
 * Historical repository-wide alerts are intentionally excluded from blocking.
 *
 * @param {{
 *   freshAnalysis: boolean,
 *   pullRequestNumber: number|null,
 *   pullRequestAlertCount: number|null
 * }} input
 * @returns {{blocked: boolean, reason: "ok"|"stale-analysis"|"pr-alerts"}}
 */
export function evaluateCodeqlGate({ freshAnalysis, pullRequestNumber, pullRequestAlertCount }) {
  if (!freshAnalysis) return { blocked: true, reason: "stale-analysis" };
  if (pullRequestNumber !== null && (pullRequestAlertCount ?? 0) > 0) {
    return { blocked: true, reason: "pr-alerts" };
  }
  return { blocked: false, reason: "ok" };
}

function parsePullRequestNumber(value) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// ---------------------------------------------------------------------------
// Repository detection
// ---------------------------------------------------------------------------

/**
 * Detecta o owner/repo do repositório atual usando `gh repo view`.
 * Retorna null se `gh` não estiver disponível ou não autenticado.
 *
 * @param {string} ghBin - Caminho para o binário gh
 * @returns {string|null} "owner/repo" ou null
 */
export function detectRepo(ghBin) {
  try {
    const stdout = execFileSync(
      ghBin,
      ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
      {
        encoding: "utf8",
        timeout: 15_000,
      }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------

/**
 * Detecta se o binário `gh` está disponível no PATH.
 * Usa `which` (Unix) sem interpolação de shell — Hard Rule #13.
 *
 * @returns {string|null} Caminho absoluto para o binário, ou null se ausente.
 */
export function findGhCli() {
  try {
    const result = spawnSync("which", ["gh"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
  } catch {
    // which não disponível
  }

  // Fallback: tentar executar diretamente para verificar ENOENT
  try {
    const result = spawnSync("gh", ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (result.error?.code === "ENOENT") return null;
    if (result.status !== null) return "gh"; // found in PATH
  } catch {
    // noop
  }

  return null;
}

// ---------------------------------------------------------------------------
// API caller
// ---------------------------------------------------------------------------

/**
 * Busca alertas CodeQL abertos via `gh api`.
 * Pagina automaticamente (GitHub retorna max 100 por página).
 *
 * @param {string} ghBin - Caminho para o binário gh
 * @param {string} repo  - "owner/repo"
 * @returns {Array} Array de alertas
 */
function fetchCodeQLAlerts(ghBin, repo, pullRequestNumber = null) {
  const allAlerts = [];
  let page = 1;
  const perPage = 100;
  const prFilter = pullRequestNumber === null ? "" : `&pr=${pullRequestNumber}`;

  while (true) {
    const endpoint = `/repos/${repo}/code-scanning/alerts?state=open&tool_name=CodeQL${prFilter}&per_page=${perPage}&page=${page}`;

    if (!QUIET) {
      const scope = pullRequestNumber === null ? "repository" : `PR #${pullRequestNumber}`;
      process.stderr.write(`[codeql-ratchet] Fetching ${scope} alerts: page ${page} ...\n`);
    }

    let stdout;
    try {
      stdout = execFileSync(ghBin, ["api", endpoint], {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (err) {
      const errMsg = String(err.stderr ?? err.message ?? "");
      if (
        errMsg.includes("authentication") ||
        errMsg.includes("401") ||
        errMsg.includes("not logged")
      ) {
        return { error: "no-auth", message: errMsg };
      }
      const codeMatch = /HTTP (\d{3})/.exec(errMsg);
      const code = codeMatch ? codeMatch[1] : "unknown";
      return { error: `api-error:${code}`, message: errMsg };
    }

    let pageAlerts;
    try {
      pageAlerts = JSON.parse(stdout);
    } catch (parseErr) {
      return { error: "parse-error", message: String(parseErr.message ?? parseErr) };
    }

    if (!Array.isArray(pageAlerts) || pageAlerts.length === 0) break;
    allAlerts.push(...pageAlerts);
    if (pageAlerts.length < perPage) break;
    page++;
  }

  return allAlerts;
}

function fetchCodeQLAnalyses(ghBin, repo, expectedRef) {
  const endpoint = `/repos/${repo}/code-scanning/analyses?tool_name=CodeQL&ref=${encodeURIComponent(expectedRef)}&per_page=100`;
  let stdout;
  try {
    stdout = execFileSync(ghBin, ["api", endpoint], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const errMsg = String(err.stderr ?? err.message ?? "");
    const codeMatch = /HTTP (\d{3})/.exec(errMsg);
    const code = codeMatch ? codeMatch[1] : "unknown";
    return { error: `api-error:${code}`, message: errMsg };
  }

  try {
    const analyses = JSON.parse(stdout);
    return Array.isArray(analyses)
      ? analyses
      : { error: "parse-error", message: "analyses response was not an array" };
  } catch (parseErr) {
    return { error: "parse-error", message: String(parseErr.message ?? parseErr) };
  }
}

// ---------------------------------------------------------------------------
// Authoritative freshness / PR-relative enforcement
// ---------------------------------------------------------------------------

function emitAlertSummary(alertCount, bySeverity, byRule, label) {
  if (QUIET) return;
  const severitySummary =
    Object.entries(bySeverity)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "none";
  const topRules =
    Object.entries(byRule)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 5)
      .map(([rule, count]) => `${rule}(${count})`)
      .join(", ") || "none";

  process.stderr.write(`[codeql-ratchet] ${label}: ${alertCount}\n`);
  if (alertCount > 0) {
    process.stderr.write(`[codeql-ratchet]   severity: ${severitySummary}\n`);
    process.stderr.write(`[codeql-ratchet]   top rules: ${topRules}\n`);
  }
}

function failEnforcement(reason, message) {
  console.log(`codeqlGate=FAIL reason=${reason}`);
  if (!QUIET && message) {
    process.stderr.write(`[codeql-ratchet] FAIL — ${message}\n`);
  }
  process.exitCode = 1;
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function pollFreshCodeqlAnalysis(ghBin, repo, expectedSha, expectedRef) {
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = fetchCodeQLAnalyses(ghBin, repo, expectedRef);
    if (!Array.isArray(result)) return result;

    const fresh = findFreshCodeqlAnalysis(result, expectedSha, expectedRef);
    if (fresh) return fresh;

    if (attempt < attempts) {
      if (!QUIET) {
        process.stderr.write(
          `[codeql-ratchet] waiting for analysis visibility (${attempt}/${attempts}) ...\n`
        );
      }
      sleepSync(5_000);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const ghBin = findGhCli();

  if (!ghBin) {
    console.log("codeqlAlerts=SKIP reason=binary-absent");
    if (ENFORCE) {
      failEnforcement(
        "binary-absent",
        "gh CLI is required in authoritative CodeQL enforcement mode"
      );
    } else {
      if (!QUIET) {
        process.stderr.write(
          "[codeql-ratchet] SKIP — gh CLI is unavailable; repository-wide telemetry is advisory.\n"
        );
      }
      process.exitCode = 0;
    }
    return;
  }

  const repo = detectRepo(ghBin);
  if (!repo) {
    console.log("codeqlAlerts=SKIP reason=no-repo");
    if (ENFORCE) {
      failEnforcement(
        "no-repo",
        "repository identity is required in authoritative CodeQL enforcement mode"
      );
    } else {
      process.exitCode = 0;
    }
    return;
  }

  if (!QUIET) {
    process.stderr.write(`[codeql-ratchet] repository: ${repo}\n`);
  }

  if (ENFORCE) {
    if (!EXPECTED_SHA || !EXPECTED_REF) {
      failEnforcement(
        "missing-freshness-context",
        "CODEQL_EXPECTED_SHA and CODEQL_EXPECTED_REF are required"
      );
      return;
    }

    const fresh = pollFreshCodeqlAnalysis(ghBin, repo, EXPECTED_SHA, EXPECTED_REF);
    if (fresh && !Array.isArray(fresh) && fresh.error) {
      failEnforcement(
        fresh.error,
        `unable to read CodeQL analyses: ${String(fresh.message ?? "").slice(0, 200)}`
      );
      return;
    }

    const isFresh = Boolean(fresh);
    console.log(
      `codeqlFreshness=${isFresh ? "FRESH" : "STALE"} expectedSha=${EXPECTED_SHA} expectedRef=${EXPECTED_REF}`
    );

    if (!isFresh) {
      failEnforcement(
        "stale-analysis",
        `no CodeQL analysis matches ${EXPECTED_REF}@${EXPECTED_SHA}`
      );
      return;
    }

    let pullRequestAlertCount = null;
    if (PULL_REQUEST_NUMBER !== null) {
      const result = fetchCodeQLAlerts(ghBin, repo, PULL_REQUEST_NUMBER);
      if (!Array.isArray(result)) {
        failEnforcement(
          result.error,
          `unable to read PR CodeQL alerts: ${String(result.message ?? "").slice(0, 200)}`
        );
        return;
      }

      if (PRINT_JSON) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      }

      const { alertCount, bySeverity, byRule } = parseCodeQLAlerts(result);
      pullRequestAlertCount = alertCount;
      console.log(`codeqlPrAlerts=${alertCount} pr=${PULL_REQUEST_NUMBER}`);
      emitAlertSummary(
        alertCount,
        bySeverity,
        byRule,
        `open CodeQL alerts associated with PR #${PULL_REQUEST_NUMBER}`
      );
    } else {
      console.log("codeqlPrAlerts=SKIP reason=no-pr");
    }

    const verdict = evaluateCodeqlGate({
      freshAnalysis: true,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestAlertCount,
    });

    if (verdict.blocked) {
      failEnforcement(
        verdict.reason,
        verdict.reason === "pr-alerts"
          ? `PR #${PULL_REQUEST_NUMBER} introduces open CodeQL alerts`
          : "CodeQL analysis is not fresh"
      );
      return;
    }

    console.log("codeqlGate=PASS reason=ok");
    process.exitCode = 0;
    return;
  }

  // Advisory/metrics mode used by legacy quality collectors. The global open
  // alert count remains visible debt inventory, but it is NOT a merge threshold.
  const result = fetchCodeQLAlerts(ghBin, repo);
  if (!Array.isArray(result)) {
    const { error, message } = result;
    console.log(`codeqlAlerts=SKIP reason=${error}`);
    if (!QUIET) {
      process.stderr.write(
        `[codeql-ratchet] SKIP — unable to measure repository CodeQL debt: ${String(message).slice(0, 200)}\n`
      );
    }
    process.exitCode = 0;
    return;
  }

  if (PRINT_JSON) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const { alertCount, bySeverity, byRule } = parseCodeQLAlerts(result);
  console.log(`codeqlAlerts=${alertCount}`);
  console.log("codeqlGate=ADVISORY reason=repository-telemetry");
  emitAlertSummary(alertCount, bySeverity, byRule, "repository-wide open CodeQL telemetry");
  process.exitCode = 0;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();

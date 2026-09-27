#!/usr/bin/env node
/**
 * AgentProxy — Docs translation pipeline (hash-based, incremental).
 *
 * Source of truth: `config/i18n.json` (locale list) and the original English
 * markdown files at the repo root (`CLAUDE.md`, `GEMINI.md`, `README.md`, …)
 * plus `docs/*.md`.
 *
 * Targets land in `docs/i18n/<locale>/...` mirroring the source layout, with a
 * header (top H1 + language bar) and an `---` separator before the translated
 * body. This is the same shape the existing `check-docs-sync.mjs` already
 * understands.
 *
 * State: `.i18n-state.json` stores a SHA-256 hash for every source file and
 * for every produced target. Re-runs only retranslate files whose source hash
 * changed or whose target file is missing.
 *
 * Usage (driven by npm scripts in package.json):
 *   npm run i18n:run
 *   npm run i18n:run -- --locale=pt-BR
 *   npm run i18n:run -- --files=CLAUDE.md,docs/ARCHITECTURE.md
 *   npm run i18n:run -- --force
 *   npm run i18n:run:dry
 *   npm run i18n:run -- --adopt   (rebuild .i18n-state.json from disk, no API calls)
 *   npm run i18n:run -- --adopt --targets-only
 *                                 (re-hash only the mirrors on disk, keeping every
 *                                  source_hash — mechanical mirror rewrites stop
 *                                  showing up as `target changed` while genuine
 *                                  source drift is still reported)
 *
 * Backend (configured via env, never committed):
 *   AGENTPROXY_TRANSLATION_API_URL     e.g. https://cloud.agentproxy.dev/v1
 *   AGENTPROXY_TRANSLATION_API_KEY     bearer token (kept out of logs)
 *   AGENTPROXY_TRANSLATION_MODEL       e.g. cx/gpt-5.6-sol
 *   AGENTPROXY_TRANSLATION_TIMEOUT_MS  optional, default 60000
 *   AGENTPROXY_TRANSLATION_CONCURRENCY optional, default 4
 */

import { promises as fs, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeLocaleText } from "./glossary-normalize.mjs";
import { buildMirrorBar } from "./lib/language-bar.mjs";
import { adoptState, mergeAdoptedState, refreshTargetHashes } from "./lib/translation-state.mjs";

// ----- .env loader --------------------------------------------------------
// Loads variables from a local `.env` (gitignored) into process.env without
// pulling dotenv as a dependency. Already-set env vars take precedence so the
// shell / CI environment can still override.
(function loadDotEnv() {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    /* ignore — script will fall back to the requireEnv error path */
  }
})();

// Prettier is loaded lazily on first use so the script still runs (with a
// warning) in environments where node_modules has not been installed. The
// formatter is applied to every translated file before its hash is recorded,
// so a subsequent lint-staged Prettier pass cannot mutate the file content
// out from under `.i18n-state.json`.
let prettierMod = null;
async function getPrettier() {
  if (prettierMod !== null) return prettierMod;
  try {
    prettierMod = await import("prettier");
  } catch {
    prettierMod = false;
  }
  return prettierMod;
}

async function formatMarkdown(content, fileName) {
  const p = await getPrettier();
  if (!p) return content;
  try {
    return await p.format(content, { parser: "markdown", filepath: fileName });
  } catch (err) {
    logWarn(`prettier could not format ${fileName}: ${err.message}`);
    return content;
  }
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const CONFIG_PATH = path.join(ROOT, "config", "i18n.json");
const STATE_PATH = path.join(ROOT, ".i18n-state.json");
const DOCS_I18N_DIR = path.join(ROOT, "docs", "i18n");
const DOCS_DIR = path.join(ROOT, "docs");

// ----- Source set ----------------------------------------------------------
//
// Root-level user-facing markdown files translated as `docs/i18n/<loc>/<name>`.
// Strict-mirror files (`llm.txt`, `CHANGELOG.md`) are intentionally NOT in this
// list — they are handled by `scripts/check-docs-sync.mjs` rules and are kept
// in sync by other tooling. Adding them here would conflict with that script.
const ROOT_DOC_SOURCES = ["CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md", "README.md"];

// File names inside `docs/` that should NOT be translated. Anything else with
// a `.md` extension at the top of `docs/` is treated as a source.
const DOCS_EXCLUDED_NAMES = new Set([
  "I18N.md", // Translator tooling docs — kept English-only for operators.
  "README.md", // Section index files — auto-generated, not prose translation targets.
]);

// Sub-trees we never recurse into when collecting sources.
const DOCS_EXCLUDED_SUBDIRS = new Set([
  "i18n",
  "screenshots",
  "superpowers",
  "diagrams",
  "reports",
]);

// ----- Helpers -------------------------------------------------------------

function logInfo(...parts) {
  console.log("[i18n-run]", ...parts);
}

function logWarn(...parts) {
  console.warn("[i18n-run] WARN", ...parts);
}

function logError(...parts) {
  console.error("[i18n-run] ERROR", ...parts);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const opts = {
    locales: null,
    files: null,
    force: false,
    dryRun: false,
    adopt: false,
    targetsOnly: false,
    concurrency: null,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run" || arg === "--dryrun") opts.dryRun = true;
    else if (arg === "--adopt") opts.adopt = true;
    else if (arg === "--targets-only") opts.targetsOnly = true;
    else if (arg.startsWith("--locale="))
      opts.locales = arg
        .slice(9)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (arg.startsWith("--locales="))
      opts.locales = arg
        .slice(10)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (arg.startsWith("--files="))
      opts.files = arg
        .slice(8)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (arg.startsWith("--concurrency=")) opts.concurrency = Number(arg.slice(14));
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/i18n/run-translation.mjs [options]",
          "",
          "  --locale=<csv>       Target locales (default: all except `en`)",
          "  --files=<csv>        Relative paths to translate (default: all sources)",
          "  --force              Retranslate even when hashes match",
          "  --dry-run            Report what would happen but never call the API",
          "  --adopt              Rebuild .i18n-state.json from the files on disk (no API calls)",
          "  --targets-only       With --adopt: re-hash only the mirrors, keeping every source_hash",
          "  --concurrency=<n>    Parallel API requests (default: env CONCURRENCY or 4)",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  return opts;
}

async function loadConfig() {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.default || !Array.isArray(cfg.locales)) {
    throw new Error("config/i18n.json: invalid shape (need `default` and `locales[]`)");
  }
  return cfg;
}

// An unreadable state is an error, never "start fresh": a runner that read the file while
// another one was rewriting it saw "" or a JSON prefix, started from { sources: {} } and wrote
// back only its own entries — the state went from 153 sources to 1 (2026-09-24).
export function parseStateText(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`translation state is not valid JSON (${err.message})`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.sources) {
    throw new Error("translation state has no `sources` object");
  }
  return parsed;
}

async function loadState() {
  if (!existsSync(STATE_PATH)) return { sources: {} };
  return parseStateText(await fs.readFile(STATE_PATH, "utf8"));
}

// Write to a temp file and rename it over the state, so a concurrent reader (or a runner
// killed mid-write) never sees a truncated file.
export async function writeStateAtomic(filePath, state) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

async function saveState(state) {
  await writeStateAtomic(STATE_PATH, state);
}

export function mergeStateUpdates(existing, touched, snapshot = { sources: {} }) {
  const merged = structuredClone(existing ?? snapshot ?? { sources: {} });
  merged.sources ||= {};
  for (const { rel, locale, sourceHash, record } of touched) {
    const entry = merged.sources[rel] ?? { source_hash: sourceHash, locales: {} };
    entry.source_hash = sourceHash;
    entry.locales ||= {};
    entry.locales[locale] = { ...record };
    merged.sources[rel] = entry;
  }
  return merged;
}

async function collectDocsSources() {
  const found = [];
  for (const entry of await fs.readdir(DOCS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md") && !DOCS_EXCLUDED_NAMES.has(entry.name)) {
      found.push(`docs/${entry.name}`);
    } else if (entry.isDirectory() && !DOCS_EXCLUDED_SUBDIRS.has(entry.name)) {
      // Recurse one level for organized doc groups (e.g. docs/features/*.md).
      const sub = path.join(DOCS_DIR, entry.name);
      for (const child of await fs.readdir(sub, { withFileTypes: true })) {
        if (
          child.isFile() &&
          child.name.endsWith(".md") &&
          !DOCS_EXCLUDED_NAMES.has(child.name) &&
          child.name.toLowerCase() !== "readme.md"
        ) {
          found.push(`docs/${entry.name}/${child.name}`);
        }
      }
    }
  }
  return found;
}

async function collectAllSources() {
  const rootSources = [];
  for (const name of ROOT_DOC_SOURCES) {
    const abs = path.join(ROOT, name);
    if (existsSync(abs)) rootSources.push(name);
  }
  const docsSources = await collectDocsSources();
  return [...rootSources, ...docsSources].sort();
}

function targetPathFor(relSource, locale) {
  // Root MDs (`CLAUDE.md`, …) → `docs/i18n/<loc>/CLAUDE.md`
  if (!relSource.includes("/")) {
    return path.join(DOCS_I18N_DIR, locale, relSource);
  }
  // `docs/X.md` → `docs/i18n/<loc>/docs/X.md`
  // `docs/features/Y.md` → `docs/i18n/<loc>/docs/features/Y.md`
  return path.join(DOCS_I18N_DIR, locale, relSource);
}

function extractTopHeading(markdown) {
  const m = markdown.match(/^# (.+)\r?\n/);
  return m ? m[1].trim() : null;
}

function stripTopHeading(markdown) {
  return markdown.replace(/^# .+\r?\n+/, "");
}

// ----- Translator backend --------------------------------------------------

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required env var: ${name}. Set it in .env (see docs/guides/I18N.md → "Translation pipeline").`
    );
  }
  return v.trim();
}

function backendConfig() {
  const apiUrl = requireEnv("AGENTPROXY_TRANSLATION_API_URL").replace(/\/$/, "");
  const apiKey = requireEnv("AGENTPROXY_TRANSLATION_API_KEY");
  const model = requireEnv("AGENTPROXY_TRANSLATION_MODEL");
  const timeoutMs = Number(process.env.AGENTPROXY_TRANSLATION_TIMEOUT_MS || 60000);
  return { apiUrl, apiKey, model, timeoutMs };
}

async function callChat(messages, { apiUrl, apiKey, model, timeoutMs }, retry = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.15,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const transient = res.status === 408 || res.status === 429 || res.status >= 500;
      if (transient && retry < 1) {
        const wait = 1500 + retry * 1500;
        logWarn(`upstream ${res.status} — retrying after ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        return callChat(messages, { apiUrl, apiKey, model, timeoutMs }, retry + 1);
      }
      throw new Error(`upstream ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content) {
      throw new Error("upstream returned empty content");
    }
    return content;
  } catch (err) {
    if (err?.name === "AbortError") {
      if (retry < 1) {
        logWarn(`timeout after ${timeoutMs}ms — retrying`);
        return callChat(messages, { apiUrl, apiKey, model, timeoutMs }, retry + 1);
      }
      throw new Error(`timeout after ${timeoutMs}ms`);
    }
    if (
      retry < 1 &&
      err instanceof TypeError &&
      /fetch failed|ECONN|ENOTFOUND|network/i.test(String(err.cause ?? err.message))
    ) {
      logWarn(`network error: ${err.message} — retrying`);
      await new Promise((r) => setTimeout(r, 1500));
      return callChat(messages, { apiUrl, apiKey, model, timeoutMs }, retry + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = (englishName, native) =>
  [
    `You are a professional translator for technical software documentation.`,
    `Translate the user's markdown content into ${englishName} (native: ${native}).`,
    `Preserve all markdown syntax EXACTLY: headings, lists, code blocks (\`\`\`), inline code (\`...\`), links, images, tables, blockquotes, HTML tags.`,
    `Do NOT translate: source code, URLs, file paths, command names (npm/git/curl/node/etc), environment variable names (UPPER_SNAKE_CASE),`,
    `version numbers, package names, shell flags, function/class identifiers, JSON keys.`,
    `Translate ALL prose, including comments inside code blocks IF they are clearly prose comments (lines starting with # or //).`,
    `Return ONLY the translated markdown — no preamble, no explanation, no surrounding fences.`,
  ].join(" ");

// ----- Output guard ---------------------------------------------------------
// The hash-based drift check cannot tell a good mirror from a broken one, and
// fallback models broke mirrors in two ways that shipped (refresh-5/6,
// 2026-09-23): reasoning models leaked their `<think>` block and English
// meta-prose ("I'll keep the table header…") into the translation, and long
// tables came back with rows missing. Each chunk is therefore cleaned and
// checked against its source before it is accepted; a chunk that still fails is
// retried, and a doc whose chunk never validates fails instead of being written.

const THINK_BLOCK = /<think>[\s\S]*?<\/think>\s*/g;
const WRAPPING_FENCE = /^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```[ \t]*$/;
const META_PROSE = [
  /\bI'll /g,
  /\bI will /g,
  /\bI need to /g,
  /\bLet me /g,
  /\bMy plan\b/g,
  /\bOkay, /g,
  /\bThe user /g,
];
const countMatches = (re, text) => (text.match(re) || []).length;
const countLines = (re, text) => text.split("\n").filter((l) => re.test(l)).length;

export function validateTranslatedChunk(source, output) {
  let text = output.replace(THINK_BLOCK, "").trim();
  const unwrapped = !/^\s*```/.test(source) && text.match(WRAPPING_FENCE);
  if (unwrapped) text = unwrapped[1].trim();
  const problems = [];
  if (/<\/?think>/.test(text)) problems.push("leaked <think> tag");
  const fences = [countLines(/^\s*```/, source), countLines(/^\s*```/, text)];
  if (fences[0] !== fences[1]) problems.push(`code fences ${fences[1]}/${fences[0]}`);
  const rows = [countLines(/^\s*\|/, source), countLines(/^\s*\|/, text)];
  if (rows[0] !== rows[1]) problems.push(`table rows ${rows[1]}/${rows[0]}`);
  const meta = META_PROSE.filter((re) => countMatches(re, text) > countMatches(re, source));
  if (meta.length) problems.push(`meta-prose ${meta.map((re) => re.source).join(", ")}`);
  return { text, problems };
}

const CHUNK_ATTEMPTS = 3;
// Splits a markdown body into chunks of <= maxChars, breaking on top-level `## ` headings only.
function chunkMarkdown(markdown, maxChars = 6000) {
  if (markdown.length <= maxChars) return [markdown];
  const lines = markdown.split("\n");
  const chunks = [];
  let buf = [];
  let size = 0;
  for (const line of lines) {
    if (line.startsWith("## ") && size > maxChars * 0.5) {
      chunks.push(buf.join("\n"));
      buf = [line];
      size = line.length;
    } else {
      buf.push(line);
      size += line.length + 1;
    }
  }
  if (buf.length) chunks.push(buf.join("\n"));
  return chunks;
}

async function translateBody(body, localeEntry, backend) {
  const englishName = localeEntry.english ?? localeEntry.name;
  const native = localeEntry.native ?? localeEntry.name;
  const system = SYSTEM_PROMPT(englishName, native);
  const chunks = chunkMarkdown(body);
  const translated = [];
  for (let i = 0; i < chunks.length; i++) {
    const messages = [
      { role: "system", content: system },
      { role: "user", content: chunks[i] },
    ];
    let checked;
    for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt++) {
      checked = validateTranslatedChunk(chunks[i], await callChat(messages, backend));
      if (checked.problems.length === 0) break;
      logWarn(
        `  chunk ${i + 1}/${chunks.length} rejected (attempt ${attempt}/${CHUNK_ATTEMPTS}): ${checked.problems.join("; ")}`
      );
    }
    if (checked.problems.length > 0) {
      throw new Error(
        `chunk ${i + 1}/${chunks.length} failed validation: ${checked.problems.join("; ")}`
      );
    }
    translated.push(checked.text);
    if (chunks.length > 1) {
      logInfo(
        `  chunk ${i + 1}/${chunks.length} translated (${chunks[i].length} → ${checked.text.length} chars)`
      );
    }
  }
  // Re-join with a blank line between chunks (we split on `## ` headings).
  // Then normalize terminology to the locale's canonical glossary — the model
  // reliably converts characters but not vocabulary habits, so zh-TW output
  // otherwise keeps mainland renderings (默認 for 預設, 緩存 for 快取) and
  // wrong-homophone conversions (上遊 for 上游, 儀錶板 for 儀表板).
  return normalizeLocaleText(translated.join("\n\n"), localeEntry.code);
}

// Simple promise-based semaphore (avoid runtime deps).
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (!queue.length || active >= max) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then((v) => {
        active--;
        resolve(v);
        next();
      })
      .catch((err) => {
        active--;
        reject(err);
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

// ----- Main ----------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);
  const config = await loadConfig();
  const allSources = await collectAllSources();
  const state = await loadState();

  const sources = opts.files ? allSources.filter((s) => opts.files.includes(s)) : allSources;
  if (opts.files) {
    const missing = opts.files.filter((f) => !allSources.includes(f));
    if (missing.length) {
      logWarn(`--files contains paths not in the source set: ${missing.join(", ")}`);
    }
  }

  const docsExcluded = new Set(config.docsExcluded ?? ["en"]);
  let targetLocales = config.locales.map((l) => l.code).filter((code) => !docsExcluded.has(code));
  if (opts.locales) {
    targetLocales = targetLocales.filter((code) => opts.locales.includes(code));
    const missing = opts.locales.filter((c) => !config.locales.some((l) => l.code === c));
    if (missing.length) {
      logWarn(`--locale contains codes not in config/i18n.json: ${missing.join(", ")}`);
    }
  }

  logInfo(`sources: ${sources.length}`);
  logInfo(`locales: ${targetLocales.length} (${targetLocales.join(", ")})`);
  logInfo(`dry-run: ${opts.dryRun ? "yes" : "no"}, force: ${opts.force ? "yes" : "no"}`);

  if (opts.targetsOnly && !opts.adopt) {
    logError("--targets-only only applies to --adopt; re-run as `--adopt --targets-only`");
    process.exit(2);
  }

  if (opts.adopt && opts.targetsOnly) {
    // Covers the WHOLE recorded state (--files / --locale do not narrow it): the
    // point is to absorb a mechanical rewrite of the mirrors without touching a
    // single source_hash, so `i18n:check` keeps reporting the real source drift.
    const now = new Date().toISOString();
    const refreshed = await refreshTargetHashes({
      state,
      root: ROOT,
      targetPathFor: (rel, locale) => targetPathFor(rel, locale),
      now,
    });
    let recorded = 0;
    let rehashed = 0;
    let changed = 0;
    for (const [rel, entry] of Object.entries(refreshed.sources ?? {})) {
      for (const [locale, info] of Object.entries(entry.locales ?? {})) {
        recorded += 1;
        if (info.updated_at !== now) continue; // target missing on disk — left as recorded
        rehashed += 1;
        if (info.target_hash !== state.sources?.[rel]?.locales?.[locale]?.target_hash) changed += 1;
      }
    }
    const scope = `${rehashed}/${recorded} recorded targets re-hashed (${changed} changed), every source_hash kept`;
    const stateRel = path.relative(ROOT, STATE_PATH);
    if (opts.dryRun) {
      logInfo(
        `adopt --targets-only (dry-run): would refresh ${scope} in ${stateRel} — nothing written`
      );
      return;
    }
    await saveState(refreshed);
    logInfo(`adopt --targets-only: refreshed ${scope} in ${stateRel}`);
    return;
  }

  if (opts.adopt) {
    const adopted = await adoptState({
      root: ROOT,
      sources,
      locales: targetLocales,
      targetPathFor: (rel, locale) => targetPathFor(rel, locale),
    });
    const adoptedTargets = Object.values(adopted.sources).reduce(
      (n, entry) => n + Object.keys(entry.locales).length,
      0
    );
    const scope = `${sources.length} sources × ${targetLocales.length} locales (${adoptedTargets} existing targets)`;
    const stateRel = path.relative(ROOT, STATE_PATH);
    if (opts.dryRun) {
      logInfo(`adopt (dry-run): would adopt ${scope} into ${stateRel} — nothing written`);
      return;
    }
    // Merge, never overwrite: a filtered run (--files / --locale) must keep every
    // entry it did not re-hash, or the next i18n:run retranslates all of them.
    await saveState(mergeAdoptedState(state, adopted));
    logInfo(`adopted ${scope} into ${stateRel}`);
    return;
  }

  // Read backend env up front so dry-run can still print masked summary.
  let backend = null;
  if (!opts.dryRun) {
    backend = backendConfig();
    if (opts.concurrency) backend.concurrency = opts.concurrency;
    else backend.concurrency = Number(process.env.AGENTPROXY_TRANSLATION_CONCURRENCY || 4);
    logInfo(
      `backend: ${backend.apiUrl} (model=${backend.model}, concurrency=${backend.concurrency}, timeout=${backend.timeoutMs}ms)`
    );
  } else {
    const apiUrl = (process.env.AGENTPROXY_TRANSLATION_API_URL || "").replace(/\/$/, "");
    logInfo(`backend (dry-run): ${apiUrl || "<unset>"}`);
  }

  const limit = createLimiter(opts.dryRun ? 1 : backend.concurrency);

  let stats = { translated: 0, skipped: 0, failed: 0, considered: 0 };
  const failures = [];
  const touched = [];

  // Precompute source hashes once per source.
  const sourceHashes = new Map();
  for (const rel of sources) {
    const abs = path.join(ROOT, rel);
    const buf = await fs.readFile(abs);
    sourceHashes.set(rel, { hash: sha256(buf), text: buf.toString("utf8") });
  }

  // Build a flat queue of (source, locale) work units.
  const tasks = [];
  for (const rel of sources) {
    const { hash: sourceHash } = sourceHashes.get(rel);
    const entry =
      state.sources[rel] || (state.sources[rel] = { source_hash: sourceHash, locales: {} });
    entry.source_hash = sourceHash;

    for (const locale of targetLocales) {
      stats.considered++;
      const targetAbs = targetPathFor(rel, locale);
      const previous = entry.locales[locale];
      const sourceChanged = previous?.source_hash !== sourceHash;
      const missingTarget = !existsSync(targetAbs);
      if (!opts.force && !sourceChanged && !missingTarget) {
        stats.skipped++;
        continue;
      }
      tasks.push({ rel, locale, targetAbs, sourceChanged, missingTarget });
    }
  }

  logInfo(
    `work units: ${tasks.length} (skipped up-to-date: ${stats.skipped} of ${stats.considered})`
  );

  if (opts.dryRun) {
    for (const t of tasks) {
      console.log(`  [DRY] ${t.rel} → ${path.relative(ROOT, t.targetAbs)}`);
    }
    logInfo(`dry-run complete — would translate ${tasks.length} files`);
    return;
  }

  const startMs = Date.now();

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        const localeEntry = config.locales.find((l) => l.code === task.locale);
        const sourceText = sourceHashes.get(task.rel).text;
        const sourceHash = sourceHashes.get(task.rel).hash;
        const topHeading = extractTopHeading(sourceText);
        const body = stripTopHeading(sourceText);

        let translatedBody;
        try {
          translatedBody = await translateBody(body, localeEntry, backend);
        } catch (err) {
          stats.failed++;
          failures.push({ rel: task.rel, locale: task.locale, error: err.message });
          logError(`${task.rel} [${task.locale}] failed: ${err.message}`);
          return;
        }

        const heading = topHeading
          ? `# ${topHeading} (${localeEntry.native})`
          : `# ${path.basename(task.rel, ".md")} (${localeEntry.native})`;
        const langBar = buildMirrorBar(task.rel, task.locale, config);
        const rawContent = `${heading}\n\n${langBar}\n\n---\n\n${translatedBody.trim()}\n`;
        // Pre-format with Prettier (markdown parser) so the on-disk content
        // matches what `lint-staged` would produce. This keeps `target_hash`
        // stable across commit hooks.
        const finalContent = await formatMarkdown(rawContent, task.targetAbs);

        await fs.mkdir(path.dirname(task.targetAbs), { recursive: true });
        await fs.writeFile(task.targetAbs, finalContent, "utf8");

        const targetHash = sha256(Buffer.from(finalContent, "utf8"));
        const record = {
          source_hash: sourceHash,
          target_hash: targetHash,
          updated_at: new Date().toISOString(),
        };
        state.sources[task.rel].locales[task.locale] = record;
        touched.push({ rel: task.rel, locale: task.locale, sourceHash, record });

        stats.translated++;
        logInfo(`✓ ${task.rel} → ${task.locale} (${translatedBody.length} chars)`);
      })
    )
  );

  // Save state even on partial failure so future runs only retry what failed. Several
  // `--locale=<code>` runs can execute in parallel, so re-read and merge only this run's
  // successful entries instead of letting the last writer discard unrelated locale state.
  let fresh = null;
  try {
    fresh = await loadState();
  } catch (err) {
    logWarn(`${err.message} at save time — merging into this run's snapshot instead`);
  }
  await saveState(mergeStateUpdates(fresh, touched, state));

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  logInfo(
    `summary: translated=${stats.translated}, skipped=${stats.skipped}, failed=${stats.failed}, total considered=${stats.considered}, elapsed=${elapsedSec}s`
  );

  if (failures.length) {
    logWarn(`${failures.length} failures:`);
    for (const f of failures) console.warn(`  - ${f.rel} [${f.locale}]: ${f.error}`);
    process.exit(1);
  }
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((err) => {
    logError(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

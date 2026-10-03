import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function cloneState(state) {
  return {
    ...state,
    sources: Object.fromEntries(
      Object.entries(state?.sources ?? {}).map(([rel, entry]) => [
        rel,
        {
          ...entry,
          locales: Object.fromEntries(
            Object.entries(entry?.locales ?? {}).map(([locale, info]) => [locale, { ...info }])
          ),
        },
      ])
    ),
  };
}

/**
 * A missing state record may be reconstructed only when git proves that the
 * mirror was added exactly once and never rewritten afterward. This avoids
 * mistaking a later language-bar-only rewrite for a translation event.
 */
export function mirrorSingleCreationCommits(mirrorRels, { cwd } = {}) {
  const wanted = new Set((mirrorRels ?? []).filter(Boolean));
  const history = new Map(
    [...wanted].map((rel) => [rel, { count: 0, commit: null, status: null }])
  );
  if (!wanted.size) return new Map();

  try {
    const out = execFileSync(
      "git",
      ["log", "--format=@@%H", "--name-status", "--", ...wanted],
      { cwd, encoding: "utf8", maxBuffer: 1 << 28 }
    );
    let commit = null;
    for (const raw of out.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("@@")) {
        commit = line.slice(2) || null;
        continue;
      }
      const parts = line.split("\t");
      if (parts.length < 2) continue;
      const status = parts[0];
      const rel = parts.at(-1);
      if (!commit || !wanted.has(rel)) continue;
      const item = history.get(rel);
      item.count += 1;
      if (item.count === 1) {
        item.commit = commit;
        item.status = status;
      }
    }
  } catch {
    return new Map();
  }

  return new Map(
    [...history].filter(([, item]) => item.count === 1 && item.status?.startsWith("A"))
      .map(([rel, item]) => [rel, item.commit])
  );
}

export function gitObjectsAtSpecs(specs, { cwd } = {}) {
  const unique = [...new Set((specs ?? []).filter(Boolean))];
  const found = new Map(unique.map((spec) => [spec, null]));
  if (!unique.length) return found;
  try {
    const batch = execFileSync("git", ["cat-file", "--batch"], {
      cwd,
      input: `${unique.join("\n")}\n`,
      maxBuffer: 1 << 28,
    });
    let offset = 0;
    for (const spec of unique) {
      const lineEnd = batch.indexOf(0x0a, offset);
      if (lineEnd < 0) break;
      const header = batch.subarray(offset, lineEnd).toString("utf8");
      offset = lineEnd + 1;
      if (header.endsWith(" missing")) continue;
      const size = Number(header.split(" ")[2]);
      if (!Number.isFinite(size) || size < 0 || offset + size > batch.length) break;
      const body = batch.subarray(offset, offset + size);
      offset += size;
      if (batch[offset] === 0x0a) offset += 1;
      found.set(spec, body);
    }
  } catch {
    // Fail closed: unresolved historical bytes never justify adoption.
  }
  return found;
}

/**
 * Reconstruct missing per-locale state without claiming that a mirror is fresh.
 *
 * Proof requirements:
 *   1. the target exists on disk;
 *   2. git history shows exactly one add commit and no later rewrite;
 *   3. the current target bytes equal the blob committed at that add commit;
 *   4. the English source exists at that same commit.
 *
 * The recovered locale record stores the source hash FROM THAT COMMIT, not the
 * current source hash. If English has moved on, i18n:check can therefore report
 * the locale as stale and i18n:run will still schedule a real translation.
 * Existing locale records and top-level source hashes are never modified.
 */
export function recoverSafeUntrackedTargets({
  state,
  root,
  sources,
  locales,
  targetPathFor,
  now = new Date().toISOString(),
}) {
  const next = cloneState(state);
  const candidates = [];
  const driftedSources = [];

  for (const rel of sources ?? []) {
    const entry = state?.sources?.[rel];
    if (!entry?.source_hash) continue;
    const sourceAbs = path.join(root, rel);
    if (!existsSync(sourceAbs)) continue;
    const currentSourceHash = sha256(readFileSync(sourceAbs));
    if (currentSourceHash !== entry.source_hash) driftedSources.push(rel);

    for (const locale of locales ?? []) {
      if (entry.locales?.[locale]) continue;
      const targetAbs = targetPathFor(rel, locale);
      if (!existsSync(targetAbs)) continue;
      candidates.push({
        rel,
        locale,
        targetAbs,
        mirrorRel: path.relative(root, targetAbs).split(path.sep).join("/"),
      });
    }
  }

  const creationCommits = mirrorSingleCreationCommits(
    candidates.map((candidate) => candidate.mirrorRel),
    { cwd: root }
  );
  const specs = [];
  for (const candidate of candidates) {
    const commit = creationCommits.get(candidate.mirrorRel);
    if (!commit) continue;
    specs.push(`${commit}:${candidate.rel}`, `${commit}:${candidate.mirrorRel}`);
  }
  const objects = gitObjectsAtSpecs(specs, { cwd: root });

  let adopted = 0;
  let unproven = 0;
  for (const candidate of candidates) {
    const commit = creationCommits.get(candidate.mirrorRel);
    if (!commit) {
      unproven += 1;
      continue;
    }
    const historicalSource = objects.get(`${commit}:${candidate.rel}`);
    const historicalTarget = objects.get(`${commit}:${candidate.mirrorRel}`);
    const currentTarget = readFileSync(candidate.targetAbs);
    if (
      !historicalSource ||
      !historicalTarget ||
      sha256(historicalTarget) !== sha256(currentTarget)
    ) {
      unproven += 1;
      continue;
    }

    next.sources[candidate.rel].locales[candidate.locale] = {
      source_hash: sha256(historicalSource),
      target_hash: sha256(currentTarget),
      updated_at: now,
    };
    adopted += 1;
  }

  return {
    state: next,
    stats: {
      candidates: candidates.length,
      adopted,
      unproven,
      driftedSources: [...new Set(driftedSources)].sort(),
    },
  };
}


/**
 * Repair an existing stale locale record only when git proves that the current
 * mirror bytes are the original single-add blob and that the English source at
 * that creation commit already equals the current source bytes.
 *
 * This is state provenance repair, not translation. When every expected locale
 * for a source is present and tied to the current source hash, the top-level
 * source_hash may also advance safely.
 */
export function repairSafeStaleProvenance({
  state,
  root,
  sources,
  locales,
  targetPathFor,
  now = new Date().toISOString(),
  advanceTopLevelSourceHash = false,
}) {
  const next = cloneState(state);
  const candidates = [];
  const currentHashes = new Map();

  for (const rel of sources ?? []) {
    const entry = state?.sources?.[rel];
    if (!entry) continue;
    const sourceAbs = path.join(root, rel);
    if (!existsSync(sourceAbs)) continue;
    const currentSourceHash = sha256(readFileSync(sourceAbs));
    currentHashes.set(rel, currentSourceHash);

    for (const locale of locales ?? []) {
      const info = entry.locales?.[locale];
      if (!info?.source_hash || info.source_hash === currentSourceHash) continue;
      const targetAbs = targetPathFor(rel, locale);
      if (!existsSync(targetAbs)) continue;
      candidates.push({
        rel,
        locale,
        targetAbs,
        mirrorRel: path.relative(root, targetAbs).split(path.sep).join("/"),
        currentSourceHash,
      });
    }
  }

  const creationCommits = mirrorSingleCreationCommits(
    candidates.map((candidate) => candidate.mirrorRel),
    { cwd: root }
  );
  const specs = [];
  for (const candidate of candidates) {
    const commit = creationCommits.get(candidate.mirrorRel);
    if (!commit) continue;
    specs.push(`${commit}:${candidate.rel}`, `${commit}:${candidate.mirrorRel}`);
  }
  const objects = gitObjectsAtSpecs(specs, { cwd: root });

  let repaired = 0;
  let unproven = 0;
  for (const candidate of candidates) {
    const commit = creationCommits.get(candidate.mirrorRel);
    if (!commit) {
      unproven += 1;
      continue;
    }
    const historicalSource = objects.get(`${commit}:${candidate.rel}`);
    const historicalTarget = objects.get(`${commit}:${candidate.mirrorRel}`);
    const currentTarget = readFileSync(candidate.targetAbs);
    if (
      !historicalSource ||
      !historicalTarget ||
      sha256(historicalTarget) !== sha256(currentTarget) ||
      sha256(historicalSource) !== candidate.currentSourceHash
    ) {
      unproven += 1;
      continue;
    }

    next.sources[candidate.rel].locales[candidate.locale] = {
      ...next.sources[candidate.rel].locales[candidate.locale],
      source_hash: candidate.currentSourceHash,
      target_hash: sha256(currentTarget),
      updated_at: now,
    };
    repaired += 1;
  }

  let sourceHashesAdvanced = 0;
  if (advanceTopLevelSourceHash) {
    for (const rel of sources ?? []) {
      const entry = next.sources?.[rel];
      const currentSourceHash = currentHashes.get(rel);
      if (!entry || !currentSourceHash) continue;
      const allFresh = (locales ?? []).every(
        (locale) => entry.locales?.[locale]?.source_hash === currentSourceHash
      );
      if (allFresh && entry.source_hash !== currentSourceHash) {
        entry.source_hash = currentSourceHash;
        sourceHashesAdvanced += 1;
      }
    }
  }

  return {
    state: next,
    stats: {
      candidates: candidates.length,
      repaired,
      unproven,
      sourceHashesAdvanced,
    },
  };
}

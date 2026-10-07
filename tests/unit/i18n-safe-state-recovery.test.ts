import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  recoverSafeUntrackedTargets,
  repairSafeStaleProvenance,
} from "../../scripts/i18n/lib/safe-state-recovery.mjs";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const OLD = "2026-01-01T00:00:00.000Z";
const NOW = "2026-09-28T00:00:00.000Z";

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function withRepo(fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "i18n-safe-recovery-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test");
    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const targetPathFor = (root: string) => (rel: string, locale: string) =>
  path.join(root, "docs", "i18n", locale, rel);

test("safe recovery adopts an untracked mirror only when git proves the same source revision", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# Current\n");
    mkdirSync(path.join(root, "docs", "i18n", "es"), { recursive: true });
    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# Actual\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "source and mirror");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# Current\n"),
          locales: {},
        },
      },
    };

    const recovered = recoverSafeUntrackedTargets({
      state,
      root,
      sources: ["README.md"],
      locales: ["es"],
      targetPathFor: targetPathFor(root),
      now: NOW,
    });

    assert.deepEqual(recovered.stats, {
      candidates: 1,
      adopted: 1,
      unproven: 0,
      driftedSources: [],
    });
    assert.deepEqual(recovered.state.sources["README.md"].locales.es, {
      source_hash: sha("# Current\n"),
      target_hash: sha("# Actual\n"),
      updated_at: NOW,
    });
    assert.deepEqual(state.sources["README.md"].locales, {}, "input state stays untouched");
  });
});

test("safe recovery records the historical source hash when the mirror predates the current source", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# V1\n");
    mkdirSync(path.join(root, "docs", "i18n", "es"), { recursive: true });
    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# V1 mirror\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "v1");

    writeFileSync(path.join(root, "README.md"), "# V2\n");
    git(root, "add", "README.md");
    git(root, "commit", "-qm", "source v2 only");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# V2\n"),
          locales: {},
        },
      },
    };

    const recovered = recoverSafeUntrackedTargets({
      state,
      root,
      sources: ["README.md"],
      locales: ["es"],
      targetPathFor: targetPathFor(root),
      now: NOW,
    });

    assert.equal(recovered.stats.candidates, 1);
    assert.equal(recovered.stats.adopted, 1);
    assert.equal(recovered.stats.unproven, 0);
    assert.deepEqual(recovered.stats.driftedSources, []);
    assert.equal(
      recovered.state.sources["README.md"].locales.es.source_hash,
      sha("# V1\n"),
      "recovered state must remember the source revision that actually existed when the mirror was created"
    );
    assert.equal(recovered.state.sources["README.md"].source_hash, sha("# V2\n"));
  });
});

test("safe recovery preserves historical provenance even when the current source already drifts from top-level state", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# V1\n");
    mkdirSync(path.join(root, "docs", "i18n", "es"), { recursive: true });
    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# V1 mirror\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "v1");

    writeFileSync(path.join(root, "README.md"), "# Working tree drift\n");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# V1\n"),
          locales: {
            de: {
              source_hash: sha("# V1\n"),
              target_hash: sha("# de\n"),
              updated_at: OLD,
            },
          },
        },
      },
    };

    const recovered = recoverSafeUntrackedTargets({
      state,
      root,
      sources: ["README.md"],
      locales: ["es", "de"],
      targetPathFor: targetPathFor(root),
      now: NOW,
    });

    assert.deepEqual(recovered.stats, {
      candidates: 1,
      adopted: 1,
      unproven: 0,
      driftedSources: ["README.md"],
    });
    assert.equal(recovered.state.sources["README.md"].source_hash, sha("# V1\n"));
    assert.equal(recovered.state.sources["README.md"].locales.es.source_hash, sha("# V1\n"));
    assert.deepEqual(
      recovered.state.sources["README.md"].locales.de,
      state.sources["README.md"].locales.de,
      "existing locale records are never overwritten"
    );
  });
});

test("safe recovery rejects a mirror that was rewritten after creation", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# V1\n");
    mkdirSync(path.join(root, "docs", "i18n", "es"), { recursive: true });
    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# V1 mirror\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "initial mirror");

    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# V1 mirror with bar rewrite\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "rewrite mirror");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# V1\n"),
          locales: {},
        },
      },
    };

    const recovered = recoverSafeUntrackedTargets({
      state,
      root,
      sources: ["README.md"],
      locales: ["es"],
      targetPathFor: targetPathFor(root),
      now: NOW,
    });

    assert.deepEqual(recovered.stats, {
      candidates: 1,
      adopted: 0,
      unproven: 1,
      driftedSources: [],
    });
    assert.equal(recovered.state.sources["README.md"].locales.es, undefined);
  });
});

test("provenance repair advances stale locale source hashes only when creation source equals current source", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# Current\n");
    mkdirSync(path.join(root, "docs", "i18n", "es"), { recursive: true });
    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# Mirror\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "source and mirror");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# Old state\n"),
          locales: {
            es: {
              source_hash: sha("# Old state\n"),
              target_hash: sha("# Mirror\n"),
              updated_at: OLD,
            },
          },
        },
      },
    };

    const repaired = repairSafeStaleProvenance({
      state,
      root,
      sources: ["README.md"],
      locales: ["es"],
      targetPathFor: targetPathFor(root),
      now: NOW,
      advanceTopLevelSourceHash: true,
    });

    assert.deepEqual(repaired.stats, {
      candidates: 1,
      repaired: 1,
      unproven: 0,
      sourceHashesAdvanced: 1,
    });
    assert.equal(repaired.state.sources["README.md"].locales.es.source_hash, sha("# Current\n"));
    assert.equal(repaired.state.sources["README.md"].source_hash, sha("# Current\n"));
    assert.equal(repaired.state.sources["README.md"].locales.es.updated_at, NOW);
    assert.equal(state.sources["README.md"].source_hash, sha("# Old state\n"), "input state stays untouched");
  });
});

test("provenance repair leaves genuinely stale mirrors stale and does not advance top-level source hash", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# V1\n");
    mkdirSync(path.join(root, "docs", "i18n", "es"), { recursive: true });
    writeFileSync(path.join(root, "docs", "i18n", "es", "README.md"), "# V1 mirror\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "v1 mirror");

    writeFileSync(path.join(root, "README.md"), "# V2\n");
    git(root, "add", "README.md");
    git(root, "commit", "-qm", "source v2");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# V1\n"),
          locales: {
            es: {
              source_hash: sha("# V1\n"),
              target_hash: sha("# V1 mirror\n"),
              updated_at: OLD,
            },
          },
        },
      },
    };

    const repaired = repairSafeStaleProvenance({
      state,
      root,
      sources: ["README.md"],
      locales: ["es"],
      targetPathFor: targetPathFor(root),
      now: NOW,
      advanceTopLevelSourceHash: true,
    });

    assert.deepEqual(repaired.stats, {
      candidates: 1,
      repaired: 0,
      unproven: 1,
      sourceHashesAdvanced: 0,
    });
    assert.deepEqual(repaired.state, state);
  });
});

test("provenance repair advances the top-level source hash only when every expected locale is fresh", async () => {
  await withRepo(async (root) => {
    writeFileSync(path.join(root, "README.md"), "# Current\n");
    for (const locale of ["es", "fr"]) {
      mkdirSync(path.join(root, "docs", "i18n", locale), { recursive: true });
      writeFileSync(path.join(root, "docs", "i18n", locale, "README.md"), `# ${locale}\n`);
    }
    git(root, "add", ".");
    git(root, "commit", "-qm", "source and mirrors");

    const state = {
      sources: {
        "README.md": {
          source_hash: sha("# Old state\n"),
          locales: {
            es: {
              source_hash: sha("# Old state\n"),
              target_hash: sha("# es\n"),
              updated_at: OLD,
            },
            fr: {
              source_hash: sha("# Current\n"),
              target_hash: sha("# fr\n"),
              updated_at: OLD,
            },
          },
        },
      },
    };

    const repaired = repairSafeStaleProvenance({
      state,
      root,
      sources: ["README.md"],
      locales: ["es", "fr"],
      targetPathFor: targetPathFor(root),
      now: NOW,
      advanceTopLevelSourceHash: true,
    });

    assert.equal(repaired.stats.repaired, 1);
    assert.equal(repaired.stats.sourceHashesAdvanced, 1);
    assert.equal(repaired.state.sources["README.md"].source_hash, sha("# Current\n"));
  });
});

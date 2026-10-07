import test from "node:test";
import assert from "node:assert/strict";
import {
  findStaleTargetsForSource,
  findUntrackedTargets,
} from "../../scripts/i18n/check-translation-drift.mjs";

test("findUntrackedTargets reports expected locale records missing from state", () => {
  const sources = {
    "README.md": {
      source_hash: "source",
      locales: {
        de: { source_hash: "source", target_hash: "de" },
      },
    },
    "docs/guides/FEATURES.md": {
      source_hash: "source2",
      locales: {},
    },
  };

  assert.deepEqual(findUntrackedTargets(sources, ["de", "fr"]), [
    { rel: "README.md", locale: "fr" },
    { rel: "docs/guides/FEATURES.md", locale: "de" },
    { rel: "docs/guides/FEATURES.md", locale: "fr" },
  ]);
});

test("findUntrackedTargets is empty when every expected locale is recorded", () => {
  const sources = {
    "README.md": {
      source_hash: "source",
      locales: {
        de: { source_hash: "source", target_hash: "de" },
        fr: { source_hash: "source", target_hash: "fr" },
      },
    },
  };

  assert.deepEqual(findUntrackedTargets(sources, ["de", "fr"]), []);
});

test("findStaleTargetsForSource reports locale records tied to older source revisions", () => {
  const entry = {
    source_hash: "source-v2",
    locales: {
      de: { source_hash: "source-v2", target_hash: "de" },
      fr: { source_hash: "source-v1", target_hash: "fr" },
      es: { target_hash: "es" },
    },
  };

  assert.deepEqual(
    findStaleTargetsForSource("README.md", entry, "source-v2", ["de", "fr", "es", "it"]),
    [
      {
        rel: "README.md",
        locale: "fr",
        recorded: "source-v1",
        current: "source-v2",
      },
    ]
  );
});

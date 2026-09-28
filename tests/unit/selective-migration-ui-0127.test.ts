import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const storagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/dashboard/settings/components/SystemStorageTab.tsx"
);
const panelPath = path.join(
  repoRoot,
  "src/app/(dashboard)/dashboard/settings/components/SelectiveMigrationPanel.tsx"
);

test("TC-MIG-UI-042 System Storage renders selective migration without replacing legacy imports", () => {
  const storage = fs.readFileSync(storagePath, "utf8");

  assert.match(storage, /import SelectiveMigrationPanel from "\.\/SelectiveMigrationPanel"/);
  assert.match(storage, /<SelectiveMigrationPanel \/>/);
  assert.match(storage, /\/api\/db-backups\/import\?filename=/);
  assert.match(storage, /\/api\/settings\/import-json/);
});

test("TC-MIG-UI-043 selective migration panel previews then applies the same source file", () => {
  const panel = fs.readFileSync(panelPath, "utf8");

  assert.match(panel, /\/api\/settings\/migration\/preview/);
  assert.match(panel, /\/api\/settings\/migration\/apply/);
  assert.match(panel, /accept="\.json,\.sqlite,\.db"/);
  assert.match(panel, /form\.set\("file", sourceFile\)/);
  assert.match(panel, /form\.set\("selection", JSON\.stringify\(selection\)\)/);
  assert.doesNotMatch(panel, /form\.set\("plan"/);
});

test("TC-MIG-UI-044 UI selection transmits only category and sourceId", () => {
  const panel = fs.readFileSync(panelPath, "utf8");

  assert.match(
    panel,
    /\.map\(\(\{ category, sourceId \}\) => \(\{ category, sourceId \}\)\)/
  );
  assert.match(panel, /require re-auth/i);
  assert.match(panel, /stable restore point/i);
});

test("TC-MIG-UI-055 category-level selection and conflict details are visible before mutation", () => {
  const panel = fs.readFileSync(panelPath, "utf8");

  assert.match(panel, /setCategorySelection\(category, !allSelected\)/);
  assert.match(panel, /categories\.map\(\(category\)/);
  assert.match(panel, /Migration has unresolved dependencies or target conflicts/);
  assert.match(panel, /Blockers:/);
  assert.match(panel, /unresolvedDependencies/);
});

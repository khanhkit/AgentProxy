import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createComboSchema, updateComboSchema } from "../../src/shared/validation/schemas/combo.ts";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("AP-ISS-0130 API Manager wires per-key auto-combo and catalog-scope controls", () => {
  const client = read("src/app/(dashboard)/dashboard/api-manager/ApiManagerPageClient.tsx");
  assert.ok(client.includes("ApiKeyAutoCombosToggle"));
  assert.ok(client.includes("ApiKeyCatalogScopeSelect"));
  assert.ok(client.includes("apiKey?.allowAutoCombos !== false"));
  assert.ok(client.includes('useState<CatalogScope>(apiKey?.catalogScope ?? "all")'));
  assert.match(client, /body: JSON\.stringify\(\{[\s\S]*?allowAutoCombos,[\s\S]*?catalogScope,/);
});

test("AP-ISS-0130 combo schemas accept displayName create/update/clear", () => {
  const created = createComboSchema.safeParse({
    name: "ap0130-combo",
    displayName: "AP0130 Combo",
    models: [{ kind: "model", model: "openai/gpt-4o", providerId: "openai" }],
  });
  assert.equal(created.success, true);
  if (created.success) assert.equal(created.data.displayName, "AP0130 Combo");

  assert.equal(updateComboSchema.safeParse({ displayName: "Renamed" }).success, true);
  assert.equal(updateComboSchema.safeParse({ displayName: null }).success, true);
  assert.equal(updateComboSchema.safeParse({ displayName: 42 }).success, false);
});

test("AP-ISS-0130 catalog advertises combo display_name and description conditionally", () => {
  const catalog = read("src/app/api/v1/models/catalog.ts");
  assert.ok(catalog.includes("...(comboDisplayName ? { display_name: comboDisplayName } : {})"));
  assert.ok(catalog.includes("...(comboDescription ? { description: comboDescription } : {})"));
});

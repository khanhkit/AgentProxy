import test from "node:test";
import assert from "node:assert/strict";

import { enrichCatalogModelEntry } from "../../src/lib/modelMetadataRegistry.ts";

function captureWarnings(fn: () => void): string[] {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return lines.filter((line) => line.includes("findInsensitive"));
}

function pricingWithCollisions(count: number): Record<string, unknown> {
  const pricing: Record<string, unknown> = {
    OpenAI: { "gpt-4o": { input: 1, output: 2 } },
  };
  for (let i = 0; i < count; i += 1) {
    pricing[`Dup${i}Provider`] = { m: { input: 1, output: 2 } };
    pricing[`dup${i}provider`] = { m: { input: 9, output: 9 } };
  }
  return pricing;
}

test("AP-ISS-0124 findInsensitive aggregates collision warnings per index build", () => {
  const warnings = captureWarnings(() => {
    enrichCatalogModelEntry(
      { id: "gpt-4o", owned_by: "openai" },
      { provider: "openai", model: "gpt-4o" },
      { modelsDevPricing: pricingWithCollisions(3) } as never
    );
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /3 case-insensitive key collision/);
  assert.match(warnings[0], /dup0provider/);
  assert.match(warnings[0], /Dup0Provider/);
});

test("AP-ISS-0124 findInsensitive emits no warning when there are no collisions", () => {
  const warnings = captureWarnings(() => {
    enrichCatalogModelEntry(
      { id: "gpt-4o", owned_by: "openai" },
      { provider: "openai", model: "gpt-4o" },
      { modelsDevPricing: { OpenAI: { "gpt-4o": { input: 1, output: 2 } } } } as never
    );
  });

  assert.deepEqual(warnings, []);
});

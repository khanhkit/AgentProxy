import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectDefaultThinkingEffort,
  detectSupportedThinkingEfforts,
  normalizeDiscoveredModels,
} from "../../src/lib/providerModels/modelDiscovery.ts";

function vendorRecord(vendorEfforts: Record<string, string[] | undefined>) {
  return {
    id: "zai/glm-5.3-flash",
    vendors: Object.fromEntries(
      Object.entries(vendorEfforts).map(([vendor, efforts]) => [
        vendor,
        { capabilities: { reasoning: { effort_values: efforts } } },
      ])
    ),
  };
}

test("single vendor-route effort_values becomes supportedThinkingEfforts", () => {
  assert.deepEqual(detectSupportedThinkingEfforts(vendorRecord({ zai: ["low", "high", "max"] })), [
    "low",
    "high",
    "max",
  ]);
});

test("vendor-route vocabularies intersect across routes", () => {
  assert.deepEqual(
    detectSupportedThinkingEfforts(
      vendorRecord({
        zai: ["low", "high", "max"],
        baseten: ["low", "medium", "high", "xhigh"],
        makora: ["low", "high", "max"],
      })
    ),
    ["low", "high"]
  );
});

test("routes without effort_values are excluded from the intersection", () => {
  const record = {
    id: "moonshot/kimi-k3",
    vendors: {
      moonshot: { capabilities: { reasoning: { effort_values: ["low", "max"] } } },
      fireworks: { capabilities: { reasoning: {} } },
    },
  };
  assert.deepEqual(detectSupportedThinkingEfforts(record), ["low", "max"]);
});

test("malformed vendor routes and entries are dropped individually", () => {
  const record = {
    id: "vendor/partial",
    vendors: {
      good: { capabilities: { reasoning: { effort_values: ["low", 42, "high"] } } },
      bad: "not-an-object",
      worse: { capabilities: { reasoning: { effort_values: 42 } } },
      other: { capabilities: { reasoning: { effort_values: ["low", "high", "max"] } } },
    },
  };
  assert.doesNotThrow(() => detectSupportedThinkingEfforts(record));
  assert.deepEqual(detectSupportedThinkingEfforts(record), ["low", "high"]);
});

test("missing or malformed vendors degrades to undefined", () => {
  assert.equal(detectSupportedThinkingEfforts({ id: "plain/model" }), undefined);
  assert.equal(
    detectSupportedThinkingEfforts({ id: "plain/model", vendors: "not-a-map" }),
    undefined
  );
});

test("vendor-route effort synonyms normalize", () => {
  assert.deepEqual(
    detectSupportedThinkingEfforts(vendorRecord({ zai: ["low", "extra", "max"] })),
    ["low", "xhigh", "max"]
  );
});

test("vendor-route default is highest shared canonical tier, independent of array order", () => {
  assert.equal(
    detectDefaultThinkingEffort(
      vendorRecord({
        zai: ["max", "low", "high"],
        makora: ["high", "low", "max"],
      })
    ),
    "max"
  );
  assert.equal(
    detectDefaultThinkingEffort(
      vendorRecord({
        zai: ["low", "high", "max"],
        baseten: ["low", "medium", "high"],
      })
    ),
    "high"
  );
});

test("higher-precedence flat or nested vocabulary suppresses vendor-derived default", () => {
  assert.equal(
    detectDefaultThinkingEffort({
      ...vendorRecord({ zai: ["low", "high", "max"] }),
      supportedThinkingEfforts: ["low"],
    }),
    undefined
  );
  assert.equal(
    detectDefaultThinkingEffort({
      ...vendorRecord({ zai: ["low", "high", "max"] }),
      reasoning: { supported_efforts: ["low"] },
    }),
    undefined
  );
});

test("disjoint vendor vocabularies are authoritative empty and have no default", () => {
  const record = vendorRecord({ a: ["low"], b: ["high"] });
  assert.deepEqual(detectSupportedThinkingEfforts(record), []);
  assert.equal(detectDefaultThinkingEffort(record), undefined);
});

test("explicit reasoning.default_effort keeps precedence", () => {
  const record = {
    ...vendorRecord({ zai: ["low", "high", "max"] }),
    reasoning: { default_effort: "high" },
  };
  assert.equal(detectDefaultThinkingEffort(record), "high");
});

test("normalizeDiscoveredModels threads vendor-route vocabulary and default", () => {
  const [synced] = normalizeDiscoveredModels([
    {
      id: "zai/glm-5.3-flash",
      vendors: {
        zai: { capabilities: { reasoning: { effort_values: ["low", "high", "max"] } } },
        baseten: { capabilities: { reasoning: { effort_values: ["low", "high", "xhigh"] } } },
      },
    },
  ]);
  assert.deepEqual(synced?.supportedThinkingEfforts, ["low", "high"]);
  assert.equal(synced?.defaultThinkingEffort, "high");
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { visionDerivedModalities } from "../../src/app/api/v1/models/catalogHelpers.ts";

test("AP-ISS-0130 derives image input + text output from vision=true when synced modalities are absent", () => {
  assert.deepEqual(visionDerivedModalities({ vision: true }, [], []), {
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  });
});

test("AP-ISS-0130 synced modalities take precedence and text/unknown does not invent vision", () => {
  assert.deepEqual(
    visionDerivedModalities({ vision: true }, ["text", "image", "video"], ["text", "image"]),
    { input_modalities: ["text", "image", "video"], output_modalities: ["text", "image"] }
  );
  assert.deepEqual(visionDerivedModalities({ vision: false }, [], []), {});
  assert.deepEqual(visionDerivedModalities({}, [], []), {});
});

test("AP-ISS-0130 unified catalog wires combo metadata through visionDerivedModalities", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/v1/models/catalog.ts"),
    "utf8"
  );
  assert.match(
    source,
    /visionDerivedModalities\(capabilities, inputModalities, outputModalities\)/
  );
});

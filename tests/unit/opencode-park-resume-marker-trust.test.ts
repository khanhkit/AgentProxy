import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const MARKER_ENV = "OPENCODE_POOL_STRAIN_MARKER_PATH";

describe("opencode pool-strain marker trust (#14568)", () => {
  let priorMarker: string | undefined;
  let dir: string;

  beforeEach(() => {
    priorMarker = process.env[MARKER_ENV];
    delete process.env[MARKER_ENV];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-strain-marker-"));
  });

  afterEach(() => {
    if (priorMarker === undefined) delete process.env[MARKER_ENV];
    else process.env[MARKER_ENV] = priorMarker;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFreshMarker(markerPath: string, mode: number): void {
    fs.writeFileSync(markerPath, JSON.stringify({ since: Date.now(), ttl_s: 300 }));
    fs.chmodSync(markerPath, mode);
  }

  it("keeps the watcher-compatible default path", async () => {
    const { poolStrainMarkerPath } = await import("../../open-sse/executors/opencodeParkResume.ts");
    assert.equal(poolStrainMarkerPath(), "/tmp/opencode-pool-strain.json");
  });

  it("honors an explicit marker path override", async () => {
    process.env[MARKER_ENV] = "/custom/path/marker.json";
    const { poolStrainMarkerPath } = await import("../../open-sse/executors/opencodeParkResume.ts");
    assert.equal(poolStrainMarkerPath(), "/custom/path/marker.json");
  });

  it("rejects a world-writable marker", async () => {
    const { readPoolStrainMarker } = await import("../../open-sse/executors/opencodeParkResume.ts");
    const markerPath = path.join(dir, "opencode-pool-strain.json");
    writeFreshMarker(markerPath, 0o666);
    assert.equal((await readPoolStrainMarker(markerPath)).fresh, false);
  });

  it("rejects a symlinked marker", async () => {
    const { readPoolStrainMarker } = await import("../../open-sse/executors/opencodeParkResume.ts");
    const target = path.join(dir, "real-marker.json");
    writeFreshMarker(target, 0o600);
    const link = path.join(dir, "opencode-pool-strain.json");
    fs.symlinkSync(target, link);
    assert.equal((await readPoolStrainMarker(link)).fresh, false);
  });

  it("accepts an owner-locked-down fresh marker", async () => {
    const { readPoolStrainMarker } = await import("../../open-sse/executors/opencodeParkResume.ts");
    const markerPath = path.join(dir, "opencode-pool-strain.json");
    writeFreshMarker(markerPath, 0o600);
    assert.equal((await readPoolStrainMarker(markerPath)).fresh, true);
  });
});

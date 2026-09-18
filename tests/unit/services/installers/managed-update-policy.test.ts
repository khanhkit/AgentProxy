import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertManagedUpdateCompatibility,
  mergeManagedUpdateMetadata,
  resolveVerifiedNpmArtifact,
} from "../../../../src/lib/services/installers/managedUpdatePolicy.ts";

describe("managed update admission policy", () => {
  it("resolves a mutable npm selector once, then binds integrity lookup to the exact version", async () => {
    const calls: string[][] = [];
    const runner = async (args: string[]) => {
      calls.push(args);
      if (calls.length === 1) return { stdout: '"2.3.4"\n', stderr: "" };
      return { stdout: '"sha512-YWJjZA=="\n', stderr: "" };
    };

    const artifact = await resolveVerifiedNpmArtifact("9router", "latest", runner);

    assert.deepEqual(artifact, {
      version: "2.3.4",
      integrity: "sha512-YWJjZA==",
    });
    assert.deepEqual(calls[0], ["view", "9router@latest", "version", "--json"]);
    assert.deepEqual(calls[1], ["view", "9router@2.3.4", "dist.integrity", "--json"]);
  });

  it("fails closed when npm integrity metadata is absent", async () => {
    let call = 0;
    const runner = async () => {
      call += 1;
      return call === 1 ? { stdout: '"2.3.4"\n', stderr: "" } : { stdout: "null\n", stderr: "" };
    };

    await assert.rejects(
      resolveVerifiedNpmArtifact("9router", "latest", runner),
      /integrity metadata/i
    );
  });

  it("rejects a known-bad version before promotion", () => {
    assert.throws(
      () =>
        assertManagedUpdateCompatibility("9router", "2.3.4", {
          pinnedVersion: null,
          configOverrides: {
            managedUpdate: {
              blockedVersions: ["2.3.4"],
            },
          },
        }),
      /blocked by managed update compatibility policy/i
    );
  });

  it("treats pinnedVersion and an explicit allowlist as compatibility admission constraints", () => {
    assert.throws(
      () =>
        assertManagedUpdateCompatibility("9router", "2.3.4", {
          pinnedVersion: "2.3.3",
          configOverrides: null,
        }),
      /pinned to 2\.3\.3/i
    );

    assert.throws(
      () =>
        assertManagedUpdateCompatibility("9router", "2.3.4", {
          pinnedVersion: null,
          configOverrides: {
            managedUpdate: {
              allowedVersions: ["2.3.3"],
            },
          },
        }),
      /not present in the managed update allowlist/i
    );
  });

  it("records the verified artifact and previous version as rollback metadata without losing other overrides", () => {
    const merged = mergeManagedUpdateMetadata(
      { custom: { keep: true } },
      {
        version: "2.3.4",
        integrity: "sha512-YWJjZA==",
        previousVersion: "2.3.3",
        verifiedAt: "2026-09-16T00:00:00.000Z",
      }
    );

    assert.deepEqual(merged, {
      custom: { keep: true },
      managedUpdate: {
        version: "2.3.4",
        integrity: "sha512-YWJjZA==",
        rollbackVersion: "2.3.3",
        lastKnownGoodVersion: "2.3.4",
        verifiedAt: "2026-09-16T00:00:00.000Z",
      },
    });
  });
});

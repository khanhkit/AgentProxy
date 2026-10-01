import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("OAuthModal exposes manual loopback fallback from mismatch panel", () => {
  const source = read("src/shared/components/OAuthModal.tsx");
  assert.match(source, /manualLoopback\?: boolean/);
  assert.match(source, /isLocalhost && !opts\?\.manualLoopback/);
  assert.match(
    source,
    /onManualInput=\{\(\) => void startOAuthFlow\(\{ manualLoopback: true \}\)\}/
  );
});

test("OAuthLoopbackMismatchPanel renders the manual-input action", () => {
  const source = read("src/shared/components/OAuthModalPanels.tsx");
  assert.match(source, /onManualInput: \(\) => void/);
  assert.match(source, /<Button onClick=\{onManualInput\} fullWidth>/);
});

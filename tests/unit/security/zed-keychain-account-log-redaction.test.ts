import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-zed-keychain-log-"));
const logPath = path.join(tempDir, "app.log");
const canaryAccount = "work-profile-alice-7842";
const originalLogToFile = process.env.APP_LOG_TO_FILE;
const originalLogPath = process.env.APP_LOG_FILE_PATH;

process.env.APP_LOG_TO_FILE = "true";
process.env.APP_LOG_FILE_PATH = logPath;

const mockSource = `
const canary = ${JSON.stringify(canaryAccount)};
export async function findCredentials(service) {
  if (service === "zed-openai") return [{ account: canary, password: "" }];
  return [];
}
export async function getPassword() { return null; }
export default { findCredentials, getPassword };
`;
const mockUrl = `data:text/javascript,${encodeURIComponent(mockSource)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "keytar" && context.parentURL?.includes("/zed-oauth/keychain-reader.ts")) {
      return { url: mockUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const consoleInterceptor = await import(
  "../../../src/lib/consoleInterceptor.ts?ap-iss-0056-console-interceptor"
);
const { discoverZedCredentials } = await import(
  "../../../src/lib/zed-oauth/keychain-reader.ts?ap-iss-0056-reader"
);

test.after(() => {
  consoleInterceptor.__consoleInterceptorInternals.reset();
  if (originalLogToFile === undefined) delete process.env.APP_LOG_TO_FILE;
  else process.env.APP_LOG_TO_FILE = originalLogToFile;
  if (originalLogPath === undefined) delete process.env.APP_LOG_FILE_PATH;
  else process.env.APP_LOG_FILE_PATH = originalLogPath;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("missing-password keychain diagnostic never persists the raw account label", async () => {
  consoleInterceptor.initConsoleInterceptor();
  const credentials = await discoverZedCredentials();
  consoleInterceptor.__consoleInterceptorInternals.reset();

  assert.deepEqual(credentials, []);
  const persisted = fs.readFileSync(logPath, "utf8");
  assert.match(persisted, /Skipping credential with missing password/);
  assert.match(persisted, /zed-openai/);
  assert.doesNotMatch(
    persisted,
    new RegExp(canaryAccount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "raw keychain account labels must not be persisted in debug logs"
  );
});

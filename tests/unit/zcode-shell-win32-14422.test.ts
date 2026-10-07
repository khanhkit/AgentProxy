import test from "node:test";
import assert from "node:assert/strict";

import { shouldUseShellForZcodeCommand } from "../../open-sse/executors/zcodeProtocol.ts";

test("ZCode uses shell only for Windows cmd/bat shims", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  try {
    assert.equal(shouldUseShellForZcodeCommand("zcode.cmd"), true);
    assert.equal(shouldUseShellForZcodeCommand("C:\\Tools\\zcode.bat"), true);
    assert.equal(shouldUseShellForZcodeCommand("C:\\Tools\\node.exe"), false);
  } finally {
    if (platform) Object.defineProperty(process, "platform", platform);
  }
});

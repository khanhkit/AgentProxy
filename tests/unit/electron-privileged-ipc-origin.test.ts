import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rendererTrust = require("../../electron/lib/resolveRemoteServerUrl");
const mainSource = readFileSync(join(import.meta.dirname, "../../electron/main.js"), "utf8");

const PRIVILEGED_MAIN_CHANNELS = [
  "get-app-info",
  "open-external",
  "get-data-dir",
  "restart-server",
  "check-for-updates",
  "download-update",
  "install-update",
  "get-app-version",
  "login:start",
  "login:cancel",
  "login:status",
  "get-autostart-status",
  "enable-autostart",
  "disable-autostart",
];

const PRIVILEGED_MAIN_SEND_CHANNELS = ["window-minimize", "window-maximize", "window-close"];

describe("Electron privileged renderer origin trust", () => {
  it("compares the exact http(s) origin while allowing paths on the approved renderer", () => {
    assert.equal(typeof rendererTrust.isTrustedRendererUrl, "function");
    const trusted = "https://router.example.test:8443/base/path";

    assert.equal(
      rendererTrust.isTrustedRendererUrl("https://router.example.test:8443/dashboard", trusted),
      true
    );
    assert.equal(
      rendererTrust.isTrustedRendererUrl("https://router.example.test:8443/settings?q=1", trusted),
      true
    );
    assert.equal(
      rendererTrust.isTrustedRendererUrl(
        "https://router.example.test.evil:8443/dashboard",
        trusted
      ),
      false
    );
    assert.equal(
      rendererTrust.isTrustedRendererUrl("https://router.example.test/dashboard", trusted),
      false
    );
    assert.equal(
      rendererTrust.isTrustedRendererUrl("http://router.example.test:8443/dashboard", trusted),
      false
    );
    assert.equal(rendererTrust.isTrustedRendererUrl("javascript:alert(1)", trusted), false);
  });

  it("accepts only the trusted top-level sender frame", () => {
    assert.equal(typeof rendererTrust.isTrustedRendererEvent, "function");

    const mainFrame = { url: "https://router.example.test/dashboard" };
    const trustedEvent = { senderFrame: mainFrame, sender: { mainFrame } };
    assert.equal(
      rendererTrust.isTrustedRendererEvent(trustedEvent, "https://router.example.test/base"),
      true
    );

    const foreignFrame = { url: "https://evil.example.test/dashboard" };
    assert.equal(
      rendererTrust.isTrustedRendererEvent(
        { senderFrame: foreignFrame, sender: { mainFrame: foreignFrame } },
        "https://router.example.test/base"
      ),
      false
    );

    const childFrame = { url: "https://router.example.test/embedded" };
    assert.equal(
      rendererTrust.isTrustedRendererEvent(
        { senderFrame: childFrame, sender: { mainFrame } },
        "https://router.example.test/base"
      ),
      false
    );
    assert.equal(
      rendererTrust.isTrustedRendererEvent({}, "https://router.example.test/base"),
      false
    );
  });
});

describe("Electron privileged IPC wiring", () => {
  it("routes every main-renderer invoke channel through the trusted sender wrapper", () => {
    for (const channel of PRIVILEGED_MAIN_CHANNELS) {
      assert.ok(
        mainSource.includes(`handleTrustedMainIpc("${channel}"`),
        `${channel} must use handleTrustedMainIpc`
      );
    }
  });

  it("routes every main-renderer fire-and-forget channel through the trusted sender wrapper", () => {
    for (const channel of PRIVILEGED_MAIN_SEND_CHANNELS) {
      assert.ok(
        mainSource.includes(`onTrustedMainIpc("${channel}"`),
        `${channel} must use onTrustedMainIpc`
      );
    }
  });

  it("blocks cross-origin top-level navigation and redirects on the privileged window", () => {
    assert.match(mainSource, /webContents\.on\("will-navigate"/);
    assert.match(mainSource, /webContents\.on\("will-redirect"/);
    assert.match(mainSource, /isTrustedRendererUrl\(url, getServerUrl\(\)\)/);
    assert.match(mainSource, /event\.preventDefault\(\)/);
  });
});

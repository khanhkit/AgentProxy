// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next-intl translations (the page imports useTranslations("auth")).
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import CallbackPage from "@/app/callback/page";

/**
 * Regression guard for ported upstream PR decolua/9router#998 (security):
 * the OAuth callback page must never relay {code, state} to a wildcard
 * postMessage target ("*"), as a hostile opener can read the code/state and
 * complete the OAuth flow as the user. Trusted targets are the same-origin
 * parent, the loopback hostname variants of the same port (localhost vs
 * 127.0.0.1 — Zed native-app redirects may land on the other spelling than the
 * dashboard the modal was opened from; same port means the same AgentProxy
 * server), and Codex's fixed loopback helper (127.0.0.1:1455).
 */
describe("OAuth callback page — postMessage target origin scope (#998)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let originalOpener: typeof window.opener;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    postMessageSpy = vi.fn();
    originalOpener = window.opener;

    // Set the callback URL with OAuth params (triggers the postMessage send).
    window.history.replaceState({}, "", "/callback?code=test_code_abc123&state=test_state_xyz789");

    // Stub window.opener as a CROSS-ORIGIN opener: same-origin probe must throw
    // (mimics a real cross-origin window.opener), which means the page falls into
    // the fallback path that previously used a wildcard "*" target origin.
    Object.defineProperty(window, "opener", {
      configurable: true,
      writable: true,
      value: {
        postMessage: postMessageSpy,
        get location(): never {
          throw new Error("cross-origin access blocked");
        },
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, "opener", {
      configurable: true,
      writable: true,
      value: originalOpener,
    });
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("never targets the wildcard '*' origin even when opener is cross-origin", async () => {
    await act(async () => {
      root.render(<CallbackPage />);
    });
    // Give useEffect a microtask to flush.
    await act(async () => {
      await Promise.resolve();
    });

    const targetOrigins = postMessageSpy.mock.calls.map((call) => call[1]);
    expect(targetOrigins).not.toContain("*");
  });

  it("only targets trusted origins (same-origin + Codex 127.0.0.1:1455)", async () => {
    await act(async () => {
      root.render(<CallbackPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const loopbackSamePort = window.location.port
      ? [`http://localhost:${window.location.port}`, `http://127.0.0.1:${window.location.port}`]
      : [];
    const trusted = new Set([
      window.location.origin,
      ...loopbackSamePort,
      "http://localhost:1455",
      "http://127.0.0.1:1455",
    ]);
    const targetOrigins = postMessageSpy.mock.calls.map((call) => call[1]);
    expect(targetOrigins.length).toBeGreaterThan(0);
    for (const origin of targetOrigins) {
      expect(trusted.has(origin)).toBe(true);
    }
  });

  it("delivers the OAuth code/state payload at least once via postMessage", async () => {
    await act(async () => {
      root.render(<CallbackPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Sanity: the scoped postMessage path still actually attempts delivery.
    expect(postMessageSpy).toHaveBeenCalled();
    const firstCall = postMessageSpy.mock.calls[0];
    expect(firstCall[0]).toMatchObject({
      type: "oauth_callback",
      data: expect.objectContaining({
        code: "test_code_abc123",
        state: "test_state_xyz789",
      }),
    });
  });

  it("uses only a state-scoped ephemeral channel and purges legacy storage for token-bearing callbacks", async () => {
    const channels: Array<{ name: string; postMessage: ReturnType<typeof vi.fn> }> = [];
    class MockBroadcastChannel {
      name: string;
      postMessage = vi.fn();
      close = vi.fn();
      constructor(name: string) {
        this.name = name;
        channels.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    localStorage.setItem("oauth_callback", JSON.stringify({ code: "stale-secret", timestamp: 1 }));
    window.history.replaceState(
      {},
      "",
      "/callback?access_token=zed_secret&user_id=user-1&state=flow_nonce"
    );

    await act(async () => {
      root.render(<CallbackPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(localStorage.getItem("oauth_callback")).toBeNull();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("oauth_callback:flow_nonce");
    expect(channels[0].postMessage).toHaveBeenCalledTimes(1);
    const payload = channels[0].postMessage.mock.calls[0][0];
    expect(payload.state).toBe("flow_nonce");
    expect(payload.code).toContain("access_token=zed_secret");
    expect(payload).not.toHaveProperty("fullUrl");
  });

  it("does not broadcast callback credentials when state is missing", async () => {
    const channelCtor = vi.fn();
    vi.stubGlobal("BroadcastChannel", channelCtor);
    localStorage.setItem("oauth_callback", "legacy-secret");
    window.history.replaceState({}, "", "/callback?code=code_without_state");

    await act(async () => {
      root.render(<CallbackPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(channelCtor).not.toHaveBeenCalled();
    expect(localStorage.getItem("oauth_callback")).toBeNull();
    expect(container.textContent).toContain("copyUrl");
  });

  it("delivers error callbacks only on the matching state-scoped channel without persistence", async () => {
    const channels: Array<{ name: string; postMessage: ReturnType<typeof vi.fn> }> = [];
    class MockBroadcastChannel {
      name: string;
      postMessage = vi.fn();
      close = vi.fn();
      constructor(name: string) {
        this.name = name;
        channels.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    localStorage.setItem("oauth_callback", "stale-error-secret");
    window.history.replaceState(
      {},
      "",
      "/callback?error=access_denied&error_description=denied&state=error_state"
    );

    await act(async () => {
      root.render(<CallbackPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(localStorage.getItem("oauth_callback")).toBeNull();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("oauth_callback:error_state");
    expect(channels[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "error_state",
        error: "access_denied",
        errorDescription: "denied",
      })
    );
    expect(channels[0].postMessage.mock.calls[0][0]).not.toHaveProperty("fullUrl");
  });
});

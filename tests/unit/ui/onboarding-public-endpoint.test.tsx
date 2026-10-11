// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/shared/hooks", () => ({
  useDisplayBaseUrl: () => "https://api.example.com",
}));

const { default: OnboardingWizard } =
  await import("../../../src/app/(dashboard)/dashboard/onboarding/page");

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function waitForText(text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

async function clickButton(label: string): Promise<void> {
  await act(async () => {
    findButton(label).click();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  pushMock.mockReset();
  replaceMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/settings") {
        return jsonResponse({ setupComplete: false, apiPort: 20131 });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    })
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("renders the public API URL instead of rebuilding an internal apiPort URL", async () => {
  await act(async () => {
    root.render(<OnboardingWizard />);
  });

  await waitForText("getStarted");
  await clickButton("getStarted");
  await clickButton("skip");
  await clickButton("skip");
  await clickButton("skip");
  await clickButton("skip");

  await waitForText("https://api.example.com/api/v1");
  expect(container.textContent).toContain("https://api.example.com/api/v1");
  expect(container.textContent).not.toContain(":20131/api/v1");
  expect(replaceMock).not.toHaveBeenCalled();
});

it("does not mark onboarding complete when require-login persistence fails", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/settings" && init?.method === "PATCH") {
      return jsonResponse({ setupComplete: true });
    }
    if (String(input) === "/api/settings") return jsonResponse({ setupComplete: false });
    if (String(input) === "/api/settings/require-login" && init?.method === "POST") {
      return { ok: false, status: 500 } as Response;
    }
    if (String(input) === "/api/settings/require-login")
      return jsonResponse({ hasPassword: false });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(<OnboardingWizard />));
  await waitForText("getStarted");
  await clickButton("getStarted");
  await clickButton("skip");
  await clickButton("skip");
  await clickButton("skip");
  await clickButton("skip");
  await clickButton("goToDashboard");
  expect(pushMock).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/api/settings",
    expect.objectContaining({ method: "PATCH" })
  );
  expect(container.textContent).toContain("connectionError");
});

it("bootstrap retry cannot replay a security write after moving to provider step", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/settings") return jsonResponse({ setupComplete: false });
    if (String(input) === "/api/settings/require-login" && init?.method === "POST") {
      return { ok: false, status: 401 } as Response;
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(<OnboardingWizard />));
  await waitForText("getStarted");
  await clickButton("getStarted");
  await clickButton("skip");
  const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await act(async () => checkbox.click());
  await clickButton("skipAndContinue");
  expect(container.textContent).toContain("This connection is not recognized as local.");
  await clickButton("skip");
  expect(container.textContent).toContain("providerDesc");
  expect(
    Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.trim() === "retry")
  ).toBe(false);
});

it("retry after Skip Wizard replays Finish even when the current step is welcome", async () => {
  const posts: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/settings" && init?.method === "PATCH") return jsonResponse({});
    if (String(input) === "/api/settings") return jsonResponse({ setupComplete: false });
    if (String(input) === "/api/settings/require-login" && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return posts.length === 1 ? ({ ok: false, status: 401 } as Response) : jsonResponse({});
    }
    if (String(input) === "/api/settings/require-login")
      return jsonResponse({ hasPassword: false });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(<OnboardingWizard />));
  await waitForText("getStarted");
  await clickButton("skipWizard");
  expect(container.textContent).toContain("This connection is not recognized as local.");
  const tokenInput = Array.from(container.querySelectorAll("input")).find(
    (input) => input.placeholder === "Bootstrap token"
  );
  expect(tokenInput).toBeDefined();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(tokenInput, "valid-test-token");
    tokenInput?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickButton("retry");
  expect(posts).toEqual([{ requireLogin: false }, { requireLogin: false }]);
  expect(pushMock).toHaveBeenCalledWith("/dashboard");
});

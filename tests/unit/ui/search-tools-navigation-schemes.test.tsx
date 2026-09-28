import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/shared/components/MonacoEditor", () => ({
  default: () => <div data-testid="mock-monaco" />,
}));

vi.mock("@/app/(dashboard)/dashboard/playground/components/MarkdownMessage", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

const { default: ResultsPanel } =
  await import("../../../src/app/(dashboard)/dashboard/search-tools/components/ResultsPanel");
const { default: ScrapeResult } =
  await import("../../../src/app/(dashboard)/dashboard/search-tools/components/ScrapeResult");
const { default: CompareTab } =
  await import("../../../src/app/(dashboard)/dashboard/search-tools/components/tabs/CompareTab");

const NAVIGATION_CASES = [
  { url: "javascript:alert(document.domain)", safe: false },
  { url: "data:text/html,<h1>agentproxy</h1>", safe: false },
  { url: "file:///etc/passwd", safe: false },
  { url: "custom://agentproxy/path", safe: false },
  { url: "not a url", safe: false },
  { url: "http://example.test/result", safe: true },
  { url: "https://example.test/result", safe: true },
] as const;

function findAnchor(container: HTMLElement, text: string): HTMLAnchorElement | null {
  return (
    Array.from(container.querySelectorAll("a")).find((anchor) => anchor.textContent === text) ??
    null
  );
}

function expectSafeNavigation(
  container: HTMLElement,
  linkText: string,
  url: string,
  safe: boolean
): void {
  const link = findAnchor(container, linkText);
  if (!safe) {
    expect(link, `expected inert rendering for ${url}`).toBeNull();
    expect(container.textContent).toContain(linkText);
    return;
  }

  expect(link, `expected rendered link for ${url}`).not.toBeNull();
  expect(link?.getAttribute("href")).toBe(url);
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
}

function renderResultsPanel(url: string): HTMLElement {
  const { container } = render(
    <ResultsPanel
      response={{
        id: "search-1",
        provider: "test-search",
        query: "q",
        cached: false,
        results: [{ title: "result", url, snippet: "snippet" }],
        usage: { queries_used: 1, search_cost_usd: 0 },
        metrics: { response_time_ms: 1, upstream_latency_ms: 1, total_results_available: 1 },
      }}
      rawJson="{}"
      loading={false}
      error=""
      statusCode={200}
      duration={1}
    />
  );
  return container;
}

function renderScrapeResult(url: string): HTMLElement {
  const { container } = render(
    <ScrapeResult
      result={{
        provider: "test-fetch",
        url,
        content: "body",
        links: [],
        metadata: { title: "title", description: null },
        screenshot_url: null,
      }}
    />
  );
  return container;
}

async function renderCompareResult(url: string): Promise<HTMLElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [{ title: "compare-result", url, snippet: "snippet" }],
            usage: { search_cost_usd: 0 },
            metrics: { response_time_ms: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    )
  );

  const { container, getByTestId } = render(
    <CompareTab
      providers={[
        {
          id: "test-search",
          name: "Test Search",
          kind: "search",
          costPerQuery: 0,
          freeMonthlyQuota: 1,
          status: "configured",
          configureHref: "/dashboard/providers",
        },
      ]}
    />
  );
  fireEvent.click(getByTestId("provider-toggle-test-search"));
  fireEvent.change(getByTestId("compare-query-input"), { target: { value: "q" } });
  fireEvent.click(getByTestId("run-compare-button"));
  await waitFor(() => expect(getByTestId("compare-results")).toBeTruthy());
  return container;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AP-ISS-0094 search-tool external navigation boundary", () => {
  for (const { url, safe } of NAVIGATION_CASES) {
    it(`enforces ResultsPanel navigation policy for ${url}`, () => {
      const container = renderResultsPanel(url);
      expectSafeNavigation(container, url, url, safe);
    });

    it(`enforces ScrapeResult navigation policy for ${url}`, () => {
      const container = renderScrapeResult(url);
      expectSafeNavigation(container, url, url, safe);
    });

    it(`enforces CompareTab navigation policy for ${url}`, async () => {
      const container = await renderCompareResult(url);
      expectSafeNavigation(container, "compare-result", url, safe);
    });
  }
});

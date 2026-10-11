// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/shared/hooks", () => ({ useDisplayBaseUrl: () => "https://public.example.test" }));

const { ApiExplorerClient } = await import("@/app/docs/components/ApiExplorerClient");
afterEach(cleanup);

it("uses the SSR-safe display base URL and preserves explicit user edits", () => {
  const { container } = render(<ApiExplorerClient />);
  const endpoint = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("/api/v1/chat/completions")
  );
  expect(endpoint).toBeDefined();
  fireEvent.click(endpoint!);
  const input = container.querySelector('input[type="text"]') as HTMLInputElement;
  expect(input.value).toBe("https://public.example.test");
  fireEvent.change(input, { target: { value: "https://custom.example.test" } });
  expect(input.value).toBe("https://custom.example.test");
});

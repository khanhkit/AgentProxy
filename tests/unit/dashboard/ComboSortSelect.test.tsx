import "../../_setup/jsdomGlobal.ts";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComboSortSelect } from "@/app/(dashboard)/dashboard/combos/ComboSortSelect";

const t = (_k: string, f: string) => f;

describe("ComboSortSelect", () => {
  it("renders four options and emits the chosen method", () => {
    let chosen = "";
    render(<ComboSortSelect value="manual" onChange={(mm) => (chosen = mm)} t={t} />);
    const select = screen.getByRole("combobox");
    expect((select as HTMLSelectElement).options.length).toBe(4);
    fireEvent.change(select, { target: { value: "provider" } });
    expect(chosen).toBe("provider");
  });
});

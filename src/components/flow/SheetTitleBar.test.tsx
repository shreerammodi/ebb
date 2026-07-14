import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFlowStore } from "@/lib/store/useFlowStore";

import SheetTitleBar from "./SheetTitleBar";

describe("SheetTitleBar", () => {
    it("shows the sheet title", () => {
        render(<SheetTitleBar sheetId="s1" title="Econ DA" side="neg" />);
        expect(screen.getByText("Econ DA")).toBeInTheDocument();
    });

    it("shows a tab label when given one", () => {
        render(<SheetTitleBar sheetId="s1" title="Econ DA" side="aff" tabLabel="Tab 1" />);
        expect(screen.getByText("Tab 1")).toBeInTheDocument();
    });

    it("marks the focused strip", () => {
        render(<SheetTitleBar sheetId="s1" title="Econ DA" side="aff" tabLabel="Tab 2" focused />);
        expect(screen.getByTestId("sheet-title-bar")).toHaveAttribute("data-focused", "true");
    });

    it("colors the title by side", () => {
        const { rerender } = render(<SheetTitleBar sheetId="s1" title="Econ DA" side="aff" />);
        expect(screen.getByText("Econ DA")).toHaveClass("text-aff");
        rerender(<SheetTitleBar sheetId="s1" title="Politics" side="neg" />);
        expect(screen.getByText("Politics")).toHaveClass("text-neg");
    });

    it("renames the sheet on click and commit", () => {
        let renamed: [string, string] | null = null;
        useFlowStore.setState({
            renameSheet: (id: string, title: string) => {
                renamed = [id, title];
            },
        });
        render(<SheetTitleBar sheetId="s1" title="Econ DA" side="aff" />);
        fireEvent.click(screen.getByText("Econ DA"));
        const input = screen.getByTestId("sheet-title-input-s1");
        fireEvent.change(input, { target: { value: "Politics" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(renamed).toEqual(["s1", "Politics"]);
    });
});

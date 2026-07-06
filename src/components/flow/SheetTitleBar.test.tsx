import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SheetTitleBar from "./SheetTitleBar";

describe("SheetTitleBar", () => {
    it("shows the sheet title", () => {
        render(<SheetTitleBar title="Econ DA" side="neg" />);
        expect(screen.getByText("Econ DA")).toBeInTheDocument();
    });

    it("shows a tab label when given one", () => {
        render(<SheetTitleBar title="Econ DA" side="aff" tabLabel="Tab 1" />);
        expect(screen.getByText("Tab 1")).toBeInTheDocument();
    });

    it("marks the focused strip", () => {
        render(<SheetTitleBar title="Econ DA" side="aff" tabLabel="Tab 2" focused />);
        expect(screen.getByTestId("sheet-title-bar")).toHaveAttribute("data-focused", "true");
    });

    it("colors the title by side", () => {
        const { rerender } = render(<SheetTitleBar title="Econ DA" side="aff" />);
        expect(screen.getByText("Econ DA")).toHaveClass("text-aff");
        rerender(<SheetTitleBar title="Politics" side="neg" />);
        expect(screen.getByText("Politics")).toHaveClass("text-neg");
    });
});

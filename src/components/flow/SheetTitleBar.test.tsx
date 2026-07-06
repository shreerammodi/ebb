import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SheetTitleBar from "./SheetTitleBar";

describe("SheetTitleBar", () => {
    it("shows the sheet title", () => {
        render(<SheetTitleBar title="Econ DA" />);
        expect(screen.getByText("Econ DA")).toBeInTheDocument();
    });

    it("shows a tab label when given one", () => {
        render(<SheetTitleBar title="Econ DA" tabLabel="Tab 1" />);
        expect(screen.getByText("Tab 1")).toBeInTheDocument();
    });

    it("marks the focused strip", () => {
        render(<SheetTitleBar title="Econ DA" tabLabel="Tab 2" focused />);
        expect(screen.getByTestId("sheet-title-bar")).toHaveAttribute("data-focused", "true");
    });
});

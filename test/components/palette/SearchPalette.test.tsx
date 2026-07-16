import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * SearchPalette (cell fuzzy-search) component tests. Uses the real Zustand
 * store, reset per test.
 */
import { describe, it, expect, beforeEach } from "vitest";

import SearchPalette from "@/components/palette/SearchPalette";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

function resetStore() {
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        revealTarget: null,
        quickSwitcherOpen: false,
        paletteSeed: "",
        settingsOpen: false,
    });
}

/** Round whose first flow sheet holds two filled cells; palette opened. */
function setupRound() {
    const round = makeFlowRound("aff");
    const sheet = round.sheets.find((s) => s.kind !== "cx")!;
    sheet.title = "Case";
    // col 0 = "1AC", col 1 = "1NC".
    sheet.data = [["perm do both", "topicality shell"]];
    useFlowStore.getState().loadRound(round);
    useFlowStore.getState().setQuickSwitcherOpen(true);
    return { sheetId: sheet.id };
}

describe("SearchPalette", () => {
    beforeEach(() => resetStore());

    it("renders nothing when closed", () => {
        setupRound();
        useFlowStore.getState().setQuickSwitcherOpen(false);
        render(<SearchPalette />);
        expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    });

    it("lists filled cells when the query is empty", () => {
        setupRound();
        render(<SearchPalette />);
        expect(screen.getByText("perm do both")).toBeInTheDocument();
        expect(screen.getByText("topicality shell")).toBeInTheDocument();
    });

    it("fuzzy-filters cells by the query", async () => {
        setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "topic");
        expect(screen.getAllByRole("option")).toHaveLength(1);
        expect(screen.getByText(/shell/)).toBeInTheDocument();
    });

    it("jumps the grid cursor to the cell on Enter and closes", async () => {
        const { sheetId } = setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "perm");
        await userEvent.keyboard("{Enter}");
        const state = useFlowStore.getState();
        expect(state.activeSheetId).toBe(sheetId);
        expect(state.revealTarget).toEqual({ sheetId, row: 0, col: 0 });
        expect(state.quickSwitcherOpen).toBe(false);
    });

    it("jumps to a cell on click", async () => {
        const { sheetId } = setupRound();
        render(<SearchPalette />);
        await userEvent.click(screen.getByTestId("sp-row-0"));
        expect(useFlowStore.getState().revealTarget).toEqual({ sheetId, row: 0, col: 0 });
    });

    it("switches to command mode when the query starts with >", async () => {
        setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), ">undo");
        // The label is split across per-char highlight spans, so match on the row.
        expect(screen.getByTestId("sp-row-0")).toHaveTextContent("Undo");
        // No cells listed in command mode.
        expect(screen.queryByText("perm do both")).not.toBeInTheDocument();
    });

    it("opens directly in command mode when seeded with >", () => {
        setupRound();
        useFlowStore.getState().setQuickSwitcherOpen(true, ">");
        render(<SearchPalette />);
        expect(screen.getByTestId("search-palette-input")).toHaveValue(">");
        // Empty command query lists commands in registry order; Undo is first.
        expect(screen.getByTestId("sp-row-0")).toHaveTextContent("Undo");
    });

    it("places the caret past the > seed rather than selecting it", () => {
        setupRound();
        useFlowStore.getState().setQuickSwitcherOpen(true, ">");
        render(<SearchPalette />);
        const input = screen.getByTestId("search-palette-input") as HTMLInputElement;
        // Collapsed selection at the end: typing appends, never overwrites ">".
        expect(input.selectionStart).toBe(1);
        expect(input.selectionEnd).toBe(1);
    });

    it("runs the selected command on Enter and closes", async () => {
        setupRound();
        useFlowStore.getState().setQuickSwitcherOpen(true, ">");
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "settings");
        await userEvent.keyboard("{Enter}");
        expect(useFlowStore.getState().settingsOpen).toBe(true);
        expect(useFlowStore.getState().quickSwitcherOpen).toBe(false);
    });

    it("closes on Escape without jumping", async () => {
        setupRound();
        render(<SearchPalette />);
        await userEvent.keyboard("{Escape}");
        expect(useFlowStore.getState().quickSwitcherOpen).toBe(false);
        expect(useFlowStore.getState().revealTarget).toBeNull();
    });
});

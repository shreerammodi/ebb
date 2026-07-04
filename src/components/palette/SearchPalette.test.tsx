import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * SearchPalette (sheet quick-switcher) component tests. Uses the real Zustand
 * store, reset per test.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import SearchPalette from "./SearchPalette";

function resetStore() {
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        quickSwitcherOpen: false,
        settingsOpen: false,
    });
}

/** Round with two extra sheets. */
function setupRound() {
    const store = useFlowStore.getState();
    store.loadRound(makeFlowRound("aff"));
    const caseId = store.addSheet({ title: "Case", group: "aff" });
    const daId = store.addSheet({ title: "Disad", group: "neg" });
    useFlowStore.getState().setQuickSwitcherOpen(true);
    return { caseId, daId };
}

describe("SearchPalette", () => {
    beforeEach(() => resetStore());

    it("renders nothing when closed", () => {
        setupRound();
        useFlowStore.getState().setQuickSwitcherOpen(false);
        render(<SearchPalette />);
        expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    });

    it("shows all sheets when the query is empty", () => {
        setupRound();
        render(<SearchPalette />);
        expect(screen.getByText("CX")).toBeInTheDocument();
        expect(screen.getByText("Case")).toBeInTheDocument();
        expect(screen.getByText("Disad")).toBeInTheDocument();
    });

    it("filters sheets by title substring", async () => {
        setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "dis");
        expect(screen.getByText("Disad")).toBeInTheDocument();
        expect(screen.queryByText("Case")).not.toBeInTheDocument();
    });

    it("activates the selected sheet on Enter and closes", async () => {
        const { daId } = setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "disad");
        await userEvent.keyboard("{Enter}");
        expect(useFlowStore.getState().activeSheetId).toBe(daId);
        expect(useFlowStore.getState().quickSwitcherOpen).toBe(false);
    });

    it("activates a sheet on click", async () => {
        const { caseId } = setupRound();
        render(<SearchPalette />);
        await userEvent.click(screen.getByTestId(`sp-sheet-${caseId}`));
        expect(useFlowStore.getState().activeSheetId).toBe(caseId);
    });

    it("closes on Escape without switching", async () => {
        const { daId } = setupRound();
        const before = useFlowStore.getState().activeSheetId;
        expect(before).toBe(daId);
        render(<SearchPalette />);
        await userEvent.keyboard("{Escape}");
        expect(useFlowStore.getState().quickSwitcherOpen).toBe(false);
        expect(useFlowStore.getState().activeSheetId).toBe(before);
    });
});

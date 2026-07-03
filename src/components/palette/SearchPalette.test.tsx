import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * SearchPalette component tests. Uses the real Zustand store, reset per test.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormatByKey } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import SearchPalette from "./SearchPalette";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
        quickSwitcherOpen: false,
        settingsOpen: false,
    });
}

/** Round with two sheets; one argument on the Disad sheet. */
function setupRound() {
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: makeFormatByKey("policy") });
    const caseId = store.addSheet({ title: "Case", group: "aff" });
    const daId = store.addSheet({ title: "Disad", group: "neg" });
    const speechId = useRoundStore.getState().round!.format.speeches[0].id;
    const nodeId = store.addNode({
        sheetId: daId,
        speechId,
        parentId: null,
        text: "Economy collapse impact",
    });
    useRoundStore.getState().setQuickSwitcherOpen(true);
    return { caseId, daId, speechId, nodeId };
}

describe("SearchPalette", () => {
    beforeEach(() => resetStore());

    it("renders nothing when closed", () => {
        setupRound();
        useRoundStore.getState().setQuickSwitcherOpen(false);
        render(<SearchPalette />);
        expect(screen.queryByTestId("search-palette")).not.toBeInTheDocument();
    });

    it("shows all sheets when the query is empty", () => {
        setupRound();
        render(<SearchPalette />);
        expect(screen.getByText("Case")).toBeInTheDocument();
        expect(screen.getByText("Disad")).toBeInTheDocument();
    });

    it("fuzzy-matches an argument and shows it under Arguments", async () => {
        setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "econ");
        expect(screen.getByText("Arguments")).toBeInTheDocument();
        expect(screen.getByText(/Economy collapse impact/)).toBeInTheDocument();
    });

    it("selecting a sheet switches to it and closes", async () => {
        const { daId } = setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "disad");
        await userEvent.keyboard("{Enter}");
        const s = useRoundStore.getState();
        expect(s.activeSheetId).toBe(daId);
        expect(s.quickSwitcherOpen).toBe(false);
    });

    it("selecting an argument switches, selects the node, and enters insert mode", async () => {
        const { daId, nodeId } = setupRound();
        render(<SearchPalette />);
        await userEvent.type(screen.getByTestId("search-palette-input"), "economy");
        await userEvent.keyboard("{Enter}");
        const s = useRoundStore.getState();
        expect(s.activeSheetId).toBe(daId);
        const node = s.round!.nodes.find((n) => n.id === nodeId)!;
        expect(s.selection).toMatchObject({
            sheetId: daId,
            speechId: node.speechId,
            row: node.row,
        });
        expect(s.quickSwitcherOpen).toBe(false);
    });
});

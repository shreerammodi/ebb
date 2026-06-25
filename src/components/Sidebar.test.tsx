/**
 * Sidebar component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import Sidebar from "./Sidebar";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        mode: "normal",
        selection: null,
        quickSwitcherOpen: false,
        settingsOpen: false,
    });
}

/** Bootstraps a round with a Case sheet and one off-case sheet. */
function setupRound() {
    const store = useRoundStore.getState();
    store.createRound({
        role: "aff",
        format: makeFormatByKey("policy"),
    });
    const caseId = store.addSheet({ title: "Case", group: "aff" });
    const daId = store.addSheet({ title: "Disad", group: "neg" });
    return { caseId, daId };
}

describe("Sidebar", () => {
    beforeEach(() => {
        resetStore();
    });

    it("lists sheets grouped as Aff / Neg", () => {
        setupRound();
        render(<Sidebar />);

        // Group headers
        expect(screen.getByText("Aff")).toBeInTheDocument();
        expect(screen.getByText("Neg")).toBeInTheDocument();
        // Aff sheet title
        expect(screen.getByText("Case")).toBeInTheDocument();
        // Neg sheet title
        expect(screen.getByText("Disad")).toBeInTheDocument();
    });

    it("shows a drop badge when a sheet has drops", () => {
        const { caseId } = setupRound();
        const store = useRoundStore.getState();
        const round = store.round!;
        const speeches = round.format.speeches;
        const affSpeech = speeches.find((s) => s.side === "aff")!; // 1AC
        const negSpeech = speeches.find((s) => s.side === "neg")!; // 1NC

        // An aff argument that the neg never answers, plus a neg node so that the
        // opposing speech "happened" — this makes the aff node a drop.
        store.addNode({
            sheetId: caseId,
            speechId: affSpeech.id,
            parentId: null,
            text: "Contention 1",
        });
        store.addNode({
            sheetId: caseId,
            speechId: negSpeech.id,
            parentId: null,
            text: "Off-topic",
        });

        render(<Sidebar />);

        expect(screen.getByTestId(`drop-badge-${caseId}`)).toBeInTheDocument();
    });

    it("clicking a sheet calls setActiveSheet", async () => {
        const user = userEvent.setup();
        const { caseId, daId } = setupRound();

        render(<Sidebar />);

        await user.click(screen.getByTestId(`sheet-${daId}`));
        expect(useRoundStore.getState().activeSheetId).toBe(daId);

        await user.click(screen.getByTestId(`sheet-${caseId}`));
        expect(useRoundStore.getState().activeSheetId).toBe(caseId);
    });

    it('shows "+ Aff" and "+ Neg" buttons, not "+ Add sheet"', () => {
        setupRound();
        render(<Sidebar />);
        expect(screen.queryByTestId("add-sheet")).toBeNull();
        expect(screen.getByTestId("add-aff")).toBeInTheDocument();
        expect(screen.getByTestId("add-neg")).toBeInTheDocument();
    });

    it('"+ Aff" button adds an aff sheet and makes it active', async () => {
        const user = userEvent.setup();
        setupRound();
        const beforeCount = useRoundStore.getState().round!.sheets.length;

        render(<Sidebar />);
        await user.click(screen.getByTestId("add-aff"));

        const state = useRoundStore.getState();
        const sheets = state.round!.sheets;
        expect(sheets).toHaveLength(beforeCount + 1);
        const newest = sheets[sheets.length - 1];
        expect(newest.group).toBe("aff");
        expect(state.activeSheetId).toBe(newest.id);
    });

    it('"+ Neg" button adds a neg sheet and makes it active', async () => {
        const user = userEvent.setup();
        setupRound();
        const beforeCount = useRoundStore.getState().round!.sheets.length;

        render(<Sidebar />);
        await user.click(screen.getByTestId("add-neg"));

        const state = useRoundStore.getState();
        const sheets = state.round!.sheets;
        expect(sheets).toHaveLength(beforeCount + 1);
        const newest = sheets[sheets.length - 1];
        expect(newest.group).toBe("neg");
        expect(state.activeSheetId).toBe(newest.id);
    });

    it("double-clicking a sheet title shows a rename input", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();

        render(<Sidebar />);
        const sheetBtn = screen.getByTestId(`sheet-${caseId}`);
        await user.dblClick(sheetBtn);

        expect(
            screen.getByTestId(`rename-input-${caseId}`),
        ).toBeInTheDocument();
    });

    it("pressing Enter in rename input commits the new name", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();

        render(<Sidebar />);
        await user.dblClick(screen.getByTestId(`sheet-${caseId}`));

        const input = screen.getByTestId(`rename-input-${caseId}`);
        await user.clear(input);
        await user.type(input, "New Name{Enter}");

        expect(
            useRoundStore.getState().round!.sheets.find((s) => s.id === caseId)!
                .title,
        ).toBe("New Name");
        expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
    });

    it("pressing Escape in rename input cancels without renaming", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();
        const originalTitle = useRoundStore
            .getState()
            .round!.sheets.find((s) => s.id === caseId)!.title;

        render(<Sidebar />);
        await user.dblClick(screen.getByTestId(`sheet-${caseId}`));

        const input = screen.getByTestId(`rename-input-${caseId}`);
        await user.clear(input);
        await user.type(input, "Changed");
        await user.keyboard("{Escape}");

        expect(
            useRoundStore.getState().round!.sheets.find((s) => s.id === caseId)!
                .title,
        ).toBe(originalTitle);
        expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
    });

    it("renders a CX section labeled above the Aff section", () => {
        setupRound();
        render(<Sidebar />);
        // The CX section label is a standalone div (not inside the cx-sheet-row button)
        const cxSheetRow = screen.getByTestId("cx-sheet-row");
        const cxLabel = screen.getByTestId("cx-section-label");
        const affLabel = screen.getByText("Aff");
        // CX label appears before Aff label in document order
        expect(
            cxLabel.compareDocumentPosition(affLabel) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // CX section label is NOT inside the cx-sheet-row button
        expect(cxSheetRow.contains(cxLabel)).toBe(false);
        // the CX sheet row is still present + clickable
        expect(cxSheetRow).toBeTruthy();
    });

    it("activates the CX sheet when its row is clicked", async () => {
        const user = userEvent.setup();
        setupRound();
        render(<Sidebar />);
        const cxId = useRoundStore
            .getState()
            .round!.sheets.find((s) => s.kind === "cx")!.id;
        await user.click(screen.getByTestId("cx-sheet-row"));
        expect(useRoundStore.getState().activeSheetId).toBe(cxId);
    });

    it("CX sheet row has no delete affordance", () => {
        setupRound();
        render(<Sidebar />);
        const cxId = useRoundStore
            .getState()
            .round!.sheets.find((s) => s.kind === "cx")!.id;
        expect(screen.queryByTestId(`delete-sheet-${cxId}`)).toBeNull();
    });

    it("deletes a flow sheet when its × is clicked, and it is undoable", async () => {
        const user = userEvent.setup();
        setupRound();
        const id = useRoundStore
            .getState()
            .addSheet({ title: "Case2", group: "aff" });

        render(<Sidebar />);

        await user.click(screen.getByTestId(`delete-sheet-${id}`));
        expect(
            useRoundStore.getState().round!.sheets.some((s) => s.id === id),
        ).toBe(false);

        useRoundStore.getState().undo();
        expect(
            useRoundStore.getState().round!.sheets.some((s) => s.id === id),
        ).toBe(true);
    });
});

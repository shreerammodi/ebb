/**
 * Sidebar component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import Sidebar from "./Sidebar";

function renderSidebar() {
    return render(
        <TooltipProvider>
            <Sidebar />
        </TooltipProvider>,
    );
}

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
import { toast } from "sonner";

/** Pulls the `action` config out of the most recent `toast(...)` call. */
function lastToastAction(): { label: string; onClick: () => void } {
    const calls = vi.mocked(toast).mock.calls;
    const opts = calls[calls.length - 1]?.[1] as
        | { action?: { label: string; onClick: () => void } }
        | undefined;
    if (!opts?.action) throw new Error("last toast had no action");
    return opts.action;
}

function resetStore() {
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        renamingSheetId: null,
        sidebarCollapsed: false,
    });
}

/** Bootstraps a round with a Case sheet and one off-case sheet. */
function setupRound() {
    const store = useFlowStore.getState();
    store.loadRound(makeFlowRound("aff"));
    const caseId = store.addSheet({ title: "Case", group: "aff" });
    const daId = store.addSheet({ title: "Disad", group: "neg" });
    return { caseId, daId };
}

describe("Sidebar", () => {
    beforeEach(() => {
        resetStore();
    });

    it("lists all flow sheets in one order-sorted list with side markers", () => {
        const { caseId, daId } = setupRound();
        renderSidebar();

        // Both titles present in the unified list
        expect(screen.getByText("Case")).toBeInTheDocument();
        expect(screen.getByText("Disad")).toBeInTheDocument();

        // Side markers reflect each sheet's group, not its position
        expect(screen.getByTestId(`sheet-marker-${caseId}`)).toHaveClass("bg-aff");
        expect(screen.getByTestId(`sheet-marker-${daId}`)).toHaveClass("bg-neg");
    });

    it("clicking a sheet calls setActiveSheet", async () => {
        const user = userEvent.setup();
        const { caseId, daId } = setupRound();

        renderSidebar();

        await user.click(screen.getByTestId(`sheet-${daId}`));
        expect(useFlowStore.getState().activeSheetId).toBe(daId);

        await user.click(screen.getByTestId(`sheet-${caseId}`));
        expect(useFlowStore.getState().activeSheetId).toBe(caseId);
    });

    it('shows "+ Aff" and "+ Neg" buttons, not "+ Add sheet"', () => {
        setupRound();
        renderSidebar();
        expect(screen.queryByTestId("add-sheet")).toBeNull();
        expect(screen.getByTestId("add-aff")).toBeInTheDocument();
        expect(screen.getByTestId("add-neg")).toBeInTheDocument();
    });

    it('"+ Aff" button adds an aff sheet and makes it active', async () => {
        const user = userEvent.setup();
        setupRound();
        const beforeCount = useFlowStore.getState().round!.sheets.length;

        renderSidebar();
        await user.click(screen.getByTestId("add-aff"));

        const state = useFlowStore.getState();
        const sheets = state.round!.sheets;
        expect(sheets).toHaveLength(beforeCount + 1);
        const newest = sheets[sheets.length - 1];
        expect(newest.group).toBe("aff");
        expect(state.activeSheetId).toBe(newest.id);
    });

    it('"+ Neg" button adds a neg sheet and makes it active', async () => {
        const user = userEvent.setup();
        setupRound();
        const beforeCount = useFlowStore.getState().round!.sheets.length;

        renderSidebar();
        await user.click(screen.getByTestId("add-neg"));

        const state = useFlowStore.getState();
        const sheets = state.round!.sheets;
        expect(sheets).toHaveLength(beforeCount + 1);
        const newest = sheets[sheets.length - 1];
        expect(newest.group).toBe("neg");
        expect(state.activeSheetId).toBe(newest.id);
    });

    it("double-clicking a sheet title shows a rename input", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();

        renderSidebar();
        const sheetBtn = screen.getByTestId(`sheet-${caseId}`);
        await user.dblClick(sheetBtn);

        expect(screen.getByTestId(`rename-input-${caseId}`)).toBeInTheDocument();
    });

    it("pressing Enter in rename input commits the new name", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();

        renderSidebar();
        await user.dblClick(screen.getByTestId(`sheet-${caseId}`));

        const input = screen.getByTestId(`rename-input-${caseId}`);
        await user.clear(input);
        await user.type(input, "New Name{Enter}");

        expect(useFlowStore.getState().round!.sheets.find((s) => s.id === caseId)!.title).toBe(
            "New Name",
        );
        expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
    });

    it("pressing Escape in rename input cancels without renaming", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();
        const originalTitle = useFlowStore
            .getState()
            .round!.sheets.find((s) => s.id === caseId)!.title;

        renderSidebar();
        await user.dblClick(screen.getByTestId(`sheet-${caseId}`));

        const input = screen.getByTestId(`rename-input-${caseId}`);
        await user.clear(input);
        await user.type(input, "Changed");
        await user.keyboard("{Escape}");

        expect(useFlowStore.getState().round!.sheets.find((s) => s.id === caseId)!.title).toBe(
            originalTitle,
        );
        expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
    });

    it("renders a CX section labeled above the Aff section", () => {
        setupRound();
        renderSidebar();
        // The CX section label is a standalone div (not inside the cx-sheet-row button)
        const cxSheetRow = screen.getByTestId("cx-sheet-row");
        const cxLabel = screen.getByTestId("cx-section-label");
        const listLabel = screen.getByTestId("sheets-section-label");
        // CX label appears before the unified sheets list label in document order
        expect(
            cxLabel.compareDocumentPosition(listLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // CX section label is NOT inside the cx-sheet-row button
        expect(cxSheetRow.contains(cxLabel)).toBe(false);
        // the CX sheet row is still present + clickable
        expect(cxSheetRow).toBeTruthy();
    });

    it("activates the CX sheet when its row is clicked", async () => {
        const user = userEvent.setup();
        setupRound();
        renderSidebar();
        const cxId = useFlowStore.getState().round!.sheets.find((s) => s.kind === "cx")!.id;
        await user.click(screen.getByTestId("cx-sheet-row"));
        expect(useFlowStore.getState().activeSheetId).toBe(cxId);
    });

    it("CX sheet row has no delete affordance", () => {
        setupRound();
        renderSidebar();
        const cxId = useFlowStore.getState().round!.sheets.find((s) => s.kind === "cx")!.id;
        expect(screen.queryByTestId(`delete-sheet-${cxId}`)).toBeNull();
    });

    it("clicking a sheet's × deletes it and the Undo toast restores it", async () => {
        const user = userEvent.setup();
        setupRound();
        const id = useFlowStore.getState().addSheet({ title: "Case2", group: "aff" });

        renderSidebar();

        await user.click(screen.getByTestId(`delete-sheet-${id}`));
        expect(useFlowStore.getState().round!.sheets.some((s) => s.id === id)).toBe(false);

        // The toast carries an Undo action; invoking it brings the sheet back.
        const action = lastToastAction();
        expect(action.label).toBe("Undo");
        action.onClick();
        expect(useFlowStore.getState().round!.sheets.some((s) => s.id === id)).toBe(true);
    });

    it("exposes accessible side label for aff sheets", () => {
        const { caseId } = setupRound();
        renderSidebar();
        const row = screen.getByTestId(`sheet-${caseId}`);
        const srLabel = row.querySelector(".sr-only");
        expect(srLabel).toBeInTheDocument();
        expect(srLabel!.textContent).toBe("Aff");
    });

    it("exposes accessible side label for neg sheets", () => {
        const { daId } = setupRound();
        renderSidebar();
        const row = screen.getByTestId(`sheet-${daId}`);
        const srLabel = row.querySelector(".sr-only");
        expect(srLabel).toBeInTheDocument();
        expect(srLabel!.textContent).toBe("Neg");
    });

    // Drag-to-reorder is driven by Motion's Reorder pointer gestures, which need
    // real layout measurement jsdom can't provide; the store's reorderSheets is
    // covered directly in useFlowStore.test.ts.
    it("renders flow sheets in order for reordering", () => {
        const { caseId, daId } = setupRound();
        renderSidebar();
        const ids = screen
            .getAllByTestId(/^sheet-(?!marker)/)
            .map((r) => r.getAttribute("data-testid"));
        expect(ids.indexOf(`sheet-${caseId}`)).toBeLessThan(ids.indexOf(`sheet-${daId}`));
    });
});

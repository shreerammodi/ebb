/**
 * Sidebar component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { render, screen, fireEvent, createEvent } from "@testing-library/react";
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

    it("reorders sheets via drag and drop", () => {
        const { caseId, daId } = setupRound(); // Case(aff) then Disad(neg), order 1,2
        renderSidebar();

        // Drag Disad and drop it in the top half of the Case row, so it inserts
        // just before Case.
        const source = screen.getByTestId(`sheet-${daId}`);
        const caseRow = rowFor(caseId);
        const dataTransfer = makeDataTransfer();
        fireEvent.dragStart(source, { dataTransfer });
        // Point just above the Case row's midpoint, so Disad inserts before it.
        fireDnd("dragOver", caseRow, dataTransfer, midTopOf(caseRow));
        fireDnd("drop", caseRow, dataTransfer, midTopOf(caseRow));

        const sheets = useFlowStore.getState().round!.sheets;
        const order = (id: string) => sheets.find((s) => s.id === id)!.order;
        expect(order(daId)).toBeLessThan(order(caseId));
    });

    it("reorders on a fast drop that skips the dragover state update", () => {
        // A quick drag fires drop before React commits the dragstart/dragover
        // setState, so the drop must resolve source and target from the event
        // itself rather than from dragId/dropIndex state (which is still null).
        const { caseId, daId } = setupRound();
        renderSidebar();

        const source = screen.getByTestId(`sheet-${daId}`);
        const caseRow = rowFor(caseId);
        const dataTransfer = makeDataTransfer();
        fireEvent.dragStart(source, { dataTransfer });
        fireDnd("drop", caseRow, dataTransfer, midTopOf(caseRow)); // no dragOver in between

        const sheets = useFlowStore.getState().round!.sheets;
        const order = (id: string) => sheets.find((s) => s.id === id)!.order;
        expect(order(daId)).toBeLessThan(order(caseId));
    });
});

// jsdom getBoundingClientRect is always zero, so stub stacked rects on the sheet
// rows to make the container's pointer-to-index math meaningful. Returns the row
// wrapping sheet `id`.
function rowFor(id: string): HTMLElement {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-sheet-row]"));
    rows.forEach((row, i) => {
        row.getBoundingClientRect = () =>
            ({
                top: i * 20,
                bottom: i * 20 + 20,
                height: 20,
                left: 0,
                right: 0,
                width: 0,
                x: 0,
                y: i * 20,
            }) as DOMRect;
    });
    const target = rows.find((r) => r.querySelector(`[data-testid="sheet-${id}"]`));
    if (!target) throw new Error(`no sheet row for ${id}`);
    return target;
}

// A clientY just above the row's midpoint, so a drop resolves to "insert before
// this row".
function midTopOf(row: HTMLElement): number {
    const rect = row.getBoundingClientRect();
    return rect.top + rect.height / 2 - 1;
}

// jsdom lacks DragEvent, so fireEvent's init never sets clientY; build the event
// and define clientY ourselves.
function fireDnd(
    type: "dragOver" | "drop",
    el: HTMLElement,
    dataTransfer: unknown,
    clientY: number,
) {
    const ev = createEvent[type](el, { dataTransfer });
    Object.defineProperty(ev, "clientY", { value: clientY });
    fireEvent(el, ev);
}

// A shared dataTransfer mirrors the browser: dragstart writes the sheet id and
// drop reads it back, so the reorder never depends on not-yet-flushed state.
// jsdom has no DataTransfer, so stub the surface the handlers touch.
function makeDataTransfer() {
    const store: Record<string, string> = {};
    return {
        effectAllowed: "",
        dropEffect: "",
        setData: (type: string, value: string) => {
            store[type] = value;
        },
        getData: (type: string) => store[type] ?? "",
    };
}

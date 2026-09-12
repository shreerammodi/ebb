/**
 * Sidebar component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import Sidebar from "@/components/flow/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { focusActiveHot } from "@/lib/grid/hotInstance";
import { makeFlowRound } from "@/lib/model/flow";
import { type CollabPeerView, useCollabStore } from "@/lib/store/useCollabStore";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { useSidebarPopup } from "@/lib/store/useSidebarPopup";

vi.mock("@/lib/grid/hotInstance", () => ({ focusActiveHot: vi.fn() }));
vi.mock("@/lib/collab/runtime", () => ({
    disconnectPeer: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
}));
vi.mock("@/lib/collab/inbox", () => ({ acceptInvite: vi.fn(async () => {}) }));
import { acceptInvite } from "@/lib/collab/inbox";
import { disconnectPeer, endSession } from "@/lib/collab/runtime";

const ALEX: CollabPeerView = {
    endpointId: "alex-endpoint",
    name: "Alex",
    role: "editor",
    connectionType: "direct",
};

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
    useCollabStore.getState().reset();
    useSidebarPopup.setState({ open: null });
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        renamingSheetId: null,
        sheetRange: null,
        sidebarCollapsed: false,
        sidebarWidth: 220,
        contacts: {},
    });
}

/** Bootstraps a round with a Case sheet and one off-case sheet. */
function setupRound() {
    const store = useFlowStore.getState();
    store.loadRound(makeFlowRound({}));
    const caseId = store.addSheet({ title: "Case", group: "aff" });
    const daId = store.addSheet({ title: "Disad", group: "neg" });
    return { caseId, daId };
}

describe("Sidebar", () => {
    beforeEach(() => {
        resetStore();
        vi.clearAllMocks();
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

    describe("resizing", () => {
        it("drags the expanded sidebar within its width bounds", () => {
            setupRound();
            renderSidebar();
            const sidebar = screen.getByTestId("sidebar");
            const handle = screen.getByRole("separator", { name: "Resize sidebar" });

            fireEvent.pointerDown(handle, { pointerId: 1, clientX: 220 });
            fireEvent.pointerMove(handle, { pointerId: 1, clientX: 540 });
            expect(sidebar).toHaveStyle({ width: "420px" });
            fireEvent.pointerUp(handle, { pointerId: 1, clientX: 540 });

            expect(useFlowStore.getState().sidebarWidth).toBe(420);
        });

        it("resizes from the keyboard and exposes the current width", async () => {
            const user = userEvent.setup();
            setupRound();
            renderSidebar();
            const handle = screen.getByRole("separator", { name: "Resize sidebar" });

            await user.click(handle);
            await user.keyboard("{ArrowRight}");
            expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "230px" });
            expect(handle).toHaveAttribute("aria-valuenow", "230");

            await user.keyboard("{Home}");
            expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "140px" });
        });

        it("restores the resized width after collapsing and expanding", async () => {
            const user = userEvent.setup();
            setupRound();
            useFlowStore.setState({ sidebarWidth: 320 });
            renderSidebar();

            await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
            await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

            expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "320px" });
        });
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
        // The row focuses + selects the input on a deferred frame; wait for that
        // so the auto-select doesn't fire mid-type and clobber the first chars.
        await waitFor(() => expect(input).toHaveFocus());
        await user.clear(input);
        await user.type(input, "New Name{Enter}");

        expect(useFlowStore.getState().round!.sheets.find((s) => s.id === caseId)!.title).toBe(
            "New Name",
        );
        expect(screen.queryByTestId(`rename-input-${caseId}`)).toBeNull();
    });

    it("refocuses the grid after committing a rename", async () => {
        const user = userEvent.setup();
        const { caseId } = setupRound();

        renderSidebar();
        await user.dblClick(screen.getByTestId(`sheet-${caseId}`));
        const input = screen.getByTestId(`rename-input-${caseId}`);
        await waitFor(() => expect(input).toHaveFocus());
        vi.mocked(focusActiveHot).mockClear();
        await user.type(input, "{Enter}");

        expect(focusActiveHot).toHaveBeenCalled();
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
    // covered directly in useFlowStore.test.ts, and where a dragged block of
    // sheets lands is covered by dropSheetRange in model/flow.test.ts.
    it("renders flow sheets in order for reordering", () => {
        const { caseId, daId } = setupRound();
        renderSidebar();
        const ids = screen
            .getAllByTestId(/^sheet-(?!marker)/)
            .map((r) => r.getAttribute("data-testid"));
        expect(ids.indexOf(`sheet-${caseId}`)).toBeLessThan(ids.indexOf(`sheet-${daId}`));
    });

    describe("selecting a range", () => {
        /** The round, plus a third sheet, with the first one active. */
        function threeSheets() {
            const { caseId, daId } = setupRound();
            const store = useFlowStore.getState();
            const extraId = store.addSheet({ title: "T", group: "neg" });
            store.setActiveSheet(caseId);
            return { caseId, daId, extraId };
        }

        /** Clicks a row with Shift genuinely held down, as a debater does. */
        async function shiftClick(user: UserEvent, id: string) {
            await user.keyboard("{Shift>}");
            await user.click(screen.getByTestId(`sheet-${id}`));
            await user.keyboard("{/Shift}");
        }

        it("paints the range on a shifted click and leaves the grid where it is", async () => {
            const user = userEvent.setup();
            const { caseId, daId, extraId } = threeSheets();
            renderSidebar();

            await shiftClick(user, extraId);

            expect(useFlowStore.getState().activeSheetId).toBe(caseId);
            for (const id of [caseId, daId, extraId]) {
                expect(screen.getByTestId(`sheet-${id}`)).toHaveAttribute("data-selected", "true");
            }
        });

        it("reads the count in the section label", async () => {
            const user = userEvent.setup();
            const { daId } = threeSheets();
            renderSidebar();

            expect(screen.getByTestId("sheets-section-label")).toHaveTextContent("Sheets");
            await shiftClick(user, daId);
            expect(screen.getByTestId("sheets-section-label")).toHaveTextContent("2 selected");
        });

        it("collapses the range on a plain click", async () => {
            const user = userEvent.setup();
            const { caseId, daId } = threeSheets();
            renderSidebar();

            await shiftClick(user, daId);
            await user.click(screen.getByTestId(`sheet-${daId}`));

            expect(useFlowStore.getState().sheetRange).toBeNull();
            expect(useFlowStore.getState().activeSheetId).toBe(daId);
            expect(screen.getByTestId(`sheet-${caseId}`)).not.toHaveAttribute("data-selected");
        });

        it("ends the range when a row inside it is deleted", async () => {
            const user = userEvent.setup();
            const { daId, extraId } = threeSheets();
            renderSidebar();

            await shiftClick(user, extraId);
            await user.click(screen.getByTestId(`delete-sheet-${daId}`));

            expect(useFlowStore.getState().sheetRange).toBeNull();
            expect(screen.getByTestId("sheets-section-label")).toHaveTextContent("Sheets");
        });
    });

    describe("session chip", () => {
        it("shows no chip while no session is live", () => {
            setupRound();
            renderSidebar();
            expect(screen.queryByTestId("collab-chip")).toBeNull();
        });

        it("puts a live session in the footer, below the sheet list", () => {
            const { caseId } = setupRound();
            useCollabStore.setState({ status: "connected", peers: [] });
            renderSidebar();

            const chip = screen.getByTestId("collab-chip");
            expect(screen.getByTestId("sidebar")).toContainElement(chip);

            // Below every sheet row, so it covers no sheet name.
            const row = screen.getByTestId(`sheet-${caseId}`);
            expect(
                row.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });

        it("floats the chip past the rail while the sidebar is collapsed", () => {
            setupRound();
            useFlowStore.setState({ sidebarCollapsed: true });
            useCollabStore.setState({ status: "connected", peers: [] });
            renderSidebar();

            const chip = screen.getByTestId("collab-chip");
            expect(screen.getByTestId("sidebar")).not.toContainElement(chip);

            // Pinned over the grid's left edge, not carried by the rail's flow.
            const slot = chip.closest(".fixed");
            expect(slot).not.toBeNull();
            expect(slot).not.toHaveClass("relative");
        });

        // The chip draws its actions only for a caller that wired them, so an
        // unwired mount would leave both unreachable.
        it.each([false, true])(
            "reaches the session actions with the sidebar collapsed=%s",
            async (collapsed) => {
                setupRound();
                useFlowStore.setState({ sidebarCollapsed: collapsed });
                useCollabStore.setState({ status: "connected", peers: [ALEX] });
                renderSidebar();

                await userEvent.click(screen.getByTestId("collab-chip"));
                await userEvent.click(screen.getByTestId("collab-peer-disconnect"));
                expect(disconnectPeer).toHaveBeenCalledWith("alex-endpoint");

                await userEvent.click(screen.getByTestId("collab-end-session"));
                expect(endSession).toHaveBeenCalled();
            },
        );
    });

    describe("invite chip", () => {
        const ALEX = "a1e0".repeat(16);
        const HARVARD = { endpointId: ALEX, roundId: "round_1", label: "Round 3 - Harvard" };

        function invited() {
            useFlowStore.setState({ contacts: { [ALEX]: { name: "Alex" } } });
            useCollabStore.getState().pushInvite(HARVARD);
        }

        it("shows no chip while nobody has offered a round", () => {
            setupRound();
            renderSidebar();
            expect(screen.queryByTestId("collab-invite-chip")).toBeNull();
        });

        // Thirty seconds of toast is the only other way to see this from
        // inside a round.
        it("surfaces a waiting invitation without leaving the flow", async () => {
            setupRound();
            invited();
            renderSidebar();

            await userEvent.click(screen.getByTestId("collab-invite-chip"));
            expect(screen.getByTestId("collab-invite-row")).toHaveTextContent(
                "Alex shared Round 3 - Harvard",
            );
        });

        it.each([false, true])("reaches the invitation with collapsed=%s", async (collapsed) => {
            setupRound();
            useFlowStore.setState({ sidebarCollapsed: collapsed });
            invited();
            renderSidebar();

            await userEvent.click(screen.getByTestId("collab-invite-chip"));
            await userEvent.click(screen.getByTestId("collab-invite-join"));
            expect(acceptInvite).toHaveBeenCalledWith(HARVARD);
        });

        it("sits above the session chip, so the newer thing is nearer the sheets", () => {
            setupRound();
            invited();
            useCollabStore.setState({ status: "connected", peers: [] });
            renderSidebar();

            const invite = screen.getByTestId("collab-invite-chip");
            const session = screen.getByTestId("collab-chip");
            expect(
                invite.compareDocumentPosition(session) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });
    });
});

describe("the share button", () => {
    beforeEach(() => {
        resetStore();
        vi.clearAllMocks();
        // Sharing is offered where an endpoint can be bound. isDesktop()
        // reads this global, and jsdom has no shell unless a test says so.
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    it("sits beside the session chip when a round is open", () => {
        setupRound();
        renderSidebar();
        expect(screen.getByTestId("sidebar-share")).toBeInTheDocument();
    });

    // Four routes behind one button, because the debater answers two
    // questions and not four: who is arriving, and what they may do.
    it("offers both grants for a saved partner and for a code", async () => {
        setupRound();
        renderSidebar();

        await userEvent.click(screen.getByTestId("sidebar-share"));

        expect(await screen.findByTestId("sidebar-invite-editor")).toBeInTheDocument();
        expect(screen.getByTestId("sidebar-invite-viewer")).toBeInTheDocument();
        expect(screen.getByTestId("sidebar-code-editor")).toBeInTheDocument();
        expect(screen.getByTestId("sidebar-code-viewer")).toBeInTheDocument();
    });

    it("offers joining beside the round too, not only from the palette", () => {
        setupRound();
        renderSidebar();
        expect(screen.getByTestId("sidebar-join")).toBeInTheDocument();
    });

    // The sidebar is the flow screen's, so with nothing open there is nothing
    // here at all - the start screen is what a debater is looking at.
    it("is not on screen at all with no flow open", () => {
        renderSidebar();
        expect(screen.queryByTestId("share-controls")).toBeNull();
    });

    // Collapsing is a request for the grid's width; Share and Join are drawn
    // in every round, so floating them would overlay the flow permanently.
    it("is off the collapsed rail, leaving the grid's edge clear", () => {
        setupRound();
        useFlowStore.setState({ sidebarCollapsed: true });
        renderSidebar();
        expect(screen.queryByTestId("sidebar-share")).toBeNull();
        expect(screen.queryByTestId("sidebar-join")).toBeNull();
    });

    // Shown before there is anybody to invite, so the route is discoverable
    // rather than appearing out of nowhere once a first partner is saved.
    it("shows the saved-partner entries dead until there is a partner", async () => {
        setupRound();
        const { unmount } = renderSidebar();
        await userEvent.click(screen.getByTestId("sidebar-share"));
        expect(await screen.findByTestId("sidebar-invite-editor")).toHaveAttribute("data-disabled");
        unmount();

        useFlowStore.setState({ contacts: { [`${"a".repeat(64)}`]: { name: "Alex" } } });
        renderSidebar();
        await userEvent.click(screen.getByTestId("sidebar-share"));
        expect(await screen.findByTestId("sidebar-invite-editor")).not.toHaveAttribute(
            "data-disabled",
        );
    });

    // The corner is the sidebar's, so a flow that closes with the menu open
    // must not bring it back open when the next round draws the corner again.
    it("releases the corner when the sidebar goes", async () => {
        setupRound();
        const { unmount } = renderSidebar();
        await userEvent.click(screen.getByTestId("sidebar-share"));
        expect(await screen.findByTestId("sidebar-invite-editor")).toBeInTheDocument();

        unmount();
        expect(useSidebarPopup.getState().open).toBeNull();

        renderSidebar();
        expect(screen.queryByTestId("sidebar-invite-editor")).toBeNull();
    });

    // A browser cannot bind an endpoint, so a button here would offer a
    // debater something that cannot exist.
    it("is absent off the desktop, round or no round", () => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
        setupRound();
        renderSidebar();
        expect(screen.queryByTestId("share-controls")).toBeNull();
    });
});

// The two chips draw upward from the same corner and the Invite menu opens
// over them, so two of these on screen at once is two panels stacked on one
// another.
describe("the sidebar's popups", () => {
    beforeEach(() => {
        resetStore();
        vi.clearAllMocks();
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    it("closes the session panel when the invitations panel opens, and back", async () => {
        setupRound();
        useCollabStore.setState({ status: "connected", peers: [ALEX] });
        useCollabStore.getState().pushInvite({
            endpointId: "b".repeat(64),
            roundId: "round_1",
            label: "Round 3 - Harvard",
        });
        renderSidebar();

        await userEvent.click(screen.getByTestId("collab-chip"));
        expect(screen.getByTestId("collab-chip-peers")).toBeInTheDocument();

        await userEvent.click(screen.getByTestId("collab-invite-chip"));
        expect(screen.getByTestId("collab-invite-list")).toBeInTheDocument();
        expect(screen.queryByTestId("collab-chip-peers")).toBeNull();

        await userEvent.click(screen.getByTestId("collab-chip"));
        expect(screen.getByTestId("collab-chip-peers")).toBeInTheDocument();
        expect(screen.queryByTestId("collab-invite-list")).toBeNull();
    });

    it("closes the Invite menu when a chip panel opens, and the panel when it opens", async () => {
        setupRound();
        useCollabStore.setState({ status: "connected", peers: [ALEX] });
        renderSidebar();

        await userEvent.click(screen.getByTestId("sidebar-share"));
        expect(await screen.findByTestId("sidebar-invite-editor")).toBeInTheDocument();

        await userEvent.click(screen.getByTestId("collab-chip"));
        expect(screen.getByTestId("collab-chip-peers")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByTestId("sidebar-invite-editor")).toBeNull());

        await userEvent.click(screen.getByTestId("sidebar-share"));
        expect(await screen.findByTestId("sidebar-invite-editor")).toBeInTheDocument();
        expect(screen.queryByTestId("collab-chip-peers")).toBeNull();
    });
});

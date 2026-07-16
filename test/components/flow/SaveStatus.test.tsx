import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import SaveStatus from "@/components/flow/SaveStatus";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSaveStatus } from "@/lib/store/useSaveStatus";

function renderSaveStatus() {
    return render(
        <TooltipProvider>
            <SaveStatus />
        </TooltipProvider>,
    );
}

const saveFlowNow = vi.fn();
vi.mock("@/lib/persistence/flowPersistence", () => ({
    saveFlowNow: (...args: unknown[]) => saveFlowNow(...args),
}));

// A round must exist for Retry to act on.
vi.mock("@/lib/store/useFlowStore", () => ({
    useFlowStore: { getState: () => ({ round: { id: "r1" } }) },
}));

beforeEach(() => {
    saveFlowNow.mockClear();
    useSaveStatus.setState({ state: "idle", savedAt: null });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("SaveStatus", () => {
    it("renders nothing when idle", () => {
        const { container } = renderSaveStatus();
        expect(container).toBeEmptyDOMElement();
    });

    it('shows "Saving…" while a save is in flight', () => {
        useSaveStatus.setState({ state: "saving" });
        renderSaveStatus();
        expect(screen.getByTestId("save-status")).toHaveTextContent("Saving…");
    });

    it('shows "Saved just now" right after a successful save', () => {
        useSaveStatus.setState({ state: "saved", savedAt: Date.now() });
        renderSaveStatus();
        expect(screen.getByTestId("save-status")).toHaveTextContent("Saved just now");
    });

    it("reports relative time for an older save", () => {
        useSaveStatus.setState({
            state: "saved",
            savedAt: Date.now() - 3 * 60 * 1000,
        });
        renderSaveStatus();
        expect(screen.getByTestId("save-status")).toHaveTextContent("Saved 3m ago");
    });

    it("surfaces an alert with a Retry that re-saves on error", async () => {
        const user = userEvent.setup();
        useSaveStatus.setState({ state: "error", savedAt: null });
        renderSaveStatus();

        const status = screen.getByTestId("save-status");
        expect(status).toHaveAttribute("role", "alert");
        expect(status).toHaveTextContent("Not saved");

        await user.click(screen.getByTestId("save-retry"));
        expect(saveFlowNow).toHaveBeenCalledTimes(1);
        expect(saveFlowNow).toHaveBeenCalledWith({ id: "r1" }, expect.any(Function));
    });
});

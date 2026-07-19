import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/keymap/displayChord", () => ({
    keyHintFor: vi.fn(),
}));

import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { keyHintFor } from "@/lib/keymap/displayChord";

const mockKeyHintFor = vi.mocked(keyHintFor);

function renderTip(
    props:
        | { label: string; command?: never }
        | { label: string; command: Parameters<typeof keyHintFor>[0] },
) {
    return render(
        <TooltipProvider delay={0}>
            <Tip {...props}>
                <button>trigger</button>
            </Tip>
        </TooltipProvider>,
    );
}

describe("Tip", () => {
    beforeEach(() => {
        mockKeyHintFor.mockReset();
    });

    it("renders the label when the trigger is focused", async () => {
        mockKeyHintFor.mockReturnValue(null);
        const user = userEvent.setup();
        renderTip({ label: "Settings" });
        await user.tab();
        expect((await screen.findAllByText("Settings")).length).toBeGreaterThan(0);
    });

    it("renders the chord when the command is bound", async () => {
        mockKeyHintFor.mockReturnValue("⌘,");
        const user = userEvent.setup();
        renderTip({ label: "Settings", command: "settings.open" });
        await user.tab();
        expect((await screen.findAllByText("⌘,")).length).toBeGreaterThan(0);
    });

    it("omits the chord when the command is unbound", async () => {
        mockKeyHintFor.mockReturnValue(null);
        const user = userEvent.setup();
        renderTip({ label: "Settings", command: "settings.open" });
        await user.tab();
        await screen.findAllByText("Settings");
        expect(screen.queryByText("⌘,")).toBeNull();
    });
});

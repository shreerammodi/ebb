import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import GuideDialog from "./GuideDialog";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { keyHintFor } from "@/lib/keymap/displayChord";

describe("GuideDialog", () => {
    beforeEach(() => {
        useRoundStore.setState({ keymapOverrides: {}, guideOpen: false });
    });

    it("renders nothing when closed", () => {
        render(<GuideDialog />);
        expect(screen.queryByTestId("guide-dialog")).toBeNull();
    });

    it("opens to Welcome and switches sections", async () => {
        useRoundStore.getState().setGuideOpen(true);
        render(<GuideDialog />);
        expect(screen.getByTestId("guide-content")).toHaveTextContent(
            /Debate Flow is a keyboard-first tool/i,
        );
        await userEvent.click(screen.getByTestId("guide-section-flowing"));
        expect(screen.getByTestId("guide-content")).toHaveTextContent(
            /sibling/i,
        );
    });

    it("renders shortcut chips from the live keymap", async () => {
        useRoundStore.getState().setGuideOpen(true);
        render(<GuideDialog />);
        await userEvent.click(screen.getByTestId("guide-section-flowing"));
        const hint = keyHintFor("node.sibling");
        expect(hint).toBeTruthy();
        expect(screen.getByTestId("guide-content")).toHaveTextContent(hint!);
    });

    it("closes on Escape", async () => {
        useRoundStore.getState().setGuideOpen(true);
        render(<GuideDialog />);
        await userEvent.keyboard("{Escape}");
        expect(useRoundStore.getState().guideOpen).toBe(false);
    });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LeaveDialog from "@/components/LeaveDialog";
import { askToLeave } from "@/lib/store/useLeaveDialog";

describe("LeaveDialog", () => {
    it("answers with the option the debater picks", async () => {
        render(<LeaveDialog />);
        let answer: Promise<string> = Promise.resolve("");
        act(() => {
            answer = askToLeave();
        });

        fireEvent.click(await screen.findByTestId("leave-discard"));

        expect(await answer).toBe("discard");
    });

    it("puts the focus on Save, so Enter keeps the round", async () => {
        render(<LeaveDialog />);
        act(() => void askToLeave());

        const save = await screen.findByTestId("leave-save");
        expect(document.activeElement).toBe(save);
    });

    it("answers cancel when a second question replaces the first", async () => {
        const first = askToLeave();
        void askToLeave();
        expect(await first).toBe("cancel");
    });
});

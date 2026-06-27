import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { useRoundStore } from "@/lib/store/useRoundStore";

import NewFlowButton from "./NewFlowButton";

beforeEach(() => {
    push.mockReset();
    useRoundStore.setState({ round: null });
});

describe("NewFlowButton", () => {
    it("creates a flow with the chosen role and navigates to it", async () => {
        render(<NewFlowButton />);
        await userEvent.click(screen.getByTestId("new-flow"));
        await userEvent.click(screen.getByTestId("new-flow-role-neg"));
        expect(push).toHaveBeenCalledTimes(1);
        const arg = push.mock.calls[0][0] as string;
        expect(arg).toMatch(/^\/flow\?id=round_/);
        expect(useRoundStore.getState().round?.role).toBe("neg");
    });
});

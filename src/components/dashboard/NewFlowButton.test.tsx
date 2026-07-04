import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { flowDb } from "@/lib/persistence/flowDb";

import NewFlowButton from "./NewFlowButton";

beforeEach(async () => {
    push.mockReset();
    await flowDb.flows.clear();
});

describe("NewFlowButton", () => {
    it("creates a flow with the chosen role and navigates to it", async () => {
        render(<NewFlowButton />);
        await userEvent.click(screen.getByTestId("new-flow"));
        await userEvent.click(screen.getByTestId("new-flow-role-neg"));
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        const arg = push.mock.calls[0][0] as string;
        expect(arg).toMatch(/^\/flow\?id=round_/);
        const rounds = await flowDb.flows.toArray();
        expect(rounds).toHaveLength(1);
        expect(rounds[0].role).toBe("neg");
    });
});

import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import NewFlowButton from "@/components/dashboard/NewFlowButton";
import { flowDb } from "@/lib/persistence/flowDb";

beforeEach(async () => {
    push.mockReset();
    await flowDb.flows.clear();
});

describe("NewFlowButton", () => {
    it("creates a flow with the chosen role and navigates to it", async () => {
        render(<NewFlowButton />);
        await userEvent.click(screen.getByTestId("new-flow"));
        await userEvent.click(await screen.findByTestId("new-flow-role-neg"));
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        const arg = push.mock.calls[0][0] as string;
        expect(arg).toMatch(/^\/flow\?id=round_/);
        const rounds = await flowDb.flows.toArray();
        expect(rounds).toHaveLength(1);
        expect(rounds[0].role).toBe("neg");
    });

    it("creates a pf round with the chosen speaking order", async () => {
        render(<NewFlowButton />);
        await userEvent.click(screen.getByTestId("new-flow"));
        await userEvent.click(await screen.findByTestId("new-flow-pf-aff"));
        await userEvent.click(await screen.findByTestId("new-flow-pf-aff-neg"));
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        const rounds = await flowDb.flows.toArray();
        expect(rounds).toHaveLength(1);
        expect(rounds[0].role).toBe("aff");
        expect(rounds[0].event).toBe("pf");
        expect(rounds[0].firstSide).toBe("neg");
    });
});

import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import FlowDetailDrawer from "@/components/dashboard/FlowDetailDrawer";
import { emptyScouting, makeFlowRound, type FlowRound } from "@/lib/model/flow";
import { flowDb } from "@/lib/persistence/flowDb";
import { persistFlow } from "@/lib/persistence/flowPersistence";

function mk(id: string): FlowRound {
    return {
        ...makeFlowRound("aff"),
        id,
        createdAt: 1,
        updatedAt: 1,
        scouting: {
            ...emptyScouting(),
            affSchool: "Westwood",
            tournament: "Berkeley",
            judge: "K. Strange",
            decision: { vote: "aff", rfd: "clear" },
        },
    };
}

beforeEach(async () => {
    await flowDb.flows.clear();
});

describe("FlowDetailDrawer", () => {
    it("renders full scouting for the open id", async () => {
        await persistFlow(mk("a"));
        render(<FlowDetailDrawer id="a" onClose={() => {}} onChanged={() => {}} />);
        await waitFor(() => expect(screen.getByText("Berkeley")).toBeInTheDocument());
        expect(screen.getByText("K. Strange")).toBeInTheDocument();
        expect(screen.getByText(/clear/)).toBeInTheDocument();
    });
});

import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { makeFormatByKey } from "@/lib/format/presets";
import { loadCoachSeen, saveCoachSeen } from "@/lib/guide/coachSeen";
import type { ArgumentNode } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";

import FlowCoach from "./FlowCoach";

let sheetId = "";
let speechId = "";

function newEmptyFlow() {
    const fmt = makeFormatByKey("policy");
    useRoundStore.getState().createRound({ role: "aff", format: fmt });
    sheetId = useRoundStore.getState().addSheet({ title: "Aff", group: "aff" });
    speechId = fmt.speeches[0].id;
}

function node(p: Partial<ArgumentNode> & Pick<ArgumentNode, "id">): ArgumentNode {
    return {
        sheetId,
        speechId,
        parentId: null,
        row: 0,
        text: "",
        statuses: [],
        bold: false,
        highlight: false,
        ...p,
    };
}

function setNodes(nodes: ArgumentNode[]) {
    const round = useRoundStore.getState().round!;
    act(() => useRoundStore.setState({ round: { ...round, nodes } }));
}

beforeEach(() => {
    localStorage.clear();
    useRoundStore.setState({ round: null, activeSheetId: null, selection: null });
    newEmptyFlow();
});

afterEach(cleanup);

describe("FlowCoach", () => {
    it("coaches step 1 on a brand-new empty flow", () => {
        render(<FlowCoach />);
        expect(screen.getByTestId("flow-coach")).toBeInTheDocument();
        expect(screen.getByTestId("flow-coach-step-1")).toHaveAttribute("data-state", "active");
    });

    it("checks off steps as the exchange is built", () => {
        render(<FlowCoach />);
        setNodes([node({ id: "a", text: "Perm" })]);
        expect(screen.getByTestId("flow-coach-step-1")).toHaveAttribute("data-state", "done");
        expect(screen.getByTestId("flow-coach-step-2")).toHaveAttribute("data-state", "active");

        setNodes([
            node({ id: "a", text: "Perm" }),
            node({ id: "b", parentId: "a", text: "Severance" }),
        ]);
        expect(screen.getByTestId("flow-coach-step-2")).toHaveAttribute("data-state", "done");
        expect(screen.getByTestId("flow-coach-step-3")).toHaveAttribute("data-state", "active");
    });

    it("shows the success note once the exchange reads across speeches, and dismisses", async () => {
        render(<FlowCoach />);
        setNodes([
            node({ id: "a", text: "Perm" }),
            node({ id: "b", parentId: "a", text: "Severance" }),
            node({ id: "c", parentId: "b", text: "No severance" }),
        ]);
        // Completion is persisted immediately so a reload never reopens it.
        expect(loadCoachSeen()).toBe(true);
        const done = screen.getByTestId("flow-coach-done");
        await userEvent.click(done);
        expect(screen.queryByTestId("flow-coach")).not.toBeInTheDocument();
    });

    it("skips and never returns", async () => {
        render(<FlowCoach />);
        await userEvent.click(screen.getByTestId("flow-coach-skip"));
        expect(screen.queryByTestId("flow-coach")).not.toBeInTheDocument();
        expect(loadCoachSeen()).toBe(true);
    });

    it("does not show when already seen", () => {
        saveCoachSeen(true);
        render(<FlowCoach />);
        expect(screen.queryByTestId("flow-coach")).not.toBeInTheDocument();
    });

    it("does not show when the flow already has content", () => {
        setNodes([node({ id: "a", text: "Existing argument" })]);
        render(<FlowCoach />);
        expect(screen.queryByTestId("flow-coach")).not.toBeInTheDocument();
    });
});

import { describe, expect, it } from "vitest";

import type { ArgumentNode } from "@/lib/model/types";

import { flowCoachProgress } from "./coachProgress";

function node(partial: Partial<ArgumentNode> & Pick<ArgumentNode, "id">): ArgumentNode {
    return {
        sheetId: "s1",
        speechId: "1ac",
        parentId: null,
        row: 0,
        text: "",
        statuses: [],
        bold: false,
        highlight: false,
        ...partial,
    };
}

describe("flowCoachProgress", () => {
    it("reports no progress for an empty sheet", () => {
        const p = flowCoachProgress([]);
        expect(p).toMatchObject({ argument: false, answer: false, chain: false, completed: 0 });
        expect(p.activeStep).toBe(1);
    });

    it("ignores nodes whose text is empty or whitespace", () => {
        const p = flowCoachProgress([node({ id: "a", text: "   " })]);
        expect(p.completed).toBe(0);
        expect(p.activeStep).toBe(1);
    });

    it("completes step 1 when a root argument is typed", () => {
        const p = flowCoachProgress([node({ id: "a", text: "Perm do both" })]);
        expect(p).toMatchObject({ argument: true, answer: false, chain: false, completed: 1 });
        expect(p.activeStep).toBe(2);
    });

    it("completes step 2 when a response is typed", () => {
        const p = flowCoachProgress([
            node({ id: "a", text: "Perm do both" }),
            node({ id: "b", parentId: "a", speechId: "1nc", text: "Severance" }),
        ]);
        expect(p).toMatchObject({ argument: true, answer: true, chain: false, completed: 2 });
        expect(p.activeStep).toBe(3);
    });

    it("completes step 3 when the response is itself answered", () => {
        const p = flowCoachProgress([
            node({ id: "a", text: "Perm do both" }),
            node({ id: "b", parentId: "a", speechId: "1nc", text: "Severance" }),
            node({ id: "c", parentId: "b", speechId: "2ac", text: "No severance" }),
        ]);
        expect(p).toMatchObject({ argument: true, answer: true, chain: true, completed: 3 });
        expect(p.activeStep).toBe(0);
    });

    it("treats earlier steps as done when a deeper move exists but an ancestor was cleared", () => {
        const p = flowCoachProgress([
            node({ id: "a", text: "Perm do both" }),
            node({ id: "b", parentId: "a", speechId: "1nc", text: "   " }),
            node({ id: "c", parentId: "b", speechId: "2ac", text: "No severance" }),
        ]);
        expect(p).toMatchObject({ answer: true, chain: true, completed: 3 });
        expect(p.activeStep).toBe(0);
    });

    it("does not loop on a corrupt parent cycle", () => {
        const p = flowCoachProgress([
            node({ id: "a", parentId: "b", text: "x" }),
            node({ id: "b", parentId: "a", text: "y" }),
        ]);
        expect(p.completed).toBeGreaterThanOrEqual(1);
    });
});

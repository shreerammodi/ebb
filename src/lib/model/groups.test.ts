import { describe, it, expect } from "vitest";

import { createGroup, removeMemberOrDelete } from "@/lib/model/groups";

describe("groups ops (pure)", () => {
    it("createGroup makes a group of the given members", () => {
        const gs = createGroup([], {
            sheetId: "s",
            memberIds: ["a", "b"],
            label: "links",
        });
        expect(gs).toHaveLength(1);
        expect(gs[0].memberIds).toEqual(["a", "b"]);
        expect(gs[0].label).toBe("links");
    });

    it("removeMemberOrDelete drops a member, dissolving the group when <2 remain", () => {
        const gs = createGroup([], {
            sheetId: "s",
            memberIds: ["a", "b"],
            label: "",
        });
        // Remove b, only a remains -> group dissolved
        const one = removeMemberOrDelete(gs, "b");
        expect(one).toHaveLength(0);
    });
});

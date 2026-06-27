import { describe, it, expect } from "vitest";
import {
  groupForNode,
  createGroup,
  addMember,
  removeMemberOrDelete,
  setLabel,
} from "@/lib/model/groups";
import type { ArgGroup } from "@/lib/model/types";

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

  it("groupForNode finds the group containing a node", () => {
    const g: ArgGroup = {
      id: "g1",
      sheetId: "s",
      label: "",
      memberIds: ["a", "b"],
    };
    expect(groupForNode([g], "b")?.id).toBe("g1");
    expect(groupForNode([g], "z")).toBeNull();
  });

  it("addMember appends to an existing group without duplicates", () => {
    const gs = createGroup([], {
      sheetId: "s",
      memberIds: ["a"],
      label: "",
    });
    const next = addMember(gs, gs[0].id, "b");
    expect(next[0].memberIds).toEqual(["a", "b"]);
    // Test idempotence of addMember
    const same = addMember(next, gs[0].id, "b");
    expect(same[0].memberIds).toEqual(["a", "b"]);
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

  it("setLabel updates only the matching group", () => {
    const gs = createGroup([], {
      sheetId: "s",
      memberIds: ["a", "b"],
      label: "",
    });
    const next = setLabel(gs, gs[0].id, "DAs");
    expect(next[0].label).toBe("DAs");
  });
});

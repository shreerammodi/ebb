import { describe, it, expect, beforeEach } from "vitest";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: "normal" as const,
  selection: null,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

function setupRound() {
  const fmt = makeFormatByKey("policy");
  useRoundStore.getState().createRound({ role: "aff", format: fmt });
  const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
  const sp = fmt.speeches[1].id; // 1NC
  const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
  const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
  return { sheetId, sp, a, b };
}

describe("Group Actions (Task 2)", () => {
  beforeEach(resetStore);

  it("groupNodes bundles two nodes and is undoable", () => {
    const { sheetId, a, b } = setupRound();

    useRoundStore.getState().groupNodes(sheetId, [a, b], "DAs");
    const groups = useRoundStore.getState().round!.groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual([a, b]);

    useRoundStore.getState().undo();
    expect(useRoundStore.getState().round!.groups).toHaveLength(0);
  });

  it("ungroupNode removes a node from its group", () => {
    const { sheetId, a, b } = setupRound();

    useRoundStore.getState().groupNodes(sheetId, [a, b], "");
    useRoundStore.getState().ungroupNode(a);
    const groups = useRoundStore.getState().round!.groups;
    expect(groups).toHaveLength(0); // Dissolved because <2 remain.
  });
});

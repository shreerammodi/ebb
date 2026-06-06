import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ArgumentNode } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import GridCell from "./GridCell";

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: "normal" as const,
  selection: null,
  keymapName: "default" as const,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

function makeNode(over: Partial<ArgumentNode> & Pick<ArgumentNode, "id" | "text">): ArgumentNode {
  return {
    sheetId: "sheet1",
    speechId: "sp1",
    parentId: null,
    order: 0,
    statuses: [],
    bold: false,
    ...over,
  };
}

function renderCell(node: ArgumentNode, opts?: { selected?: boolean }) {
  resetStore();
  const fmt = makeFormatByKey("policy");
  useRoundStore.getState().createRound({ role: "aff", format: fmt });
  if (opts?.selected !== false) {
    useRoundStore.getState().setSelection({
      sheetId: node.sheetId,
      speechId: node.speechId,
      nodeId: node.id,
    });
    useRoundStore.setState({ mode: "insert" });
  }
  useRoundStore.setState({
    round: {
      ...useRoundStore.getState().round!,
      nodes: [node],
    },
  });
  const sheetNodes = [node];
  return render(
    <GridCell
      node={node}
      sheetId={node.sheetId}
      speechId={node.speechId}
      isDropped={false}
      sheetNodes={sheetNodes}
      hasChildren={false}
    />,
  );
}

describe("GridCell decorations", () => {
  beforeEach(resetStore);

  it("renders conceded text with line-through, not a badge", () => {
    renderCell(makeNode({ id: "n1", text: "no link", statuses: ["conceded"] }), {
      selected: false,
    });
    const text = screen.getByText("no link");
    expect(text).toHaveClass("arg-crossed");
    expect(screen.queryByText(/conceded/i)).toBeNull();
  });

  it("renders bold text in a .arg-bold span", () => {
    renderCell(makeNode({ id: "n1", text: "outweighs", bold: true }), { selected: false });
    expect(screen.getByText("outweighs")).toHaveClass("arg-bold");
  });

  it("renders an extension arrow when extended", () => {
    renderCell(makeNode({ id: "n1", text: "arg", statuses: ["extended"] }), {
      selected: false,
    });
    expect(screen.getByText("↳")).toBeInTheDocument();
    expect(screen.queryByText(/extended/i)).toBeNull();
  });
});

describe("GridCell editing keys", () => {
  beforeEach(resetStore);

  it("Backspace in an empty focused cell deletes the node", () => {
    const node = makeNode({ id: "n1", text: "" });
    renderCell(node);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: "Backspace" });
    expect(useRoundStore.getState().round!.nodes.find((n) => n.id === node.id)).toBeUndefined();
  });

  it("plain Enter does NOT preventDefault inside the cell (keymap handles it)", () => {
    const node = makeNode({ id: "n1", text: "tag" });
    renderCell(node);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

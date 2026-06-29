import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import type { ArgumentNode } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";

import GridCell from "./GridCell";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
    });
}

function makeNode(over: Partial<ArgumentNode> & Pick<ArgumentNode, "id" | "text">): ArgumentNode {
    return {
        sheetId: "sheet1",
        speechId: "sp1",
        parentId: null,
        row: 0,
        statuses: [],
        bold: false,
        highlight: false,
        ...over,
    };
}

function renderCell(
    node: ArgumentNode,
    opts?: { selected?: boolean; sheetNodes?: ArgumentNode[] },
) {
    resetStore();
    useRoundStore.getState().createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    if (opts?.selected !== false) {
        useRoundStore.getState().setSelection({
            sheetId: node.sheetId,
            speechId: node.speechId,
            row: node.row,
        });
    }
    useRoundStore.setState({
        round: {
            ...useRoundStore.getState().round!,
            nodes: [node],
        },
    });
    const sheetNodes = opts?.sheetNodes ?? [node];
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

    it("renders conceded text without strikethrough", () => {
        renderCell(makeNode({ id: "n1", text: "no link", statuses: ["conceded"] }), {
            selected: false,
        });
        const text = screen.getByText("no link");
        expect(text).not.toHaveClass("arg-crossed");
        expect(screen.queryByText(/conceded/i)).toBeNull();
    });

    it("renders bold text in a .arg-bold span", () => {
        renderCell(makeNode({ id: "n1", text: "outweighs", bold: true }), {
            selected: false,
        });
        expect(screen.getByText("outweighs")).toHaveClass("arg-bold");
    });

    it("renders an extension arrow when extended", () => {
        renderCell(makeNode({ id: "n1", text: "arg", statuses: ["extended"] }), {
            selected: false,
        });
        expect(screen.getByText("↳")).toBeInTheDocument();
    });

    it("renders highlighted text in a .arg-highlight span", () => {
        renderCell(makeNode({ id: "n1", text: "key voter", highlight: true }), {
            selected: false,
        });
        expect(screen.getByText("key voter")).toHaveClass("arg-highlight");
    });

    it("does not apply .arg-highlight when highlight is false", () => {
        renderCell(makeNode({ id: "n1", text: "plain", highlight: false }), {
            selected: false,
        });
        expect(screen.getByText("plain")).not.toHaveClass("arg-highlight");
    });
});

describe("GridCell modeless editing", () => {
    beforeEach(resetStore);

    it("shows a textarea when the cell is selected", () => {
        const node = makeNode({ id: "n1", text: "tag" });
        renderCell(node);
        expect(screen.getByRole("textbox")).toBeTruthy();
    });

    it("shows text (not a textarea) when the cell is not selected", () => {
        const node = makeNode({ id: "n1", text: "tag" });
        renderCell(node, { selected: false });
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.getByText("tag")).toBeTruthy();
    });

    it("places the caret at the end of text on edit-mode entry", () => {
        const node = makeNode({ id: "n1", text: "a" });
        renderCell(node);
        const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
        expect(ta.selectionStart).toBe(1);
        expect(ta.selectionEnd).toBe(1);
    });

    it("Backspace in an empty focused cell clears the cell", () => {
        const node = makeNode({ id: "n1", text: "" });
        renderCell(node);
        const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.keyDown(ta, { key: "Backspace" });
        // cell.clear orphans children, but for a leaf node it removes the node
        // (because parentId is null, there's nothing to orphan — wait, cell.clear
        // calls orphanNode which removes the node and nulls children, which for a
        // leaf means the node is just removed).
        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === node.id)).toBeUndefined();
    });

    it("plain Enter does NOT preventDefault (keymap handles it)", () => {
        const node = makeNode({ id: "n1", text: "tag" });
        renderCell(node);
        const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
        const ev = new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
        });
        ta.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
    });
});

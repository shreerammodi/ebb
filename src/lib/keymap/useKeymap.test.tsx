import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import { useKeymap } from "./useKeymap";

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: "normal" as const,
  selection: null,
  keymapName: "vim" as const,
  quickSwitcherOpen: false,
  settingsOpen: false,
  keymapOverrides: {} as Record<string, string>,
  renamingSheetId: null,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

function Harness() {
  useKeymap();
  return <div data-testid="harness" />;
}

function dispatchKey(key: string, init: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

describe("useKeymap", () => {
  beforeEach(resetStore);

  it('moves selection to the node below on "j" (vim normal)', () => {
    const fmt = makeFormatByKey("policy");
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: fmt });
    const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
    const sp = fmt.speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    render(<Harness />);
    dispatchKey("j");

    expect(useRoundStore.getState().selection?.nodeId).toBe(b);
  });

  it("cleans up its listener on unmount", () => {
    const fmt = makeFormatByKey("policy");
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: fmt });
    const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
    const sp = fmt.speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });

    const { unmount } = render(<Harness />);
    unmount();
    dispatchKey("j");

    // Selection unchanged because the listener was removed.
    expect(useRoundStore.getState().selection?.nodeId).toBe(a);
  });
});

describe("default keymap (always-insert)", () => {
  beforeEach(resetStore);

  it('arrow keys navigate between cells even while mode is "insert"', () => {
    // Repro: after pressing Enter to create a cell, the store is in 'insert'
    // mode. Navigation bindings live only in 'normal', so resolution must use
    // the effective (normal) mode for the default keymap, not the raw mode.
    const fmt = makeFormatByKey("policy");
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: fmt });
    useRoundStore.setState({ keymapName: "default" });
    const sheetId = useRoundStore.getState().addSheet({ title: "DA", group: "neg" });
    const sp = fmt.speeches[1].id;
    const a = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    const b = useRoundStore.getState().addNode({ sheetId, speechId: sp, parentId: null });
    useRoundStore.getState().setSelection({ sheetId, speechId: sp, nodeId: a });
    useRoundStore.getState().setMode("insert");

    render(<Harness />);
    dispatchKey("ArrowDown");

    expect(useRoundStore.getState().selection?.nodeId).toBe(b);
  });
});

describe("two-key chord sequences", () => {
  beforeEach(resetStore);

  function setupWithSheet() {
    const fmt = makeFormatByKey("policy");
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: fmt });
    const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
    useRoundStore.setState({ activeSheetId: sheetId, renamingSheetId: null });
    return sheetId;
  }

  it('"g" then "r" fires sheet.rename (sets renamingSheetId)', () => {
    const sheetId = setupWithSheet();
    render(<Harness />);

    dispatchKey("g");
    expect(useRoundStore.getState().renamingSheetId).toBeNull(); // not yet

    dispatchKey("r");
    expect(useRoundStore.getState().renamingSheetId).toBe(sheetId);
  });

  it('"g" then an unbound key clears the prefix without firing', () => {
    setupWithSheet();
    render(<Harness />);

    dispatchKey("g");
    dispatchKey("x"); // 'g x' is not bound; 'x' alone is node.delete, no-ops (no selection)
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
  });

  it('"g" alone does not fire any command', () => {
    setupWithSheet();
    render(<Harness />);

    dispatchKey("g");
    expect(useRoundStore.getState().renamingSheetId).toBeNull();
    // mode is unchanged
    expect(useRoundStore.getState().mode).toBe("normal");
  });
});

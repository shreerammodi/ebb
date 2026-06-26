import { it, expect } from "vitest";
import { FLAT_KEYMAP, GRAB_BINDINGS } from "@/lib/keymap/presets";

it("flat keymap binds conceded and extended", () => {
    expect(FLAT_KEYMAP.bindings["Ctrl+Shift+x"]).toBe(
        "status.toggleConceded",
    );
    expect(FLAT_KEYMAP.bindings["Ctrl+e"]).toBe("status.toggleExtended");
});

it("grab bindings map Enter to move.commit and Escape to move.cancel", () => {
    expect(GRAB_BINDINGS["Enter"]).toBe("move.commit");
    expect(GRAB_BINDINGS["Escape"]).toBe("move.cancel");
});

it("flat keymap binds arrow keys to move.* navigation", () => {
    expect(FLAT_KEYMAP.bindings["ArrowRight"]).toBe("move.right");
    expect(FLAT_KEYMAP.bindings["ArrowLeft"]).toBe("move.left");
    expect(FLAT_KEYMAP.bindings["ArrowUp"]).toBe("move.up");
    expect(FLAT_KEYMAP.bindings["ArrowDown"]).toBe("move.down");
});

it("flat keymap binds Enter to node.sibling and Shift+Enter to node.response", () => {
    expect(FLAT_KEYMAP.bindings["Enter"]).toBe("node.sibling");
    expect(FLAT_KEYMAP.bindings["Shift+Enter"]).toBe("node.response");
});

it("flat keymap binds Tab to move.right and Shift+Tab to move.left", () => {
    expect(FLAT_KEYMAP.bindings["Tab"]).toBe("move.right");
    expect(FLAT_KEYMAP.bindings["Shift+Tab"]).toBe("move.left");
});

it("flat keymap binds Delete to cell.clear and Ctrl+Backspace to row.delete", () => {
    expect(FLAT_KEYMAP.bindings["Delete"]).toBe("cell.clear");
    expect(FLAT_KEYMAP.bindings["Ctrl+Backspace"]).toBe("row.delete");
});

it("binds Excel-style jump navigation (directional + corners)", () => {
    const cmds = Object.values(FLAT_KEYMAP.bindings);
    // Directional jumps bound to a modifier+Arrow chord (Ctrl on non-Mac CI).
    expect(cmds).toContain("nav.jumpUp");
    expect(cmds).toContain("nav.jumpDown");
    expect(cmds).toContain("nav.jumpLeft");
    expect(cmds).toContain("nav.jumpRight");
    // Corner jumps on Ctrl+Home / Ctrl+End regardless of platform.
    expect(FLAT_KEYMAP.bindings["Ctrl+Home"]).toBe("nav.jumpHome");
    expect(FLAT_KEYMAP.bindings["Ctrl+End"]).toBe("nav.jumpEnd");
});

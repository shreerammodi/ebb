import { describe, it, expect } from "vitest";
import { eventToChord, resolveCommand } from "./resolve";
import { VIM_KEYMAP } from "./presets";

type Ev = {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
};

function ev(key: string, mods: Partial<Omit<Ev, "key">> = {}): Ev {
    return {
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...mods,
    };
}

describe("eventToChord", () => {
    it("returns a single printable char as-is (no Shift+)", () => {
        expect(eventToChord(ev("j"))).toBe("j");
    });

    it("encodes shift in case for printable chars (O, not Shift+O)", () => {
        // Browser reports key 'O' with shiftKey true for shift+o.
        expect(eventToChord(ev("O", { shiftKey: true }))).toBe("O");
    });

    it("adds Shift+ for named keys when shiftKey is true", () => {
        expect(eventToChord(ev("Tab", { shiftKey: true }))).toBe("Shift+Tab");
    });

    it("does not add Shift+ for named keys when shiftKey is false", () => {
        expect(eventToChord(ev("Enter"))).toBe("Enter");
    });

    it("orders modifiers Meta+Ctrl+Alt+Shift", () => {
        expect(
            eventToChord(
                ev("k", { metaKey: true, ctrlKey: true, altKey: true }),
            ),
        ).toBe("Meta+Ctrl+Alt+k");
    });

    it("builds Meta+k", () => {
        expect(eventToChord(ev("k", { metaKey: true }))).toBe("Meta+k");
    });

    it("builds Alt+Enter for named key with Alt", () => {
        expect(eventToChord(ev("Enter", { altKey: true }))).toBe("Alt+Enter");
    });
});

describe("resolveCommand (vim)", () => {
    it("j in normal mode → move.down", () => {
        expect(resolveCommand(VIM_KEYMAP, "normal", ev("j"))).toBe("move.down");
    });

    it("i in normal mode → edit.enter", () => {
        expect(resolveCommand(VIM_KEYMAP, "normal", ev("i"))).toBe(
            "edit.enter",
        );
    });

    it("Escape in insert mode → edit.exit", () => {
        expect(resolveCommand(VIM_KEYMAP, "insert", ev("Escape"))).toBe(
            "edit.exit",
        );
    });

    it("Ctrl+k in normal mode → sheet.quickSwitch", () => {
        expect(
            resolveCommand(VIM_KEYMAP, "normal", ev("k", { ctrlKey: true })),
        ).toBe("sheet.quickSwitch");
    });

    it("O (shift+o) in normal mode → arg.newRoot (not Shift+O)", () => {
        expect(
            resolveCommand(VIM_KEYMAP, "normal", ev("O", { shiftKey: true })),
        ).toBe("arg.newRoot");
    });

    it("returns null for an unbound chord", () => {
        expect(resolveCommand(VIM_KEYMAP, "normal", ev("z"))).toBeNull();
    });
});

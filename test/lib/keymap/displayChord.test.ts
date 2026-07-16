import { describe, it, expect, beforeEach } from "vitest";

import { prettyChord, buildChordMap, keyHintFor } from "@/lib/keymap/displayChord";
import { useFlowStore } from "@/lib/store/useFlowStore";

describe("displayChord", () => {
    beforeEach(() => {
        useFlowStore.setState({ keymapOverrides: {} });
    });

    it("prettifies modifier chords", () => {
        expect(prettyChord("Meta+Shift+ArrowUp")).toBe("Cmd-Shift-Up");
        expect(prettyChord("Escape")).toBe("Esc");
    });

    it("renders a shift-bearing uppercase letter chord with Shift", () => {
        // An uppercase single letter encodes Shift (eventToChord rule), so the
        // hint must spell it out rather than show a bare "Cmd-X".
        expect(prettyChord("Meta+X")).toBe("Cmd-Shift-X");
        expect(prettyChord("Meta+Z")).toBe("Cmd-Shift-Z");
        // Lowercase letters carry no Shift and render as-is.
        expect(prettyChord("Meta+z")).toBe("Cmd-z");
    });

    it("maps a bound command to its chord", () => {
        const map = buildChordMap();
        expect(map["sheet.next"]).toBe("]");
    });

    it("returns a pretty hint for a bound command", () => {
        expect(keyHintFor("sheet.next")).toBe(prettyChord(buildChordMap()["sheet.next"]!));
    });

    it("reflects a user override", () => {
        useFlowStore.setState({
            keymapOverrides: { "sheet.next": "Meta+J" },
        });
        expect(keyHintFor("sheet.next")).toBe("Cmd-Shift-J");
    });
});

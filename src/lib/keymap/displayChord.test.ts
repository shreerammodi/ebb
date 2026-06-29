import { describe, it, expect, beforeEach } from "vitest";

import { useRoundStore } from "@/lib/store/useRoundStore";

import { prettyChord, buildChordMap, keyHintFor } from "./displayChord";

describe("displayChord", () => {
    beforeEach(() => {
        useRoundStore.setState({ keymapOverrides: {} });
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
        expect(map["node.sibling"]).toBeTruthy();
    });

    it("returns a pretty hint for a bound command", () => {
        expect(keyHintFor("node.sibling")).toBe(prettyChord(buildChordMap()["node.sibling"]!));
    });

    it("reflects a user override", () => {
        useRoundStore.setState({
            keymapOverrides: { "node.sibling": "Meta+J" },
        });
        expect(keyHintFor("node.sibling")).toBe("Cmd-Shift-J");
    });
});

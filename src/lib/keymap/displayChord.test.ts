import { describe, it, expect, beforeEach } from "vitest";

import { useRoundStore } from "@/lib/store/useRoundStore";

import { prettyChord, buildChordMap, keyHintFor } from "./displayChord";

describe("displayChord", () => {
    beforeEach(() => {
        useRoundStore.setState({ keymapOverrides: {} });
    });

    it("prettifies modifier chords", () => {
        expect(prettyChord("Meta+Shift+ArrowUp")).toBe("⌘⇧↑");
        expect(prettyChord("Escape")).toBe("Esc");
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
        expect(keyHintFor("node.sibling")).toBe("⌘J");
    });
});

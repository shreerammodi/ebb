import { describe, it, expect } from "vitest";

import {
    keyTipParent,
    cardNavTarget,
    effectiveKeytips,
    DEFAULT_KEYTIPS,
} from "@/lib/dashboard/keytips";

describe("keyTipParent", () => {
    it("unwinds sub-contexts to the root", () => {
        expect(keyTipParent("flows")).toBe("root");
        expect(keyTipParent("new")).toBe("root");
    });

    it("exits from the root and stays off when already off", () => {
        expect(keyTipParent("root")).toBe("off");
        expect(keyTipParent("off")).toBe("off");
    });
});

describe("cardNavTarget", () => {
    // 5 cards, 3 columns: row 0 = [0,1,2], row 1 = [3,4].
    it("steps one card left and right", () => {
        expect(cardNavTarget(2, 5, "ArrowLeft", 3)).toBe(1);
        expect(cardNavTarget(2, 5, "ArrowRight", 3)).toBe(3);
    });

    it("moves a whole row up and down", () => {
        expect(cardNavTarget(3, 5, "ArrowUp", 3)).toBe(0);
        expect(cardNavTarget(0, 5, "ArrowDown", 3)).toBe(3);
    });

    it("stays put when no card is above or below", () => {
        expect(cardNavTarget(1, 5, "ArrowUp", 3)).toBe(1);
        expect(cardNavTarget(4, 5, "ArrowDown", 3)).toBe(4);
    });

    it("clamps horizontal steps at the ends", () => {
        expect(cardNavTarget(0, 5, "ArrowLeft", 3)).toBe(0);
        expect(cardNavTarget(4, 5, "ArrowRight", 3)).toBe(4);
    });

    it("jumps to the ends with Home/End", () => {
        expect(cardNavTarget(3, 5, "Home", 3)).toBe(0);
        expect(cardNavTarget(1, 5, "End", 3)).toBe(4);
    });

    it("lands on the first card when nothing is focused yet", () => {
        expect(cardNavTarget(-1, 5, "ArrowRight", 3)).toBe(0);
        expect(cardNavTarget(-1, 5, "ArrowDown", 3)).toBe(0);
    });

    it("returns null for non-navigation keys and empty lists", () => {
        expect(cardNavTarget(0, 5, "a", 3)).toBeNull();
        expect(cardNavTarget(0, 0, "ArrowRight", 3)).toBeNull();
    });
});

describe("effectiveKeytips", () => {
    it("defaults the trigger to f and search to s", () => {
        expect(DEFAULT_KEYTIPS.trigger).toBe("f");
        expect(DEFAULT_KEYTIPS["root.search"]).toBe("s");
        expect(effectiveKeytips({}).trigger).toBe("f");
    });

    it("applies a non-empty override and ignores empty ones", () => {
        const map = effectiveKeytips({ trigger: "k", "root.new": "" });
        expect(map.trigger).toBe("k");
        expect(map["root.new"]).toBe(DEFAULT_KEYTIPS["root.new"]);
    });
});

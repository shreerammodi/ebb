import { describe, it, expect } from "vitest";

import { keyTipParent, cardNavTarget } from "@/lib/dashboard/keytips";

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
    it("moves one step per arrow, mapping both axes onto prev/next", () => {
        expect(cardNavTarget(2, 5, "ArrowLeft")).toBe(1);
        expect(cardNavTarget(2, 5, "ArrowUp")).toBe(1);
        expect(cardNavTarget(2, 5, "ArrowRight")).toBe(3);
        expect(cardNavTarget(2, 5, "ArrowDown")).toBe(3);
    });

    it("clamps at both edges", () => {
        expect(cardNavTarget(0, 5, "ArrowLeft")).toBe(0);
        expect(cardNavTarget(4, 5, "ArrowRight")).toBe(4);
    });

    it("jumps to the ends with Home/End", () => {
        expect(cardNavTarget(3, 5, "Home")).toBe(0);
        expect(cardNavTarget(1, 5, "End")).toBe(4);
    });

    it("lands on the first card when nothing is focused yet", () => {
        expect(cardNavTarget(-1, 5, "ArrowRight")).toBe(0);
        expect(cardNavTarget(-1, 5, "ArrowLeft")).toBe(0);
    });

    it("returns null for non-navigation keys and empty lists", () => {
        expect(cardNavTarget(0, 5, "a")).toBeNull();
        expect(cardNavTarget(0, 0, "ArrowRight")).toBeNull();
    });
});

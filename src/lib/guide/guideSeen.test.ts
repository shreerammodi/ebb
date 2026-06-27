import { describe, it, expect, beforeEach } from "vitest";
import { loadGuideSeen, saveGuideSeen, GUIDE_SEEN_KEY } from "./guideSeen";

describe("guideSeen", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("defaults to false when unset", () => {
        expect(loadGuideSeen()).toBe(false);
    });

    it("round-trips true", () => {
        saveGuideSeen(true);
        expect(loadGuideSeen()).toBe(true);
        expect(localStorage.getItem(GUIDE_SEEN_KEY)).toBe("true");
    });

    it("treats malformed values as false", () => {
        localStorage.setItem(GUIDE_SEEN_KEY, "nonsense");
        expect(loadGuideSeen()).toBe(false);
    });
});

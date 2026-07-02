import { describe, it, expect, beforeEach } from "vitest";

import { loadCoachSeen, saveCoachSeen, COACH_SEEN_KEY } from "./coachSeen";

describe("coachSeen", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("defaults to false when unset", () => {
        expect(loadCoachSeen()).toBe(false);
    });

    it("round-trips true", () => {
        saveCoachSeen(true);
        expect(loadCoachSeen()).toBe(true);
        expect(localStorage.getItem(COACH_SEEN_KEY)).toBe("true");
    });

    it("treats malformed values as false", () => {
        localStorage.setItem(COACH_SEEN_KEY, "nonsense");
        expect(loadCoachSeen()).toBe(false);
    });
});

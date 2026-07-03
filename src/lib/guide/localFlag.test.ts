import { beforeEach, describe, expect, it } from "vitest";

import { loadBooleanFlag, saveBooleanFlag } from "./localFlag";

const KEY = "df-test-flag";

describe("localFlag", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("defaults to false when unset", () => {
        expect(loadBooleanFlag(KEY)).toBe(false);
    });

    it("round-trips true", () => {
        saveBooleanFlag(KEY, true);
        expect(loadBooleanFlag(KEY)).toBe(true);
    });

    it("round-trips false", () => {
        saveBooleanFlag(KEY, true);
        saveBooleanFlag(KEY, false);
        expect(loadBooleanFlag(KEY)).toBe(false);
    });

    it('treats any non-"true" stored value as false', () => {
        window.localStorage.setItem(KEY, "yes");
        expect(loadBooleanFlag(KEY)).toBe(false);
    });
});

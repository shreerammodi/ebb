import { beforeEach, describe, expect, it } from "vitest";

import { loadUpdateConfig, saveUpdateConfig } from "./settings";
import { DEFAULT_UPDATE_CONFIG, type UpdateConfig } from "./types";

describe("update settings persistence", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("returns defaults when nothing is stored", () => {
        expect(loadUpdateConfig()).toEqual(DEFAULT_UPDATE_CONFIG);
    });

    it("round-trips a saved config", () => {
        const config: UpdateConfig = {
            autoCheckEnabled: true,
            blackoutStartDay: 4,
            blackoutEndDay: 0,
            tournamentMode: true,
        };
        saveUpdateConfig(config);
        expect(loadUpdateConfig()).toEqual(config);
    });

    it("merges a partial stored config over defaults", () => {
        window.localStorage.setItem(
            "df-update-settings",
            JSON.stringify({ autoCheckEnabled: true }),
        );
        expect(loadUpdateConfig()).toEqual({
            ...DEFAULT_UPDATE_CONFIG,
            autoCheckEnabled: true,
        });
    });

    it("falls back to defaults on malformed JSON", () => {
        window.localStorage.setItem("df-update-settings", "{not json");
        expect(loadUpdateConfig()).toEqual(DEFAULT_UPDATE_CONFIG);
    });
});

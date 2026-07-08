import { describe, expect, it } from "vitest";

import { COMMANDS } from "@/lib/commands/registry";
import type { AppConfig } from "@/lib/store/useFlowStore";

import { configFromState, toAppConfig } from "./configFile";

const aCommandId = Object.keys(COMMANDS)[0];
const anotherCommandId = Object.keys(COMMANDS)[1];

const sample: AppConfig = {
    flowFont: "plex-mono",
    sidebarCollapsed: true,
    rfdOpen: false,
    rfdVim: true,
    theme: "dark",
    affColor: "#1d4ed8",
    negColor: null,
    keymapOverrides: { [aCommandId]: "g g" },
    updateConfig: { autoCheckEnabled: true, tournamentMode: false },
};

describe("configFromState -> toAppConfig round-trip", () => {
    it("preserves every field through the file shape", () => {
        expect(toAppConfig(configFromState(sample))).toEqual(sample);
    });

    it("emits snake_case keys and keeps a null color as null", () => {
        const file = configFromState(sample);
        expect(file.flow_font).toBe("plex-mono");
        expect(file.rfd_vim).toBe(true);
        expect(file.neg_color).toBeNull();
        expect(file.update.auto_check_enabled).toBe(true);
    });

    it("ships every default binding but stores none of them as overrides", () => {
        const file = configFromState({ ...sample, keymapOverrides: {} });
        expect(Object.keys(file.keymap).length).toBeGreaterThan(10);
        expect(toAppConfig(file).keymapOverrides).toEqual({});
    });
});

describe("toAppConfig validation", () => {
    it("falls back to defaults for garbage values without throwing", () => {
        const cfg = toAppConfig({
            theme: "drak",
            flow_font: "comic-sans",
            aff_color: "blue",
            sidebar_collapsed: "yes",
        });
        expect(cfg.theme).toBe("system");
        expect(cfg.flowFont).toBe("dm-sans");
        expect(cfg.affColor).toBeNull();
        expect(cfg.sidebarCollapsed).toBe(false);
    });

    it("drops keymap entries for unknown commands or non-string chords", () => {
        const cfg = toAppConfig({
            keymap: { [aCommandId]: "g g", notACommand: "x", [anotherCommandId]: 42 },
        });
        expect(cfg.keymapOverrides).toEqual({ [aCommandId]: "g g" });
    });

    it("returns a fully-defaulted config for a non-object input", () => {
        const cfg = toAppConfig(null);
        expect(cfg.theme).toBe("system");
        expect(cfg.keymapOverrides).toEqual({});
        expect(cfg.updateConfig).toEqual({ autoCheckEnabled: false, tournamentMode: false });
    });
});

import { describe, expect, it } from "vitest";

import { COMMANDS } from "@/lib/commands/registry";
import { configFromState, toAppConfig } from "@/lib/config/configFile";
import type { AppConfig } from "@/lib/store/useFlowStore";

const aCommandId = Object.keys(COMMANDS)[0];
const anotherCommandId = Object.keys(COMMANDS)[1];

const sample: AppConfig = {
    flowFont: "plex-mono",
    defaultGridZoom: 1.25,
    sidebarCollapsed: true,
    rfdOpen: false,
    rfdVim: true,
    insertPaste: true,
    scrollZoom: false,
    tooltips: false,
    theme: "dark",
    affColor: "#1d4ed8",
    negColor: null,
    keymapOverrides: { [aCommandId]: "g g" },
    keytipOverrides: { trigger: "k" },
    updateConfig: { autoCheckEnabled: true },
};

describe("configFromState -> toAppConfig round-trip", () => {
    it("preserves every field through the file shape", () => {
        expect(toAppConfig(configFromState(sample))).toEqual(sample);
    });

    it("emits snake_case keys and keeps a null color as null", () => {
        const file = configFromState(sample);
        expect(file.flow_font).toBe("IBM Plex Mono");
        expect(file.default_zoom).toBe(1.25);
        expect(file.rfd_vim).toBe(true);
        expect(file.neg_color).toBeNull();
        expect(file.update.auto_check_enabled).toBe(true);
    });

    it("ships every default binding but stores none of them as overrides", () => {
        const file = configFromState({ ...sample, keymapOverrides: {} });
        expect(toAppConfig(file).keymapOverrides).toEqual({});
    });

    it("nests dotted command ids into tables and ships every command", () => {
        const file = configFromState({ ...sample, keymapOverrides: {} });
        // theme.light/dark/system group under a [keymap.theme] table.
        expect(typeof file.keymap.theme).toBe("object");
        // toHaveProperty reads the dot as a nested path.
        for (const id of Object.keys(COMMANDS)) expect(file.keymap).toHaveProperty(id);
        // info.open has no default chord, so it ships as "" ready to fill in.
        expect(file.keymap).toHaveProperty("info.open", "");
    });

    it("nests keytips, ships every default, and stores none when unchanged", () => {
        const file = configFromState({ ...sample, keytipOverrides: {} });
        expect(typeof file.keytips.root).toBe("object");
        expect(file.keytips).toHaveProperty("trigger", "f");
        expect(file.keytips).toHaveProperty("root.search", "s");
        expect(toAppConfig(file).keytipOverrides).toEqual({});
    });

    it("keeps a keytip chord that differs from its default", () => {
        const file = configFromState({ ...sample, keytipOverrides: { "root.search": "z" } });
        expect(toAppConfig(file).keytipOverrides).toEqual({ "root.search": "z" });
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
        expect(cfg.flowFont).toBe("pretendard");
        expect(cfg.affColor).toBeNull();
        expect(cfg.sidebarCollapsed).toBe(false);
    });

    it("accepts a human font name and the legacy id, case-insensitively", () => {
        expect(toAppConfig({ flow_font: "DM Sans" }).flowFont).toBe("dm-sans");
        expect(toAppConfig({ flow_font: "ibm plex sans" }).flowFont).toBe("plex-sans");
        expect(toAppConfig({ flow_font: "plex-mono" }).flowFont).toBe("plex-mono");
    });

    it("clamps an out-of-range default_zoom and defaults a non-number", () => {
        expect(toAppConfig({ default_zoom: 9 }).defaultGridZoom).toBe(3);
        expect(toAppConfig({ default_zoom: 0.1 }).defaultGridZoom).toBe(0.5);
        expect(toAppConfig({ default_zoom: "big" }).defaultGridZoom).toBe(1);
        expect(toAppConfig({}).defaultGridZoom).toBe(1);
    });

    it("drops keymap entries for unknown commands or non-string chords", () => {
        const cfg = toAppConfig({
            keymap: { [aCommandId]: "g g", notACommand: "x", [anotherCommandId]: 42 },
        });
        expect(cfg.keymapOverrides).toEqual({ [aCommandId]: "g g" });
    });

    it("still reads the pre-nesting flat keymap shape so upgrades keep bindings", () => {
        // Files written by earlier versions stored bindings as flat dotted keys
        // under [keymap]; reading must recover them, not drop them.
        const cfg = toAppConfig({ keymap: { "info.open": "z" } });
        expect(cfg.keymapOverrides["info.open"]).toBe("z");
    });

    it("drops keytip entries for unknown ids", () => {
        const cfg = toAppConfig({ keytips: { trigger: "k", notAKeytip: "x" } });
        expect(cfg.keytipOverrides).toEqual({ trigger: "k" });
    });

    it("returns a fully-defaulted config for a non-object input", () => {
        const cfg = toAppConfig(null);
        expect(cfg.theme).toBe("system");
        expect(cfg.keymapOverrides).toEqual({});
        expect(cfg.updateConfig).toEqual({ autoCheckEnabled: false });
    });
});

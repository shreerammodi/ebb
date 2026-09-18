import { describe, expect, it } from "vitest";

import { COMMANDS } from "@/lib/commands/registry";
import { configFromState, toAppConfig } from "@/lib/config/configFile";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { getPresetKeymap } from "@/lib/keymap/presets";
import type { AppConfig } from "@/lib/store/useFlowStore";

const aCommandId = Object.keys(COMMANDS)[0];
const anotherCommandId = Object.keys(COMMANDS)[1];

const sample: AppConfig = {
    flowFont: "plex-mono",
    defaultGridZoom: 1.25,
    sidebarCollapsed: true,
    sidebarWidth: 312,
    rfdOpen: false,
    rfdVim: true,
    insertPaste: true,
    appendEdit: false,
    scrollZoom: false,
    alignSpeeches: true,
    tooltips: false,
    cardmirrorEnabled: false,
    cardmirrorSpaceArguments: true,
    cardmirrorTextType: "tag",
    collabEnabled: false,
    collabRelayEnabled: true,
    collabListenEnabled: false,
    collabShowViewers: false,
    collabName: "Rin",
    contacts: {},
    theme: "dark",
    affColor: "#1d4ed8",
    negColor: null,
    flowsDir: null,
    keymapOverrides: { [aCommandId]: "g g" },
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
        expect(file.sidebar_width).toBe(312);
        expect(file.rfd_vim).toBe(true);
        expect(file.cardmirror_space_arguments).toBe(true);
        expect(file.neg_color).toBeNull();
        expect(file.update.auto_check_enabled).toBe(true);
    });

    it("defaults speech alignment off when the file does not name it", () => {
        expect(toAppConfig({}).alignSpeeches).toBe(false);
    });

    it("defaults append mode on when the file does not name it", () => {
        expect(toAppConfig({}).appendEdit).toBe(true);
    });

    it("defaults CardMirror argument spacing off when the file does not name it", () => {
        expect(toAppConfig({}).cardmirrorSpaceArguments).toBe(false);
    });

    it("falls back to the analytic text type when the file names an unknown one", () => {
        expect(toAppConfig({ cardmirror_text_type: "footnote" }).cardmirrorTextType).toBe(
            "analytic",
        );
        expect(toAppConfig({ cardmirror_text_type: "body" }).cardmirrorTextType).toBe("body");
    });
    it("keeps every CardMirror heading level the file can name", () => {
        for (const type of ["pocket", "hat", "block", "tag", "analytic"]) {
            expect(toAppConfig({ cardmirror_text_type: type }).cardmirrorTextType).toBe(type);
        }
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

    it("clamps sidebar width and defaults malformed values", () => {
        expect(toAppConfig({ sidebar_width: 90 }).sidebarWidth).toBe(140);
        expect(toAppConfig({ sidebar_width: 900 }).sidebarWidth).toBe(420);
        expect(toAppConfig({ sidebar_width: "wide" }).sidebarWidth).toBe(220);
        expect(toAppConfig({}).sidebarWidth).toBe(220);
    });

    it("drops keymap entries for unknown commands or non-string chords", () => {
        const cfg = toAppConfig({
            keymap: { [aCommandId]: "g g", notACommand: "x", [anotherCommandId]: 42 },
        });
        expect(cfg.keymapOverrides).toEqual({ [aCommandId]: "g g" });
    });

    it("drops a keymap entry naming a prototype member rather than a command", () => {
        // `constructor` and `toString` are on every object, so a hand-edited
        // file naming one must not read as a command.
        const cfg = toAppConfig({
            keymap: JSON.parse('{"constructor":"Meta+q","toString":"Meta+p"}'),
        });
        expect(cfg.keymapOverrides).toEqual({});
    });

    it("still reads the pre-nesting flat keymap shape so upgrades keep bindings", () => {
        // Files written by earlier versions stored bindings as flat dotted keys
        // under [keymap]; reading must recover them, not drop them.
        const cfg = toAppConfig({ keymap: { "info.open": "z" } });
        expect(cfg.keymapOverrides["info.open"]).toBe("z");
    });

    it("drops a stale default the preset has since moved to another command", () => {
        // Files written before New window existed record flow.new = Mod+N. Kept
        // as an override it outranks the new default, so Mod+N would open the
        // New flow prompt forever instead of a window.
        const chord = Object.entries(getPresetKeymap().bindings).find(
            ([, id]) => id === "window.new",
        )![0];
        expect(toAppConfig({ keymap: { "flow.new": chord } }).keymapOverrides).toEqual({});
        expect(effectiveKeymap({}).bindings[chord]).toBe("window.new");
    });

    it("keeps a rebind of a command whose default was retired", () => {
        const cfg = toAppConfig({ keymap: { "flow.new": "Meta+q" } });
        expect(cfg.keymapOverrides).toEqual({ "flow.new": "Meta+q" });
    });

    it("drops the bare brackets a file written before the sheet steps moved", () => {
        // Kept as overrides they outrank the new defaults, so every existing
        // install would keep a chord the cell editor swallows.
        const cfg = toAppConfig({ keymap: { sheet: { next: "]", prev: "[" } } });
        expect(cfg.keymapOverrides).toEqual({});
    });

    it("returns a fully-defaulted config for a non-object input", () => {
        const cfg = toAppConfig(null);
        expect(cfg.theme).toBe("system");
        expect(cfg.keymapOverrides).toEqual({});
        expect(cfg.updateConfig).toEqual({ autoCheckEnabled: false });
    });
});

describe("collaboration settings", () => {
    it("writes every switch to the file", () => {
        expect(
            configFromState({
                ...sample,
                collabEnabled: true,
                collabRelayEnabled: false,
                collabListenEnabled: true,
                collabShowViewers: false,
            }),
        ).toMatchObject({
            collab_enabled: true,
            collab_relay: false,
            collab_listen: true,
            collab_show_viewers: false,
        });
    });

    // Viewer cursors default on: a read-only peer claims nothing, so painting
    // them can never hide a mark that would refuse a keystroke.
    it("defaults shared editing off, the relay on, idle listening off, and viewer cursors on", () => {
        const parsed = toAppConfig({});
        expect(parsed.collabEnabled).toBe(false);
        expect(parsed.collabRelayEnabled).toBe(true);
        expect(parsed.collabListenEnabled).toBe(false);
        expect(parsed.collabShowViewers).toBe(true);
    });

    it("reads a hand-edited switch back", () => {
        expect(
            toAppConfig({
                collab_enabled: true,
                collab_relay: false,
                collab_listen: true,
                collab_show_viewers: false,
            }),
        ).toMatchObject({
            collabEnabled: true,
            collabRelayEnabled: false,
            collabListenEnabled: true,
            collabShowViewers: false,
        });
    });
});

describe("contacts", () => {
    const ALEX = "a1e0".repeat(16);
    const withAlex = { ...sample, contacts: { [ALEX]: { name: "Alex" } } };

    it("round-trips a saved contact through the file shape", () => {
        expect(toAppConfig(configFromState(withAlex)).contacts).toEqual(withAlex.contacts);
    });

    it("writes one table per peer, so the file stays hand-editable", () => {
        expect(configFromState(withAlex).contacts).toEqual({ [ALEX]: { name: "Alex" } });
    });

    // Every file an older build wrote grades each contact, and a round grades
    // its own peers instead. Dropping those entries would cost a debater every
    // partner they have saved, on the first read after an upgrade.
    it("keeps a hand-written entry carrying a stale role, as a named contact", () => {
        expect(
            toAppConfig({ contacts: { [ALEX]: { name: "Alex", role: "partner" } } }).contacts,
        ).toEqual({ [ALEX]: { name: "Alex" } });
    });

    it("drops a hand-written entry with no name", () => {
        expect(toAppConfig({ contacts: { [ALEX]: {} } }).contacts).toEqual({});
    });

    it("reads a file with no contacts at all as none", () => {
        expect(toAppConfig({}).contacts).toEqual({});
    });

    it("leaves no key behind when a contact is removed", () => {
        expect(configFromState({ ...withAlex, contacts: {} }).contacts).toEqual({});
    });
});

/**
 * Desktop config-file sync.
 *
 * On desktop, the Settings mirror to a plain-text `config.toml` under the user's
 * config dir (see `src-tauri/src/config.rs`). This module owns the *meaning* of
 * that file: mapping the store's settings to and from the flat object the Rust
 * side bridges over IPC, and validating a hand-edited file so garbage values
 * degrade to defaults instead of corrupting the store.
 *
 * The bridge speaks JSON with snake_case keys (matching the TOML field names);
 * Rust owns the TOML syntax and comment preservation, this side owns validation.
 */

import { COMMANDS } from "@/lib/commands/registry";
import { resolveFontId } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { getPresetKeymap } from "@/lib/keymap/presets";
import { type AppConfig, useFlowStore } from "@/lib/store/useFlowStore";
import { resolveThemeMode } from "@/lib/theme/mode";
import { isDesktop } from "@/lib/update/adapter";
import { DEFAULT_UPDATE_CONFIG } from "@/lib/update/types";

/** The flat, snake_case shape carried over IPC (and serialized as TOML). */
export interface ConfigFileShape {
    theme: string;
    flow_font: string;
    sidebar_collapsed: boolean;
    rfd_open: boolean;
    rfd_vim: boolean;
    /** null means "reset to theme default"; Rust removes the key from the file. */
    aff_color: string | null;
    neg_color: string | null;
    /**
     * commandId -> chord for every configurable command, defaults included and
     * unbound commands emitted as "", so the file ships the full keybinding set
     * editable in place. Reading keeps only the entries that differ from the
     * preset as overrides.
     */
    keymap: Record<string, string>;
    update: { auto_check_enabled: boolean; tournament_mode: boolean };
}

/** Accepts only a `#rrggbb` literal (the shape native color inputs emit). */
function resolveColor(value: unknown): string | null {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

/**
 * Inverts a chord -> commandId map into commandId -> chord, seeding an entry for
 * every command so configurable-but-unbound commands ship as "" (editable in
 * place) rather than being absent from the file.
 */
function byCommand(bindings: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const commandId of Object.keys(COMMANDS)) out[commandId] = "";
    for (const [chord, commandId] of Object.entries(bindings)) out[commandId] = chord;
    return out;
}

/** Serializes the store's current settings into the file shape. */
export function configFromState(s: AppConfig): ConfigFileShape {
    return {
        theme: s.theme,
        flow_font: s.flowFont,
        sidebar_collapsed: s.sidebarCollapsed,
        rfd_open: s.rfdOpen,
        rfd_vim: s.rfdVim,
        aff_color: s.affColor,
        neg_color: s.negColor,
        keymap: byCommand(effectiveKeymap(s.keymapOverrides).bindings),
        update: {
            auto_check_enabled: s.updateConfig.autoCheckEnabled,
            tournament_mode: s.updateConfig.tournamentMode,
        },
    };
}

/** Validates a file-originated object into the store's vocabulary. */
export function toAppConfig(raw: unknown): AppConfig {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    // The file lists every default binding; keep only chords that deviate from
    // the preset as real overrides, so a shipped default file reads as no
    // customization at all.
    const defaults = byCommand(getPresetKeymap().bindings);
    const keymapOverrides: Record<string, string> = {};
    if (o.keymap && typeof o.keymap === "object") {
        for (const [commandId, chord] of Object.entries(o.keymap as Record<string, unknown>)) {
            // Drop entries for commands that no longer exist, non-string chords,
            // and any chord that just restates the default.
            if (
                commandId in COMMANDS &&
                typeof chord === "string" &&
                chord.length > 0 &&
                chord !== defaults[commandId]
            ) {
                keymapOverrides[commandId] = chord;
            }
        }
    }

    const update =
        o.update && typeof o.update === "object" ? (o.update as Record<string, unknown>) : {};

    return {
        flowFont: resolveFontId(o.flow_font),
        sidebarCollapsed: bool(o.sidebar_collapsed, false),
        rfdOpen: bool(o.rfd_open, false),
        rfdVim: bool(o.rfd_vim, false),
        theme: resolveThemeMode(o.theme),
        affColor: resolveColor(o.aff_color),
        negColor: resolveColor(o.neg_color),
        keymapOverrides,
        updateConfig: {
            autoCheckEnabled: bool(
                update.auto_check_enabled,
                DEFAULT_UPDATE_CONFIG.autoCheckEnabled,
            ),
            tournamentMode: bool(update.tournament_mode, DEFAULT_UPDATE_CONFIG.tournamentMode),
        },
    };
}

// --- Live sync wiring ----------------------------------------------------------

/**
 * Wires the two-way sync: file wins on boot, then app edits write the file and
 * external file edits apply live to the store. No-op on the web build. Returns a
 * cleanup that tears the wiring down.
 */
export function startConfigSync(): () => void {
    if (!isDesktop()) return () => {};

    let active = true;
    // Until boot resolves, the store subscription must not write: an early
    // change (e.g. loadRound seeding rfdOpen) would clobber the file before it
    // is read, breaking file-wins-on-boot.
    let booted = false;
    // True while applying a file-originated change, so the subscription skips
    // writing it straight back out to disk.
    let applyingFromFile = false;
    // The last config serialized toward the file; guards redundant writes.
    let lastSent = "";
    let unlisten: (() => void) | undefined;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;

    const core = import("@tauri-apps/api/core");
    const events = import("@tauri-apps/api/event");

    const currentConfig = () => configFromState(useFlowStore.getState());

    const applyFromFile = (raw: unknown) => {
        applyingFromFile = true;
        try {
            useFlowStore.getState().applyExternalConfig(toAppConfig(raw));
            lastSent = JSON.stringify(currentConfig());
        } finally {
            applyingFromFile = false;
        }
    };

    // Boot: the file is the source of truth. Apply it if present, else seed it
    // from the current settings.
    void core
        .then(({ invoke }) =>
            invoke<unknown>("read_config").then((raw) => {
                if (!active) return;
                if (raw == null) {
                    lastSent = JSON.stringify(currentConfig());
                    void invoke("write_config", { config: currentConfig() });
                } else {
                    applyFromFile(raw);
                }
            }),
        )
        .catch(() => {
            // Missing HOME, malformed file, or IPC failure: leave the store as
            // seeded from localStorage. Local-first, never error UI.
        })
        .finally(() => {
            booted = true;
        });

    // App -> file. Debounced so a color-slider drag does not spam writes.
    const unsub = useFlowStore.subscribe(() => {
        if (!booted || applyingFromFile) return;
        const serialized = JSON.stringify(currentConfig());
        if (serialized === lastSent) return;
        lastSent = serialized;
        clearTimeout(writeTimer);
        writeTimer = setTimeout(() => {
            void core.then(({ invoke }) =>
                invoke("write_config", { config: JSON.parse(serialized) }),
            );
        }, 150);
    });

    // File -> app.
    void events.then(({ listen }) =>
        listen<unknown>("config:changed", (e) => {
            if (active) applyFromFile(e.payload);
        }).then((un) => {
            if (active) unlisten = un;
            else un();
        }),
    );

    return () => {
        active = false;
        unsub();
        unlisten?.();
        clearTimeout(writeTimer);
    };
}

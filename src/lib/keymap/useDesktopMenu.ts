"use client";

import { useEffect } from "react";

import { useFlowStore } from "@/lib/store/useFlowStore";
import { isDesktop } from "@/lib/update/adapter";

import { menuAccelerators } from "./accelerator";
import { dispatchMenuCommand } from "./menuDispatch";
import { effectiveKeymap } from "./useKeymap";

/**
 * Bridges the native menu to the command layer and keeps its accelerators
 * in sync with the effective keymap. Menu items carry a CommandId (or the
 * special "selectAll" id) as their menu id and emit "menu:command" on click
 * and via their real accelerators (see src-tauri/src/menu.rs).
 * dispatchMenuCommand re-creates native text editing for the focus-dependent
 * chords and runs the app command otherwise. Accelerators follow the preset
 * merged with user overrides, and are fingerprinted to skip redundant rebuilds.
 */
export function useDesktopMenu(): void {
    useEffect(() => {
        if (!isDesktop()) return;

        let active = true;
        let unlisten: (() => void) | undefined;

        import("@tauri-apps/api/event").then(({ listen }) =>
            listen<string>("menu:command", (e) => {
                dispatchMenuCommand(e.payload);
            }).then((un) => {
                if (active) unlisten = un;
                else un();
            }),
        );

        return () => {
            active = false;
            unlisten?.();
        };
    }, []);

    // Keeps the native menu's accelerators in step with the effective keymap
    // (preset merged with the user's overrides). Fingerprinting skips
    // redundant rebuilds; menu rebuilds are cheap but flicker the menubar.
    useEffect(() => {
        if (!isDesktop()) return;

        let active = true;
        let last = "";

        const sync = () => {
            const accels = menuAccelerators(effectiveKeymap());
            const fingerprint = JSON.stringify(accels);
            if (fingerprint === last) return;
            last = fingerprint;
            import("@tauri-apps/api/core")
                .then(({ invoke }) => {
                    if (active) return invoke("rebuild_menu", { accels });
                })
                .catch(() => {
                    // A stale menu is cosmetic; never crash the app over it.
                });
        };

        sync();
        const unsubscribe = useFlowStore.subscribe((state, prev) => {
            if (state.keymapOverrides !== prev.keymapOverrides) sync();
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);
}

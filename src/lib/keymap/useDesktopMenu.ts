"use client";

import { useEffect } from "react";

import { isDesktop } from "@/lib/update/adapter";

import { dispatchMenuCommand } from "./menuDispatch";

/**
 * Bridges the native menu to the command layer. Menu items carry a CommandId
 * (or the special "selectAll" id) as their menu id and emit "menu:command"
 * on click and via their real accelerators (see src-tauri/src/menu.rs).
 * dispatchMenuCommand re-creates native text editing for the focus-dependent
 * chords and runs the app command otherwise.
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
}

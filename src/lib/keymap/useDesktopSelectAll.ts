"use client";

import { useEffect } from "react";

import { isDesktop } from "@/lib/update/adapter";

import { isSelectAllChord, isTextEntryFocus, selectAllInElement } from "./intercept";

/**
 * Restores Meta+A "select all" inside desktop text fields.
 *
 * On the web the browser selects the field natively. The Tauri desktop shell
 * withholds Meta+A's menu accelerator because that chord is the app's
 * `sheet.newAff` binding (see menu.rs), and WKWebView only selects a field when
 * a menu item carries the accelerator, so Meta+A does nothing there. This
 * listener fills the gap: when Meta+A fires with a text field focused it selects
 * the field's contents and swallows the event. Outside a text field it is inert,
 * so `sheet.newAff` still reaches the keymap.
 *
 * Mounted globally (see the root layout) because text inputs live on pages that
 * do not run `useKeymap`, notably the dashboard's flow search.
 */
export function useDesktopSelectAll(): void {
    useEffect(() => {
        if (!isDesktop()) return;

        function onKeyDown(e: KeyboardEvent) {
            if (!isSelectAllChord(e) || !isTextEntryFocus(e.target)) return;
            const target = e.target instanceof HTMLElement ? e.target : null;
            if (selectAllInElement(target)) {
                e.preventDefault();
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}

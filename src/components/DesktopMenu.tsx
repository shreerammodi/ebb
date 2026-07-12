"use client";

import { useDesktopMenu } from "@/lib/keymap/useDesktopMenu";
import { useDesktopSelectAll } from "@/lib/keymap/useDesktopSelectAll";

/**
 * Mounts the desktop-only keyboard bridges once, app-wide. The native menu's
 * accelerators fire on every route (macOS consumes them before the webview),
 * so the menu:command listener must live in the root layout, not just the
 * flow screen.
 */
export function DesktopMenu(): null {
    useDesktopMenu();
    useDesktopSelectAll();
    return null;
}

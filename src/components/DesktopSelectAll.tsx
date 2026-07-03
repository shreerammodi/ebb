"use client";

import { useDesktopSelectAll } from "@/lib/keymap/useDesktopSelectAll";

/**
 * Mounts the desktop Meta+A select-all fallback app-wide. Rendered once in the root
 * layout so it covers text inputs on pages that never run `useKeymap` (the
 * dashboard flow search). Renders nothing; inert on the web build.
 */
export default function DesktopSelectAll() {
    useDesktopSelectAll();
    return null;
}

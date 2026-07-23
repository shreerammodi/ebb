"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import {
    cardNavTarget,
    keyTipParent,
    type KeyTipGroup,
    type KeyTipMode,
} from "@/lib/dashboard/keytips";
import { isTextEntryFocus } from "@/lib/keymap/intercept";

/** DOM marker for a roving-focus flow card. */
export const CARD_ATTR = "data-keytip-card";
/** DOM marker carrying a menu item's key while the new-flow tips are live. */
export const MENU_ATTR = "data-keytip";

/** Keys that are modifiers on their own; pressing one alone never routes. */
const MODIFIER_KEYS: Record<string, true> = { Shift: true, Control: true, Alt: true, Meta: true };

interface RegisteredTip {
    run: () => void;
    /** Mode to switch to after `run` fires; `off` closes the overlay. */
    next: KeyTipMode;
}

interface KeyTipsContextValue {
    mode: KeyTipMode;
    setMode: (mode: KeyTipMode) => void;
    register: (group: KeyTipGroup, chord: string, tip: RegisteredTip) => () => void;
}

// Default is a live no-op so controls used outside the dashboard (and in their
// own unit tests) render without a provider: no tips, no keyboard layer.
const KeyTipsContext = createContext<KeyTipsContextValue>({
    mode: "off",
    setMode: () => {},
    register: () => () => {},
});

export function useKeyTips(): KeyTipsContextValue {
    return useContext(KeyTipsContext);
}

export function KeyTipsProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<KeyTipMode>("off");
    const registry = useRef(new Map<string, RegisteredTip>());
    const modeRef = useRef(mode);
    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    const register = useCallback<KeyTipsContextValue["register"]>((group, chord, tip) => {
        const id = `${group}:${chord}`;
        registry.current.set(id, tip);
        return () => {
            if (registry.current.get(id) === tip) registry.current.delete(id);
        };
    }, []);

    // Single capture-phase keyboard layer for the whole overlay. Capture beats
    // Base UI's menu handlers, so routed keys never trigger its typeahead.
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const current = modeRef.current;

            if (current === "off") {
                const bare = !e.metaKey && !e.ctrlKey && !e.altKey;
                if (e.key === "g" && bare && !isTextEntryFocus(e.target)) {
                    e.preventDefault();
                    setMode("root");
                }
                return;
            }

            // The Base UI menu owns Escape while its tips are live; letting it
            // close the menu resets the mode through onOpenChange.
            if (e.key === "Escape") {
                if (current === "new") return;
                e.preventDefault();
                setMode(keyTipParent(current));
                return;
            }

            if (current === "new") {
                // Route printable keys to menu items; leave arrows/Enter to
                // Base UI so native navigation still works underneath.
                if (e.key.length !== 1) return;
                // Later DOM order wins: an open submenu's item beats the parent
                // menu's same key (closed submenus unmount, so they don't match).
                const items = document.querySelectorAll<HTMLElement>(`[${MENU_ATTR}="${e.key}"]`);
                const target = items[items.length - 1];
                if (!target) return;
                e.preventDefault();
                e.stopPropagation();
                target.click();
                return;
            }

            if (current === "flows") {
                const cards = document.querySelectorAll<HTMLElement>(`[${CARD_ATTR}]`);
                const active = document.activeElement as HTMLElement | null;
                const from = active ? Array.prototype.indexOf.call(cards, active) : -1;
                const to = cardNavTarget(from, cards.length, e.key);
                if (to !== null) {
                    e.preventDefault();
                    cards[to]?.focus();
                    return;
                }
                // Enter opens the focused card via its own handler.
                if (e.key === "Enter") return;
            }

            if (MODIFIER_KEYS[e.key]) return;

            const tip = registry.current.get(`${current}:${e.key}`);
            if (tip) {
                e.preventDefault();
                tip.run();
                setMode(tip.next);
                return;
            }

            // Any other key cancels the overlay, Excel-style. Tab keeps its
            // default so focus can leave; the rest are swallowed.
            if (e.key === "Tab") {
                setMode("off");
                return;
            }
            e.preventDefault();
            setMode("off");
        }

        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
    }, []);

    // Entering the flows context hands focus to the first card so arrows and
    // Enter have somewhere to start.
    useEffect(() => {
        if (mode === "flows") {
            document.querySelector<HTMLElement>(`[${CARD_ATTR}]`)?.focus();
        }
    }, [mode]);

    // A pointer click dismisses the root/flows tips (the new-flow menu manages
    // its own outside-click close through Base UI).
    useEffect(() => {
        if (mode !== "root" && mode !== "flows") return;
        function dismiss() {
            setMode("off");
        }
        window.addEventListener("mousedown", dismiss);
        return () => window.removeEventListener("mousedown", dismiss);
    }, [mode]);

    return (
        <KeyTipsContext.Provider value={{ mode, setMode, register }}>
            {children}
        </KeyTipsContext.Provider>
    );
}

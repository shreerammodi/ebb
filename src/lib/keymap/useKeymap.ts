"use client";

import { useEffect } from "react";

import { executeCommand } from "@/lib/commands/commands";
import { useRoundStore } from "@/lib/store/useRoundStore";

import { effectiveKeymap as computeEffectiveKeymap } from "./effective";
import { shouldIntercept, isTextEntryFocus, isNativeEditingChord } from "./intercept";
import { GRAB_BINDINGS } from "./presets";
import { resolveCommand, eventToChord } from "./resolve";

/** Returns the keymap currently in effect: flat preset merged with user overrides. */
export function effectiveKeymap() {
    const { keymapOverrides } = useRoundStore.getState();
    return computeEffectiveKeymap(keymapOverrides);
}

// Module-level accumulator — safe because useKeymap is a singleton hook.
let pendingPrefix: string | null = null;

export function useKeymap(): void {
    useEffect(() => {
        /**
         * Capture-phase interceptor. Runs before the browser's shortcut handler
         * and before any bubble-phase listeners, calling preventDefault() so the
         * browser never sees the event.
         *
         * Uses the unified shouldIntercept predicate so both phases agree.
         */
        function onKeyDownCapture(e: KeyboardEvent) {
            if (shouldIntercept(e)) {
                // preventDefault stops the browser's shortcut handler.
                // We do NOT stopPropagation — the event must continue to the
                // bubble phase so useKeymap's resolver can fire the command.
                e.preventDefault();
            }
        }

        function onKeyDown(e: KeyboardEvent) {
            const { moveSource } = useRoundStore.getState();
            const moveActive = moveSource !== null;

            // In a text-entry field, only intercept navigation keys and
            // modifier chords; everything else is regular typing.
            const inTextField = !moveActive && isTextEntryFocus(e.target);
            if (inTextField) {
                pendingPrefix = null;
                // Native editing chords (Cmd+A/C/V/X/Z, copy, paste, undo, etc.)
                // must pass through to the browser — do not intercept them.
                if (isNativeEditingChord(e)) return;
                const isNavKey = [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Tab",
                    "Enter",
                ].includes(e.key);
                const isModifierChord = e.metaKey || e.ctrlKey || e.altKey;
                if (!isNavKey && !isModifierChord) return;
            }

            const chord = eventToChord({
                key: e.key,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
            });

            const keymap = effectiveKeymap();

            // ── Grab-move override ────────────────────────────────────────────
            // When grabbing, check grab-specific bindings first (Enter → commit,
            // Escape → cancel), then fall through to flat bindings for arrows etc.
            let commandId: string | null = null;
            if (moveActive && chord in GRAB_BINDINGS) {
                commandId = GRAB_BINDINGS[chord]!;
            }

            // ── Two-key chord resolution ──────────────────────────────────────
            if (!commandId && pendingPrefix !== null) {
                const twoKey = `${pendingPrefix} ${chord}`;
                if (twoKey in keymap.bindings) {
                    pendingPrefix = null;
                    e.preventDefault();
                    executeCommand(keymap.bindings[twoKey]!);
                    return;
                }
                // Prefix didn't complete — clear and fall through to single-chord lookup.
                pendingPrefix = null;
            }

            if (!commandId) {
                // Check whether this chord is a valid prefix for any two-key sequence.
                const isPrefix = Object.keys(keymap.bindings).some((k) =>
                    k.startsWith(`${chord} `),
                );
                if (isPrefix) {
                    pendingPrefix = chord;
                    e.preventDefault();
                    return;
                }

                // ── Single-chord resolution ──────────────────────────────────────
                commandId = resolveCommand(keymap, {
                    key: e.key,
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                });
            }

            if (!commandId) return;

            e.preventDefault();
            executeCommand(commandId as any);
        }

        window.addEventListener("keydown", onKeyDownCapture, { capture: true });
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDownCapture, { capture: true });
            window.removeEventListener("keydown", onKeyDown);
            pendingPrefix = null;
        };
    }, []);
}

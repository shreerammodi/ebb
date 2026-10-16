"use client";

import { useEffect } from "react";

import { executeCommand } from "@/lib/commands/commands";
import { GRID_SCOPED, type CommandId } from "@/lib/commands/registry";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { isDesktop } from "@/lib/update/adapter";

import { effectiveKeymap as computeEffectiveKeymap } from "./effective";
import {
    shouldIntercept,
    isTextEntryFocus,
    isGridEditorFocus,
    isNativeEditingChord,
} from "./intercept";
import { runNativeEditActionForChord } from "./nativeEdit";
import { resolveCommand, eventToChord } from "./resolve";

/** Returns the keymap currently in effect: flat preset merged with user overrides. */
export function effectiveKeymap() {
    const { keymapOverrides } = useFlowStore.getState();
    return computeEffectiveKeymap(keymapOverrides);
}

// Module-level accumulator - safe because useKeymap is a singleton hook.
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
                // Does not call stopPropagation - the event must continue to the
                // bubble phase so useKeymap's resolver can fire the command.
                e.preventDefault();
            }
        }

        function onKeyDown(e: KeyboardEvent) {
            // In a text-entry field (including the grid's cell editor), only
            // intercept modifier chords; everything else is regular typing or
            // a grid-native gesture Handsontable owns.
            const inTextField = isTextEntryFocus(e.target);
            if (inTextField) {
                pendingPrefix = null;
                // Native editing chords (Meta+A/C/V/X/Z, copy, paste, undo,
                // etc.) must pass through to the browser - do not intercept
                // them. Where the shell's Edit-menu accelerator consumed the
                // chord this handler never sees it; where it did not - the
                // GTK backend can end up with replaced accelerators never
                // installed (see nativeEdit.ts) - the webview has to perform
                // the reserved edit itself or the chord does nothing while a
                // text field is focused. Copy/cut/paste and the caret jumps
                // fall out of the action lookup and stay with the browser.
                if (isNativeEditingChord(e)) {
                    if (isDesktop()) {
                        const chord = eventToChord({
                            key: e.key,
                            metaKey: e.metaKey,
                            ctrlKey: e.ctrlKey,
                            altKey: e.altKey,
                            shiftKey: e.shiftKey,
                        });
                        if (runNativeEditActionForChord(chord, e.target as HTMLElement)) {
                            // The action ran here; keep the engine's own
                            // default from applying a second copy of it.
                            e.preventDefault();
                        }
                    }
                    return;
                }
                if (!(e.metaKey || e.ctrlKey || e.altKey)) return;
            }

            // A chord that lands in chrome - rename, palette, RFD, a settings
            // field - is aimed at that box; the grid behind it is not the
            // target. The grid's own cell editor is the exception.
            const chromeField = inTextField && !isGridEditorFocus(e.target);

            /** Fires a resolved command unless chrome focus makes it a misfire. */
            function run(commandId: CommandId): void {
                if (chromeField && GRID_SCOPED[commandId]) return;
                e.preventDefault();
                executeCommand(commandId);
            }

            const chord = eventToChord({
                key: e.key,
                code: e.code,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
            });

            const keymap = effectiveKeymap();

            // -- Two-key chord resolution ------------------------------------
            if (pendingPrefix !== null) {
                const twoKey = `${pendingPrefix} ${chord}`;
                if (twoKey in keymap.bindings) {
                    pendingPrefix = null;
                    run(keymap.bindings[twoKey]!);
                    return;
                }
                // Prefix did not complete - clear and fall through.
                pendingPrefix = null;
            }

            // Check whether this chord is a valid prefix for any two-key sequence.
            const isPrefix = Object.keys(keymap.bindings).some((k) => k.startsWith(`${chord} `));
            if (isPrefix) {
                pendingPrefix = chord;
                e.preventDefault();
                return;
            }

            // -- Single-chord resolution ---------------------------------------
            const commandId = resolveCommand(keymap, {
                key: e.key,
                code: e.code,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
            });

            if (!commandId) return;

            run(commandId);
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

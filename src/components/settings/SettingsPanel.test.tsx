/**
 * SettingsPanel component tests.
 *
 * Uses the real Zustand store. Resets keymap-related state before each test
 * and clears localStorage so persistence assertions are deterministic.
 *
 * The dialog is a two-pane layout: shortcut rows live in the "Keyboard" pane,
 * so shortcut tests click the Keyboard nav item before asserting.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, it, expect, beforeEach } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { COMMANDS } from "@/lib/commands/registry";
import { FONTS, DEFAULT_FONT_ID } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { useFlowStore } from "@/lib/store/useFlowStore";

import SettingsPanel from "./SettingsPanel";

function renderSettingsPanel() {
    return render(
        <TooltipProvider>
            <SettingsPanel />
        </TooltipProvider>,
    );
}

const KEY = "ebb-keymap-settings";

function resetStore() {
    useFlowStore.setState({
        keymapOverrides: {},
        settingsOpen: true,
    });
}

function dispatchPanelKey(key: string, init: Partial<KeyboardEventInit> = {}) {
    const panel = screen.getByTestId("settings-panel");
    act(() => {
        panel.dispatchEvent(
            new KeyboardEvent("keydown", {
                key,
                bubbles: true,
                cancelable: true,
                ...init,
            }),
        );
    });
}

/** The shortcut list lives in the Keyboard pane; switch to it first. */
async function gotoKeyboard(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId("settings-nav-keyboard"));
}

describe("SettingsPanel", () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetStore();
    });

    it("renders nothing when settings are closed", () => {
        useFlowStore.setState({ settingsOpen: false });
        renderSettingsPanel();
        expect(screen.queryByTestId("settings-panel")).toBeNull();
    });

    it("lists commands with their current binding from the flat keymap", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        // The flat keymap binds sheet.next to "]".
        const row = screen.getByTestId("cmd-sheet.next");
        expect(within(row).getByText(COMMANDS["sheet.next"].label)).toBeTruthy();
        expect(screen.getByTestId("chord-sheet.next").textContent).toBe("]");
    });

    it("records a chord override: click Record then press a key", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-sheet.next"));
        // Now recording - the next keydown is captured as the new chord.
        dispatchPanelKey("g");

        expect(useFlowStore.getState().keymapOverrides["sheet.next"]).toBe("g");
        expect(screen.getByTestId("chord-sheet.next").textContent).toBe("g");
    });

    it("records a chord with modifiers", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-sheet.prev"));
        dispatchPanelKey("k", { metaKey: true });

        expect(useFlowStore.getState().keymapOverrides["sheet.prev"]).toBe("Meta+k");
    });

    it("ignores lone modifier keys while recording", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-sheet.next"));
        dispatchPanelKey("Shift", { shiftKey: true });

        // Still recording, no override saved yet.
        expect(useFlowStore.getState().keymapOverrides["sheet.next"]).toBeUndefined();
        expect(screen.getByTestId("record-sheet.next").textContent).toBe("Cancel");
    });

    it("Reset clears an override back to the preset binding", async () => {
        const user = userEvent.setup();
        useFlowStore.getState().setKeymapOverride("sheet.next", "g");
        renderSettingsPanel();
        await gotoKeyboard(user);

        expect(screen.getByTestId("chord-sheet.next").textContent).toBe("g");
        await user.click(screen.getByTestId("reset-sheet.next"));

        expect(useFlowStore.getState().keymapOverrides["sheet.next"]).toBeUndefined();
        expect(screen.getByTestId("chord-sheet.next").textContent).toBe("]");
    });

    it("shows shortcuts only in the Keyboard pane", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        // Display is the default pane - no command rows.
        expect(screen.queryByTestId("cmd-sheet.next")).toBeNull();

        await user.click(screen.getByTestId("settings-nav-keyboard"));
        expect(screen.getByTestId("cmd-sheet.next")).toBeTruthy();

        await user.click(screen.getByTestId("settings-nav-display"));
        expect(screen.queryByTestId("cmd-sheet.next")).toBeNull();
    });

    it("filters the command list by label", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.type(screen.getByTestId("shortcut-filter"), "Undo");

        // "Undo" matches only the edit.undo command label.
        expect(screen.getByTestId("cmd-edit.undo")).toBeTruthy();
        expect(screen.queryByTestId("cmd-sheet.next")).toBeNull();
    });

    it("Escape closes the panel", () => {
        renderSettingsPanel();
        dispatchPanelKey("Escape");
        expect(useFlowStore.getState().settingsOpen).toBe(false);
    });

    it("close button closes the panel", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await user.click(screen.getByTestId("settings-close"));
        expect(useFlowStore.getState().settingsOpen).toBe(false);
    });

    describe("theme picker", () => {
        it("renders a radio for each mode with the current one checked", () => {
            useFlowStore.getState().setTheme("dark");
            renderSettingsPanel();

            expect(screen.getByTestId("theme-light")).toBeInTheDocument();
            expect(screen.getByTestId("theme-dark")).toBeInTheDocument();
            expect(screen.getByTestId("theme-system")).toBeInTheDocument();
            expect(screen.getByTestId("theme-dark")).toBeChecked();
        });

        it("calls setTheme when a different mode is chosen", async () => {
            useFlowStore.getState().setTheme("system");
            renderSettingsPanel();
            await userEvent.click(screen.getByTestId("theme-light"));
            expect(useFlowStore.getState().theme).toBe("light");
        });
    });

    describe("flow font picker", () => {
        it("lists every curated font as an option, with the current one shown selected", async () => {
            useFlowStore.getState().setFlowFont("commit-mono");
            renderSettingsPanel();
            // Display is the default pane - no nav click needed.

            expect(screen.getByTestId("flow-font-select")).toHaveTextContent("Commit Mono");

            await userEvent.click(screen.getByTestId("flow-font-select"));
            for (const f of FONTS) {
                expect(screen.getByTestId(`flow-font-${f.id}`)).toBeInTheDocument();
            }
        });

        it("calls setFlowFont when a different font is chosen", async () => {
            useFlowStore.getState().setFlowFont("commit-mono");
            renderSettingsPanel();
            await userEvent.click(screen.getByTestId("flow-font-select"));
            await userEvent.click(screen.getByTestId("flow-font-plex-sans"));
            expect(useFlowStore.getState().flowFont).toBe("plex-sans");
        });

        it("resets to the default font", async () => {
            useFlowStore.getState().setFlowFont("plex-sans");
            renderSettingsPanel();
            await userEvent.click(screen.getByTestId("flow-font-reset"));
            expect(useFlowStore.getState().flowFont).toBe(DEFAULT_FONT_ID);
        });

        it("disables the reset button once the default font is active", async () => {
            useFlowStore.getState().setFlowFont(DEFAULT_FONT_ID);
            renderSettingsPanel();
            expect(screen.getByTestId("flow-font-reset")).toBeDisabled();
        });
    });

    it("persists overrides to localStorage and effectiveKeymap uses them", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-sheet.next"));
        dispatchPanelKey("g");

        // Persisted to localStorage.
        const raw = window.localStorage.getItem(KEY);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed.keymapOverrides["sheet.next"]).toBe("g");

        // effectiveKeymap reflects the override: "g" fires sheet.next, "]" removed.
        const keymap = effectiveKeymap(parsed.keymapOverrides);
        expect(keymap.bindings["g"]).toBe("sheet.next");
        expect(keymap.bindings["]"]).toBeUndefined();
    });
});

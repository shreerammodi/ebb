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
import { FONTS } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { useRoundStore } from "@/lib/store/useRoundStore";

import SettingsPanel from "./SettingsPanel";

function renderSettingsPanel() {
    return render(
        <TooltipProvider>
            <SettingsPanel />
        </TooltipProvider>,
    );
}

const KEY = "df-keymap-settings";

function resetStore() {
    useRoundStore.setState({
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
        useRoundStore.setState({ settingsOpen: false });
        renderSettingsPanel();
        expect(screen.queryByTestId("settings-panel")).toBeNull();
    });

    it("lists commands with their current binding from the flat keymap", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        // The flat keymap binds move.down to "ArrowDown".
        const row = screen.getByTestId("cmd-move.down");
        expect(within(row).getByText(COMMANDS["move.down"].label)).toBeTruthy();
        expect(screen.getByTestId("chord-move.down").textContent).toBe("ArrowDown");
    });

    it("records a chord override: click Record then press a key", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.down"));
        // Now recording — the next keydown is captured as the new chord.
        dispatchPanelKey("g");

        expect(useRoundStore.getState().keymapOverrides["move.down"]).toBe("g");
        expect(screen.getByTestId("chord-move.down").textContent).toBe("g");
    });

    it("records a chord with modifiers", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.up"));
        dispatchPanelKey("k", { metaKey: true });

        expect(useRoundStore.getState().keymapOverrides["move.up"]).toBe("Meta+k");
    });

    it("ignores lone modifier keys while recording", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.down"));
        dispatchPanelKey("Shift", { shiftKey: true });

        // Still recording, no override saved yet.
        expect(useRoundStore.getState().keymapOverrides["move.down"]).toBeUndefined();
        expect(screen.getByTestId("record-move.down").textContent).toBe("Cancel");
    });

    it("Reset clears an override back to the preset binding", async () => {
        const user = userEvent.setup();
        useRoundStore.getState().setKeymapOverride("move.down", "g");
        renderSettingsPanel();
        await gotoKeyboard(user);

        expect(screen.getByTestId("chord-move.down").textContent).toBe("g");
        await user.click(screen.getByTestId("reset-move.down"));

        expect(useRoundStore.getState().keymapOverrides["move.down"]).toBeUndefined();
        expect(screen.getByTestId("chord-move.down").textContent).toBe("ArrowDown");
    });

    it("shows shortcuts only in the Keyboard pane", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        // Display is the default pane — no command rows.
        expect(screen.queryByTestId("cmd-move.down")).toBeNull();

        await user.click(screen.getByTestId("settings-nav-keyboard"));
        expect(screen.getByTestId("cmd-move.down")).toBeTruthy();

        await user.click(screen.getByTestId("settings-nav-display"));
        expect(screen.queryByTestId("cmd-move.down")).toBeNull();
    });

    it("filters the command list by label", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.type(screen.getByTestId("shortcut-filter"), "Undo");

        // "Undo" matches only the edit.undo command label.
        expect(screen.getByTestId("cmd-edit.undo")).toBeTruthy();
        expect(screen.queryByTestId("cmd-move.down")).toBeNull();
    });

    it("Escape closes the panel", () => {
        renderSettingsPanel();
        dispatchPanelKey("Escape");
        expect(useRoundStore.getState().settingsOpen).toBe(false);
    });

    it("close button closes the panel", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await user.click(screen.getByTestId("settings-close"));
        expect(useRoundStore.getState().settingsOpen).toBe(false);
    });

    it("toggles autoNumber via the display switch", async () => {
        useRoundStore.getState().setSettingsOpen(true);
        renderSettingsPanel();
        const sw = screen.getByTestId("toggle-autoNumber");
        await userEvent.click(sw);
        expect(useRoundStore.getState().autoNumber).toBe(false);
        // Reset so other tests aren't affected
        useRoundStore.getState().setAutoNumber(true);
    });

    it("toggles labelDrops via the display switch", async () => {
        useRoundStore.getState().setSettingsOpen(true);
        renderSettingsPanel();
        const sw = screen.getByTestId("toggle-labelDrops");
        await userEvent.click(sw);
        expect(useRoundStore.getState().labelDrops).toBe(false);
        useRoundStore.getState().setLabelDrops(true);
    });

    describe("flow font picker", () => {
        it("renders a radio for each curated font with the current one checked", async () => {
            useRoundStore.getState().setFlowFont("commit-mono");
            renderSettingsPanel();
            // Display is the default pane — no nav click needed.

            for (const f of FONTS) {
                expect(screen.getByTestId(`flow-font-${f.id}`)).toBeInTheDocument();
            }
            expect(screen.getByTestId("flow-font-commit-mono")).toBeChecked();
        });

        it("calls setFlowFont when a different font is chosen", async () => {
            useRoundStore.getState().setFlowFont("commit-mono");
            renderSettingsPanel();
            await userEvent.click(screen.getByTestId("flow-font-plex-sans"));
            expect(useRoundStore.getState().flowFont).toBe("plex-sans");
        });

        it("resets to the default font", async () => {
            useRoundStore.getState().setFlowFont("plex-sans");
            renderSettingsPanel();
            await userEvent.click(screen.getByTestId("flow-font-reset"));
            expect(useRoundStore.getState().flowFont).toBe("plex-sans");
        });
    });

    it("persists overrides to localStorage and effectiveKeymap uses them", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.down"));
        dispatchPanelKey("g");

        // Persisted to localStorage.
        const raw = window.localStorage.getItem(KEY);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed.keymapOverrides["move.down"]).toBe("g");

        // effectiveKeymap reflects the override: "g" → move.down, ArrowDown removed.
        const keymap = effectiveKeymap(parsed.keymapOverrides);
        expect(keymap.bindings["g"]).toBe("move.down");
        expect(keymap.bindings["ArrowDown"]).toBeUndefined();
    });
});

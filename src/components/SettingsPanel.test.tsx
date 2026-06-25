/**
 * SettingsPanel component tests.
 *
 * Uses the real Zustand store. Resets keymap-related state before each test
 * and clears localStorage so persistence assertions are deterministic.
 *
 * The dialog is a two-pane layout: shortcut rows live in the "Keyboard" pane,
 * so shortcut tests click the Keyboard nav item before asserting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { COMMANDS } from "@/lib/commands/registry";
import SettingsPanel from "./SettingsPanel";

const KEY = "df-keymap-settings";

function resetStore() {
    useRoundStore.setState({
        keymapName: "vim",
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
        render(<SettingsPanel />);
        expect(screen.queryByTestId("settings-panel")).toBeNull();
    });

    it("renders nothing when settings are closed", () => {
        useRoundStore.setState({ settingsOpen: false });
        render(<SettingsPanel />);
        expect(screen.queryByTestId("settings-panel")).toBeNull();
    });

    it("lists commands with their current binding from the active keymap", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        // The vim preset binds move.down to "j".
        const row = screen.getByTestId("cmd-move.down");
        expect(within(row).getByText(COMMANDS["move.down"].label)).toBeTruthy();
        expect(screen.getByTestId("chord-move.down").textContent).toBe("j");
    });

    it("switching preset updates keymapName in the store", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("preset-default"));

        expect(useRoundStore.getState().keymapName).toBe("default");
        // Default binds move.down to ArrowDown.
        expect(screen.getByTestId("chord-move.down").textContent).toBe(
            "ArrowDown",
        );
    });

    it("switching preset clears existing overrides", async () => {
        const user = userEvent.setup();
        useRoundStore.getState().setKeymapOverride("move.down", "Meta+j");
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("preset-default"));

        expect(useRoundStore.getState().keymapOverrides).toEqual({});
    });

    it("records a chord override: click Record then press a key", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.down"));
        // Now recording — the next keydown is captured as the new chord.
        dispatchPanelKey("g");

        expect(useRoundStore.getState().keymapOverrides["move.down"]).toBe("g");
        expect(screen.getByTestId("chord-move.down").textContent).toBe("g");
    });

    it("records a chord with modifiers", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.up"));
        dispatchPanelKey("k", { metaKey: true });

        expect(useRoundStore.getState().keymapOverrides["move.up"]).toBe(
            "Meta+k",
        );
    });

    it("ignores lone modifier keys while recording", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.down"));
        dispatchPanelKey("Shift", { shiftKey: true });

        // Still recording, no override saved yet.
        expect(
            useRoundStore.getState().keymapOverrides["move.down"],
        ).toBeUndefined();
        expect(screen.getByTestId("record-move.down").textContent).toBe(
            "Cancel",
        );
    });

    it("Reset clears an override back to the preset binding", async () => {
        const user = userEvent.setup();
        useRoundStore.getState().setKeymapOverride("move.down", "g");
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        expect(screen.getByTestId("chord-move.down").textContent).toBe("g");
        await user.click(screen.getByTestId("reset-move.down"));

        expect(
            useRoundStore.getState().keymapOverrides["move.down"],
        ).toBeUndefined();
        expect(screen.getByTestId("chord-move.down").textContent).toBe("j");
    });

    it("shows shortcuts only in the Keyboard pane", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);

        // Display is the default pane — no command rows.
        expect(screen.queryByTestId("cmd-move.down")).toBeNull();

        await user.click(screen.getByTestId("settings-nav-keyboard"));
        expect(screen.getByTestId("cmd-move.down")).toBeTruthy();

        await user.click(screen.getByTestId("settings-nav-display"));
        expect(screen.queryByTestId("cmd-move.down")).toBeNull();
    });

    it("filters the command list by label", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.type(screen.getByTestId("shortcut-filter"), "Undo");

        // "Undo" matches only the edit.undo command label.
        expect(screen.getByTestId("cmd-edit.undo")).toBeTruthy();
        expect(screen.queryByTestId("cmd-move.down")).toBeNull();
    });

    it("Escape closes the panel", () => {
        render(<SettingsPanel />);
        dispatchPanelKey("Escape");
        expect(useRoundStore.getState().settingsOpen).toBe(false);
    });

    it("close button closes the panel", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await user.click(screen.getByTestId("settings-close"));
        expect(useRoundStore.getState().settingsOpen).toBe(false);
    });

    it("toggles autoNumber via the display switch", async () => {
        useRoundStore.getState().setSettingsOpen(true);
        render(<SettingsPanel />);
        const sw = screen.getByTestId("toggle-autoNumber");
        await userEvent.click(sw);
        expect(useRoundStore.getState().autoNumber).toBe(false);
        // Reset so other tests aren't affected
        useRoundStore.getState().setAutoNumber(true);
    });

    it("toggles straightDown via the display switch", async () => {
        useRoundStore.getState().setSettingsOpen(true);
        render(<SettingsPanel />);
        const sw = screen.getByTestId("toggle-straightDown");
        await userEvent.click(sw);
        expect(useRoundStore.getState().straightDown).toBe(true);
        useRoundStore.getState().setStraightDown(false);
    });

    it("disables autoNumber and labelDrops toggles when straightDown is on", () => {
        useRoundStore.setState({ settingsOpen: true, straightDown: true });
        render(<SettingsPanel />);
        expect(screen.getByTestId("toggle-autoNumber")).toBeDisabled();
        expect(screen.getByTestId("toggle-labelDrops")).toBeDisabled();
        useRoundStore.setState({ straightDown: false });
    });

    it("persists overrides to localStorage and effectiveKeymap uses them", async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-move.down"));
        dispatchPanelKey("g");

        // Persisted to localStorage.
        const raw = window.localStorage.getItem(KEY);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed.keymapOverrides["move.down"]).toBe("g");
        expect(parsed.keymapName).toBe("vim");

        // effectiveKeymap reflects the override: "g" → move.down, old "j" removed.
        const keymap = effectiveKeymap(
            parsed.keymapName,
            parsed.keymapOverrides,
        );
        expect(keymap.bindings.normal["g"]).toBe("move.down");
        expect(keymap.bindings.normal["j"]).toBeUndefined();
    });
});

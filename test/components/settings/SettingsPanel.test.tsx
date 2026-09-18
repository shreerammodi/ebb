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
import { describe, it, expect, beforeEach, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateProvider } from "@/components/update/UpdateProvider";
import { COMMANDS } from "@/lib/commands/registry";
import { FONTS, DEFAULT_FONT_ID } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { isMacPlatform } from "@/lib/platform";
import { useFlowStore } from "@/lib/store/useFlowStore";

// Force desktop so the Updates category is present. Only the exported isDesktop
// is overridden; the adapter's own I/O helpers keep their real (web) behavior,
// so mounting the update hook triggers no Tauri calls.
vi.mock("@/lib/update/adapter", async (importActual) => ({
    ...(await importActual<typeof import("@/lib/update/adapter")>()),
    isDesktop: () => true,
}));

vi.mock("@/lib/keymap/useDesktopMenu", () => ({
    suspendMenuAccelerators: vi.fn(),
    restoreMenuAccelerators: vi.fn(),
}));

import SettingsPanel from "@/components/settings/SettingsPanel";
import { restoreMenuAccelerators, suspendMenuAccelerators } from "@/lib/keymap/useDesktopMenu";

import { installFakeFlowFs } from "../../support/fakeFlowFs";

function renderSettingsPanel() {
    return render(
        <TooltipProvider>
            <SettingsPanel />
        </TooltipProvider>,
    );
}

const KEY = "ebb-keymap-settings";
const MOD = isMacPlatform() ? "Meta" : "Ctrl";

function resetStore() {
    useFlowStore.setState({
        keymapOverrides: {},
        settingsOpen: true,
        cardmirrorEnabled: true,
        cardmirrorSpaceArguments: false,
        collabEnabled: false,
        collabRelayEnabled: true,
        collabListenEnabled: false,
        collabShowViewers: true,
        contacts: {},
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
        vi.clearAllMocks();
        // isDesktop() is forced on above, so the Editor pane's flows-folder
        // control resolves a real path; the fake port keeps it off Tauri IPC.
        installFakeFlowFs();
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

        // The flat keymap steps sheets on the platform modifier and a bracket.
        const row = screen.getByTestId("cmd-sheet.next");
        expect(within(row).getByText(COMMANDS["sheet.next"].label)).toBeTruthy();
        expect(screen.getByTestId("chord-sheet.next").textContent).toBe(`${MOD}+]`);
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

    it("ignores chords the native menu permanently owns (Select All, Cut/Copy/Paste, Quit)", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await gotoKeyboard(user);

        await user.click(screen.getByTestId("record-sheet.next"));
        for (const key of ["a", "c", "v", "x", "q"]) {
            dispatchPanelKey(key, { metaKey: MOD === "Meta", ctrlKey: MOD === "Ctrl" });
        }

        // Still recording, no override saved for any of the reserved chords.
        expect(useFlowStore.getState().keymapOverrides["sheet.next"]).toBeUndefined();
        expect(screen.getByTestId("record-sheet.next").textContent).toBe("Cancel");
    });

    describe("menu accelerator suspension while recording", () => {
        it("suspends on record start and restores once a chord is accepted", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await gotoKeyboard(user);

            await user.click(screen.getByTestId("record-sheet.next"));
            expect(suspendMenuAccelerators).toHaveBeenCalledTimes(1);
            expect(restoreMenuAccelerators).not.toHaveBeenCalled();

            dispatchPanelKey("g");
            expect(restoreMenuAccelerators).toHaveBeenCalledTimes(1);
        });

        it("restores when recording is cancelled via Escape", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await gotoKeyboard(user);

            await user.click(screen.getByTestId("record-sheet.next"));
            dispatchPanelKey("Escape");
            expect(restoreMenuAccelerators).toHaveBeenCalledTimes(1);
        });

        it("restores when recording is cancelled via the Cancel button", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await gotoKeyboard(user);

            await user.click(screen.getByTestId("record-sheet.next"));
            await user.click(screen.getByTestId("record-sheet.next"));
            expect(restoreMenuAccelerators).toHaveBeenCalledTimes(1);
        });

        it("restores if the panel unmounts mid-recording", async () => {
            const user = userEvent.setup();
            const { unmount } = renderSettingsPanel();
            await gotoKeyboard(user);

            await user.click(screen.getByTestId("record-sheet.next"));
            unmount();
            expect(restoreMenuAccelerators).toHaveBeenCalledTimes(1);
        });
    });

    it("Reset clears an override back to the preset binding", async () => {
        const user = userEvent.setup();
        useFlowStore.getState().setKeymapOverride("sheet.next", "g");
        renderSettingsPanel();
        await gotoKeyboard(user);

        expect(screen.getByTestId("chord-sheet.next").textContent).toBe("g");
        await user.click(screen.getByTestId("reset-sheet.next"));

        expect(useFlowStore.getState().keymapOverrides["sheet.next"]).toBeUndefined();
        expect(screen.getByTestId("chord-sheet.next").textContent).toBe(`${MOD}+]`);
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
                expect(await screen.findByTestId(`flow-font-${f.id}`)).toBeInTheDocument();
            }
        });

        it("calls setFlowFont when a different font is chosen", async () => {
            useFlowStore.getState().setFlowFont("commit-mono");
            renderSettingsPanel();
            await userEvent.click(screen.getByTestId("flow-font-select"));
            await userEvent.click(await screen.findByTestId("flow-font-plex-sans"));
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

    it("toggles the RFD vim setting", async () => {
        renderSettingsPanel();
        const toggle = screen.getByTestId("rfd-vim-toggle");
        expect(toggle).not.toBeChecked();
        await userEvent.click(toggle);
        expect(useFlowStore.getState().rfdVim).toBe(true);
        expect(toggle).toBeChecked();
    });

    it("toggles the speech alignment setting", async () => {
        renderSettingsPanel();
        const toggle = screen.getByTestId("align-speeches-toggle");
        expect(toggle).not.toBeChecked();
        await userEvent.click(toggle);
        expect(useFlowStore.getState().alignSpeeches).toBe(true);
        expect(toggle).toBeChecked();
    });

    it("toggles the insert paste setting from the Editor category", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await user.click(screen.getByTestId("settings-nav-editor"));

        const toggle = screen.getByTestId("insert-paste-toggle");
        expect(toggle).not.toBeChecked();
        await user.click(toggle);
        expect(useFlowStore.getState().insertPaste).toBe(true);
        expect(toggle).toBeChecked();
    });

    it("toggles append mode from the Editor category, on by default", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        await user.click(screen.getByTestId("settings-nav-editor"));

        const toggle = screen.getByTestId("append-edit-toggle");
        expect(toggle).toBeChecked();
        await user.click(toggle);
        expect(useFlowStore.getState().appendEdit).toBe(false);
        expect(toggle).not.toBeChecked();
    });

    describe("CardMirror section", () => {
        it("toggles spacing between pasted arguments", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-editor"));

            const toggle = screen.getByTestId("cardmirror-space-arguments-toggle");
            expect(toggle).not.toBeChecked();
            await user.click(toggle);
            expect(useFlowStore.getState().cardmirrorSpaceArguments).toBe(true);
            expect(toggle).toBeChecked();
        });

        it("hides the text type picker until the integration is switched on", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-editor"));

            const toggle = screen.getByTestId("cardmirror-enabled-toggle");
            expect(toggle).toBeChecked();
            expect(screen.getByTestId("cardmirror-text-type-select")).toBeTruthy();

            await user.click(toggle);
            expect(useFlowStore.getState().cardmirrorEnabled).toBe(false);
            expect(screen.queryByTestId("cardmirror-text-type-select")).toBeNull();
        });

        it("drops the CardMirror shortcuts from the Keyboard pane when off", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await gotoKeyboard(user);
            expect(screen.getByTestId("cmd-cell.jumpToSource")).toBeTruthy();

            act(() => useFlowStore.getState().setCardmirrorEnabled(false));
            expect(screen.queryByTestId("cmd-cell.jumpToSource")).toBeNull();
            expect(screen.queryByTestId("cmd-cell.sendToDoc")).toBeNull();
        });
    });

    describe("Collaboration section", () => {
        // The master row is the only collaboration copy a debater reads before
        // switching anything on, because every other row is hidden behind it.
        // Listen for invites is what puts ebb on the network with no round in
        // hand, so a promise that nothing does until a round is shared is the
        // one claim here that a switch in the same panel falsifies.
        it("does not promise the network stays untouched until a round is shared", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));

            const copy = screen.getByTestId("collab-section").textContent ?? "";
            expect(copy).not.toContain("until you share or join a round");
            expect(copy).toContain("Listen for invites");
        });

        it("hides the relay row until shared editing is switched on", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));

            const toggle = screen.getByTestId("collab-enabled-toggle");
            expect(toggle).not.toBeChecked();
            expect(screen.queryByTestId("collab-relay-toggle")).toBeNull();

            await user.click(toggle);
            expect(useFlowStore.getState().collabEnabled).toBe(true);
            expect(toggle).toBeChecked();
            expect(screen.getByTestId("collab-relay-toggle")).toBeTruthy();
        });

        it("hides the relay row again when shared editing goes back off", async () => {
            const user = userEvent.setup();
            useFlowStore.setState({ collabEnabled: true });
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));
            expect(screen.getByTestId("collab-relay-toggle")).toBeTruthy();

            await user.click(screen.getByTestId("collab-enabled-toggle"));
            expect(useFlowStore.getState().collabEnabled).toBe(false);
            expect(screen.queryByTestId("collab-relay-toggle")).toBeNull();
        });

        it("toggles the relay setting", async () => {
            const user = userEvent.setup();
            useFlowStore.setState({ collabEnabled: true });
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));

            const toggle = screen.getByTestId("collab-relay-toggle");
            expect(toggle).toBeChecked();
            await user.click(toggle);
            expect(useFlowStore.getState().collabRelayEnabled).toBe(false);
            expect(toggle).not.toBeChecked();
        });

        // Turning shared editing on unlocks Share and Join, and must not by
        // itself put an endpoint on the network.
        it("leaves idle listening off when shared editing is switched on", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));
            await user.click(screen.getByTestId("collab-enabled-toggle"));

            const listen = screen.getByTestId("collab-listen-toggle");
            expect(listen).not.toBeChecked();
            expect(useFlowStore.getState().collabListenEnabled).toBe(false);

            await user.click(listen);
            expect(useFlowStore.getState().collabListenEnabled).toBe(true);
            expect(listen).toBeChecked();
        });

        it("hides the viewer cursor row until shared editing is switched on", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));
            expect(screen.queryByTestId("collab-show-viewers-toggle")).toBeNull();

            await user.click(screen.getByTestId("collab-enabled-toggle"));
            expect(screen.getByTestId("collab-show-viewers-toggle")).toBeTruthy();
        });

        // A viewer's cursor is shown until the debater says otherwise: hiding
        // a partner by default would make the grid look empty while somebody
        // is reading along.
        it("shows viewer cursors on until they are turned off", async () => {
            const user = userEvent.setup();
            useFlowStore.setState({ collabEnabled: true });
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));

            const viewers = screen.getByTestId("collab-show-viewers-toggle");
            expect(viewers).toBeChecked();

            await user.click(viewers);
            expect(useFlowStore.getState().collabShowViewers).toBe(false);
            expect(viewers).not.toBeChecked();
        });

        it("hides the contact list until shared editing is switched on", async () => {
            const user = userEvent.setup();
            useFlowStore.setState({ contacts: { alex: { name: "Alex" } } });
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-collaboration"));
            expect(screen.queryByTestId("contact-row-alex")).toBeNull();

            await user.click(screen.getByTestId("collab-enabled-toggle"));
            expect(screen.getByTestId("contact-row-alex")).toBeTruthy();
        });

        // Palette only, for all five: a printable-key chord would reach a
        // command that dials the network from inside the grid.
        it("offers none of the shared editing commands in the Keyboard pane", async () => {
            const user = userEvent.setup();
            useFlowStore.setState({ collabEnabled: true });
            renderSettingsPanel();
            await gotoKeyboard(user);

            expect(screen.getByTestId("cmd-edit.undo")).toBeTruthy();
            for (const id of [
                "collab.share",
                "collab.shareView",
                "collab.join",
                "collab.invite",
                "collab.inviteView",
                "collab.end",
            ]) {
                expect(screen.queryByTestId(`cmd-${id}`)).toBeNull();
            }
        });
    });

    // The Updates pane calls useUpdate(), which throws unless a UpdateProvider is
    // an ancestor. The root layout must keep SettingsPanel inside that provider.
    it("renders the Updates pane when wrapped in UpdateProvider", async () => {
        const user = userEvent.setup();
        render(
            <TooltipProvider>
                <UpdateProvider>
                    <SettingsPanel />
                </UpdateProvider>
            </TooltipProvider>,
        );

        await user.click(screen.getByTestId("settings-nav-updates"));
        expect(screen.getByTestId("check-updates")).toBeTruthy();
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

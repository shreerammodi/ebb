/**
 * SettingsPanel component tests.
 *
 * Uses the real Zustand store. Resets keymap-related state before each test
 * and clears localStorage so persistence assertions are deterministic.
 *
 * The dialog is a two-pane layout: shortcut rows live in the "Keyboard" pane,
 * so shortcut tests click the Keyboard nav item before asserting.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateProvider } from "@/components/update/UpdateProvider";
import type { Contacts } from "@/lib/collab/contacts";
import { COMMANDS } from "@/lib/commands/registry";
import { FONTS, DEFAULT_FONT_ID } from "@/lib/fonts/registry";
import { effectiveKeymap } from "@/lib/keymap/effective";
import { isMacPlatform } from "@/lib/platform";
import { useCollabStore } from "@/lib/store/useCollabStore";
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

const { machineName, myEndpointId, toastSuccess, toastError } = vi.hoisted(() => ({
    machineName: vi.fn(async () => "smodi-mbp"),
    myEndpointId: vi.fn(async () => ""),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock("@/lib/collab/machineName", async (importActual) => ({
    ...(await importActual<typeof import("@/lib/collab/machineName")>()),
    machineName,
    myEndpointId,
}));

vi.mock("sonner", async (importActual) => ({
    ...(await importActual<typeof import("sonner")>()),
    toast: { success: toastSuccess, error: toastError },
}));

import SettingsPanel, {
    ContactList,
    DisplayNameRow,
    FlowsFolderControl,
    MyEndpointId,
} from "@/components/settings/SettingsPanel";
import { restoreMenuAccelerators, suspendMenuAccelerators } from "@/lib/keymap/useDesktopMenu";

import { FLOWS_DIR, installFakeFlowFs, type FakeFlowFs } from "../../support/fakeFlowFs";

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
        cardmirrorPushEdits: false,
        collabEnabled: false,
        collabRelayEnabled: true,
        collabListenEnabled: false,
        collabShowViewers: true,
        contacts: {},
        speakingWpm: 150,
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
        const user = userEvent.setup();
        renderSettingsPanel();
        await user.click(screen.getByTestId("settings-nav-editor"));
        const toggle = screen.getByTestId("rfd-vim-toggle");
        expect(toggle).not.toBeChecked();
        await user.click(toggle);
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

    it("sets the speaking speed", async () => {
        const user = userEvent.setup();
        renderSettingsPanel();
        const input = screen.getByTestId("speaking-wpm-input");

        await user.type(input, "180", { initialSelectionStart: 0, initialSelectionEnd: 3 });
        await user.tab();

        expect(useFlowStore.getState().speakingWpm).toBe(180);
        expect(input).toHaveValue("180");
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

        it("hides the push-edits row until the integration is switched on", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-editor"));

            expect(screen.getByTestId("cardmirror-push-edits-toggle")).toBeTruthy();

            await user.click(screen.getByTestId("cardmirror-enabled-toggle"));
            expect(screen.queryByTestId("cardmirror-push-edits-toggle")).toBeNull();
        });

        it("leaves pushing edits off by default and flips the store", async () => {
            const user = userEvent.setup();
            renderSettingsPanel();
            await user.click(screen.getByTestId("settings-nav-editor"));

            const toggle = screen.getByTestId("cardmirror-push-edits-toggle");
            expect(toggle).not.toBeChecked();

            await user.click(toggle);
            expect(useFlowStore.getState().cardmirrorPushEdits).toBe(true);
            expect(toggle).toBeChecked();
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

describe("FlowsFolderControl", () => {
    let fs: FakeFlowFs;

    beforeEach(() => {
        fs = installFakeFlowFs();
        useFlowStore.setState({ flowsDir: null });
    });

    it("shows the resolved default when nothing is configured", async () => {
        render(<FlowsFolderControl />);
        // Shortened against home, since that is what the user recognizes.
        await waitFor(() =>
            expect(screen.getByTestId("flows-folder-path")).toHaveTextContent("~/Documents/ebb"),
        );
    });

    it("shows the configured folder instead once one is set", async () => {
        useFlowStore.setState({ flowsDir: "/Volumes/usb/rounds" });
        render(<FlowsFolderControl />);
        await waitFor(() =>
            expect(screen.getByTestId("flows-folder-path")).toHaveTextContent(
                "/Volumes/usb/rounds",
            ),
        );
    });

    it("stores the folder the picker returns", async () => {
        fs.nextDirectory = "/Volumes/usb/rounds";
        render(<FlowsFolderControl />);

        await userEvent.click(screen.getByTestId("flows-folder-choose"));

        await waitFor(() => expect(useFlowStore.getState().flowsDir).toBe("/Volumes/usb/rounds"));
    });

    it("keeps the current folder when the picker is cancelled", async () => {
        useFlowStore.setState({ flowsDir: "/Volumes/usb/rounds" });
        fs.nextDirectory = null;
        render(<FlowsFolderControl />);

        await userEvent.click(screen.getByTestId("flows-folder-choose"));

        expect(useFlowStore.getState().flowsDir).toBe("/Volumes/usb/rounds");
    });

    it("clears the override rather than pinning today's default", async () => {
        useFlowStore.setState({ flowsDir: "/Volumes/usb/rounds" });
        render(<FlowsFolderControl />);

        await userEvent.click(screen.getByTestId("flows-folder-reset"));

        expect(useFlowStore.getState().flowsDir).toBeNull();
        await waitFor(() =>
            expect(screen.getByTestId("flows-folder-path")).toHaveTextContent("~/Documents/ebb"),
        );
    });

    it("offers no reset while following the default", async () => {
        render(<FlowsFolderControl />);
        await waitFor(() =>
            expect(screen.getByTestId("flows-folder-path")).not.toBeEmptyDOMElement(),
        );
        expect(screen.queryByTestId("flows-folder-reset")).not.toBeInTheDocument();
        expect(FLOWS_DIR).toContain("Documents/ebb");
    });
});

/**
 *
 * Uses the real Zustand store: a contact is only ever edited through it, and
 * the whole table is replaced on every keystroke, so the rows the edit did not
 * touch are as much of the assertion as the row it did.
 */
describe("ContactList", () => {
    const ALEX = "alexendpointid0000000000";
    const RIN = "rinendpointid00000000000";

    const TWO: Contacts = {
        [ALEX]: { name: "Alex" },
        [RIN]: { name: "Rin" },
    };

    beforeEach(() => {
        window.localStorage.clear();
        useFlowStore.setState({ contacts: {} });
    });

    it("says where a contact comes from when none is saved", () => {
        render(<ContactList />);
        const empty = screen.getByTestId("contact-list-empty");
        expect(empty).toHaveTextContent("No partners saved yet");
        expect(empty).toHaveTextContent("after a shared flow session");
    });

    it("renames one contact and leaves the other alone", async () => {
        useFlowStore.setState({ contacts: TWO });
        render(<ContactList />);

        const field = screen.getByTestId(`contact-name-${ALEX}`);
        await userEvent.clear(field);
        await userEvent.type(field, "Alexis");

        expect(useFlowStore.getState().contacts).toEqual({
            [ALEX]: { name: "Alexis" },
            [RIN]: { name: "Rin" },
        });
    });

    // What a partner may do is decided at the invitation, for that round only,
    // so a saved contact carries no grade to set here.
    it("offers no grade on a row at all", () => {
        useFlowStore.setState({ contacts: TWO });
        render(<ContactList />);

        const row = screen.getByTestId(`contact-row-${ALEX}`);
        expect(screen.queryByTestId(`contact-role-${ALEX}`)).toBeNull();
        expect(within(row).queryByRole("combobox")).toBeNull();
    });

    it("removes exactly the contact asked for", async () => {
        useFlowStore.setState({ contacts: TWO });
        render(<ContactList />);

        await userEvent.click(screen.getByTestId(`contact-remove-${ALEX}`));

        expect(useFlowStore.getState().contacts).toEqual({ [RIN]: { name: "Rin" } });
        expect(screen.queryByTestId(`contact-row-${ALEX}`)).toBeNull();
        expect(screen.getByTestId(`contact-row-${RIN}`)).toBeInTheDocument();
    });

    it("shows the first eight characters of the EndpointId, and the whole one on hover", () => {
        useFlowStore.setState({ contacts: TWO });
        render(<ContactList />);

        const row = screen.getByTestId(`contact-row-${ALEX}`);
        expect(within(row).getByTitle(ALEX)).toHaveTextContent(ALEX.slice(0, 8));
    });

    // A nameless entry is dropped when the config file is read back, which
    // would take the EndpointId with it.
    it("keeps a peer whose name is emptied, falling back to the short id", async () => {
        useFlowStore.setState({ contacts: TWO });
        render(<ContactList />);

        await userEvent.clear(screen.getByTestId(`contact-name-${ALEX}`));
        expect(useFlowStore.getState().contacts[ALEX].name).toBe("");

        await userEvent.tab();
        expect(useFlowStore.getState().contacts[ALEX].name).toBe(ALEX.slice(0, 8));
    });

    describe("adding a partner by hand", () => {
        const ID = "b".repeat(64);

        it("saves a partner nobody has shared with yet", async () => {
            render(<ContactList />);

            await userEvent.type(screen.getByTestId("add-contact-name"), "Rin");
            await userEvent.type(screen.getByTestId("add-contact-id"), ID);
            await userEvent.click(screen.getByTestId("add-contact-save"));

            expect(useFlowStore.getState().contacts[ID]).toEqual({ name: "Rin" });
        });

        it("empties the form so a second partner does not inherit the first", async () => {
            render(<ContactList />);

            await userEvent.type(screen.getByTestId("add-contact-name"), "Rin");
            await userEvent.type(screen.getByTestId("add-contact-id"), ID);
            await userEvent.click(screen.getByTestId("add-contact-save"));

            expect(screen.getByTestId("add-contact-name")).toHaveValue("");
            expect(screen.getByTestId("add-contact-id")).toHaveValue("");
        });

        it("refuses a name with no id, and an id with no name", async () => {
            render(<ContactList />);
            expect(screen.getByTestId("add-contact-save")).toBeDisabled();

            await userEvent.type(screen.getByTestId("add-contact-name"), "Rin");
            expect(screen.getByTestId("add-contact-save")).toBeDisabled();

            await userEvent.clear(screen.getByTestId("add-contact-name"));
            await userEvent.type(screen.getByTestId("add-contact-id"), ID);
            expect(screen.getByTestId("add-contact-save")).toBeDisabled();
        });

        it("says so when what was pasted is not an id at all", async () => {
            render(<ContactList />);

            await userEvent.type(screen.getByTestId("add-contact-name"), "Rin");
            await userEvent.type(screen.getByTestId("add-contact-id"), "ebb1:whatever");
            expect(screen.getByTestId("add-contact-error")).toBeTruthy();
            expect(screen.getByTestId("add-contact-save")).toBeDisabled();
        });

        it("refuses to add a second entry over a partner already saved", async () => {
            useFlowStore.setState({ contacts: { [ID]: { name: "Rin" } } });
            render(<ContactList />);

            await userEvent.type(screen.getByTestId("add-contact-name"), "Rin again");
            await userEvent.type(screen.getByTestId("add-contact-id"), ID);
            expect(screen.getByTestId("add-contact-known")).toHaveTextContent("Rin");
            expect(screen.getByTestId("add-contact-save")).toBeDisabled();
        });
    });
});

/**
 *
 * The hostname is shown as a placeholder and never as a value: a value would
 * be saved, and the config file it is saved to syncs between machines.
 */
describe("DisplayNameRow", () => {
    beforeEach(() => {
        window.localStorage.clear();
        machineName.mockClear();
        useFlowStore.setState({ collabName: "" });
    });

    it("offers the machine's name as a placeholder, leaving the setting empty", async () => {
        render(<DisplayNameRow />);

        await waitFor(() =>
            expect(screen.getByTestId("collab-name")).toHaveAttribute("placeholder", "smodi-mbp"),
        );
        expect(screen.getByTestId("collab-name")).toHaveValue("");
        expect(useFlowStore.getState().collabName).toBe("");
    });

    it("keeps the field usable when the shell has no name to give", async () => {
        machineName.mockResolvedValueOnce("");
        render(<DisplayNameRow />);

        await waitFor(() =>
            expect(screen.getByTestId("collab-name")).toHaveAttribute(
                "placeholder",
                "This machine",
            ),
        );
    });

    it("saves what the debater types", async () => {
        render(<DisplayNameRow />);

        await userEvent.type(screen.getByTestId("collab-name"), "Rin");
        expect(useFlowStore.getState().collabName).toBe("Rin");
    });

    it("shows a name already set instead of the placeholder", () => {
        useFlowStore.setState({ collabName: "Rin" });
        render(<DisplayNameRow />);

        expect(screen.getByTestId("collab-name")).toHaveValue("Rin");
    });
});

/**
 *
 * The row exists so a partner can be handed an identity before either side
 * has a round, which is why it reads the id off the identity file rather than
 * off a bound endpoint: showing it must not put ebb on the network.
 */
describe("MyEndpointId", () => {
    const ID = "c".repeat(64);

    beforeEach(() => {
        toastSuccess.mockClear();
        toastError.mockClear();
        myEndpointId.mockClear();
        myEndpointId.mockResolvedValue("");
        useCollabStore.setState({ endpointId: null });
    });

    it("has nothing to copy until the shell answers", () => {
        render(<MyEndpointId />);
        expect(screen.getByTestId("my-id-copy")).toBeDisabled();
        expect(screen.getByTestId("my-id").textContent).not.toContain("c");
    });

    it("asks the identity file, not an endpoint, and shows what comes back", async () => {
        myEndpointId.mockResolvedValue(ID);
        render(<MyEndpointId />);
        await act(async () => {});

        expect(myEndpointId).toHaveBeenCalled();
        expect(screen.getByTestId("my-id").textContent).toBe(ID);
        expect(screen.getByTestId("my-id-copy")).not.toBeDisabled();
    });

    it("shows the id a live session reports", () => {
        render(<MyEndpointId />);
        act(() => useCollabStore.getState().setEndpointId(ID));

        expect(screen.getByTestId("my-id").textContent).toBe(ID);
        expect(screen.getByTestId("my-id-copy")).not.toBeDisabled();
    });

    it("copies the whole id, not the short form a row shows", async () => {
        const writeText = vi.fn(async () => {});
        vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
        useCollabStore.setState({ endpointId: ID });
        render(<MyEndpointId />);

        await userEvent.click(screen.getByTestId("my-id-copy"));
        expect(writeText).toHaveBeenCalledWith(ID);
        expect(toastSuccess).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("selects the id when the webview refuses the write", async () => {
        const writeText = vi.fn(async () => {
            throw new Error("The request is not allowed by the user agent");
        });
        vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
        useCollabStore.setState({ endpointId: ID });
        render(<MyEndpointId />);

        await userEvent.click(screen.getByTestId("my-id-copy"));
        expect(toastError.mock.calls[0]?.[0]).toMatch(/Cmd\+C/);
        expect(window.getSelection()?.toString()).toBe(ID);
        vi.unstubAllGlobals();
    });
});

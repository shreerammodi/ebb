import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * CommandPalette component tests. Uses the real Zustand store, reset per test.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormat, POLICY_PRESET } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import CommandPalette from "./CommandPalette";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
        commandPaletteOpen: false,
        settingsOpen: false,
    });
}

function setup() {
    const store = useRoundStore.getState();
    store.createRound({ role: "aff", format: makeFormat(POLICY_PRESET) });
    useRoundStore.getState().setCommandPaletteOpen(true);
}

describe("CommandPalette", () => {
    beforeEach(() => resetStore());

    it("renders nothing when closed", () => {
        setup();
        useRoundStore.getState().setCommandPaletteOpen(false);
        render(<CommandPalette />);
        expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });

    it("lists all commands when the query is empty", () => {
        setup();
        render(<CommandPalette />);
        // A couple of representative registry labels.
        expect(screen.getByText("New aff sheet")).toBeInTheDocument();
        expect(screen.getByText("Toggle bold")).toBeInTheDocument();
    });

    it("fuzzy-matches commands by label", async () => {
        setup();
        render(<CommandPalette />);
        // "bold" uniquely fronts "Toggle bold" among registry labels.
        await userEvent.type(screen.getByTestId("command-palette-input"), "bold");
        expect(screen.getByText("Toggle bold")).toBeInTheDocument();
        expect(screen.queryByText("New aff sheet")).not.toBeInTheDocument();
    });

    it("runs the selected command on Enter and closes", async () => {
        setup();
        render(<CommandPalette />);
        await userEvent.type(screen.getByTestId("command-palette-input"), "settings");
        await userEvent.keyboard("{Enter}");
        const s = useRoundStore.getState();
        expect(s.settingsOpen).toBe(true);
        expect(s.commandPaletteOpen).toBe(false);
    });

    it("closes when its own self-listed command is chosen", async () => {
        setup();
        render(<CommandPalette />);
        await userEvent.type(screen.getByTestId("command-palette-input"), "command palette");
        await userEvent.keyboard("{Enter}");
        expect(useRoundStore.getState().commandPaletteOpen).toBe(false);
    });

    it("closes on Escape without running a command", async () => {
        setup();
        render(<CommandPalette />);
        await userEvent.keyboard("{Escape}");
        const s = useRoundStore.getState();
        expect(s.commandPaletteOpen).toBe(false);
        expect(s.settingsOpen).toBe(false);
    });
});

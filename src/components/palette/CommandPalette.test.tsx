import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * CommandPalette component tests. Uses the real Zustand store, reset per test.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

import CommandPalette from "./CommandPalette";

function resetStore() {
    useFlowStore.setState({
        round: null,
        activeSheetId: null,
        commandPaletteOpen: false,
        settingsOpen: false,
    });
}

function setup() {
    useFlowStore.getState().loadRound(makeFlowRound("aff"));
    useFlowStore.getState().setCommandPaletteOpen(true);
}

describe("CommandPalette", () => {
    beforeEach(() => resetStore());

    it("renders nothing when closed", () => {
        setup();
        useFlowStore.getState().setCommandPaletteOpen(false);
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
        const s = useFlowStore.getState();
        expect(s.settingsOpen).toBe(true);
        expect(s.commandPaletteOpen).toBe(false);
    });

    it("closes when its own self-listed command is chosen", async () => {
        setup();
        render(<CommandPalette />);
        await userEvent.type(screen.getByTestId("command-palette-input"), "command palette");
        await userEvent.keyboard("{Enter}");
        expect(useFlowStore.getState().commandPaletteOpen).toBe(false);
    });

    it("closes on Escape without running a command", async () => {
        setup();
        render(<CommandPalette />);
        await userEvent.keyboard("{Escape}");
        const s = useFlowStore.getState();
        expect(s.commandPaletteOpen).toBe(false);
        expect(s.settingsOpen).toBe(false);
    });
});

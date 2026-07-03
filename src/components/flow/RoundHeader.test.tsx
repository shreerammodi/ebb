/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFormatByKey } from "@/lib/format/presets";
import type { Role } from "@/lib/model/types";
import { useRoundStore } from "@/lib/store/useRoundStore";

import RoundHeader from "./RoundHeader";

// Mock next/link used by the header's back-to-flows link
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

// Mock io functions used by the header
vi.mock("@/lib/persistence/io", () => ({
    downloadRoundFile: vi.fn(),
    readRoundFile: vi.fn(),
}));
vi.mock("@/lib/export/xlsx", () => ({
    downloadXlsx: vi.fn().mockResolvedValue(undefined),
}));

function setupRound(role: Role) {
    useRoundStore.getState().createRound({
        role,
        format: makeFormatByKey("policy"),
    });
}

function renderRoundHeader() {
    return render(
        <TooltipProvider>
            <RoundHeader />
        </TooltipProvider>,
    );
}

describe("RoundHeader", () => {
    beforeEach(() => {
        useRoundStore.setState({
            round: null,
            activeSheetId: null,
            selection: null,
            quickSwitcherOpen: false,
            settingsOpen: false,
        });
    });

    it('renders "Aff vs Neg" fallback for role=aff with empty scouting', () => {
        setupRound("aff");
        renderRoundHeader();
        expect(screen.getByText("Aff vs Neg")).toBeInTheDocument();
    });

    it('renders "Neg vs Aff" fallback for role=neg with empty scouting', () => {
        setupRound("neg");
        renderRoundHeader();
        expect(screen.getByText("Neg vs Aff")).toBeInTheDocument();
    });

    it('renders "<affCode> (Aff) vs <negCode> (Neg)" for role=judge with scouting', () => {
        setupRound("judge");
        useRoundStore.getState().setScouting({
            affSchool: "Alpha",
            aff: {
                first: { first: "T", last: "A" },
                second: { first: "", last: "" },
            },
            negSchool: "Beta",
            neg: {
                first: { first: "T", last: "B" },
                second: { first: "", last: "" },
            },
        });
        renderRoundHeader();
        expect(screen.getByText("Alpha TA (Aff) vs Beta TB (Neg)")).toBeInTheDocument();
    });

    it("renders the back link, export menu, and Import button", () => {
        setupRound("aff");
        renderRoundHeader();
        expect(screen.getByTestId("back-to-flows")).toBeInTheDocument();
        expect(screen.getByTestId("export-btn")).toBeInTheDocument();
        expect(screen.getByTestId("import-btn")).toBeInTheDocument();
        expect(screen.queryByTestId("new-round-btn")).not.toBeInTheDocument();
        expect(screen.queryByTestId("print-btn")).not.toBeInTheDocument();
    });

    it("opens settings when the settings button is clicked", async () => {
        setupRound("aff");
        renderRoundHeader();
        const btn = screen.getByTestId("settings-btn");
        await userEvent.click(btn);
        expect(useRoundStore.getState().settingsOpen).toBe(true);
    });

    it("shows team codes from scouting", () => {
        useRoundStore.getState().createRound({ role: "aff", format: makeFormatByKey("policy") });
        useRoundStore.getState().setScouting({
            affSchool: "Westwood",
            aff: {
                first: { first: "Al", last: "Smith" },
                second: { first: "Bo", last: "Jones" },
            },
        });
        renderRoundHeader();
        expect(screen.getByTestId("round-header").textContent).toContain("Westwood JS");
    });

    it("opens the guide from the Guide button", async () => {
        setupRound("aff");
        renderRoundHeader();
        expect(useRoundStore.getState().guideOpen).toBe(false);
        await userEvent.click(screen.getByTestId("guide-btn"));
        expect(useRoundStore.getState().guideOpen).toBe(true);
    });

    it("updates store round and resets activeSheetId/selection/mode when a valid file is imported", async () => {
        const { readRoundFile } = await import("@/lib/persistence/io");

        // Set up an initial round
        setupRound("aff");
        // Simulate stale selection state
        useRoundStore.setState({
            activeSheetId: "stale-sheet",
            selection: { sheetId: "stale-sheet", speechId: "s1", row: 0 },
        });

        // Build a different round to return from the mock
        useRoundStore.getState().createRound({
            role: "neg",
            format: makeFormatByKey("policy"),
        });
        const importedRound = useRoundStore.getState().round!;

        // Reset store back to original so we can observe the change
        setupRound("aff");
        useRoundStore.setState({
            activeSheetId: "stale-sheet",
            selection: { sheetId: "stale-sheet", speechId: "s1", row: 0 },
        });

        vi.mocked(readRoundFile).mockResolvedValueOnce(importedRound);

        renderRoundHeader();

        const fileInput = screen.getByTestId("import-file-input");
        const fakeFile = new File(["{}"], "round.json", {
            type: "application/json",
        });
        fireEvent.change(fileInput, { target: { files: [fakeFile] } });

        await waitFor(() => {
            const state = useRoundStore.getState();
            expect(state.round).toBe(importedRound);
            expect(state.activeSheetId).toBeNull();
            expect(state.selection).toBeNull();
        });
    });
});

/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import type { Role } from "@/lib/model/types";
import { useFlowStore } from "@/lib/store/useFlowStore";

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
vi.mock("@/lib/persistence/flowIo", () => ({
    downloadFlowFile: vi.fn(),
    readFlowFile: vi.fn(),
}));
vi.mock("@/lib/export/xlsx", () => ({
    downloadXlsx: vi.fn().mockResolvedValue(undefined),
}));

function setupRound(role: Role) {
    useFlowStore.getState().loadRound(makeFlowRound(role));
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
        useFlowStore.setState({
            round: null,
            activeSheetId: null,
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
        useFlowStore.getState().setScouting({
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
        expect(useFlowStore.getState().settingsOpen).toBe(true);
    });

    it("shows team codes from scouting", () => {
        setupRound("aff");
        useFlowStore.getState().setScouting({
            affSchool: "Westwood",
            aff: {
                first: { first: "Al", last: "Smith" },
                second: { first: "Bo", last: "Jones" },
            },
        });
        renderRoundHeader();
        expect(screen.getByTestId("round-header").textContent).toContain("Westwood JS");
    });

    it("keeps the Guide button disabled while the guide is away", () => {
        setupRound("aff");
        renderRoundHeader();
        expect(screen.getByTestId("guide-btn")).toBeDisabled();
    });

    it("replaces the store round when a valid file is imported", async () => {
        const { readFlowFile } = await import("@/lib/persistence/flowIo");

        setupRound("aff");
        const importedRound = makeFlowRound("neg");
        vi.mocked(readFlowFile).mockResolvedValueOnce(importedRound);

        renderRoundHeader();

        const fileInput = screen.getByTestId("import-file-input");
        const fakeFile = new File(["{}"], "round.json", {
            type: "application/json",
        });
        fireEvent.change(fileInput, { target: { files: [fakeFile] } });

        await waitFor(() => {
            const state = useFlowStore.getState();
            expect(state.round).toBe(importedRound);
            // The active sheet resets to the imported round's first flow sheet.
            expect(importedRound.sheets.some((s) => s.id === state.activeSheetId)).toBe(true);
        });
    });
});

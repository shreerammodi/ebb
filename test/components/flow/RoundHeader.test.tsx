/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

import RoundHeader from "@/components/flow/RoundHeader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeFlowRound } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

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

// Mock the exporter the header reaches for.
vi.mock("@/lib/export/xlsx", () => ({
    saveXlsx: vi.fn().mockResolvedValue(undefined),
}));

function setupRound() {
    useFlowStore.getState().loadRound(makeFlowRound());
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

    it('renders "Aff vs Neg" fallback with empty scouting', () => {
        setupRound();
        renderRoundHeader();
        expect(screen.getByText("Aff vs Neg")).toBeInTheDocument();
    });

    it("renders team codes from scouting in aff-vs-neg order", () => {
        setupRound();
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
        expect(screen.getByText("Alpha TA vs Beta TB")).toBeInTheDocument();
    });

    it("renders the back link and export menu, but no import button", () => {
        setupRound();
        renderRoundHeader();
        expect(screen.getByTestId("back-to-flows")).toBeInTheDocument();
        expect(screen.getByTestId("export-btn")).toBeInTheDocument();
        expect(screen.queryByTestId("import-btn")).not.toBeInTheDocument();
        expect(screen.queryByTestId("new-round-btn")).not.toBeInTheDocument();
        expect(screen.queryByTestId("print-btn")).not.toBeInTheDocument();
    });

    it("opens settings when the settings button is clicked", async () => {
        setupRound();
        renderRoundHeader();
        const btn = screen.getByTestId("settings-btn");
        await userEvent.click(btn);
        expect(useFlowStore.getState().settingsOpen).toBe(true);
    });

    it("shows team codes from scouting", () => {
        setupRound();
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

    it("opens the guide when the Guide button is clicked", () => {
        setupRound();
        renderRoundHeader();
        fireEvent.click(screen.getByTestId("guide-btn"));
        expect(useFlowStore.getState().cheatsheetOpen).toBe(true);
    });
});

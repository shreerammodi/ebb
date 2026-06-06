/**
 * RoundHeader component tests.
 *
 * Uses the real Zustand store. Resets state between tests for isolation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import type { Role } from "@/lib/model/types";
import RoundHeader from "./RoundHeader";

// Mock io functions used by the header
vi.mock("@/lib/persistence/io", () => ({
  downloadRoundFile: vi.fn(),
  readRoundFile: vi.fn(),
}));
vi.mock("@/lib/export/xlsx", () => ({ downloadXlsx: vi.fn().mockResolvedValue(undefined) }));

function setupRound(role: Role) {
  useRoundStore.getState().createRound({
    role,
    format: makeFormatByKey("policy"),
  });
}

describe("RoundHeader", () => {
  beforeEach(() => {
    useRoundStore.setState({
      round: null,
      activeSheetId: null,
      mode: "normal",
      selection: null,
      quickSwitcherOpen: false,
      settingsOpen: false,
    });
  });

  it('renders "Aff vs Neg" fallback for role=aff with empty scouting', () => {
    setupRound("aff");
    render(<RoundHeader />);
    expect(screen.getByText("Aff vs Neg")).toBeInTheDocument();
  });

  it('renders "Neg vs Aff" fallback for role=neg with empty scouting', () => {
    setupRound("neg");
    render(<RoundHeader />);
    expect(screen.getByText("Neg vs Aff")).toBeInTheDocument();
  });

  it('renders "<affCode> (Aff) vs <negCode> (Neg)" for role=judge with scouting', () => {
    setupRound("judge");
    useRoundStore.getState().setScouting({
      affSchool: "Alpha",
      aff: { first: { first: "T", last: "A" }, second: { first: "", last: "" } },
      negSchool: "Beta",
      neg: { first: { first: "T", last: "B" }, second: { first: "", last: "" } },
    });
    render(<RoundHeader />);
    expect(screen.getByText("Alpha TA (Aff) vs Beta TB (Neg)")).toBeInTheDocument();
  });

  it("renders the export menu, Import, and New round buttons", () => {
    setupRound("aff");
    render(<RoundHeader />);
    expect(screen.getByTestId("export-btn")).toBeInTheDocument();
    expect(screen.getByTestId("import-btn")).toBeInTheDocument();
    expect(screen.getByTestId("new-round-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("print-btn")).not.toBeInTheDocument();
  });

  it("opens settings when the settings button is clicked", async () => {
    setupRound("aff");
    render(<RoundHeader />);
    const btn = screen.getByTestId("settings-btn");
    await userEvent.click(btn);
    expect(useRoundStore.getState().settingsOpen).toBe(true);
  });

  it("shows team codes from scouting", () => {
    useRoundStore
      .getState()
      .createRound({ role: "aff", format: makeFormatByKey("policy") });
    useRoundStore.getState().setScouting({
      affSchool: "Westwood",
      aff: { first: { first: "Al", last: "Smith" }, second: { first: "Bo", last: "Jones" } },
    });
    render(<RoundHeader />);
    expect(screen.getByTestId("round-header").textContent).toContain("Westwood JS");
  });

  it("updates store round and resets activeSheetId/selection/mode when a valid file is imported", async () => {
    const { readRoundFile } = await import("@/lib/persistence/io");

    // Set up an initial round
    setupRound("aff");
    // Simulate stale selection state
    useRoundStore.setState({
      activeSheetId: "stale-sheet",
      selection: { sheetId: "stale-sheet", speechId: "s1", nodeId: "n1" },
      mode: "insert",
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
      selection: { sheetId: "stale-sheet", speechId: "s1", nodeId: "n1" },
      mode: "insert",
    });

    vi.mocked(readRoundFile).mockResolvedValueOnce(importedRound);

    render(<RoundHeader />);

    const fileInput = screen.getByTestId("import-file-input");
    const fakeFile = new File(["{}"], "round.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      const state = useRoundStore.getState();
      expect(state.round).toBe(importedRound);
      expect(state.activeSheetId).toBeNull();
      expect(state.selection).toBeNull();
      expect(state.mode).toBe("normal");
    });
  });
});

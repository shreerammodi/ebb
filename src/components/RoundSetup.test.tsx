/**
 * RoundSetup component tests.
 *
 * Uses the real Zustand store — no mocking needed.
 * Resets store state before each test so tests are isolated.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRoundStore } from "@/lib/store/useRoundStore";
import RoundSetup from "./RoundSetup";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: "normal",
    selection: null,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RoundSetup", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders role choices (Aff, Neg, Judge) and a submit button", () => {
    render(<RoundSetup />);

    expect(screen.getByTestId("role-aff")).toBeInTheDocument();
    expect(screen.getByTestId("role-neg")).toBeInTheDocument();
    expect(screen.getByTestId("role-judge")).toBeInTheDocument();

    expect(screen.getByText("Aff")).toBeInTheDocument();
    expect(screen.getByText("Neg")).toBeInTheDocument();
    expect(screen.getByText("Judge")).toBeInTheDocument();

    expect(screen.getByTestId("submit")).toBeInTheDocument();
  });

  it("creates a policy round with role only", async () => {
    render(<RoundSetup />);
    await userEvent.click(screen.getByTestId("role-neg"));
    await userEvent.click(screen.getByTestId("submit"));
    const r = useRoundStore.getState().round!;
    expect(r.role).toBe("neg");
    expect(r.format.name).toBe("Policy");
    expect(r.sheets.some((s) => s.kind === "cx")).toBe(true);
    const active = r.sheets.find((s) => s.id === useRoundStore.getState().activeSheetId);
    expect(active?.kind).toBe("flow");
  });

  it("no longer renders the topic field", () => {
    render(<RoundSetup />);
    expect(screen.queryByLabelText(/topic/i)).toBeNull();
  });
});

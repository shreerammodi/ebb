import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSaveStatus } from "@/lib/store/useSaveStatus";
import SaveStatus from "./SaveStatus";

const saveRoundNow = vi.fn();
vi.mock("@/lib/persistence/autosave", () => ({
  saveRoundNow: (...args: unknown[]) => saveRoundNow(...args),
}));

// A round must exist for Retry to act on.
vi.mock("@/lib/store/useRoundStore", () => ({
  useRoundStore: { getState: () => ({ round: { id: "r1" } }) },
}));

beforeEach(() => {
  saveRoundNow.mockClear();
  useSaveStatus.setState({ state: "idle", savedAt: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SaveStatus", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<SaveStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Saving…" while a save is in flight', () => {
    useSaveStatus.setState({ state: "saving" });
    render(<SaveStatus />);
    expect(screen.getByTestId("save-status")).toHaveTextContent("Saving…");
  });

  it('shows "Saved just now" right after a successful save', () => {
    useSaveStatus.setState({ state: "saved", savedAt: Date.now() });
    render(<SaveStatus />);
    expect(screen.getByTestId("save-status")).toHaveTextContent("Saved just now");
  });

  it("reports relative time for an older save", () => {
    useSaveStatus.setState({
      state: "saved",
      savedAt: Date.now() - 3 * 60 * 1000,
    });
    render(<SaveStatus />);
    expect(screen.getByTestId("save-status")).toHaveTextContent("Saved 3m ago");
  });

  it("surfaces an alert with a Retry that re-saves on error", async () => {
    const user = userEvent.setup();
    useSaveStatus.setState({ state: "error", savedAt: null });
    render(<SaveStatus />);

    const status = screen.getByTestId("save-status");
    expect(status).toHaveAttribute("role", "alert");
    expect(status).toHaveTextContent("Not saved");

    await user.click(screen.getByTestId("save-retry"));
    expect(saveRoundNow).toHaveBeenCalledTimes(1);
    expect(saveRoundNow).toHaveBeenCalledWith({ id: "r1" }, expect.any(Function));
  });
});

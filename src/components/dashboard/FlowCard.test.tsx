import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowCard from "./FlowCard";
import type { RoundSummary } from "@/lib/dashboard/summary";

function summary(over: Partial<RoundSummary> = {}): RoundSummary {
  return {
    id: "r1",
    createdAt: 1,
    updatedAt: 2,
    role: "aff",
    affTeam: "Westwood GM",
    negTeam: "Harvard BS",
    tournament: "Berkeley",
    round: "Round 3",
    judge: "K. Strange",
    decision: { vote: "aff" },
    ...over,
  };
}

describe("FlowCard", () => {
  it("shows matchup, scouting rows, and result", () => {
    render(<FlowCard summary={summary()} onOpen={() => {}} />);
    expect(screen.getByText("Westwood GM")).toBeInTheDocument();
    expect(screen.getByText("Harvard BS")).toBeInTheDocument();
    expect(screen.getByText("Berkeley")).toBeInTheDocument();
    expect(screen.getAllByText("Aff").length).toBeGreaterThan(0);
  });

  it("falls back gracefully when unscouted", () => {
    render(
      <FlowCard
        summary={summary({
          affTeam: "",
          negTeam: "Lincoln PK",
          tournament: undefined,
          judge: undefined,
          decision: undefined,
        })}
        onOpen={() => {}}
      />
    );
    expect(screen.getByText(/Untitled Aff/)).toBeInTheDocument();
    expect(screen.getByText("undecided")).toBeInTheDocument();
  });

  it("calls onOpen when the card body is clicked", async () => {
    const onOpen = vi.fn();
    render(<FlowCard summary={summary()} onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId("flow-card-r1"));
    expect(onOpen).toHaveBeenCalledWith("r1");
  });
});

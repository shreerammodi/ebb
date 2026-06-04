/**
 * PrintView component tests.
 *
 * Verifies that PrintView renders all sheet titles and their nodes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import PrintView from "./PrintView";

const BLANK_STATE = {
  round: null,
  activeSheetId: null,
  mode: "normal" as const,
  selection: null,
};

function resetStore() {
  useRoundStore.setState(BLANK_STATE);
}

function setupTwoSheets() {
  const fmt = makeFormatByKey("policy");
  useRoundStore.getState().createRound({ role: "aff", format: fmt, meta: {} });

  const sheet1Id = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
  const sheet2Id = useRoundStore.getState().addSheet({ title: "Topicality", group: "neg" });

  const speeches = fmt.speeches;
  const s1AC = speeches[0].id;
  const s1NC = speeches[1].id;

  // Add a node to sheet 1
  useRoundStore.getState().addNode({
    sheetId: sheet1Id,
    speechId: s1AC,
    parentId: null,
    text: "Aff advantage",
  });

  // Add a node to sheet 2
  useRoundStore.getState().addNode({
    sheetId: sheet2Id,
    speechId: s1NC,
    parentId: null,
    text: "Topicality violation",
  });

  return { sheet1Id, sheet2Id };
}

describe("PrintView", () => {
  beforeEach(resetStore);

  it("renders nothing when there is no round", () => {
    render(<PrintView />);
    expect(screen.queryByTestId("print-view")).toBeNull();
  });

  it("shows every sheet title", () => {
    setupTwoSheets();
    render(<PrintView />);

    expect(screen.getByText("Case")).toBeInTheDocument();
    expect(screen.getByText("Topicality")).toBeInTheDocument();
  });

  it("shows the nodes for each sheet", () => {
    setupTwoSheets();
    render(<PrintView />);

    expect(screen.getByText("Aff advantage")).toBeInTheDocument();
    expect(screen.getByText("Topicality violation")).toBeInTheDocument();
  });

  it("renders sheets sorted by order", () => {
    setupTwoSheets();
    render(<PrintView />);

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

    // Case was added first (lower order), Topicality second
    expect(titles.indexOf("Case")).toBeLessThan(titles.indexOf("Topicality"));
  });
});

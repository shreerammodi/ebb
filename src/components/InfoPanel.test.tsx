import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import InfoPanel from "./InfoPanel";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";

describe("InfoPanel", () => {
  beforeEach(() => {
    useRoundStore
      .getState()
      .createRound({ role: "aff", format: makeFormatByKey("policy") });
    useRoundStore.getState().setInfoOpen(true);
  });

  it("edits aff school", async () => {
    render(<InfoPanel />);
    await userEvent.type(screen.getByTestId("scout-affSchool"), "Westwood");
    expect(useRoundStore.getState().round!.scouting.affSchool).toBe("Westwood");
  });

  it("renders nothing when closed", () => {
    useRoundStore.getState().setInfoOpen(false);
    const { container } = render(<InfoPanel />);
    expect(container.firstChild).toBeNull();
  });
});

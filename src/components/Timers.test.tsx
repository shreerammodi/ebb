/**
 * Tests for timer store actions and the Timers component.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import Timers from "./Timers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useRoundStore.setState({
    round: null,
    activeSheetId: null,
    mode: "normal",
    selection: null,
    keymapName: "vim",
    quickSwitcherOpen: false,
    settingsOpen: false,
  });
}

function setupRound() {
  const fmt = makeFormatByKey("policy");
  useRoundStore.getState().createRound({ role: "aff", format: fmt });
  return { fmt, speeches: fmt.speeches };
}

// ─── Timer store action tests ────────────────────────────────────────────────

describe("timer store actions", () => {
  beforeEach(resetStore);

  it("startSpeech sets activeSpeechId, speechRemaining, and running=true", () => {
    const { speeches } = setupRound();
    const speech = speeches[0]; // 1AC, 480 seconds
    useRoundStore.getState().startSpeech(speech.id);
    const { timers } = useRoundStore.getState().round!;
    expect(timers.activeSpeechId).toBe(speech.id);
    expect(timers.speechRemaining).toBe(speech.seconds);
    expect(timers.running).toBe(true);
  });

  it("tickSpeech decrements speechRemaining by 1", () => {
    const { speeches } = setupRound();
    useRoundStore.getState().startSpeech(speeches[0].id);
    const before = useRoundStore.getState().round!.timers.speechRemaining!;
    useRoundStore.getState().tickSpeech();
    const after = useRoundStore.getState().round!.timers.speechRemaining!;
    expect(after).toBe(before - 1);
  });

  it("tickSpeech does not go below 0", () => {
    setupRound();
    // Manually set speechRemaining to 0
    const round = useRoundStore.getState().round!;
    useRoundStore.setState({
      round: {
        ...round,
        timers: { ...round.timers, speechRemaining: 0 },
      },
    });
    useRoundStore.getState().tickSpeech();
    expect(useRoundStore.getState().round!.timers.speechRemaining).toBe(0);
  });

  it("startPrep sets prepRunning to the given side", () => {
    setupRound();
    useRoundStore.getState().startPrep("aff");
    expect(useRoundStore.getState().round!.timers.prepRunning).toBe("aff");
  });

  it("stopPrep sets prepRunning to null", () => {
    setupRound();
    useRoundStore.getState().startPrep("aff");
    useRoundStore.getState().stopPrep();
    expect(useRoundStore.getState().round!.timers.prepRunning).toBeNull();
  });

  it("tickPrep decrements prepRemaining.aff when prepRunning=aff", () => {
    setupRound();
    useRoundStore.getState().startPrep("aff");
    const before = useRoundStore.getState().round!.timers.prepRemaining.aff;
    useRoundStore.getState().tickPrep();
    const after = useRoundStore.getState().round!.timers.prepRemaining.aff;
    expect(after).toBe(before - 1);
  });

  it("tickPrep does not decrement when prepRunning is null", () => {
    setupRound();
    const before = useRoundStore.getState().round!.timers.prepRemaining.aff;
    useRoundStore.getState().tickPrep();
    const after = useRoundStore.getState().round!.timers.prepRemaining.aff;
    expect(after).toBe(before);
  });

  it("all actions no-op when round is null", () => {
    // round is null from resetStore
    expect(() => useRoundStore.getState().startSpeech("any")).not.toThrow();
    expect(() => useRoundStore.getState().tickSpeech()).not.toThrow();
    expect(() => useRoundStore.getState().startPrep("aff")).not.toThrow();
    expect(() => useRoundStore.getState().stopPrep()).not.toThrow();
    expect(() => useRoundStore.getState().tickPrep()).not.toThrow();
    expect(useRoundStore.getState().round).toBeNull();
  });
});

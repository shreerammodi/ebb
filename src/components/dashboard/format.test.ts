import { describe, it, expect } from "vitest";
import { relativeTime, resultLabel } from "./format";

describe("relativeTime", () => {
  it("formats recent times", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 60_000, now)).toMatch(/min/);
    expect(relativeTime(now - 2 * 3600_000, now)).toMatch(/h/);
  });
});

describe("resultLabel", () => {
  it("labels a vote", () => {
    expect(resultLabel({ vote: "aff" })).toEqual({
      text: "Aff",
      side: "aff",
    });
    expect(resultLabel({ vote: "neg" })).toEqual({
      text: "Neg",
      side: "neg",
    });
  });
  it("labels undecided", () => {
    expect(resultLabel(undefined)).toEqual({
      text: "undecided",
      side: null,
    });
  });
});

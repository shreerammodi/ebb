/**
 * Timers component — displays and controls speech and prep timers.
 *
 * Renders:
 *  - Active speech timer (mm:ss) with start/stop
 *  - Aff prep timer (mm:ss) with start/stop
 *  - Neg prep timer (mm:ss) with start/stop
 *
 * Tick interval: 1 second via setInterval.
 */

"use client";

import { useEffect } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";

/** Formats a number of seconds as mm:ss. */
function formatTime(seconds: number): string {
  return (
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (seconds % 60).toString().padStart(2, "0")
  );
}

export default function Timers() {
  const round = useRoundStore((s) => s.round);
  const tickSpeech = useRoundStore((s) => s.tickSpeech);
  const tickPrep = useRoundStore((s) => s.tickPrep);
  const startPrep = useRoundStore((s) => s.startPrep);
  const stopPrep = useRoundStore((s) => s.stopPrep);

  const timers = round?.timers ?? null;
  const running = timers?.running ?? false;
  const prepRunning = timers?.prepRunning ?? null;

  // Tick interval
  useEffect(() => {
    if (!timers) return;
    if (!running && prepRunning === null) return;

    const id = setInterval(() => {
      if (running) tickSpeech();
      if (prepRunning !== null) tickPrep();
    }, 1000);

    return () => clearInterval(id);
  }, [running, prepRunning, tickSpeech, tickPrep, timers]);

  if (!round || !timers) {
    return null;
  }

  const activeSpeech = timers.activeSpeechId
    ? (round.format.speeches.find((s) => s.id === timers.activeSpeechId) ?? null)
    : null;

  function handleToggleSpeech() {
    if (!round || !timers) return;
    useRoundStore.setState({
      round: {
        ...round,
        timers: { ...timers, running: !timers.running },
      },
    });
  }

  function handleTogglePrepAff() {
    if (prepRunning === "aff") {
      stopPrep();
    } else {
      startPrep("aff");
    }
  }

  function handleTogglePrepNeg() {
    if (prepRunning === "neg") {
      stopPrep();
    } else {
      startPrep("neg");
    }
  }

  return (
    <div className="timers no-print">
      {/* Speech timer */}
      <div className="timers__speech">
        {activeSpeech && <span className="timers__speech-name">{activeSpeech.name}</span>}
        {timers.speechRemaining !== null && (
          <span className="timers__speech-time" data-testid="speech-time">
            {formatTime(timers.speechRemaining)}
          </span>
        )}
        <button
          className="timers__btn"
          onClick={handleToggleSpeech}
          aria-label={running ? "Stop speech timer" : "Start speech timer"}
          disabled={timers.speechRemaining === null}
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>

      {/* Aff prep timer */}
      <div className="timers__prep timers__prep--aff">
        <span className="timers__prep-label">Aff prep</span>
        <span className="timers__prep-time" data-testid="aff-prep-time">
          {formatTime(timers.prepRemaining.aff)}
        </span>
        <button
          className="timers__btn"
          onClick={handleTogglePrepAff}
          aria-label={prepRunning === "aff" ? "Stop aff prep" : "Start aff prep"}
        >
          {prepRunning === "aff" ? "Stop" : "Start"}
        </button>
      </div>

      {/* Neg prep timer */}
      <div className="timers__prep timers__prep--neg">
        <span className="timers__prep-label">Neg prep</span>
        <span className="timers__prep-time" data-testid="neg-prep-time">
          {formatTime(timers.prepRemaining.neg)}
        </span>
        <button
          className="timers__btn"
          onClick={handleTogglePrepNeg}
          aria-label={prepRunning === "neg" ? "Stop neg prep" : "Start neg prep"}
        >
          {prepRunning === "neg" ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}

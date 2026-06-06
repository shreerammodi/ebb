"use client";

import { useRef } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { readRoundFile } from "@/lib/persistence/io";
import { Button } from "@/components/ui/button";
import ExportMenu from "./ExportMenu";
import { teamCode } from "@/lib/model/teamCode";

export default function RoundHeader() {
  const round = useRoundStore((s) => s.round);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!round) return null;

  const { role, scouting } = round;

  const affCode =
    teamCode(scouting.affSchool ?? "", scouting.aff.first, scouting.aff.second) || "Aff";
  const negCode =
    teamCode(scouting.negSchool ?? "", scouting.neg.first, scouting.neg.second) || "Neg";
  const participants =
    role === "judge"
      ? `${affCode} (Aff) vs ${negCode} (Neg)`
      : role === "neg"
        ? `${negCode} vs ${affCode}`
        : `${affCode} vs ${negCode}`;

  function handleNewRound() {
    useRoundStore.setState({ round: null, activeSheetId: null, selection: null, mode: "normal" });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readRoundFile(file);
      useRoundStore.setState({
        round: imported,
        activeSheetId: null,
        selection: null,
        mode: "normal",
      });
    } catch {
      alert("Failed to import: file may be invalid or from an incompatible version.");
    }
    e.target.value = "";
  }

  return (
    <header
      className="flex h-12 flex-none items-center justify-between border-b border-border bg-card px-4"
      data-testid="round-header"
    >
      <span className="text-sm font-semibold text-zinc-900">{participants}</span>
      <div className="no-print flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="Import round file"
          className="hidden"
          onChange={handleImportChange}
          data-testid="import-file-input"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useRoundStore.getState().setInfoOpen(true)}
          aria-label="Round info"
          data-testid="info-btn"
        >
          Info
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useRoundStore.getState().setSettingsOpen(true)}
          aria-label="Settings"
          data-testid="settings-btn"
        >
          <span className="text-base leading-none">⚙</span>
        </Button>
        <ExportMenu />
        <Button variant="outline" size="sm" onClick={handleImportClick} data-testid="import-btn">
          Import
        </Button>
        <Button variant="ghost" size="sm" onClick={handleNewRound} data-testid="new-round-btn">
          New round
        </Button>
      </div>
    </header>
  );
}

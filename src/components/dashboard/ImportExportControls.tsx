"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { db } from "@/lib/persistence/db";
import { persistRound } from "@/lib/persistence/autosave";
import { parseImportFile, exportBackupJSON } from "@/lib/persistence/backup";
import { downloadBlob } from "@/lib/export/download";
import { Button } from "@/components/ui/button";

export interface ImportExportControlsProps {
  onChanged: () => void;
}

export default function ImportExportControls({ onChanged }: ImportExportControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function readFileText(file: File): Promise<string> {
    if (typeof file.text === "function") {
      return file.text();
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFileText(file);
      const rounds = parseImportFile(text);
      for (const r of rounds) await persistRound(r);
      onChanged();
      toast.success(`Imported ${rounds.length} flow${rounds.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : "invalid file"}`);
    }
  }

  async function exportAll() {
    const live = await db.rounds.toArray();
    const rounds = live.filter((r) => r.deletedAt == null);
    if (rounds.length === 0) {
      toast("No flows to export");
      return;
    }
    const blob = new Blob([exportBackupJSON(rounds)], {
      type: "application/json",
    });
    downloadBlob(blob, `debate-flow-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        data-testid="import-input"
        onChange={onFile}
      />
      <Button
        variant="outline"
        size="sm"
        data-testid="import-btn"
        onClick={() => inputRef.current?.click()}
      >
        Import
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="export-all-btn"
        onClick={() => void exportAll()}
      >
        Export all
      </Button>
    </>
  );
}

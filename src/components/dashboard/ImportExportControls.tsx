"use client";

import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { saveBlob } from "@/lib/export/download";
import { flowDb } from "@/lib/persistence/flowDb";
import { exportFlowBackupJSON, parseFlowImportFile } from "@/lib/persistence/flowIo";
import { persistFlow } from "@/lib/persistence/flowPersistence";

import { KeyTip } from "./keytips/KeyTip";

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
            const rounds = parseFlowImportFile(text);
            for (const r of rounds) await persistFlow(r);
            onChanged();
            toast.success(`Imported ${rounds.length} flow${rounds.length === 1 ? "" : "s"}`);
        } catch (err) {
            toast.error(`Import failed: ${err instanceof Error ? err.message : "invalid file"}`);
        }
    }

    async function exportAll() {
        const live = await flowDb.flows.toArray();
        const rounds = live.filter((r) => r.deletedAt == null);
        if (rounds.length === 0) {
            toast("No flows to export");
            return;
        }
        const blob = new Blob([exportFlowBackupJSON(rounds)], {
            type: "application/json",
        });
        await saveBlob(blob, `debate-flow-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
            <KeyTip id="root.import" run={() => inputRef.current?.click()}>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Import"
                    data-testid="import-btn"
                    onClick={() => inputRef.current?.click()}
                >
                    <UploadSimple className="size-4.5" />
                    <span className="max-[899.98px]:hidden">Import</span>
                </Button>
            </KeyTip>
            <KeyTip id="root.export" run={() => void exportAll()}>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Export all"
                    data-testid="export-all-btn"
                    onClick={() => void exportAll()}
                >
                    <DownloadSimple className="size-4.5" />
                    <span className="max-[899.98px]:hidden">Export all</span>
                </Button>
            </KeyTip>
        </>
    );
}

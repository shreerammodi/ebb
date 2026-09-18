import { columnsForFlowSheet } from "@/lib/grid/flowColumns";
import type { FlowRound } from "@/lib/model/flow";

export function textWordCount(text: string | null | undefined): number {
    const trimmed = text?.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function speechWordCount(round: FlowRound, speechId: string): number {
    let words = 0;
    for (const sheet of round.sheets) {
        if (sheet.kind === "cx") continue;
        const col = columnsForFlowSheet(round, sheet).findIndex(
            (candidate) => candidate.id === speechId,
        );
        if (col < 0) continue;
        for (const row of sheet.data) words += textWordCount(row[col]);
    }
    return words;
}

export function speechDuration(words: number, wpm: number): string {
    const seconds = Math.ceil((words * 60) / wpm);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

import { uid } from "@/lib/model/ids";
import type { Format, Side } from "@/lib/model/types";

/** A speech template (no id yet — id is assigned by makeFormat). */
export interface SpeechTemplate {
    name: string;
    side: Side;
    seconds: number;
    group?: string;
}

/** A preset descriptor — the data needed to instantiate a Format. */
export interface FormatPresetDescriptor {
    name: string;
    speeches: SpeechTemplate[];
    prepSeconds: { aff: number; neg: number };
}

// ─── Policy preset ──────────────────────────────────────────────────────────

export const POLICY_PRESET: FormatPresetDescriptor = {
    name: "Policy",
    speeches: [
        { name: "1AC", side: "aff", seconds: 480 },
        { name: "1NC", side: "neg", seconds: 480 },
        { name: "2AC", side: "aff", seconds: 480 },
        { name: "Block", side: "neg", seconds: 780 },
        { name: "1AR", side: "aff", seconds: 300 },
        { name: "2NR", side: "neg", seconds: 300 },
        { name: "2AR", side: "aff", seconds: 300 },
    ],
    prepSeconds: { aff: 480, neg: 480 },
};

// ─── Enumerable list for setup UI ────────────────────────────────────────────

export type PresetKey = "policy";

export interface PresetEntry {
    key: PresetKey;
    label: string;
    preset: FormatPresetDescriptor;
}

export const FORMAT_PRESETS: PresetEntry[] = [
    { key: "policy", label: "Policy", preset: POLICY_PRESET },
];

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Instantiate a fresh Format from a descriptor.
 * Every call generates new unique ids for the format and all speeches.
 */
export function makeFormat(preset: FormatPresetDescriptor): Format {
    return {
        id: uid("fmt"),
        name: preset.name,
        speeches: preset.speeches.map((t) => ({
            id: uid("speech"),
            name: t.name,
            side: t.side,
            seconds: t.seconds,
            ...(t.group !== undefined ? { group: t.group } : {}),
        })),
        prepSeconds: { ...preset.prepSeconds },
    };
}

/**
 * Convenience helper: create a fresh Format by preset key.
 */
export function makeFormatByKey(key: PresetKey): Format {
    const entry = FORMAT_PRESETS.find((p) => p.key === key);
    if (!entry) {
        throw new Error(`Unknown preset key: ${key}`);
    }
    return makeFormat(entry.preset);
}

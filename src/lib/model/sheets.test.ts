import { describe, it, expect } from "vitest";

import type { ArgGroup, ArgumentNode, Format, Sheet } from "@/lib/model/types";

import { createSheet, renameSheet, reorderSheets, removeSheet, restoreSheet } from "./sheets";

// ─── Helpers ────────────────────────────────────────────────────────────────

const format: Format = {
    id: "fmt",
    name: "Test",
    speeches: [
        { id: "1ac", name: "1AC", side: "aff", seconds: 0 },
        { id: "1nc", name: "1NC", side: "neg", seconds: 0 },
        { id: "2ac", name: "2AC", side: "aff", seconds: 0 },
    ],
    prepSeconds: { aff: 0, neg: 0 },
};

function makeSheet(overrides: Partial<Sheet> & { id: string }): Sheet {
    return { title: "S", group: "aff", order: 0, kind: "flow", ...overrides };
}

function makeNode(overrides: Partial<ArgumentNode> & { id: string }): ArgumentNode {
    return {
        sheetId: "s1",
        speechId: "1ac",
        parentId: null,
        row: 0,
        text: "",
        statuses: [],
        bold: false,
        highlight: false,
        numberOverride: null,
        ...overrides,
    };
}

// ─── createSheet ──────────────────────────────────────────────────────────────

describe("createSheet", () => {
    it("assigns order one past the current max", () => {
        const sheets = [makeSheet({ id: "a", order: 0 }), makeSheet({ id: "b", order: 3 })];
        const sheet = createSheet(sheets, format, { title: "New", group: "aff" });
        expect(sheet.order).toBe(4);
    });

    it("starts order at 0 when there are no sheets", () => {
        const sheet = createSheet([], format, { title: "New", group: "aff" });
        expect(sheet.order).toBe(0);
    });

    it("an aff sheet starts at the first speech", () => {
        const sheet = createSheet([], format, { title: "New", group: "aff" });
        expect(sheet.startSpeechId).toBe("1ac");
    });

    it("a neg sheet starts at the first neg speech", () => {
        const sheet = createSheet([], format, { title: "New", group: "neg" });
        expect(sheet.startSpeechId).toBe("1nc");
    });

    it("creates a flow sheet with the given title and group and a unique id", () => {
        const sheet = createSheet([], format, { title: "Disad", group: "neg" });
        expect(sheet.title).toBe("Disad");
        expect(sheet.group).toBe("neg");
        expect(sheet.kind).toBe("flow");
        expect(sheet.id).toBeTruthy();
    });
});

// ─── renameSheet ──────────────────────────────────────────────────────────────

describe("renameSheet", () => {
    it("renames the target sheet and leaves others untouched", () => {
        const sheets = [
            makeSheet({ id: "a", title: "Old" }),
            makeSheet({ id: "b", title: "Keep" }),
        ];
        const result = renameSheet(sheets, "a", "New");
        expect(result.find((s) => s.id === "a")!.title).toBe("New");
        expect(result.find((s) => s.id === "b")!.title).toBe("Keep");
    });

    it("is pure", () => {
        const sheets = [makeSheet({ id: "a", title: "Old" })];
        renameSheet(sheets, "a", "New");
        expect(sheets[0].title).toBe("Old");
    });
});

// ─── reorderSheets ────────────────────────────────────────────────────────────

describe("reorderSheets", () => {
    it("renumbers listed sheets to contiguous order by position", () => {
        const sheets = [
            makeSheet({ id: "a", order: 0 }),
            makeSheet({ id: "b", order: 1 }),
            makeSheet({ id: "c", order: 2 }),
        ];
        const result = reorderSheets(sheets, ["c", "a", "b"]);
        expect(result.find((s) => s.id === "c")!.order).toBe(0);
        expect(result.find((s) => s.id === "a")!.order).toBe(1);
        expect(result.find((s) => s.id === "b")!.order).toBe(2);
    });

    it("leaves sheets not in the list untouched", () => {
        const sheets = [makeSheet({ id: "cx", order: -1 }), makeSheet({ id: "a", order: 5 })];
        const result = reorderSheets(sheets, ["a"]);
        expect(result.find((s) => s.id === "cx")!.order).toBe(-1);
        expect(result.find((s) => s.id === "a")!.order).toBe(0);
    });
});

// ─── removeSheet ──────────────────────────────────────────────────────────────

describe("removeSheet", () => {
    it("drops the sheet and its scoped nodes and groups", () => {
        const sheets = [makeSheet({ id: "a" }), makeSheet({ id: "b" })];
        const nodes = [makeNode({ id: "n1", sheetId: "a" }), makeNode({ id: "n2", sheetId: "b" })];
        const groups: ArgGroup[] = [
            { id: "g1", sheetId: "a", label: "", memberIds: ["n1"] },
            { id: "g2", sheetId: "b", label: "", memberIds: ["n2"] },
        ];
        const result = removeSheet(sheets, nodes, groups, "a");
        expect(result.sheets.map((s) => s.id)).toEqual(["b"]);
        expect(result.nodes.map((n) => n.id)).toEqual(["n2"]);
        expect(result.groups.map((g) => g.id)).toEqual(["g2"]);
    });

    it("is pure", () => {
        const sheets = [makeSheet({ id: "a" })];
        const nodes = [makeNode({ id: "n1", sheetId: "a" })];
        removeSheet(sheets, nodes, [], "a");
        expect(sheets).toHaveLength(1);
        expect(nodes).toHaveLength(1);
    });
});

// ─── restoreSheet ─────────────────────────────────────────────────────────────

describe("restoreSheet", () => {
    it("re-inserts the sheet with its nodes and groups", () => {
        const sheets = [makeSheet({ id: "b", order: 1 })];
        const nodes = [makeNode({ id: "n2", sheetId: "b" })];
        const groups: ArgGroup[] = [];
        const removedSheet = makeSheet({ id: "a", order: 0 });
        const removedNodes = [makeNode({ id: "n1", sheetId: "a" })];
        const removedGroups: ArgGroup[] = [
            { id: "g1", sheetId: "a", label: "", memberIds: ["n1", "n1b"] },
        ];
        const result = restoreSheet(
            sheets,
            nodes,
            groups,
            removedSheet,
            removedNodes,
            removedGroups,
        );
        expect(result.sheets.map((s) => s.id).sort()).toEqual(["a", "b"]);
        expect(result.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
        expect(result.groups.map((g) => g.id)).toEqual(["g1"]);
    });
});

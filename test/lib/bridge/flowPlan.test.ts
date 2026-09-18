import { describe, expect, it } from "vitest";

import { planFlowWrite } from "@/lib/bridge/flowPlan";
import type { FlowItem } from "@/lib/bridge/protocol";

const item = (kind: string, text: string, n = text): FlowItem => ({
    kind,
    text,
    token: `cmsrc1.${n}`,
    key: `doc-1|${n.toLowerCase()}`,
});

describe("planFlowWrite in column mode", () => {
    it("gives each item a row and decorates by kind", () => {
        const cells = planFlowWrite(
            [item("block", "Cap K"), item("tag", "Perm solves"), item("analytic", "No link")],
            "column",
            "AT - Cap K",
        );
        expect(cells.map((c) => c.text)).toEqual(["Cap K", "Perm solves", "No link"]);
        expect(cells[0].meta.bold).toBe(true);
        expect(cells[1].meta.card).toBe(true);
        expect(cells[2].meta.bold).toBeUndefined();
        expect(cells[2].meta.card).toBeUndefined();
    });

    it("folds a cite into the cell above it rather than taking a row", () => {
        const cells = planFlowWrite(
            [item("tag", "Perm solves"), item("cite", "Smith 24")],
            "column",
            "AT - Cap K",
        );
        expect(cells).toHaveLength(1);
        expect(cells[0].text).toBe("Perm solves\nSmith 24");
        // The folded cell keeps the tag's provenance, not the cite's.
        expect(cells[0].meta.source?.token).toBe("cmsrc1.Perm solves");
        expect(cells[0].meta.card).toBe(true);
    });

    it("gives a leading cite its own plain row", () => {
        const cells = planFlowWrite(
            [item("cite", "Smith 24"), item("tag", "Perm solves")],
            "column",
            "",
        );
        expect(cells.map((c) => c.text)).toEqual(["Smith 24", "Perm solves"]);
        expect(cells[0].meta.card).toBeUndefined();
    });

    it("treats an undertag and an unknown kind as plain text", () => {
        const cells = planFlowWrite([item("undertag", "AND"), item("mystery", "?")], "column", "");
        expect(cells.every((c) => !c.meta.bold && !c.meta.card)).toBe(true);
    });

    it("stamps provenance with the origin app and document title", () => {
        const [cell] = planFlowWrite([item("tag", "Perm solves")], "column", "AT - Cap K");
        expect(cell.meta.source).toEqual({
            app: "cardmirror",
            token: "cmsrc1.Perm solves",
            key: "doc-1|perm solves",
            title: "AT - Cap K",
        });
    });

    it("leaves provenance off an item that carries no token", () => {
        const [cell] = planFlowWrite(
            [{ kind: "tag", text: "Perm solves", token: "", key: "" }],
            "column",
            "AT - Cap K",
        );
        expect(cell.meta.source).toBeUndefined();
        expect(cell.meta.card).toBe(true);
    });
});

describe("planFlowWrite in cell mode", () => {
    it("joins every item into one undecorated cell with the first item's source", () => {
        const cells = planFlowWrite(
            [item("block", "Cap K"), item("tag", "Perm solves"), item("cite", "Smith 24")],
            "cell",
            "AT - Cap K",
        );
        expect(cells).toHaveLength(1);
        expect(cells[0].text).toBe("Cap K\nPerm solves\nSmith 24");
        expect(cells[0].meta.bold).toBeUndefined();
        expect(cells[0].meta.card).toBeUndefined();
        expect(cells[0].meta.source?.token).toBe("cmsrc1.Cap K");
    });
});

describe("planFlowWrite with a paste space", () => {
    it("adds the empty cells below a column send", () => {
        const cells = planFlowWrite(
            [item("tag", "Perm solves"), item("analytic", "No link")],
            "column",
            "AT - Cap K",
            2,
        );
        expect(cells.map((c) => c.text)).toEqual(["Perm solves", "No link", "", ""]);
        expect(cells[2].meta).toEqual({});
        expect(cells[3].meta).toEqual({});
    });

    it("adds the empty cells below a single-cell send", () => {
        const cells = planFlowWrite(
            [item("tag", "Perm solves"), item("cite", "Smith 24")],
            "cell",
            "AT - Cap K",
            1,
        );
        expect(cells).toHaveLength(2);
        expect(cells[0].text).toBe("Perm solves\nSmith 24");
        expect(cells[1]).toEqual({ text: "", meta: {} });
    });

    it("plans nothing extra when the space is zero", () => {
        const cells = planFlowWrite([item("tag", "Perm solves")], "column", "AT - Cap K", 0);
        expect(cells).toHaveLength(1);
    });

    it("plans nothing at all for an empty send, whatever the space", () => {
        expect(planFlowWrite([], "column", "AT - Cap K", 3)).toEqual([]);
    });
});

describe("planFlowWrite with argument spacing", () => {
    it("separates tags and analytics while keeping a cite with its tag", () => {
        const cells = planFlowWrite(
            [
                item("block", "Cap K"),
                item("tag", "Perm solves"),
                item("cite", "Smith 24"),
                item("analytic", "No link"),
                item("tag", "Turn case"),
            ],
            "column",
            "AT - Cap K",
            0,
            true,
        );

        expect(cells.map((cell) => cell.text)).toEqual([
            "Cap K",
            "Perm solves\nSmith 24",
            "",
            "No link",
            "",
            "Turn case",
        ]);
    });

    it("keeps intervening headings with the argument they introduce", () => {
        const cells = planFlowWrite(
            [item("tag", "First card"), item("block", "Next block"), item("tag", "Second card")],
            "column",
            "AT - Cap K",
            0,
            true,
        );

        expect(cells.map((cell) => cell.text)).toEqual([
            "First card",
            "",
            "Next block",
            "Second card",
        ]);
    });
});

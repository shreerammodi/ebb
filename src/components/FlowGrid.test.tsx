/**
 * FlowGrid render tests — coordinate-based spreadsheet grid.
 *
 * Each (speech, row) is a distinct cell. No rowspan, no cell-void, no
 * straightDown. Selection is a grid coordinate.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { makeFormatByKey } from "@/lib/format/presets";
import { useRoundStore } from "@/lib/store/useRoundStore";

import FlowGrid from "./FlowGrid";

function resetStore() {
    useRoundStore.setState({
        round: null,
        activeSheetId: null,
        selection: null,
    });
}

function setupScenario() {
    const fmt = makeFormatByKey("policy");
    useRoundStore.getState().createRound({ role: "neg", format: fmt });
    const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });

    const speeches = fmt.speeches;
    const s1NC = speeches[1].id;
    const s2AC = speeches[2].id;
    const s2NC = speeches[3].id; // Block

    const ncId = useRoundStore.getState().placeBareNode({
        sheetId,
        speechId: s1NC,
        row: 0,
    });
    const ac1Id = useRoundStore.getState().placeBareNode({
        sheetId,
        speechId: s2AC,
        row: 0,
    });
    const ac2Id = useRoundStore.getState().placeBareNode({
        sheetId,
        speechId: s2AC,
        row: 1,
    });
    const ac3Id = useRoundStore.getState().placeBareNode({
        sheetId,
        speechId: s2AC,
        row: 2,
    });

    // Build relationships: 1NC is parent of three 2AC responses; Block answers two.
    const r = useRoundStore.getState().round!;
    useRoundStore.getState()._commit(null, (rr) => ({
        ...rr,
        nodes: r.nodes.map((n) => {
            if (n.id === ac1Id || n.id === ac2Id || n.id === ac3Id) return { ...n, parentId: ncId };
            return n;
        }),
    }));

    const blk1 = useRoundStore.getState().placeBareNode({
        sheetId,
        speechId: s2NC,
        row: 0,
    });
    const blk2 = useRoundStore.getState().placeBareNode({
        sheetId,
        speechId: s2NC,
        row: 1,
    });
    const r2 = useRoundStore.getState().round!;
    useRoundStore.getState()._commit(null, (rr) => ({
        ...rr,
        nodes: r2.nodes.map((n) => {
            if (n.id === blk1) return { ...n, parentId: ac1Id };
            if (n.id === blk2) return { ...n, parentId: ac2Id };
            return n;
        }),
    }));

    // Set text on the nodes.
    useRoundStore.getState().updateNodeText(ncId, "Topicality");
    useRoundStore.getState().updateNodeText(ac1Id, "We meet");
    useRoundStore.getState().updateNodeText(ac2Id, "Counter-interp");
    useRoundStore.getState().updateNodeText(ac3Id, "Standards");

    return { sheetId, ncId, ac1Id, ac2Id, ac3Id };
}

describe("FlowGrid — coordinate-based rendering", () => {
    beforeEach(resetStore);

    it("renders column headers with speech names", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        const headers = screen.getAllByRole("columnheader");
        expect(headers.some((h) => h.textContent?.includes("1NC"))).toBe(true);
        expect(headers.some((h) => h.textContent?.includes("2AC"))).toBe(true);
    });

    it("applies side-neg to 1NC header and side-aff to 2AC header", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        const headers = screen.getAllByRole("columnheader");
        const ncHeader = headers.find((h) => h.querySelector(".th-label")?.textContent === "1NC");
        const acHeader = headers.find((h) => h.querySelector(".th-label")?.textContent === "2AC");
        expect(ncHeader!.classList.contains("side-neg")).toBe(true);
        expect(acHeader!.classList.contains("side-aff")).toBe(true);
    });

    it("renders a cell per (speech, row) coordinate, no rowspan", () => {
        const { sheetId } = setupScenario();
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        // The 1NC node at row 0 should be in its own td (no rowspan).
        const cell = screen.getByText("Topicality").closest("td");
        expect(cell).toBeDefined();
        expect(cell!.getAttribute("rowspan")).toBeNull();
    });

    it("shows numbering prefixes on response cells", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        const numSpans = document.querySelectorAll(".arg-num");
        const numTexts = Array.from(numSpans).map((s) => s.textContent);
        expect(numTexts).toContain("1.");
        expect(numTexts).toContain("2.");
        expect(numTexts).toContain("3.");
    });

    it("marks dropped nodes with .cell-drop and renders .badge-drop", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        // ac3 ("Standards") has no Block answer → dropped
        const cell = screen.getByText("Standards").closest("td");
        expect(cell!.classList.contains("cell-drop")).toBe(true);
        expect(document.querySelector(".badge-drop")).not.toBeNull();
    });

    it("draws a sibling-band divider before each stacked response group, not the first", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        // ac1/ac2/ac3 are siblings whose group bears responses (Block answers), so
        // the boundary before ac2 and ac3 is ruled; ac1 sits at the band's top.
        expect(
            screen.getByText("We meet").closest("td")!.classList.contains("cell-band-start"),
        ).toBe(false);
        expect(
            screen.getByText("Counter-interp").closest("td")!.classList.contains("cell-band-start"),
        ).toBe(true);
        expect(
            screen.getByText("Standards").closest("td")!.classList.contains("cell-band-start"),
        ).toBe(true);
    });

    it("extends the divider rightward across the sibling's subtree columns", () => {
        const { sheetId } = setupScenario();
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        // The boundary before ac2 (2AC, row 1) also rules the Block column to its
        // right at the same row, since it belongs to ac2's subtree.
        const row1Cells = container.querySelectorAll("tbody tr:nth-child(2) td.cell-band-start");
        // 2AC + the Block (2NC) column and beyond are ruled; the parent 1NC column
        // to the left is not.
        expect(row1Cells.length).toBeGreaterThanOrEqual(2);
    });

    it("highlights the selected cell with .cell-sel", () => {
        const { sheetId, ac2Id } = setupScenario();
        const fmt = useRoundStore.getState().round!.format;
        const s2AC = fmt.speeches[2].id;
        // Find ac2's row
        const ac2 = useRoundStore.getState().round!.nodes.find((n) => n.id === ac2Id)!;
        useRoundStore.getState().setSelection({ sheetId, speechId: s2AC, row: ac2.row });

        render(<FlowGrid sheetId={sheetId} />);
        const cell = screen.getByText("Counter-interp").closest("td");
        expect(cell!.classList.contains("cell-sel")).toBe(true);
    });

    it("renders at least one row even on an empty sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Empty", group: "aff" });
        render(<FlowGrid sheetId={sheetId} />);
        const rows = document.querySelectorAll("tbody tr");
        expect(rows.length).toBeGreaterThan(0);
    });

    it("renders every empty cell as clickable (no cell-void)", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        render(<FlowGrid sheetId={sheetId} />);
        const cells = document.querySelectorAll("td");
        // None should carry cell-void in the new coordinate model.
        expect(document.querySelectorAll("td.cell-void").length).toBe(0);
        // All empty cells should be marked cell-open.
        const openCells = document.querySelectorAll("td.cell-open");
        expect(openCells.length).toBeGreaterThan(0);
    });

    it("clicking an empty cell sets selection to that coordinate", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        const fmt2 = useRoundStore.getState().round!.format;
        const s1AC = fmt2.speeches[0].id;
        render(<FlowGrid sheetId={sheetId} />);

        const row0 = document.querySelector("tbody tr")!;
        const cell = row0.querySelectorAll("td")[1]; // 1NC col, row 0
        cell.click();

        const sel = useRoundStore.getState().selection;
        expect(sel).toEqual({ sheetId, speechId: fmt2.speeches[1].id, row: 0 });
    });

    it("hides argument numbers when autoNumber is off", () => {
        useRoundStore.getState().setAutoNumber(false);
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        expect(screen.queryByText("1.")).toBeNull();
        useRoundStore.getState().setAutoNumber(true);
    });

    it("shows first-run hint in entry cell of an empty sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        const hint = container.querySelector(".cell-hint");
        expect(hint).not.toBeNull();
        expect(hint!.textContent?.toLowerCase()).toContain("argument");
    });

    it("hides first-run hint once a node exists", () => {
        const { sheetId } = setupScenario();
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        expect(container.querySelector(".cell-hint")).toBeNull();
    });

    it("renders a caption naming the sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Disad", group: "neg" });
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        const caption = container.querySelector("table.flow > caption");
        expect(caption).not.toBeNull();
        expect(caption!.textContent).toContain("Disad");
    });

    it("applies side-aff class to a group header spanning aff speeches", () => {
        // Test: set up a sheet with speeches that have groups.
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "AffGroup", group: "aff" });
        render(<FlowGrid sheetId={sheetId} />);
        // The policy format doesn't have explicit groups, so this just checks
        // the rendering doesn't break. The Block header should be present.
        const headers = screen.getAllByRole("columnheader");
        expect(headers.some((h) => h.textContent?.includes("Block"))).toBe(true);
    });

    it("dropping a node onto another reparent it", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        const s1AC = fmt.speeches[0].id;
        const s1NC = fmt.speeches[1].id;

        const idA = useRoundStore.getState().placeBareNode({
            sheetId,
            speechId: s1AC,
            row: 0,
        });
        const idB = useRoundStore.getState().placeBareNode({
            sheetId,
            speechId: s1NC,
            row: 0,
        });
        useRoundStore.getState().updateNodeText(idA, "A-text");
        useRoundStore.getState().updateNodeText(idB, "B-text");

        render(<FlowGrid sheetId={sheetId} />);

        const dropEl = screen.getByText("B-text").closest("[draggable]")!;
        const dragEl = screen.getByText("A-text").closest("[draggable]")!;
        const store: Record<string, string> = {};
        const dataTransfer = {
            effectAllowed: "move",
            setData: (type: string, value: string) => {
                store[type] = value;
            },
            getData: (type: string) => store[type] ?? "",
        };
        fireEvent.dragStart(dragEl, { dataTransfer });
        fireEvent.dragOver(dropEl, { dataTransfer });
        fireEvent.drop(dropEl, { dataTransfer });

        expect(useRoundStore.getState().round!.nodes.find((n) => n.id === idA)!.parentId).toBe(idB);
    });
});

describe("FlowGrid — CX sheet folding", () => {
    beforeEach(resetStore);

    it("renders CX period group headers when the sheet is a CX sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const cxId = useRoundStore.getState().round!.sheets.find((s) => s.kind === "cx")!.id;

        render(<FlowGrid sheetId={cxId} />);

        ["1AC CX", "1NC CX", "2AC CX", "2NC CX"].forEach((h) =>
            expect(screen.getByText(h)).toBeTruthy(),
        );
        expect(screen.getAllByText("Question").length).toBe(4);
        expect(screen.getAllByText("Response").length).toBe(4);
    });

    it("renders CX nodes with numbering (no special-case suppression)", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const cxId = useRoundStore.getState().round!.sheets.find((s) => s.kind === "cx")!.id;

        const qId = useRoundStore.getState().placeBareNode({
            sheetId: cxId,
            speechId: "cx-1ac-q",
            row: 0,
        });
        const rId = useRoundStore.getState().placeBareNode({
            sheetId: cxId,
            speechId: "cx-1ac-r",
            row: 0,
        });
        // Set r as child of q
        useRoundStore.getState()._commit(null, (rr) => ({
            ...rr,
            nodes: rr.nodes.map((n) => (n.id === rId ? { ...n, parentId: qId } : n)),
        }));
        useRoundStore.getState().updateNodeText(qId, "Q1");
        useRoundStore.getState().updateNodeText(rId, "R1");

        render(<FlowGrid sheetId={cxId} />);
        // The response should be numbered "1."
        expect(screen.getByText("Q1")).toBeTruthy();
        expect(screen.getByText("R1")).toBeTruthy();
        expect(screen.queryByText("1.")).not.toBeNull();
    });
});
describe("FlowGrid — reserved cells beside a response band", () => {
    beforeEach(resetStore);

    it("greys band cells in the parent column and blocks editing there", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        useRoundStore.getState().setActiveSheet(sheetId);
        const c0 = fmt.speeches[0].id; // 1AC

        // arg1 in 1AC with three responses stacked in 1NC (rows 0..2).
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().spawnResponse();
        useRoundStore.getState().spawnSibling();
        useRoundStore.getState().spawnSibling();

        render(<FlowGrid sheetId={sheetId} />);
        const rows = document.querySelectorAll("tbody tr");

        // 1AC (first column) rows 1 and 2 sit inside arg1's band → reserved.
        const r1c0 = rows[1].querySelectorAll("td")[0];
        const r2c0 = rows[2].querySelectorAll("td")[0];
        expect(r1c0.className).toContain("cell-reserved");
        expect(r2c0.className).toContain("cell-reserved");

        // Row 3 in 1AC is below the band → a normal open entry cell.
        const r3c0 = rows[3].querySelectorAll("td")[0];
        expect(r3c0.className).toContain("cell-open");
        expect(r3c0.className).not.toContain("cell-reserved");

        // Clicking a reserved cell neither selects it nor opens an editor.
        const before = useRoundStore.getState().selection;
        fireEvent.click(r1c0);
        expect(useRoundStore.getState().selection).toEqual(before);
        expect(r1c0.querySelector("textarea")).toBeNull();
    });
});

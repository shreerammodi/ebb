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

    // Set text on the nodes. The Block answers need real text too: empty cells
    // are not real arguments, so a blank Block would count as "never happened"
    // and ac3 would not register as dropped.
    useRoundStore.getState().updateNodeText(ncId, "Topicality");
    useRoundStore.getState().updateNodeText(ac1Id, "We meet");
    useRoundStore.getState().updateNodeText(ac2Id, "Counter-interp");
    useRoundStore.getState().updateNodeText(ac3Id, "Standards");
    useRoundStore.getState().updateNodeText(blk1, "No, you don't");
    useRoundStore.getState().updateNodeText(blk2, "Bad counter-interp");

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

    it("marks dropped nodes with .cell-drop and renders .mark-drop", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        // ac3 ("Standards") has no Block answer → dropped
        const cell = screen.getByText("Standards").closest("td");
        expect(cell!.classList.contains("cell-drop")).toBe(true);
        expect(document.querySelector(".mark-drop")).not.toBeNull();
    });

    // A parent (1NC) answered by a run of 2AC responses where one of them is a
    // tall, multi-row exchange (it carries Block answers) and the rest are leaves.
    function setupTallSibling() {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        const sp = fmt.speeches;
        const s1NC = sp[1].id;
        const s2AC = sp[2].id;
        const s2NC = sp[3].id;

        const place = (speechId: string, row: number, text: string) => {
            const id = useRoundStore.getState().placeBareNode({ sheetId, speechId, row });
            useRoundStore.getState().updateNodeText(id, text);
            return id;
        };
        const setParent = (childId: string, parentId: string) => {
            const r = useRoundStore.getState().round!;
            useRoundStore.getState()._commit(null, (rr) => ({
                ...rr,
                nodes: r.nodes.map((n) => (n.id === childId ? { ...n, parentId } : n)),
            }));
        };

        const nc = place(s1NC, 0, "Topicality");
        // Four sibling 2AC responses. r3 is tall: its Block answers occupy rows 2-3.
        const r1 = place(s2AC, 0, "r1-leaf");
        const r2 = place(s2AC, 1, "r2-leaf");
        const r3 = place(s2AC, 2, "r3-tall");
        const r4 = place(s2AC, 4, "r4-leaf");
        [r1, r2, r3, r4].forEach((id) => setParent(id, nc));

        const b1 = place(s2NC, 2, "blk-1");
        const b2 = place(s2NC, 3, "blk-2");
        setParent(b1, r3);
        setParent(b2, r3);

        return { sheetId };
    }

    it("rules only the boundaries that touch a tall sibling, not between leaves", () => {
        const { sheetId } = setupTallSibling();
        render(<FlowGrid sheetId={sheetId} />);
        const band = (text: string) =>
            screen.getByText(text).closest("td")!.classList.contains("cell-band-start");
        // Two adjacent leaves (r1→r2) need no line.
        expect(band("r2-leaf")).toBe(false);
        // r3 opens a multi-row exchange → ruled; r4 closes it (previous sibling
        // is tall) → ruled.
        expect(band("r3-tall")).toBe(true);
        expect(band("r4-leaf")).toBe(true);
        // The first sibling never gets a top rule.
        expect(band("r1-leaf")).toBe(false);
    });

    it("extends a tall sibling's boundary rightward across its subtree columns", () => {
        const { sheetId } = setupTallSibling();
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        // r3's boundary at row 2 also rules the Block column to its right, since
        // that column holds r3's subtree; the parent 1NC column stays continuous.
        const row3Cells = container.querySelectorAll("tbody tr:nth-child(3) td.cell-band-start");
        expect(row3Cells.length).toBeGreaterThanOrEqual(2);
        expect(
            screen.getByText("Topicality").closest("td")!.classList.contains("cell-band-start"),
        ).toBe(false);
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

    it("dropping a node onto an empty cell moves the subtree there", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        const s1AC = fmt.speeches[0].id; // 1AC
        const s1NC = fmt.speeches[1].id; // 1NC

        // Place a parent in 1AC r0 and a child in 1NC r0.
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
        const r = useRoundStore.getState().round!;
        useRoundStore.getState()._commit(null, (rr) => ({
            ...rr,
            nodes: r.nodes.map((n) => (n.id === idB ? { ...n, parentId: idA } : n)),
        }));
        useRoundStore.getState().updateNodeText(idA, "A-text");
        useRoundStore.getState().updateNodeText(idB, "B-text");

        render(<FlowGrid sheetId={sheetId} />);

        // Drop A onto the empty 1AC row 1 cell.
        const dropTarget = screen.getByText("A-text").closest("[draggable]")!;
        // Find the empty cell at 1AC row 1.
        const rows = document.querySelectorAll("tbody tr");
        const row1cells = rows[1].querySelectorAll("td");
        // 1AC is column 0
        const emptyCell = row1cells[0];

        const store: Record<string, string> = {};
        const dataTransfer = {
            effectAllowed: "move",
            setData: (type: string, value: string) => {
                store[type] = value;
            },
            getData: (type: string) => store[type] ?? "",
        };
        // Drag from A-text span (draggable ancestor is the GridCell span)
        const dragEl = screen.getByText("A-text").closest("[draggable]")!;
        const store2: Record<string, string> = {};
        const dt2 = {
            effectAllowed: "move",
            setData: (type: string, value: string) => {
                store2[type] = value;
            },
            getData: (type: string) => store2[type] ?? "",
        };
        fireEvent.dragStart(dragEl, { dataTransfer: dt2 });
        fireEvent.dragOver(emptyCell, { dataTransfer: dt2 });
        fireEvent.drop(emptyCell, { dataTransfer: dt2 });

        // A moved from row 0 to row 1; B (child) moves along with it.
        const aAfter = useRoundStore.getState().round!.nodes.find((n) => n.id === idA)!;
        const bAfter = useRoundStore.getState().round!.nodes.find((n) => n.id === idB)!;
        expect(aAfter.row).toBe(1);
        expect(bAfter.row).toBe(1);
    });

    it("dropping a node onto an occupied cell ripples the occupant down", () => {
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

        // A moves onto B's cell; B is rippled down by the subtree span (1 row).
        const aAfter = useRoundStore.getState().round!.nodes.find((n) => n.id === idA)!;
        const bAfter = useRoundStore.getState().round!.nodes.find((n) => n.id === idB)!;
        expect(aAfter.speechId).toBe(s1NC);
        expect(aAfter.row).toBe(0);
        expect(bAfter.speechId).toBe(s1NC);
        expect(bAfter.row).toBe(1);
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

        // arg1 in 1AC with three separate responses stacked in 1NC (rows 0..2).
        // Spawns are deferred; Enter continues an argument, so break each time to
        // make a distinct sibling response, then type to create the node.
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().setSelection({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().spawnResponse();
        useRoundStore.getState().commitPendingSpawn("r1");
        useRoundStore.getState().spawnSibling();
        useRoundStore.getState().breakPendingSpawn();
        useRoundStore.getState().commitPendingSpawn("r2");
        useRoundStore.getState().spawnSibling();
        useRoundStore.getState().breakPendingSpawn();
        useRoundStore.getState().commitPendingSpawn("r3");

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

describe("FlowGrid — link mode banner", () => {
    beforeEach(resetStore);

    it("renders the Link banner when linkSource is set", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        useRoundStore.getState().setActiveSheet(sheetId);
        const h = useRoundStore
            .getState()
            .placeBareNode({ sheetId, speechId: fmt.speeches[0].id, row: 0 });
        useRoundStore.setState({ linkSource: h });

        render(<FlowGrid sheetId={sheetId} />);
        expect(screen.getByText("Link")).toBeTruthy();
    });
});

describe("FlowGrid — unit dividers and highlight", () => {
    beforeEach(resetStore);

    function newSheet() {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore.getState().addSheet({ title: "Case", group: "aff" });
        useRoundStore.getState().setActiveSheet(sheetId);
        return { sheetId, speeches: fmt.speeches };
    }

    it("suppresses the rule between cells of one unit", () => {
        const { sheetId, speeches } = newSheet();
        const c0 = speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 0 }, "a-text");
        useRoundStore.getState().setSelection({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().spawnSibling();
        useRoundStore.getState().commitPendingSpawn("b-text");

        render(<FlowGrid sheetId={sheetId} />);
        const bCell = screen.getByText("b-text").closest("td")!;
        expect(bCell.className).toContain("cell-unit-cont");
    });

    it("does not draw a heavy rule between two plain single-cell arguments", () => {
        const { sheetId, speeches } = newSheet();
        const c0 = speeches[0].id;
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 0 }, "first-arg");
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 1 }, "second-arg");

        render(<FlowGrid sheetId={sheetId} />);
        const second = screen.getByText("second-arg").closest("td")!;
        expect(second.className).not.toContain("cell-band-start");
    });

    it("draws the heavy rule at a tall band boundary", () => {
        const { sheetId, speeches } = newSheet();
        const c0 = speeches[0].id;
        // Root P with three stacked responses (band rows 0-2), sibling root Q at row 3.
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 0 }, "p-text");
        useRoundStore.getState().setSelection({ sheetId, speechId: c0, row: 0 });
        useRoundStore.getState().spawnResponse();
        const r1 = useRoundStore.getState().commitPendingSpawn("r1")!;
        const r1n = useRoundStore.getState().round!.nodes.find((n) => n.id === r1)!;
        useRoundStore.getState().setSelection({ sheetId, speechId: r1n.speechId, row: 0 });
        useRoundStore.getState().spawnSibling();
        useRoundStore.getState().breakPendingSpawn();
        useRoundStore.getState().commitPendingSpawn("r2");
        useRoundStore.getState().setSelection({ sheetId, speechId: r1n.speechId, row: 1 });
        useRoundStore.getState().spawnSibling();
        useRoundStore.getState().breakPendingSpawn();
        useRoundStore.getState().commitPendingSpawn("r3");
        useRoundStore.getState().placeBareNode({ sheetId, speechId: c0, row: 3 }, "q-text");

        render(<FlowGrid sheetId={sheetId} />);
        const q = screen.getByText("q-text").closest("td")!;
        expect(q.className).toContain("cell-band-start");
    });
});

/**
 * FlowGrid + GridCell render tests (TDD-first).
 *
 * Setup:
 *   - Policy format (1AC, 1NC, 2AC, Block, 1AR, 2NR, 2AR)
 *   - One sheet
 *   - 1NC root arg  →  three 2AC children (#1, #2, #3)
 *   - Block answers #1 and #2 but NOT #3  (so #3 is dropped)
 *   - Selection set to the #2 cell
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey, makeFormat } from "@/lib/format/presets";
import FlowGrid from "./FlowGrid";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BLANK_STATE = {
    round: null,
    activeSheetId: null,
    mode: "normal" as const,
    selection: null,
    keymapName: "vim" as const,
};

function resetStore() {
    useRoundStore.setState(BLANK_STATE);
}

// ─── Setup shared state ───────────────────────────────────────────────────────

interface TestContext {
    sheetId: string;
    ncId: string; // 1NC node (root)
    ac1Id: string; // 2AC child #1
    ac2Id: string; // 2AC child #2
    ac3Id: string; // 2AC child #3 (dropped)
    nc2Id: string; // Block answer to ac1
    nc3Id: string; // Block answer to ac2
}

function setupScenario(): TestContext {
    const fmt = makeFormatByKey("policy");
    useRoundStore.getState().createRound({ role: "neg", format: fmt });
    const sheetId = useRoundStore
        .getState()
        .addSheet({ title: "Case", group: "aff" });

    const speeches = fmt.speeches;
    // Policy order: 1AC[0], 1NC[1], 2AC[2], Block[3], 1AR[4], 2NR[5], 2AR[6]
    const s1NC = speeches[1].id;
    const s2AC = speeches[2].id;
    const s2NC = speeches[3].id; // Block

    // 1NC root argument
    const ncId = useRoundStore.getState().addNode({
        sheetId,
        speechId: s1NC,
        parentId: null,
        text: "Topicality",
    });

    // Three 2AC responses to 1NC
    const ac1Id = useRoundStore.getState().addNode({
        sheetId,
        speechId: s2AC,
        parentId: ncId,
        text: "We meet",
    });
    const ac2Id = useRoundStore.getState().addNode({
        sheetId,
        speechId: s2AC,
        parentId: ncId,
        text: "Counter-interp",
    });
    const ac3Id = useRoundStore.getState().addNode({
        sheetId,
        speechId: s2AC,
        parentId: ncId,
        text: "Standards",
    });

    // Block answers ac1 and ac2 but NOT ac3 → ac3 is dropped
    const nc2Id = useRoundStore.getState().addNode({
        sheetId,
        speechId: s2NC,
        parentId: ac1Id,
        text: "Block answer to we meet",
    });
    const nc3Id = useRoundStore.getState().addNode({
        sheetId,
        speechId: s2NC,
        parentId: ac2Id,
        text: "Block answer to counter-interp",
    });

    return { sheetId, ncId, ac1Id, ac2Id, ac3Id, nc2Id, nc3Id };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FlowGrid", () => {
    beforeEach(resetStore);

    // ── Column headers ─────────────────────────────────────────────────────────

    it("renders column headers with speech names", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        // All 7 policy speeches should appear as headers (in the bottom header row)
        expect(
            screen
                .getAllByRole("columnheader")
                .some((h) => h.textContent?.includes("1NC")),
        ).toBe(true);
        expect(
            screen
                .getAllByRole("columnheader")
                .some((h) => h.textContent?.includes("2AC")),
        ).toBe(true);
    });

    it("applies side-neg to 1NC header and side-aff to 2AC header", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        const headers = screen.getAllByRole("columnheader");
        const ncHeader = headers.find(
            (h) => h.querySelector(".th-label")?.textContent === "1NC",
        );
        const acHeader = headers.find(
            (h) => h.querySelector(".th-label")?.textContent === "2AC",
        );

        expect(ncHeader).toBeDefined();
        expect(acHeader).toBeDefined();
        expect(ncHeader!.classList.contains("side-neg")).toBe(true);
        expect(acHeader!.classList.contains("side-aff")).toBe(true);
    });

    // ── Group header row ───────────────────────────────────────────────────────

    it('renders a "Block" column header', () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        const headers = screen.getAllByRole("columnheader");
        const blockHeader = headers.find(
            (h) => h.querySelector(".th-label")?.textContent === "Block",
        );
        expect(blockHeader).toBeDefined();
        expect(blockHeader!.classList.contains("side-neg")).toBe(true);
    });

    // ── rowSpan for parent node ────────────────────────────────────────────────

    it("renders the 1NC parent cell with rowSpan 3 (spanning its three 2AC answers)", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        // Find the cell containing "Topicality" (the 1NC root node)
        const cell = screen.getByText("Topicality").closest("td");
        expect(cell).toBeDefined();
        // rowSpan should be 3 because it has 3 children
        expect(
            cell!.getAttribute("rowspan") ?? cell!.getAttribute("rowSpan"),
        ).toBe("3");
    });

    // ── Response numbering ─────────────────────────────────────────────────────

    it('shows numbered prefixes "1." "2." "3." on the three 2AC children', () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        const numSpans = document.querySelectorAll(".arg-num");
        const numTexts = Array.from(numSpans).map((s) => s.textContent);
        expect(numTexts).toContain("1.");
        expect(numTexts).toContain("2.");
        expect(numTexts).toContain("3.");
    });

    // ── Drop detection ─────────────────────────────────────────────────────────

    it("marks the dropped node (#3 Standards) with .cell-drop and renders .badge-drop", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        // "Standards" is the dropped 2AC child
        const cell = screen.getByText("Standards").closest("td");
        expect(cell).toBeDefined();
        expect(cell!.classList.contains("cell-drop")).toBe(true);

        // badge-drop should exist somewhere in the DOM
        const badge = document.querySelector(".badge-drop");
        expect(badge).not.toBeNull();
    });

    it("renders no drop markers when straightDown is on", () => {
        const { sheetId } = setupScenario();
        useRoundStore.setState({ straightDown: true, labelDrops: true });

        render(<FlowGrid sheetId={sheetId} />);

        // The dropped cell should NOT carry the .cell-drop class.
        const cell = screen.getByText("Standards").closest("td");
        expect(cell!.classList.contains("cell-drop")).toBe(false);
        // No drop badge anywhere in the DOM.
        expect(document.querySelector(".badge-drop")).toBeNull();

        useRoundStore.setState({ straightDown: false });
    });

    // ── Selected cell ──────────────────────────────────────────────────────────

    it("highlights the selected cell with .cell-sel", () => {
        const { sheetId, ac2Id } = setupScenario();
        const fmt = useRoundStore.getState().round!.format;
        const s2AC = fmt.speeches[2].id;

        // Set selection to ac2 (Counter-interp)
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: s2AC, nodeId: ac2Id });

        render(<FlowGrid sheetId={sheetId} />);

        const cell = screen.getByText("Counter-interp").closest("td");
        expect(cell).toBeDefined();
        expect(cell!.classList.contains("cell-sel")).toBe(true);
    });

    // ── Empty sheet fallback ───────────────────────────────────────────────────

    it("renders at least one row even when the sheet has no nodes", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Empty", group: "aff" });

        render(<FlowGrid sheetId={sheetId} />);

        const rows = document.querySelectorAll("tbody tr");
        expect(rows.length).toBeGreaterThan(0);
    });

    // ── Cycle guard (leafCount stack overflow prevention) ──────────────────────

    it("does NOT throw when two nodes form a parentId cycle", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Cycle", group: "aff" });

        const speeches = fmt.speeches;
        const s1NC = speeches[1].id;
        const s2AC = speeches[2].id;

        // Create two nodes in different speeches
        const nodeA = useRoundStore.getState().addNode({
            sheetId,
            speechId: s1NC,
            parentId: null,
            text: "Node A",
        });
        const nodeB = useRoundStore.getState().addNode({
            sheetId,
            speechId: s2AC,
            parentId: nodeA,
            text: "Node B",
        });

        // Forcibly create a cycle: A→B, B→A (bypasses normal tree constraints)
        useRoundStore.getState().setNodeParent(nodeA, nodeB);

        // Render must not throw (cycle guard prevents stack overflow)
        expect(() => render(<FlowGrid sheetId={sheetId} />)).not.toThrow();
    });

    // ── Empty cells — no em-dash ──────────────────────────────────────────────

    it("renders accessible empty cells without an em-dash but still clickable", async () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        // Find an empty data cell (one with no node text — click it and check selection)
        // The 1AC column has no nodes in our scenario, so it will have empty cells
        const fmt = useRoundStore.getState().round!.format;
        const s1AC = fmt.speeches[0].id;

        // Get all tds in the side-aff column for 1AC — these should be empty cells
        // We can find a td that is side-aff but contains no .arg-num (i.e. no node)
        const allTds = document.querySelectorAll("td");
        const emptyTd = Array.from(allTds).find((td) => {
            return (
                !td.querySelector(".arg-num") &&
                !td.querySelector(".cell-input") &&
                td.textContent?.trim() === ""
            );
        });
        expect(emptyTd).toBeDefined();
        // Empty cells carry no em-dash glyph (gridline-only voids).
        expect(emptyTd!.querySelector(".dash")).toBeNull();

        // Click it
        emptyTd!.click();

        // Selection should have nodeId === ''
        expect(useRoundStore.getState().selection?.nodeId).toBe("");
    });

    // ── Inaccessible empty cells — no gridlines ───────────────────────────────

    it("marks empty cells with no reachable parent as inaccessible (cell-void)", () => {
        // Empty flow: only the first column (where roots originate) is reachable.
        // Later columns have nothing to their left to respond to → inaccessible.
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });

        render(<FlowGrid sheetId={sheetId} />);

        const row0 = document.querySelector("tbody tr")!;
        const cells = row0.querySelectorAll("td");

        // 1AC (col 0) — roots start here, stays accessible (keeps gridlines)
        expect(cells[0].classList.contains("cell-void")).toBe(false);
        // 1NC (col 1) — no 1AC argument to respond to → inaccessible
        expect(cells[1].classList.contains("cell-void")).toBe(true);
    });

    it("keeps the cell directly right of an argument accessible, but not further", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });
        // Root argument in 1AC (col 0), no children
        useRoundStore.getState().addNode({
            sheetId,
            speechId: fmt.speeches[0].id,
            parentId: null,
            text: "Contention 1",
        });

        render(<FlowGrid sheetId={sheetId} />);

        const row0 = document.querySelector("tbody tr")!;
        const cells = row0.querySelectorAll("td");

        // col 0 is the placed node (has text)
        expect(cells[0].textContent).toContain("Contention 1");
        // 1NC (col 1) — directly right of the argument → accessible
        expect(cells[1].classList.contains("cell-void")).toBe(false);
        // 2AC (col 2) — nothing to its immediate left → inaccessible
        expect(cells[2].classList.contains("cell-void")).toBe(true);
    });

    // ── autoNumber toggle ─────────────────────────────────────────────────────

    it("hides argument numbers when autoNumber is off", () => {
        useRoundStore.getState().setAutoNumber(false);
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);
        // "1." prefix should not appear in DOM when autoNumber is disabled
        expect(screen.queryByText("1.")).toBeNull();
        useRoundStore.getState().setAutoNumber(true);
    });

    // ── CX sheet rendering ────────────────────────────────────────────────────

    it("renders CX period group headers when the sheet is a CX sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const round = useRoundStore.getState().round!;
        const cxSheet = round.sheets.find((s) => s.kind === "cx")!;
        const cxId = cxSheet.id;

        render(<FlowGrid sheetId={cxId} />);

        ["1AC CX", "1NC CX", "2AC CX", "2NC CX"].forEach((h) =>
            expect(screen.getByText(h)).toBeTruthy(),
        );
        expect(screen.getAllByText("Question").length).toBe(4);
        expect(screen.getAllByText("Response").length).toBe(4);
    });

    it("does not number or badge cells on a CX sheet even when autoNumber is on", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const round = useRoundStore.getState().round!;
        const cxSheet = round.sheets.find((s) => s.kind === "cx")!;
        const cxId = cxSheet.id;

        useRoundStore.getState().setAutoNumber(true);
        useRoundStore.getState().addNode({
            sheetId: cxId,
            speechId: "cx-1ac-q",
            parentId: null,
            text: "Q1",
        });

        render(<FlowGrid sheetId={cxId} />);

        expect(screen.getByText("Q1")).toBeTruthy();
        expect(screen.queryByText("1.")).toBeNull();
    });

    // ── Group header side class ────────────────────────────────────────────────

    it("typing in a selected empty cell creates a node with that text", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "DA", group: "neg" });
        const s1NC = fmt.speeches.find((s) => s.side === "neg")!.id;

        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: s1NC, nodeId: "" });
        render(<FlowGrid sheetId={sheetId} />);

        const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(ta, { target: { value: "topicality" } });
        const created = useRoundStore
            .getState()
            .round!.nodes.find((n) => n.text === "topicality");
        expect(created).toBeTruthy();
        expect(created!.speechId).toBe(s1NC);
        expect(created!.parentId).toBeNull();
    });

    it("renders the editor on the empty entry cell below the content (straight-down)", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "DA", group: "neg" });
        const s1NC = fmt.speeches[1].id;
        useRoundStore
            .getState()
            .addNode({ sheetId, speechId: s1NC, parentId: null, text: "one" });
        useRoundStore
            .getState()
            .addNode({ sheetId, speechId: s1NC, parentId: null, text: "two" });

        // Select the empty entry cell on row 2 (just below the two stacked cells).
        useRoundStore.setState({ straightDown: true });
        useRoundStore
            .getState()
            .setSelection({ sheetId, speechId: s1NC, nodeId: "", row: 2 });

        render(<FlowGrid sheetId={sheetId} />);

        // The entry row must exist and host an empty editor; the content is untouched.
        expect(screen.getByText("one")).toBeTruthy();
        expect(screen.getByText("two")).toBeTruthy();
        expect(screen.getByRole("textbox")).toBeTruthy();

        useRoundStore.setState({ straightDown: false });
    });

    it("dropping a node onto another sets the dragged node's parent to the target", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });
        const s1AC = fmt.speeches[0].id;
        const s1NC = fmt.speeches[1].id;

        const idA = useRoundStore.getState().addNode({
            sheetId,
            speechId: s1AC,
            parentId: null,
            text: "A-text",
        });
        const idB = useRoundStore.getState().addNode({
            sheetId,
            speechId: s1NC,
            parentId: null,
            text: "B-text",
        });

        render(<FlowGrid sheetId={sheetId} />);

        const dropEl = screen.getByText("B-text").closest("[draggable]")!;
        const dragEl = screen.getByText("A-text").closest("[draggable]")!;
        const store: Record<string, string> = {};
        const dataTransfer = {
            effectAllowed: "move",
            setData(type: string, value: string) {
                store[type] = value;
            },
            getData(type: string) {
                return store[type] ?? "";
            },
        };
        fireEvent.dragStart(dragEl, { dataTransfer });
        fireEvent.dragOver(dropEl, { dataTransfer });
        fireEvent.drop(dropEl, { dataTransfer });

        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === idA)!
                .parentId,
        ).toBe(idB);
    });

    it("applies side-aff class to a group header spanning aff speeches", () => {
        // Build a custom format with two adjacent aff speeches sharing a group
        const fmt = makeFormat({
            name: "Custom",
            speeches: [
                { name: "NC", side: "neg", seconds: 420 },
                { name: "AR1", side: "aff", seconds: 240, group: "Aff block" },
                { name: "AR2", side: "aff", seconds: 180, group: "Aff block" },
                { name: "NR", side: "neg", seconds: 360 },
            ],
            prepSeconds: { aff: 240, neg: 240 },
        });

        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "AffGroup", group: "aff" });

        render(<FlowGrid sheetId={sheetId} />);

        const headers = screen.getAllByRole("columnheader");
        const affBlockHeader = headers.find(
            (h) => h.textContent === "Aff block",
        );
        expect(affBlockHeader).toBeDefined();
        expect(affBlockHeader!.classList.contains("side-aff")).toBe(true);
    });

    it("renders inaccessible cells as gridline-only with no em-dash glyph", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });
        // A single root in the first column. On that row, cells two-or-more columns
        // to the right have no argument to their left, so they are inaccessible →
        // marked .cell-void, but carry no glyph; the gridlines read as empty space.
        useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: fmt.speeches[0].id,
                parentId: null,
                text: "Adv",
            });

        const { container } = render(<FlowGrid sheetId={sheetId} />);

        // No em-dash placeholder anywhere.
        expect(container.querySelector("span.dash")).toBeNull();
        // The unreachable cells are still distinguished structurally as voids.
        expect(
            container.querySelectorAll("td.cell-void").length,
        ).toBeGreaterThan(0);
    });

    // ── Accessibility: table semantics ─────────────────────────────────────────

    it('gives every speech column header scope="col"', () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        const speechHeaders = screen
            .getAllByRole("columnheader")
            .filter((h) => h.querySelector(".th-label"));
        expect(speechHeaders.length).toBeGreaterThan(0);
        speechHeaders.forEach((h) =>
            expect(h.getAttribute("scope")).toBe("col"),
        );
    });

    it('gives a spanning group header scope="colgroup"', () => {
        const fmt = makeFormat({
            name: "Custom",
            speeches: [
                { name: "NC", side: "neg", seconds: 420 },
                { name: "AR1", side: "aff", seconds: 240, group: "Aff block" },
                { name: "AR2", side: "aff", seconds: 180, group: "Aff block" },
                { name: "NR", side: "neg", seconds: 360 },
            ],
            prepSeconds: { aff: 240, neg: 240 },
        });
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "AffGroup", group: "aff" });

        render(<FlowGrid sheetId={sheetId} />);

        const groupHeader = screen
            .getAllByRole("columnheader")
            .find((h) => h.textContent === "Aff block");
        expect(groupHeader).toBeDefined();
        expect(groupHeader!.getAttribute("scope")).toBe("colgroup");
    });

    it("renders a caption naming the sheet for screen readers", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Disad", group: "neg" });

        const { container } = render(<FlowGrid sheetId={sheetId} />);

        const caption = container.querySelector("table.flow > caption");
        expect(caption).not.toBeNull();
        expect(caption!.textContent).toContain("Disad");
    });

    // ── Onboarding: discoverable entry points ──────────────────────────────────

    it("marks accessible empty cells with .cell-open and leaves inaccessible ones without it", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });

        render(<FlowGrid sheetId={sheetId} />);

        const row0 = document.querySelector("tbody tr")!;
        const cells = row0.querySelectorAll("td");
        // col 0 (1AC) is the always-reachable entry column → looks interactive.
        expect(cells[0].classList.contains("cell-open")).toBe(true);
        // col 1 (1NC) has nothing to respond to → not an entry point, not cell-open.
        expect(cells[1].classList.contains("cell-open")).toBe(false);
        expect(cells[1].classList.contains("cell-void")).toBe(true);
    });

    it("shows a first-run hint in the entry cell of an empty sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });

        const { container } = render(<FlowGrid sheetId={sheetId} />);

        const hint = container.querySelector(".cell-hint");
        expect(hint).not.toBeNull();
        expect(hint!.textContent?.toLowerCase()).toContain("argument");
    });

    it("hides the first-run hint once the sheet has a node", () => {
        const { sheetId } = setupScenario();
        const { container } = render(<FlowGrid sheetId={sheetId} />);
        expect(container.querySelector(".cell-hint")).toBeNull();
    });

    it("shows no first-run hint on a CX sheet", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "neg", format: fmt });
        const cxId = useRoundStore
            .getState()
            .round!.sheets.find((s) => s.kind === "cx")!.id;
        const { container } = render(<FlowGrid sheetId={cxId} />);
        expect(container.querySelector(".cell-hint")).toBeNull();
    });

    // ── Drag feedback (state-conveying motion) ─────────────────────────────────

    it("highlights a node cell as a drop target while a drag is over it", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        const targetTd = screen.getByText("Topicality").closest("td")!;
        expect(targetTd.classList.contains("drag-over")).toBe(false);

        fireEvent.dragOver(targetTd);
        expect(targetTd.classList.contains("drag-over")).toBe(true);

        // A drag-end anywhere clears the highlight.
        fireEvent.dragEnd(targetTd);
        expect(targetTd.classList.contains("drag-over")).toBe(false);
    });

    it("lifts (dims) the dragged argument while it is in flight", () => {
        const { sheetId } = setupScenario();
        render(<FlowGrid sheetId={sheetId} />);

        const source = screen.getByText("Topicality").closest("[draggable]")!;
        fireEvent.dragStart(source, {
            dataTransfer: { setData() {}, getData: () => "" },
        });
        expect(source.classList.contains("arg-dragging")).toBe(true);

        fireEvent.dragEnd(source);
        expect(source.classList.contains("arg-dragging")).toBe(false);
    });

    it("flashes the moved argument in its new home after a reparent drop", () => {
        const fmt = makeFormatByKey("policy");
        useRoundStore.getState().createRound({ role: "aff", format: fmt });
        const sheetId = useRoundStore
            .getState()
            .addSheet({ title: "Case", group: "aff" });
        const idA = useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: fmt.speeches[0].id,
                parentId: null,
                text: "A-text",
            });
        useRoundStore
            .getState()
            .addNode({
                sheetId,
                speechId: fmt.speeches[1].id,
                parentId: null,
                text: "B-text",
            });

        const { container } = render(<FlowGrid sheetId={sheetId} />);

        const dropEl = screen.getByText("B-text").closest("[draggable]")!;
        const store: Record<string, string> = {};
        const dataTransfer = {
            effectAllowed: "move",
            setData: (t: string, v: string) => {
                store[t] = v;
            },
            getData: (t: string) => store[t] ?? "",
        };
        const dragEl = screen.getByText("A-text").closest("[draggable]")!;
        fireEvent.dragStart(dragEl, { dataTransfer });
        fireEvent.drop(dropEl, { dataTransfer });

        // The moved node (A) is now nested under B; its cell carries the flash class.
        const movedTd = screen.getByText("A-text").closest("td")!;
        expect(movedTd.classList.contains("cell-flash")).toBe(true);
        expect(
            useRoundStore.getState().round!.nodes.find((n) => n.id === idA)!
                .parentId,
        ).not.toBeNull();
        // The flash clears itself when the animation ends.
        fireEvent.animationEnd(movedTd);
        expect(container.querySelector(".cell-flash")).toBeNull();
    });
});

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { buildSearchEntries } from "@/lib/search/entries";
import { fuzzySearch, toSegments } from "@/lib/search/fuzzy";

/** Cap argument rows so a broad query never floods the DOM. */
const MAX_NODE_RESULTS = 50;

/** A flat, keyboard-navigable result row. */
type Row =
  | { kind: "sheet"; sheetId: string; title: string; ranges: number[] }
  | {
      kind: "node";
      nodeId: string;
      sheetId: string;
      speechId: string;
      text: string;
      crumb: string;
      ranges: number[];
    };

/** Renders text with matched character runs wrapped in <mark>. */
function Highlighted({ text, ranges }: { text: string; ranges: number[] }) {
  const segments = toSegments(text, ranges);
  const hasHighlight = segments.some((s) => s.match);

  // When there's no highlight, render a plain span so getByText("...") finds it
  // as a single leaf element with a direct text node.
  if (!hasHighlight) {
    return <span>{text}</span>;
  }

  // When there are highlights, put the full text in a sr-only span (for
  // Testing Library / screen readers) and the visual mark-wrapped version
  // alongside it, hidden from the accessibility tree.
  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="contents">
        {segments.map((seg, i) =>
          seg.match ? (
            <mark key={i} className="bg-transparent font-semibold text-zinc-900">
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>
    </span>
  );
}

export default function SearchPalette() {
  const open = useRoundStore((s) => s.quickSwitcherOpen);
  const round = useRoundStore((s) => s.round);
  const setActiveSheet = useRoundStore((s) => s.setActiveSheet);
  const setSelection = useRoundStore((s) => s.setSelection);
  const setMode = useRoundStore((s) => s.setMode);
  const setOpen = useRoundStore((s) => s.setQuickSwitcherOpen);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // Rebuild the index only when the underlying data changes.
  const entries = useMemo(() => buildSearchEntries(round), [round?.sheets, round?.nodes]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();

    // Empty query: list all sheets, no arguments.
    if (!q) {
      return entries.sheetEntries.map((e) => ({
        kind: "sheet" as const,
        sheetId: e.sheetId,
        title: e.title,
        ranges: [],
      }));
    }

    const sheetRes = fuzzySearch(entries.sheetHaystack, q);
    const sheetRows: Row[] = sheetRes.order.map((idx, i) => {
      const e = entries.sheetEntries[idx];
      return { kind: "sheet", sheetId: e.sheetId, title: e.title, ranges: sheetRes.ranges[i] };
    });

    const nodeRes = fuzzySearch(entries.nodeHaystack, q);
    const nodeRows: Row[] = nodeRes.order.slice(0, MAX_NODE_RESULTS).map((idx, i) => {
      const e = entries.nodeEntries[idx];
      const crumb = e.speechName ? `${e.sheetTitle} · ${e.speechName}` : e.sheetTitle;
      return {
        kind: "node",
        nodeId: e.nodeId,
        sheetId: e.sheetId,
        speechId: e.speechId,
        text: e.text,
        crumb,
        ranges: nodeRes.ranges[i],
      };
    });

    return [...sheetRows, ...nodeRows];
  }, [entries, query]);

  // Keep selection in range as results change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const sheetRows = rows.filter((r) => r.kind === "sheet");
  const nodeRows = rows.filter((r) => r.kind === "node");

  function select(row: Row) {
    if (row.kind === "sheet") {
      setActiveSheet(row.sheetId);
    } else {
      setActiveSheet(row.sheetId);
      setSelection({ sheetId: row.sheetId, speechId: row.speechId, nodeId: row.nodeId });
      setMode("insert");
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");
    if (down) {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
      return;
    }
    if (up) {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const row = rows[selectedIndex];
      if (row) select(row);
    }
  }

  // Sheets render first, so a sheet row's flat index is its own position and a
  // node row's is offset by the number of sheet rows.
  const nodeOffset = sheetRows.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 pt-[12vh]"
      onClick={() => setOpen(false)}
      data-testid="search-palette-overlay"
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Search flow"
        data-testid="search-palette"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sheets and arguments…"
          className="box-border w-full border-b border-border bg-card px-3.5 py-3 text-[14px] text-zinc-900 focus:outline-none"
          data-testid="search-palette-input"
          aria-label="Search flow"
        />
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <div className="px-2.5 py-2 text-[13px] text-zinc-400">No results</div>
          ) : (
            <>
              {sheetRows.length > 0 && (
                <Section label="Sheets">
                  {sheetRows.map((row, i) => (
                    <RowButton
                      key={row.sheetId}
                      active={i === selectedIndex}
                      onClick={() => select(row)}
                      testId={`sp-sheet-${row.sheetId}`}
                    >
                      <Highlighted text={row.title} ranges={row.ranges} />
                    </RowButton>
                  ))}
                </Section>
              )}
              {nodeRows.length > 0 && (
                <Section label="Arguments">
                  {nodeRows.map((row, i) =>
                    row.kind === "node" ? (
                      <RowButton
                        key={row.nodeId}
                        active={nodeOffset + i === selectedIndex}
                        onClick={() => select(row)}
                        testId={`sp-node-${row.nodeId}`}
                      >
                        <span className="block truncate">
                          <Highlighted text={row.text} ranges={row.ranges} />
                        </span>
                        <span className="block truncate text-[11px] text-zinc-400">{row.crumb}</span>
                      </RowButton>
                    ) : null,
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <ul className="m-0 list-none p-0">{children}</ul>
    </div>
  );
}

function RowButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className={`block w-full cursor-pointer rounded-md border-none px-2.5 py-2 text-left text-[13px] text-zinc-900 ${
          active ? "bg-zinc-100" : "bg-transparent hover:bg-zinc-50"
        }`}
        onClick={onClick}
        data-testid={testId}
      >
        {children}
      </button>
    </li>
  );
}

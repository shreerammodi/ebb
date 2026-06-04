"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";

export default function QuickSwitcher() {
  const open = useRoundStore((s) => s.quickSwitcherOpen);
  const round = useRoundStore((s) => s.round);
  const setActiveSheet = useRoundStore((s) => s.setActiveSheet);
  const setOpen = useRoundStore((s) => s.setQuickSwitcherOpen);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const all = round?.sheets ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((s) => s.title.toLowerCase().includes(q)) : all;
  }, [round?.sheets, query]);

  if (!open) return null;

  function select(sheetId: string) {
    setActiveSheet(sheetId);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const first = filtered[0];
      if (first) select(first.id);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 pt-[12vh]"
      onClick={() => setOpen(false)}
      data-testid="quick-switcher-overlay"
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        data-testid="quick-switcher"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to sheet…"
          className="box-border w-full border-b border-none border-border bg-card px-3.5 py-3 text-[14px] text-zinc-900 focus:outline-none"
          data-testid="quick-switcher-input"
          aria-label="Filter sheets"
        />
        <ul className="m-0 max-h-[50vh] list-none overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-[13px] text-zinc-400">No matching sheets</li>
          ) : (
            filtered.map((sheet) => (
              <li key={sheet.id}>
                <button
                  type="button"
                  className="block w-full cursor-pointer rounded-md border-none bg-transparent px-2.5 py-2 text-left text-[13px] text-zinc-900 hover:bg-zinc-50"
                  onClick={() => select(sheet.id)}
                  data-testid={`qs-sheet-${sheet.id}`}
                >
                  {sheet.title}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

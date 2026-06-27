"use client";

import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  useRoundStore,
  selectSheetsByGroup,
  selectSheetDropCount,
} from "@/lib/store/useRoundStore";
import { executeCommand } from "@/lib/commands/commands";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Sheet } from "@/lib/model/types";

interface GroupConfig {
  group: "aff" | "neg";
  label: string;
}

const GROUPS: GroupConfig[] = [
  { group: "aff", label: "Aff" },
  { group: "neg", label: "Neg" },
];

export default function Sidebar() {
  const round = useRoundStore((s) => s.round);
  const activeSheetId = useRoundStore((s) => s.activeSheetId);
  const setActiveSheet = useRoundStore((s) => s.setActiveSheet);
  const renamingSheetId = useRoundStore((s) => s.renamingSheetId);
  const setRenamingSheet = useRoundStore((s) => s.setRenamingSheet);
  const labelDrops = useRoundStore((s) => s.labelDrops);
  const removeSheet = useRoundStore((s) => s.removeSheet);
  const restoreSheet = useRoundStore((s) => s.restoreSheet);

  if (!round) return null;

  // Deleting a sheet wipes a whole column of a live round, so it must be
  // reversible at the point of action — not only via a keyboard Undo the user
  // may not know about. Mirror the dashboard's soft-delete + Undo toast.
  function deleteSheet(sheetId: string) {
    const removed = removeSheet(sheetId);
    if (!removed) return;
    toast(`Deleted “${removed.sheet.title}”`, {
      action: {
        label: "Undo",
        onClick: () => restoreSheet(removed),
      },
    });
  }

  const cxSheet = round.sheets.find((s) => s.kind === "cx") ?? null;

  return (
    <nav
      className="no-print flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-card"
      aria-label="Sheets"
      data-testid="sidebar"
    >
      <div className="flex shrink-0 gap-1 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => executeCommand("sheet.newAff")}
          data-testid="add-aff"
        >
          + Aff
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => executeCommand("sheet.newNeg")}
          data-testid="add-neg"
        >
          + Neg
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {cxSheet && (
          <div className="mb-3">
            <div
              data-testid="cx-section-label"
              className="px-2 pb-1 font-mono text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              CX
            </div>
            <button
              type="button"
              onClick={() => setActiveSheet(cxSheet.id)}
              aria-current={cxSheet.id === activeSheetId ? "true" : undefined}
              data-testid="cx-sheet-row"
              className={cn(
                "flex w-full items-center rounded-md border px-2 py-1.5 text-left text-[13px] text-foreground transition-colors",
                cxSheet.id === activeSheetId
                  ? "border-border bg-accent font-semibold text-foreground"
                  : "border-transparent hover:bg-accent/50",
              )}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {cxSheet.title}
              </span>
            </button>
          </div>
        )}
        {GROUPS.map(({ group, label }) => {
          const sheets = selectSheetsByGroup(round, group).filter((s) => s.kind !== "cx");
          return (
            <div key={group} className="mb-3">
              <div className="px-2 pb-1 font-mono text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
                {label}
              </div>
              {sheets.length === 0 ? (
                <div className="px-2 py-1 text-xs text-muted-foreground">No sheets</div>
              ) : (
                sheets.map((sheet) => (
                  <SheetRow
                    key={sheet.id}
                    sheet={sheet}
                    dropCount={labelDrops ? selectSheetDropCount(round, sheet.id) : 0}
                    active={sheet.id === activeSheetId}
                    onSelect={() => setActiveSheet(sheet.id)}
                    isRenaming={sheet.id === renamingSheetId}
                    onStartRename={() => setRenamingSheet(sheet.id)}
                    onDelete={() => deleteSheet(sheet.id)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

interface SheetRowProps {
  sheet: Sheet;
  dropCount: number;
  active: boolean;
  onSelect: () => void;
  isRenaming: boolean;
  onStartRename: () => void;
  onDelete: () => void;
}

function SheetRow({
  sheet,
  dropCount,
  active,
  onSelect,
  isRenaming,
  onStartRename,
  onDelete,
}: SheetRowProps) {
  const renameSheet = useRoundStore((s) => s.renameSheet);
  const setRenamingSheet = useRoundStore((s) => s.setRenamingSheet);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(sheet.title);

  useEffect(() => {
    if (isRenaming) {
      setValue(sheet.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, sheet.title]);

  function commit() {
    renameSheet(sheet.id, value.trim() || sheet.title);
    setRenamingSheet(null);
  }

  function cancel() {
    setRenamingSheet(null);
  }

  if (isRenaming) {
    return (
      <div
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5",
          active ? "border-border bg-accent font-semibold" : "border-transparent",
        )}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              commit();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              cancel();
            }
          }}
          onBlur={commit}
          className="flex-1 rounded-sm border-none bg-transparent px-0.5 font-[inherit] text-[13px] text-foreground outline outline-1 outline-aff"
          data-testid={`rename-input-${sheet.id}`}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onDoubleClick={onStartRename}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-current={active ? "true" : undefined}
        data-testid={`sheet-${sheet.id}`}
        className={cn(
          "flex w-full flex-1 cursor-pointer items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-left text-[13px] text-foreground transition-colors",
          active
            ? "border-border bg-accent font-semibold text-foreground"
            : "border-transparent hover:bg-accent/50",
        )}
      >
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{sheet.title}</span>
        {dropCount > 0 && (
          <span className="badge-drop" data-testid={`drop-badge-${sheet.id}`}>
            {dropCount}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label="Delete sheet"
        data-testid={`delete-sheet-${sheet.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="cursor-pointer rounded px-1 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

'use client';

import { useRef, useState, useEffect } from 'react';
import { useRoundStore, selectSheetsByGroup, selectSheetDropCount } from '@/lib/store/useRoundStore';
import { executeCommand } from '@/lib/commands/commands';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Sheet } from '@/lib/model/types';

interface GroupConfig {
  group: 'aff' | 'neg';
  label: string;
}

const GROUPS: GroupConfig[] = [
  { group: 'aff', label: 'Aff' },
  { group: 'neg', label: 'Neg' },
];

export default function Sidebar() {
  const round            = useRoundStore(s => s.round);
  const activeSheetId    = useRoundStore(s => s.activeSheetId);
  const setActiveSheet   = useRoundStore(s => s.setActiveSheet);
  const renamingSheetId  = useRoundStore(s => s.renamingSheetId);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);
  const labelDrops       = useRoundStore(s => s.labelDrops);
  const removeSheet      = useRoundStore(s => s.removeSheet);

  if (!round) return null;

  const cxSheet = round.sheets.find(s => s.kind === 'cx') ?? null;

  return (
    <nav
      className="no-print flex flex-col w-[220px] shrink-0 h-full bg-card border-r border-border"
      aria-label="Sheets"
      data-testid="sidebar"
    >
      <div className="flex-1 overflow-y-auto p-2">
        {cxSheet && (
          <div className="mb-3">
            <div
              data-testid="cx-section-label"
              className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400 px-2 pb-1"
            >
              CX
            </div>
            <button
              type="button"
              onClick={() => setActiveSheet(cxSheet.id)}
              aria-current={cxSheet.id === activeSheetId ? 'true' : undefined}
              data-testid="cx-sheet-row"
              className={cn(
                'flex items-center w-full text-left text-[13px] px-2 py-1.5 rounded-md border transition-colors',
                cxSheet.id === activeSheetId
                  ? 'bg-zinc-100 border-zinc-200 font-semibold text-zinc-900'
                  : 'border-transparent hover:bg-zinc-50 text-zinc-700',
              )}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{cxSheet.title}</span>
            </button>
          </div>
        )}
        {GROUPS.map(({ group, label }) => {
          const sheets = selectSheetsByGroup(round, group).filter(s => s.kind !== 'cx');
          return (
            <div key={group} className="mb-3">
              <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400 px-2 pb-1">
                {label}
              </div>
              {sheets.length === 0 ? (
                <div className="text-zinc-400 text-xs px-2 py-1">No sheets</div>
              ) : (
                sheets.map(sheet => (
                  <SheetRow
                    key={sheet.id}
                    sheet={sheet}
                    dropCount={labelDrops ? selectSheetDropCount(round, sheet.id) : 0}
                    active={sheet.id === activeSheetId}
                    onSelect={() => setActiveSheet(sheet.id)}
                    isRenaming={sheet.id === renamingSheetId}
                    onStartRename={() => setRenamingSheet(sheet.id)}
                    onDelete={() => removeSheet(sheet.id)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 p-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => executeCommand('sheet.newAff')}
          data-testid="add-aff"
        >
          + Aff
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => executeCommand('sheet.newNeg')}
          data-testid="add-neg"
        >
          + Neg
        </Button>
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

function SheetRow({ sheet, dropCount, active, onSelect, isRenaming, onStartRename, onDelete }: SheetRowProps) {
  const renameSheet      = useRoundStore(s => s.renameSheet);
  const setRenamingSheet = useRoundStore(s => s.setRenamingSheet);
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
      <div className={cn(
        'flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md border',
        active ? 'bg-zinc-100 border-zinc-200 font-semibold' : 'border-transparent',
      )}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.stopPropagation(); commit(); }
            if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
          }}
          onBlur={commit}
          className="flex-1 text-[13px] text-zinc-900 bg-transparent border-none outline outline-1 outline-aff rounded-sm px-0.5 font-[inherit]"
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
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
        aria-current={active ? 'true' : undefined}
        data-testid={`sheet-${sheet.id}`}
        className={cn(
          'flex flex-1 items-center justify-between gap-1.5 w-full text-left text-[13px] text-zinc-700 px-2 py-1.5 rounded-md border transition-colors cursor-pointer',
          active
            ? 'bg-zinc-100 border-zinc-200 font-semibold text-zinc-900'
            : 'border-transparent hover:bg-zinc-50',
        )}
      >
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{sheet.title}</span>
        {dropCount > 0 && (
          <span className="badge-drop" data-testid={`drop-badge-${sheet.id}`}>
            {dropCount}
          </span>
        )}
      </div>
      <span
        role="button"
        aria-label="Delete sheet"
        data-testid={`delete-sheet-${sheet.id}`}
        onClick={e => { e.stopPropagation(); onDelete(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDelete(); } }}
        tabIndex={0}
        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 px-1 cursor-pointer"
      >×</span>
    </div>
  );
}

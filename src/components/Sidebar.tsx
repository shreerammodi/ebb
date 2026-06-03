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

  if (!round) return null;

  return (
    <nav
      className="no-print flex flex-col w-[220px] shrink-0 h-full bg-card border-r border-border"
      aria-label="Sheets"
      data-testid="sidebar"
    >
      <div className="flex-1 overflow-y-auto p-2">
        {GROUPS.map(({ group, label }) => {
          const sheets = selectSheetsByGroup(round, group);
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
                    dropCount={selectSheetDropCount(round, sheet.id)}
                    active={sheet.id === activeSheetId}
                    onSelect={() => setActiveSheet(sheet.id)}
                    isRenaming={sheet.id === renamingSheetId}
                    onStartRename={() => setRenamingSheet(sheet.id)}
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
}

function SheetRow({ sheet, dropCount, active, onSelect, isRenaming, onStartRename }: SheetRowProps) {
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
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      aria-current={active ? 'true' : undefined}
      data-testid={`sheet-${sheet.id}`}
      className={cn(
        'flex items-center justify-between gap-1.5 w-full text-left text-[13px] text-zinc-700 px-2 py-1.5 rounded-md border transition-colors',
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
    </button>
  );
}

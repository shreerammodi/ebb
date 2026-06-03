'use client';

import { useRoundStore } from '@/lib/store/useRoundStore';
import { COMMANDS, type CommandId } from '@/lib/commands/registry';
import { effectiveKeymap } from '@/lib/keymap/useKeymap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const GROUPS = [
  { label: 'Navigate', rows: [{ commandId: 'move.up' as CommandId }, { commandId: 'move.down' as CommandId }, { commandId: 'move.left' as CommandId }, { commandId: 'move.right' as CommandId }] },
  { label: 'Edit', rows: [{ commandId: 'edit.enter' as CommandId }, { commandId: 'edit.exit' as CommandId, insertMode: true }, { commandId: 'node.addAnswer' as CommandId }, { commandId: 'node.answerAcross' as CommandId }, { commandId: 'arg.newRoot' as CommandId }, { commandId: 'node.delete' as CommandId }] },
  { label: 'Status', rows: [{ commandId: 'status.toggleConceded' as CommandId }, { commandId: 'status.toggleExtended' as CommandId }] },
  { label: 'Sheets', rows: [{ commandId: 'sheet.prev' as CommandId }, { commandId: 'sheet.next' as CommandId }, { commandId: 'sheet.quickSwitch' as CommandId }, { commandId: 'sheet.newAff' as CommandId }, { commandId: 'sheet.newNeg' as CommandId }, { commandId: 'sheet.rename' as CommandId }, { commandId: 'sheet.jump1' as CommandId }] },
  { label: 'Timers', rows: [{ commandId: 'timer.toggleSpeech' as CommandId }, { commandId: 'timer.togglePrepAff' as CommandId }, { commandId: 'timer.togglePrepNeg' as CommandId }] },
  { label: 'App', rows: [{ commandId: 'settings.open' as CommandId }, { commandId: 'help.open' as CommandId }] },
] as const;

const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '↩', Delete: 'Del', Backspace: '⌫', Tab: '⇥',
};

function prettyChord(chord: string): string {
  return chord.split('+').map(part => {
    if (part === 'Meta') return '⌘';
    if (part === 'Ctrl') return '⌃';
    if (part === 'Alt') return '⌥';
    if (part === 'Shift') return '⇧';
    return KEY_LABELS[part] ?? part;
  }).join('');
}

export default function KeybindingsCheatsheet() {
  const open = useRoundStore(s => s.cheatsheetOpen);
  const setCheatsheetOpen = useRoundStore(s => s.setCheatsheetOpen);

  function close() { setCheatsheetOpen(false); }

  const keymap = effectiveKeymap();
  const normalBindings = keymap.bindings.normal;
  const insertBindings = keymap.bindings.insert;

  const chordFor: Partial<Record<CommandId, string>> = {};
  for (const [chord, cmd] of Object.entries(normalBindings)) {
    if (!chordFor[cmd as CommandId]) chordFor[cmd as CommandId] = chord;
  }
  for (const [chord, cmd] of Object.entries(insertBindings)) {
    if (!chordFor[cmd as CommandId]) chordFor[cmd as CommandId] = chord;
  }

  return (
    <Dialog open={open} onOpenChange={val => { if (!val) close(); }}>
      <DialogContent
        className="max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden p-0"
        data-testid="cheatsheet-panel"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === '?') { e.preventDefault(); e.stopPropagation(); close(); }
        }}
      >
        <DialogHeader className="px-[18px] pt-[14px] pb-2.5 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold text-zinc-900">Keyboard shortcuts</DialogTitle>
        </DialogHeader>

        <div
          className="overflow-y-auto px-[18px] py-3 grid gap-4"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          {GROUPS.map(group => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-1">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.rows.map((row) => {
                  const { commandId } = row;
                  const insertMode = 'insertMode' in row ? row.insertMode : undefined;
                  const chord = chordFor[commandId];
                  const isJumpAnchor = commandId === 'sheet.jump1';
                  if (!chord && !isJumpAnchor) return null;
                  const displayChord = isJumpAnchor
                    ? prettyChord(chord ?? 'Meta+1').replace('1', '1–9')
                    : prettyChord(chord!);
                  const label = isJumpAnchor ? 'Jump to sheet 1–9' : COMMANDS[commandId].label;

                  return (
                    <div key={commandId} className="flex items-center gap-2">
                      <kbd className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-px bg-zinc-50 border border-zinc-200 border-b-2 rounded font-mono text-[12px] text-zinc-900 shrink-0 whitespace-nowrap">
                        {displayChord}
                      </kbd>
                      <span className="text-[12px] text-zinc-700 flex items-center gap-1">
                        {label}
                        {insertMode && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-50 border border-zinc-200 rounded px-1 leading-4">
                            insert
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

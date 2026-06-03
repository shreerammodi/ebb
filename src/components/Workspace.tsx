'use client';

import { useEffect } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { useKeymap } from '@/lib/keymap/useKeymap';
import RoundHeader from './RoundHeader';
import Sidebar from './Sidebar';
import QuickSwitcher from './QuickSwitcher';
import SettingsPanel from './SettingsPanel';
import InfoPanel from './InfoPanel';
import KeybindingsCheatsheet from './KeybindingsCheatsheet';
import FlowGrid from './FlowGrid';
import CxSheet from './CxSheet';
import PrintView from './PrintView';

export default function Workspace() {
  useKeymap();

  const activeSheetId = useRoundStore(s => s.activeSheetId);
  const round = useRoundStore(s => s.round);
  const activeSheet = round?.sheets.find(s => s.id === activeSheetId) ?? null;

  useEffect(() => {
    const { round, selection, mode } = useRoundStore.getState();
    if (!activeSheetId || !round || mode === 'insert') return;
    const sheet = round.sheets.find(s => s.id === activeSheetId);
    if (sheet?.kind === 'cx') return;
    if (selection?.sheetId === activeSheetId && selection.nodeId !== '') return;

    const sheetNodes = round.nodes
      .filter(n => n.sheetId === activeSheetId)
      .sort((a, b) => {
        const colA = round.format.speeches.findIndex(s => s.id === a.speechId);
        const colB = round.format.speeches.findIndex(s => s.id === b.speechId);
        return colA !== colB ? colA - colB : a.order - b.order;
      });

    if (sheetNodes.length > 0) {
      const first = sheetNodes[0];
      useRoundStore.getState().setSelection({ sheetId: first.sheetId, speechId: first.speechId, nodeId: first.id });
    } else {
      useRoundStore.getState().setSelection(null);
    }
  }, [activeSheetId]);

  return (
    <div className="flex flex-col h-screen bg-zinc-50" data-testid="workspace">
      <RoundHeader />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto p-4" data-testid="workspace-content">
          {activeSheet?.kind === 'cx' ? (
            <CxSheet />
          ) : activeSheetId ? (
            <FlowGrid sheetId={activeSheetId} />
          ) : (
            <div className="text-zinc-400 text-[13px] p-6">No sheet selected</div>
          )}
        </main>
      </div>
      <QuickSwitcher />
      <SettingsPanel />
      <InfoPanel />
      <KeybindingsCheatsheet />
      <PrintView />
    </div>
  );
}

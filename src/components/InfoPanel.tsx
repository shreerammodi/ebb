'use client';

import { useRoundStore } from '@/lib/store/useRoundStore';
import { teamCode } from '@/lib/model/teamCode';
import { Input } from '@/components/ui/input';

export default function InfoPanel() {
  const open = useRoundStore(s => s.infoOpen);
  const round = useRoundStore(s => s.round);
  const setInfoOpen = useRoundStore(s => s.setInfoOpen);
  const setScouting = useRoundStore(s => s.setScouting);

  if (!open || !round) return null;
  const sc = round.scouting;

  const affCode = teamCode(sc.affSchool ?? '', sc.aff.first, sc.aff.second);
  const negCode = teamCode(sc.negSchool ?? '', sc.neg.first, sc.neg.second);

  function close() { setInfoOpen(false); }

  return (
    <div className="fixed inset-0 flex items-start justify-center pt-[8vh] bg-black/30 z-[200]"
      onClick={close} data-testid="info-overlay">
      <div className="w-full max-w-[640px] max-h-[84vh] flex flex-col overflow-y-auto bg-card border border-border rounded-[var(--radius)] shadow-lg outline-none"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
        role="dialog" aria-modal="true" aria-label="Round info" data-testid="info-panel" tabIndex={-1}>

        <div className="flex items-center justify-between px-3.5 py-3 border-b border-border">
          <span className="text-[13px] font-semibold tracking-wide text-zinc-900">Round Info</span>
          <button type="button" onClick={close} aria-label="Close info" data-testid="info-close"
            className="text-[13px] text-zinc-400 px-1.5 py-0.5 rounded hover:text-zinc-600">✕</button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-aff">Aff — {affCode || '—'}</div>
            <Input data-testid="scout-affSchool" placeholder="Aff school" value={sc.affSchool ?? ''}
              onChange={e => setScouting({ affSchool: e.target.value })} />
            <DebaterRow label="1A" value={sc.aff.first}
              onChange={d => setScouting({ aff: { ...sc.aff, first: d } })} testid="scout-aff-1a" />
            <DebaterRow label="2A" value={sc.aff.second}
              onChange={d => setScouting({ aff: { ...sc.aff, second: d } })} testid="scout-aff-2a" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-neg">Neg — {negCode || '—'}</div>
            <Input data-testid="scout-negSchool" placeholder="Neg school" value={sc.negSchool ?? ''}
              onChange={e => setScouting({ negSchool: e.target.value })} />
            <DebaterRow label="1N" value={sc.neg.first}
              onChange={d => setScouting({ neg: { ...sc.neg, first: d } })} testid="scout-neg-1n" />
            <DebaterRow label="2N" value={sc.neg.second}
              onChange={d => setScouting({ neg: { ...sc.neg, second: d } })} testid="scout-neg-2n" />
          </div>
        </div>

        <div className="px-4 pb-3 grid grid-cols-2 gap-3">
          <Input data-testid="scout-tournament" placeholder="Tournament" value={sc.tournament ?? ''}
            onChange={e => setScouting({ tournament: e.target.value })} />
          <Input data-testid="scout-round" placeholder="Round" value={sc.round ?? ''}
            onChange={e => setScouting({ round: e.target.value })} />
          <Input data-testid="scout-date" placeholder="Date" value={sc.date ?? ''}
            onChange={e => setScouting({ date: e.target.value })} />
          <Input data-testid="scout-judge" placeholder="Judge" value={sc.judge ?? ''}
            onChange={e => setScouting({ judge: e.target.value })} />
        </div>

        <div className="px-4 pb-4 flex flex-col gap-2">
          <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400">Decision</div>
          <div className="flex gap-3 text-[13px]" role="group" aria-label="Vote">
            <label className="flex items-center gap-1">
              <input type="radio" name="vote" checked={sc.decision?.vote === 'aff'}
                onChange={() => setScouting({ decision: { ...sc.decision, vote: 'aff' } })} data-testid="scout-vote-aff" /> Aff
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="vote" checked={sc.decision?.vote === 'neg'}
                onChange={() => setScouting({ decision: { ...sc.decision, vote: 'neg' } })} data-testid="scout-vote-neg" /> Neg
            </label>
          </div>
          <textarea className="cell-input border border-border rounded p-2 text-[13px]" rows={3} placeholder="RFD"
            value={sc.decision?.rfd ?? ''} data-testid="scout-rfd"
            onChange={e => setScouting({ decision: { ...sc.decision, rfd: e.target.value } })} />
        </div>
      </div>
    </div>
  );
}

function DebaterRow({ label, value, onChange, testid }: {
  label: string; value: { first: string; last: string };
  onChange: (d: { first: string; last: string }) => void; testid: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[11px] text-zinc-400">{label}</span>
      <Input data-testid={`${testid}-first`} placeholder="First" value={value.first}
        onChange={e => onChange({ ...value, first: e.target.value })} />
      <Input data-testid={`${testid}-last`} placeholder="Last" value={value.last}
        onChange={e => onChange({ ...value, last: e.target.value })} />
    </div>
  );
}

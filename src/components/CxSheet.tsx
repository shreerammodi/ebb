'use client';

import { useRoundStore } from '@/lib/store/useRoundStore';
import type { CxPeriod } from '@/lib/model/types';
import { Button } from '@/components/ui/button';

const PERIODS: CxPeriod[] = ['1AC', '1NC', '2AC', '2NC'];

export default function CxSheet() {
  const round = useRoundStore(s => s.round);
  const addCxRow = useRoundStore(s => s.addCxRow);
  const updateCxRow = useRoundStore(s => s.updateCxRow);
  const removeCxRow = useRoundStore(s => s.removeCxRow);
  if (!round) return null;

  return (
    <div className="grid grid-cols-4 gap-4" data-testid="cx-sheet">
      {PERIODS.map(period => (
        <div key={period} className="flex flex-col gap-2">
          <div className="text-center font-semibold text-[0.9rem]">{period} CX</div>
          {round.cx[period].map(row => (
            <div key={row.id} className="flex flex-col gap-1 border border-border rounded p-1.5">
              <input className="cell-input text-[13px]" placeholder="Question" value={row.question}
                onChange={e => updateCxRow(period, row.id, { question: e.target.value })}
                data-testid={`cx-q-${row.id}`} />
              <input className="cell-input text-[13px]" placeholder="Response" value={row.response}
                onChange={e => updateCxRow(period, row.id, { response: e.target.value })}
                data-testid={`cx-r-${row.id}`} />
              <button type="button" className="text-[11px] text-zinc-400 self-end hover:text-zinc-600"
                onClick={() => removeCxRow(period, row.id)} aria-label="Remove row">✕</button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm"
            onClick={() => addCxRow(period)} data-testid={`cx-add-${period}`}>+ Q/A</Button>
        </div>
      ))}
    </div>
  );
}

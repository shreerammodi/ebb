'use client';

import { useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey, FORMAT_PRESETS } from '@/lib/format/presets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Role } from '@/lib/model/types';
import type { PresetKey } from '@/lib/format/presets';

export default function RoundSetup() {
  const createRound = useRoundStore(s => s.createRound);
  const addSheet    = useRoundStore(s => s.addSheet);

  const [role, setRole]             = useState<Role>('aff');
  const [formatKey, setFormatKey]   = useState<PresetKey>('policy');
  const [topic, setTopic]           = useState('');
  const [opponent, setOpponent]     = useState('');
  const [affName, setAffName]       = useState('');
  const [negName, setNegName]       = useState('');
  const [tournament, setTournament] = useState('');
  const [roundLabel, setRoundLabel] = useState('');
  const [judge, setJudge]           = useState('');

  const isJudge = role === 'judge';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const meta = isJudge
      ? { affName: affName.trim() || undefined, negName: negName.trim() || undefined,
          tournament: tournament.trim() || undefined, roundLabel: roundLabel.trim() || undefined }
      : { opponent: opponent.trim() || undefined, tournament: tournament.trim() || undefined,
          roundLabel: roundLabel.trim() || undefined, judge: judge.trim() || undefined };
    createRound({ role, format: makeFormatByKey(formatKey), meta, topic: topic.trim() || undefined });
    addSheet({ title: 'Aff', group: 'aff' });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <Card className="w-full max-w-[440px]" data-testid="round-setup-form">
        <CardHeader className="pb-0">
          <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            New Round
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-4">

            {/* Role */}
            <fieldset className="flex flex-col gap-2">
              <legend className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                Role
              </legend>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Role">
                {(['aff', 'neg', 'judge'] as Role[]).map(r => (
                  <Button
                    key={r}
                    type="button"
                    variant={role === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    data-testid={`role-${r}`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Button>
                ))}
              </div>
            </fieldset>

            {/* Format */}
            <fieldset className="flex flex-col gap-2">
              <legend className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                Format
              </legend>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Format">
                {FORMAT_PRESETS.map(({ key, label }) => (
                  <Button
                    key={key}
                    type="button"
                    variant={formatKey === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormatKey(key)}
                    aria-pressed={formatKey === key}
                    data-testid={`format-${key}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>

            {/* Topic */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rs-topic" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Topic (optional)
              </Label>
              <Input
                id="rs-topic"
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Resolved: …"
              />
            </div>

            {/* Judge-specific fields */}
            {isJudge && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rs-affName" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                    Aff team name
                  </Label>
                  <Input
                    id="rs-affName"
                    type="text"
                    value={affName}
                    onChange={e => setAffName(e.target.value)}
                    placeholder="Aff team"
                    data-testid="field-affName"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rs-negName" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                    Neg team name
                  </Label>
                  <Input
                    id="rs-negName"
                    type="text"
                    value={negName}
                    onChange={e => setNegName(e.target.value)}
                    placeholder="Neg team"
                    data-testid="field-negName"
                  />
                </div>
              </>
            )}

            {/* Competitor-specific field */}
            {!isJudge && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rs-opponent" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                  Opponent
                </Label>
                <Input
                  id="rs-opponent"
                  type="text"
                  value={opponent}
                  onChange={e => setOpponent(e.target.value)}
                  placeholder="Opponent team"
                  data-testid="field-opponent"
                />
              </div>
            )}

            {/* Shared optional fields */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rs-tournament" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Tournament (optional)
              </Label>
              <Input
                id="rs-tournament"
                type="text"
                value={tournament}
                onChange={e => setTournament(e.target.value)}
                placeholder="Tournament name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rs-roundLabel" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Round (optional)
              </Label>
              <Input
                id="rs-roundLabel"
                type="text"
                value={roundLabel}
                onChange={e => setRoundLabel(e.target.value)}
                placeholder="e.g. Round 3, Octos"
              />
            </div>

            {!isJudge && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rs-judge" className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                  Judge (optional)
                </Label>
                <Input
                  id="rs-judge"
                  type="text"
                  value={judge}
                  onChange={e => setJudge(e.target.value)}
                  placeholder="Judge name"
                  data-testid="field-judge"
                />
              </div>
            )}

            <Button type="submit" className="mt-1 self-end" data-testid="submit">
              Start Round
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

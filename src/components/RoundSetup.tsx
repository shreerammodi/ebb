'use client';

/**
 * RoundSetup — first-screen form shown when there is no active round.
 *
 * Collects role, format, optional topic, and context-dependent participant
 * names, then calls createRound + addSheet to bootstrap the flow session.
 */

import { useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { makeFormatByKey, FORMAT_PRESETS } from '@/lib/format/presets';
import type { Role } from '@/lib/model/types';
import type { PresetKey } from '@/lib/format/presets';

// ─── Component ────────────────────────────────────────────────────────────────

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
      ? { affName: affName.trim() || undefined,
          negName: negName.trim() || undefined,
          tournament: tournament.trim() || undefined,
          roundLabel: roundLabel.trim() || undefined }
      : { opponent: opponent.trim() || undefined,
          tournament: tournament.trim() || undefined,
          roundLabel: roundLabel.trim() || undefined,
          judge: judge.trim() || undefined };

    createRound({
      role,
      format: makeFormatByKey(formatKey),
      meta,
      topic: topic.trim() || undefined,
    });

    // Bootstrap default Aff sheet; addSheet auto-sets it active for first sheet
    addSheet({ title: 'Aff', group: 'aff' });
  }

  return (
    <div style={styles.overlay}>
      <form
        className="panel"
        style={styles.card}
        onSubmit={handleSubmit}
        data-testid="round-setup-form"
      >
        {/* Title */}
        <div className="panel-header">New Round</div>

        <div style={styles.body}>

          {/* Role */}
          <fieldset style={styles.fieldset}>
            <legend className="label">Role</legend>
            <div style={styles.btnGroup} role="group" aria-label="Role">
              {(['aff', 'neg', 'judge'] as Role[]).map(r => (
                <button
                  key={r}
                  type="button"
                  className={`btn${role === r ? ' btn-primary' : ''}`}
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  data-testid={`role-${r}`}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Format */}
          <fieldset style={styles.fieldset}>
            <legend className="label">Format</legend>
            <div style={styles.btnGroup} role="group" aria-label="Format">
              {FORMAT_PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`btn${formatKey === key ? ' btn-primary' : ''}`}
                  onClick={() => setFormatKey(key)}
                  aria-pressed={formatKey === key}
                  data-testid={`format-${key}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Topic */}
          <div style={styles.field}>
            <label className="label" htmlFor="rs-topic">Topic (optional)</label>
            <input
              id="rs-topic"
              style={styles.input}
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Resolved: …"
            />
          </div>

          {/* Judge-specific: two team name fields */}
          {isJudge && (
            <>
              <div style={styles.field}>
                <label className="label" htmlFor="rs-affName">Aff team name</label>
                <input
                  id="rs-affName"
                  style={styles.input}
                  type="text"
                  value={affName}
                  onChange={e => setAffName(e.target.value)}
                  placeholder="Aff team"
                  data-testid="field-affName"
                />
              </div>
              <div style={styles.field}>
                <label className="label" htmlFor="rs-negName">Neg team name</label>
                <input
                  id="rs-negName"
                  style={styles.input}
                  type="text"
                  value={negName}
                  onChange={e => setNegName(e.target.value)}
                  placeholder="Neg team"
                  data-testid="field-negName"
                />
              </div>
            </>
          )}

          {/* Competitor-specific: one opponent field */}
          {!isJudge && (
            <div style={styles.field}>
              <label className="label" htmlFor="rs-opponent">Opponent</label>
              <input
                id="rs-opponent"
                style={styles.input}
                type="text"
                value={opponent}
                onChange={e => setOpponent(e.target.value)}
                placeholder="Opponent team"
                data-testid="field-opponent"
              />
            </div>
          )}

          {/* Optional shared fields */}
          <div style={styles.field}>
            <label className="label" htmlFor="rs-tournament">Tournament (optional)</label>
            <input
              id="rs-tournament"
              style={styles.input}
              type="text"
              value={tournament}
              onChange={e => setTournament(e.target.value)}
              placeholder="Tournament name"
            />
          </div>

          <div style={styles.field}>
            <label className="label" htmlFor="rs-roundLabel">Round (optional)</label>
            <input
              id="rs-roundLabel"
              style={styles.input}
              type="text"
              value={roundLabel}
              onChange={e => setRoundLabel(e.target.value)}
              placeholder="e.g. Round 3, Octos"
            />
          </div>

          {/* Judge name — only when role is NOT judge */}
          {!isJudge && (
            <div style={styles.field}>
              <label className="label" htmlFor="rs-judge">Judge (optional)</label>
              <input
                id="rs-judge"
                style={styles.input}
                type="text"
                value={judge}
                onChange={e => setJudge(e.target.value)}
                placeholder="Judge name"
                data-testid="field-judge"
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary"
            style={styles.submit}
            data-testid="submit"
          >
            Start Round
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      '100vh',
    padding:        '24px',
    background:     'var(--bg)',
  } as React.CSSProperties,

  card: {
    width:    '100%',
    maxWidth: '440px',
  } as React.CSSProperties,

  body: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '16px',
    padding:       '20px',
  } as React.CSSProperties,

  fieldset: {
    border:  'none',
    margin:  0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap:           '8px',
  } as React.CSSProperties,

  btnGroup: {
    display: 'flex',
    gap:     '8px',
    flexWrap: 'wrap',
  } as React.CSSProperties,

  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '6px',
  } as React.CSSProperties,

  input: {
    font:         'inherit',
    fontSize:     '13px',
    color:        'var(--ink)',
    background:   'var(--bg)',
    border:       '1px solid var(--line)',
    borderRadius: '6px',
    padding:      '6px 10px',

    width:        '100%',
  } as React.CSSProperties,

  submit: {
    marginTop:  '4px',
    alignSelf:  'flex-end',
  } as React.CSSProperties,
} as const;

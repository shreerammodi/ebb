# Roadmap

Where ebb is going and in what order. This is a living document; horizons are
intentions, not commitments.

## Guiding constraints

Every item below is judged against the product's non-negotiables:

- **Local-first and lossless.** Data lives in the browser (IndexedDB). It cannot
  phone home or lose a round.
- **Keyboard-first.** Every action is reachable and fast from the keyboard.
- **The tool disappears.** Chrome recedes mid-round; speed is the feature.

A feature that breaks these is not on the roadmap until we can do it without
breaking them. The collaboration aspiration below is the main place this tension
shows up.

## Shipped

The core flowing instrument is in place.

- Hybrid flow-editor grid: per-speech columns, response numbering, drops,
  extensions, conceded-argument styling.
- Drag-and-drop and keyboard subtree moves with aligned, deferred node creation.
- Keymap system with reserved chords, a cheatsheet, and `Cmd+P` command palette.
- Fuzzy search across flows.
- Flows dashboard: organize, filter, summarize.
- Persistence: Dexie store, autosave, backup, import/export.
- Export to xlsx/csv and a print view.
- Tooltips, settings panel, trash/restore, in-app guide.

## Now

In active development.

- **Desktop app with tournament-safe auto-updates.** (Design approved for
  planning.) A desktop shell removes the browser as an adversary for keybindings
  and window lifecycle, and delivers signed updates that never apply during a
  round or tournament window. Web build stays as the no-install on-ramp; both run
  the same `src/`.

## Next

Candidates once the desktop shell lands. Not yet sequenced.

- **Mark arguments as evidence.** Let users flag certain cells/arguments as
  carrying evidence, so the flow visually emphasizes which points are backed by
  cards versus analytics. Needs a model field, a keyboard toggle, and a reserved,
  meaningful styling treatment (per the color discipline).
- Keybinding completeness: reclaim chords the browser previously swallowed.
- Flow templates and format presets surfaced earlier in the create flow.
- Export fidelity: richer xlsx structure, configurable layouts.
- Dashboard scale: organizing and finding flows across many tournaments.

## Later

Larger bets, not yet specced.

- Round-context metadata (tournament, round, opponents) as first-class fields.

## Aspirational: two people editing one flow

The headline aspiration is **two people editing the same flow at once** (for
example, a 2-person team flowing both sides, or a coach following along live).

This is the hardest thing on the list because it pushes directly against
local-first and no-backend. We are not committing to an approach yet; the open
questions come first.

**Open questions to resolve before any build:**

- **Transport.** Real-time sync needs a channel between peers. Options range from
  peer-to-peer (WebRTC) to a thin relay. Either way, "no network" becomes "no
  network unless you opt into a shared session," and that boundary has to be
  explicit and privacy-preserving.
- **Conflict resolution.** Two cursors editing one tree need a merge strategy.
  The likely direction is CRDTs over the flow document so edits converge without
  a server arbitrating. This probably means reshaping the data model toward a
  CRDT-friendly representation.
- **Identity and presence.** Showing who is editing what, without accounts or a
  backend to authenticate them.
- **Offline and the local-first promise.** A shared session must degrade
  gracefully to solo editing and never make a single user's data depend on a
  peer being online.

**Likely sequencing (when we take it on):**

1. Make the flow document mergeable (CRDT model) while still single-user. This
   is valuable on its own (undo, history) and de-risks the rest.
2. Add presence and shared-session opt-in over a minimal transport.
3. Live multi-cursor editing.

Until those questions are answered, this stays an aspiration, not a plan.

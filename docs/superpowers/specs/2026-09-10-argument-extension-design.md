# Argument extension design

## Problem

A debater can keep an argument active in a later speech, but ebb does not support this action directly. The debater must copy the text and manually open space in the later speech.

The new Extend command copies a selected argument into the next speech for the same side. The copy is independent. Later edits to the source or copy do not change the other occurrence.

## Decisions

The approved behavior has these rules:

- Extend works on exactly one selected vertical run in one speech column.
- The destination is the first later speech for the same side.
- The destination starts on the same row as the source.
- The command moves the destination column tail down by the selected height.
- The command keeps interior and edge blank cells in the selected run.
- The copy keeps text, bold, highlight, card, group, and CardMirror provenance.
- The copy does not keep the kicked status.
- The source stays unchanged.
- The command selects the new copy after the operation.
- The copy has no persistent link to the source.

## Scope

This feature applies to flow sheets and normal speech columns. It does not apply to the cross-examination sheet or unlabeled overflow columns.

The feature does not add an extended status. It does not use the reserved `CellMeta.answers` field. It does not change the `.ebb` file schema.

## Command surface

The command registry gains `cell.extend` with the label `Extend to next speech`.

The default keymap assigns unshifted Mod+E to `cell.extend`. The `cell.jumpToSource` command loses its default chord. Jump to source stays available in the command palette and the conditional grid context menu.

Extend also appears in these surfaces:

- The command palette.
- The keyboard cheatsheet.
- The flow grid context menu.

The context-menu item uses the grid that opened the menu. This preserves correct behavior in split view.

## Architecture

A focused helper in `src/lib/grid/` owns the extension rules. The helper validates the selection, finds the destination speech, and prepares the grid transform.

`src/lib/commands/commands.ts` owns orchestration. The command gets the active grid and sheet, calls the helper, submits the write, attaches metadata undo state, records collaboration operations, and selects the destination.

The design does not add a store action. The live Handsontable grid remains the editor state for this operation. The existing snapshot path writes the result into the flow store.

## Destination calculation

The command converts the selected visual column into a model column. This conversion removes speech-alignment spacer columns.

The command reads the sheet columns from `columnsForFlowSheet`. It starts after the source column and selects the first column with the same `SpeechCol.side` value.

This rule skips intervening opponent speeches. The command does not infer a debater identity because the event model defines speeches by side, not by person.

## Grid transform

The helper reads the complete source run before it changes the destination. Each source cell contributes these values:

- Text.
- Runtime class name.
- CardMirror provenance.

For a source run of height `n` that starts at row `r`, the operation has this sequence:

1. Make sure that the grid has sufficient blank capacity below the destination tail.
2. Move destination rows from `r` through the tail down by `n` rows.
3. Put the copied run in destination rows `r` through `r + n - 1`.
4. Remove `flow-kicked` from each copied class name.
5. Submit all text changes in one `setDataAtCell` call with `STRUCTURED_WRITE`.
6. Attach one destination-column metadata snapshot to the resulting undo action.
7. Save the grid snapshot through `notifyGridMutated`.
8. Select the inserted destination run.

The capacity step prevents the command from discarding an occupied destination tail. Added blank grid capacity does not become stored flow data because `trimGrid` removes trailing empty rows.

The transform changes only the destination column. Other speech columns keep their text, metadata, and row positions.

## Metadata behavior

The copy keeps these stored values:

- `bold`.
- `highlight`.
- `card`.
- `group`.
- `source`.

The copy clears `kicked`. The command does not copy `answers` or add another structured field.

CardMirror provenance continues to name the same external source. Thus, the copied card can still use Jump to source.

## Undo and redo

The command submits one batched text write. Handsontable adds one undo action for that write.

The metadata undo system captures the destination column before and after the write. Undo restores the destination tail and removes the copy. Redo puts the copy and shifted tail back.

The source is not part of the undo action because the source does not change.

## Shared editing

`cell.extend` edits the round. The existing viewer gate blocks the command for a read-only peer.

A structured write does not use the normal per-cell `afterChange` replication path. The command records the structural operation directly.

For a run of height `n`, the command records these operations in order:

1. Record `n` `insertCell` operations at the destination start row.
2. Record `cellText` operations for the copied destination cells.
3. Record `cellMeta` operations for destination cells that contain metadata.

The source produces no collaboration operation. Adjacent columns produce no collaboration operation.

The operations make each peer project the same destination insertion. A peer observes a column insertion, not a set of text assignments that changes cell identities.

## Validation and errors

The command validates the complete request before the first write. An invalid request does not change text, metadata, selection, undo state, or collaboration state.

The command uses these outcomes:

- A missing active grid or selection causes a silent no-op.
- A multi-range or multi-column selection shows `Select cells in one speech to extend`.
- An all-blank selection shows `Select an argument to extend`.
- A cross-examination or overflow column shows `This column is not a speech`.
- A source without a later same-side speech shows `No later speech for this side`.
- A capacity or transform failure shows `Could not extend this argument`.

A selected run can contain blank cells when at least one selected cell contains text. The copy keeps the exact selected height and blank positions.

## Tests

### Grid logic

`test/lib/grid/extendCells.test.ts` covers these contracts:

- The destination calculation skips opponent speeches.
- A last same-side speech has no destination.
- Invalid column and selection shapes fail before mutation.
- The transform keeps the selected height and interior blank cells.
- The transform moves only the destination column.
- The copy keeps the selected formatting and provenance.
- The copy clears only the kicked status.
- The transform keeps an occupied destination tail.

### Command behavior

`test/lib/commands/commands.test.ts` covers these contracts:

- A valid vertical selection creates the copy and selects it.
- A multi-range or multi-column selection makes no grid change.
- An all-blank selection makes no grid change.
- One undo removes the copy and restores the destination tail and metadata.
- One redo restores the extension.

### Shared editing

`test/lib/commands/collabSeams.test.ts` proves that the initiating replica and a peer project the same extension. The test also proves that adjacent columns stay unchanged.

### Command surfaces

The registry, keymap, and context-menu tests cover these changes:

- `cell.extend` appears with the approved label.
- Mod+E resolves to `cell.extend`.
- `cell.jumpToSource` has no default chord.
- The context menu runs Extend against the menu grid.

The browser smoke check confirms that the keyboard cheatsheet lists Extend.

## Verification

Implementation verification includes the focused tests, `npm test`, `npm run lint`, and `npm run format:check`.

A browser smoke check uses a real flow grid. The check extends a formatted multi-cell run into an occupied next same-side speech. The check then uses undo and redo and examines the destination text, metadata, and selection.

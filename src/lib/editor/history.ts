/**
 * Undo/redo history. Stores inverse bundles plus the focus to restore.
 * It is store-agnostic: `undo`/`redo` take an `apply` callback that applies a
 * bundle to the live state and returns that bundle's inverse.
 */
import type { ActionBundle } from "@/lib/editor/action";

export interface HistoryEntry {
  /** Bundle that reverts the recorded edit. */
  inverse: ActionBundle;
  /** Focus to restore when this edit is undone. */
  beforeFocus: string | null;
  /** Focus to restore when this edit is redone. */
  afterFocus: string | null;
}

export type ApplyFn = (bundle: ActionBundle) => ActionBundle;

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  /** Record an applied edit. `inverse` is what `applyActionBundle` returned. */
  record(inverse: ActionBundle, beforeFocus: string | null, afterFocus: string | null): void {
    this.past.push({ inverse, beforeFocus, afterFocus });
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Undo the most recent edit. Returns the focus id to restore, or null. */
  undo(apply: ApplyFn): string | null {
    const entry = this.past.pop();
    if (!entry) return null;
    const redoInverse = apply(entry.inverse);
    this.future.push({
      inverse: redoInverse,
      beforeFocus: entry.beforeFocus,
      afterFocus: entry.afterFocus,
    });
    return entry.beforeFocus;
  }

  /** Redo the most recently undone edit. Returns the focus id to restore, or null. */
  redo(apply: ApplyFn): string | null {
    const entry = this.future.pop();
    if (!entry) return null;
    const undoInverse = apply(entry.inverse);
    this.past.push({
      inverse: undoInverse,
      beforeFocus: entry.beforeFocus,
      afterFocus: entry.afterFocus,
    });
    return entry.afterFocus;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

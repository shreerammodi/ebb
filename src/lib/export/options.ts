/** User display settings that affect export output. Sourced from the store. */
export interface ExportOptions {
  /** Apply argument numbering (matches the on-screen autoNumber setting). */
  autoNumber: boolean;
  /** Render drop markers (PDF only; Excel ignores this). */
  labelDrops: boolean;
}

/** Conservative default used by callers/tests that don't pass options. */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { autoNumber: true, labelDrops: true };

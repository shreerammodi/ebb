/**
 * Editor model types (reference-based rework).
 *
 * A sheet's flow is a tree of `Box` nodes stored in a `Boxes` map keyed by id.
 * Sibling order is the order of ids in each node's `children` array.
 * A box's COLUMN is its depth below an invisible per-sheet root node:
 * the root's direct children are column 0, their children column 1, and so on.
 * Empty boxes act as spacers (they render blank and navigation skips them),
 * which is how an argument can "start" in a later speech column.
 */

/** The editable payload of a node. The sheet root also uses this shape (empty). */
export interface Box {
  content: string;
  /** Spacer: renders blank, skipped by navigation. */
  empty: boolean;
  /** Line-through (was: status 'conceded'). */
  crossed: boolean;
  bold: boolean;
  /** Arrow-icon extension node (was: status 'extended'). */
  isExtension: boolean;
}

/** A node in the tree: its value plus structural links. */
export interface BoxNode {
  value: Box;
  /** null only for a sheet root. */
  parentId: string | null;
  /** Ordered child ids. */
  children: string[];
}

/** The whole forest: every node (including sheet roots) keyed by id. */
export type Boxes = Record<string, BoxNode>;

/** A flow sheet (page). Columns come from the shared format.speeches. */
export interface Sheet {
  id: string;
  title: string;
  side: "aff" | "neg";
  /** Display order among sheets. */
  order: number;
}

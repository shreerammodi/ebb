import type { Round } from "@/lib/model/types";

/** One state in the undo tree: a full Round snapshot plus its tree links. */
export interface HistoryNode {
    id: string;
    parentId: string | null;
    childIds: string[];
    snapshot: Round;
    /** Short human label for the panel, e.g. "Type", "Delete row", "Bold". */
    label: string;
    /**
     * Coalesce key of the commit that produced this node. While this node is
     * current, a commit with the same non-null key replaces its snapshot in
     * place instead of branching. null = never coalescable.
     */
    coalesceKey: string | null;
    /** Wall-clock creation time (display only). */
    createdAt: number;
    /** Monotonic creation order; drives deterministic redo / panel ordering. */
    createdSeq: number;
}

/** The whole undo tree for one flow. */
export interface HistoryTree {
    nodes: Record<string, HistoryNode>;
    rootId: string;
    currentId: string;
    /** Next createdSeq / id suffix to hand out. */
    seq: number;
}

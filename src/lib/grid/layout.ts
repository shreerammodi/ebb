/**
 * MIGRATION ONLY: assigns initial rows to legacy tree-shaped rounds.
 * Not a render path. Retained so the one-shot Dexie migration can compute
 * `(startRow, rowSpan, col)` from the legacy `parentId`+`order` tree and
 * persist each node's `row` coordinate.
 *
 * Elastic flow layout: turns the argument tree into (row, col, rowSpan) placements.
 * Extracted from FlowGrid so exporters reuse the exact on-screen placement.
 *
 * ASSUMPTION: responses always live in a LATER column than their parent.
 * READS the legacy `order` field — callers must pass pre-migration nodes
 * (cast if necessary) that carry `order`.
 */

import type { ArgumentNode, Speech } from "@/lib/model/types";

/** A pre-migration node carrying the legacy `order` field (row not yet assigned). */
export type LegacyNode = ArgumentNode & { order?: number };

export interface PlacedNode {
    node: LegacyNode;
    startRow: number;
    rowSpan: number;
    col: number;
}

export function buildLayout(
    nodes: LegacyNode[],
    speeches: Speech[],
): { placed: PlacedNode[]; totalRows: number } {
    if (nodes.length === 0) {
        return { placed: [], totalRows: 0 };
    }

    // Map speechId → column index
    const colIndex = new Map<string, number>(speeches.map((s, i) => [s.id, i]));

    // Filter out nodes whose speechId doesn't exist in the format
    const validNodes = nodes.filter((n) => colIndex.has(n.speechId));

    // Build children map
    const childrenByParent = new Map<string | null, LegacyNode[]>();
    for (const node of validNodes) {
        const key = node.parentId;
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key)!.push(node);
    }
    // Sort children by order
    for (const children of childrenByParent.values()) {
        children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    // Roots: nodes with parentId === null, stacked by their sheet-wide order so a
    // root created in any column can sit anywhere vertically (roots-anywhere).
    const roots = (childrenByParent.get(null) ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Leaf count (memoized) with cycle guard
    const leafCountCache = new Map<string, number>();
    function leafCount(node: LegacyNode, visiting: Set<string> = new Set()): number {
        if (leafCountCache.has(node.id)) return leafCountCache.get(node.id)!;
        // Cycle guard: if we've already entered this node on the current path, treat as leaf
        if (visiting.has(node.id)) return 1;
        visiting.add(node.id);
        const children = childrenByParent.get(node.id) ?? [];
        const count =
            children.length === 0 ? 1 : children.reduce((s, c) => s + leafCount(c, visiting), 0);
        visiting.delete(node.id);
        leafCountCache.set(node.id, count);
        return count;
    }

    // Place each node via DFS
    const placed: PlacedNode[] = [];
    const visited = new Set<string>(); // cycle guard

    function place(node: LegacyNode, startRow: number): void {
        if (visited.has(node.id)) return;
        visited.add(node.id);

        const col = colIndex.get(node.speechId) ?? 0;
        const rowSpan = leafCount(node);
        placed.push({ node, startRow, rowSpan, col });

        const children = childrenByParent.get(node.id) ?? [];
        let cursor = startRow;
        for (const child of children) {
            place(child, cursor);
            cursor += leafCount(child);
        }
    }

    let totalRows = 0;
    for (const root of roots) {
        place(root, totalRows);
        totalRows += leafCount(root);
    }

    return { placed, totalRows };
}

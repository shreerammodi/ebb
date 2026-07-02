"use client";

import { flattenForPanel } from "@/lib/history/select";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { cn } from "@/lib/utils";

/**
 * Compact rendering of the undo tree. Each row is a state; indent encodes depth,
 * the current state is highlighted, and off-path branches are dimmed. Clicking a
 * row jumps the document to that snapshot.
 */
export default function UndoTreePanel() {
    const history = useRoundStore((s) => s.history);
    const jumpToHistory = useRoundStore((s) => s.jumpToHistory);

    if (!history) return null;

    const rows = flattenForPanel(history);

    return (
        <ul data-testid="undo-tree" className="flex flex-col gap-0.5">
            {rows.map(({ node, depth, isCurrent, isOnCurrentPath }) => (
                <li key={node.id}>
                    <button
                        type="button"
                        onClick={() => jumpToHistory(node.id)}
                        data-testid={`history-node-${node.id}`}
                        aria-current={isCurrent ? "true" : undefined}
                        title={new Date(node.createdAt).toLocaleTimeString()}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        className={cn(
                            "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[12px] transition-colors",
                            isCurrent
                                ? "bg-accent font-semibold text-foreground"
                                : isOnCurrentPath
                                  ? "text-foreground hover:bg-accent/50"
                                  : "text-muted-foreground hover:bg-accent/50",
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                isCurrent ? "bg-foreground" : "bg-muted-foreground/40",
                            )}
                        />
                        <span className="truncate">{node.label}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

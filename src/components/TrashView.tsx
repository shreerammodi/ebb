"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    listTrash,
    restoreRound,
    deleteRoundForever,
    type RoundSummary,
} from "@/lib/persistence/autosave";
import { db } from "@/lib/persistence/db";
import { deleteSearchIndex } from "@/lib/persistence/searchIndex";
import FlowCard from "./dashboard/FlowCard";
import { Button } from "./ui/button";

export default function TrashView() {
    const [items, setItems] = useState<RoundSummary[] | null>(null);

    const refresh = useCallback(async () => {
        setItems(await listTrash());
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    async function restore(id: string) {
        await restoreRound(id);
        await refresh();
    }

    async function remove(id: string) {
        if (!confirm("Permanently delete this flow? This cannot be undone."))
            return;
        await deleteRoundForever(id);
        await refresh();
    }

    async function emptyTrash() {
        if (!confirm("Permanently delete ALL flows in trash?")) return;
        const trashed = (await db.rounds.toArray()).filter(
            (r) => r.deletedAt != null,
        );
        for (const r of trashed) {
            await db.rounds.delete(r.id);
            await deleteSearchIndex(r.id);
        }
        await refresh();
    }

    if (items === null) return null;

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
                <Link
                    href="/"
                    className="text-[13px] text-zinc-500 hover:text-zinc-800"
                    data-testid="trash-back"
                >
                    ← Flows
                </Link>
                <span className="text-[15px] font-semibold">Trash</span>
                <div className="flex-1" />
                {items.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        data-testid="empty-trash"
                        onClick={() => void emptyTrash()}
                    >
                        Empty trash
                    </Button>
                )}
            </div>

            <div className="px-5 py-5">
                {items.length === 0 ? (
                    <p className="mt-20 text-center text-[13px] text-zinc-400">
                        Trash is empty.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((s) => (
                            <div key={s.id} className="flex flex-col gap-2">
                                <FlowCard summary={s} onOpen={() => {}} />
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        data-testid={`trash-restore-${s.id}`}
                                        onClick={() => void restore(s.id)}
                                    >
                                        Restore
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600"
                                        data-testid={`trash-delete-${s.id}`}
                                        onClick={() => void remove(s.id)}
                                    >
                                        Delete forever
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

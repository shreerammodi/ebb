"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
import { ConfirmDialog } from "./ui/confirm-dialog";

type ConfirmTarget = { type: "one"; id: string } | { type: "all" };

export default function TrashView() {
    const [items, setItems] = useState<RoundSummary[] | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

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
        await deleteRoundForever(id);
        await refresh();
    }

    async function emptyTrash() {
        const trashed = (await db.rounds.toArray()).filter((r) => r.deletedAt != null);
        for (const r of trashed) {
            await db.rounds.delete(r.id);
            await deleteSearchIndex(r.id);
        }
        await refresh();
    }

    function runConfirm() {
        if (!confirmTarget) return;
        if (confirmTarget.type === "one") void remove(confirmTarget.id);
        else void emptyTrash();
    }

    if (items === null) return null;

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="border-border bg-card flex items-center gap-3 border-b px-5 py-4">
                <Link
                    href="/"
                    className="text-muted-foreground hover:text-foreground text-[13px]"
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
                        onClick={() => setConfirmTarget({ type: "all" })}
                    >
                        Empty trash
                    </Button>
                )}
            </div>

            <div className="px-5 py-5">
                {items.length === 0 ? (
                    <p className="text-muted-foreground mt-20 text-center text-[13px]">
                        Trash is empty.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((s) => (
                            <div key={s.id} className="flex flex-col gap-2">
                                <FlowCard summary={s} onOpen={() => {}} interactive={false} />
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
                                        className="text-destructive"
                                        data-testid={`trash-delete-${s.id}`}
                                        onClick={() =>
                                            setConfirmTarget({
                                                type: "one",
                                                id: s.id,
                                            })
                                        }
                                    >
                                        Delete forever
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={confirmTarget !== null}
                onOpenChange={(o) => {
                    if (!o) setConfirmTarget(null);
                }}
                title={confirmTarget?.type === "all" ? "Empty trash?" : "Delete forever?"}
                description={
                    confirmTarget?.type === "all"
                        ? "Permanently delete all flows in trash. This cannot be undone."
                        : "Permanently delete this flow. This cannot be undone."
                }
                confirmLabel={confirmTarget?.type === "all" ? "Empty trash" : "Delete forever"}
                destructive
                onConfirm={runConfirm}
            />
        </div>
    );
}

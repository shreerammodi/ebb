"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { collabLive } from "@/lib/collab/enabled";
import { recoverReplica } from "@/lib/collab/persist";
import { resumeSession } from "@/lib/collab/runtime";
import { flowRouteFor } from "@/lib/commands/flowNav";
import { reportOpenPath } from "@/lib/commands/windowCommands";
import { errorMessage } from "@/lib/errorMessage";
import { applyFlowFont } from "@/lib/fonts/applyFlowFont";
import { serializeFlow } from "@/lib/persistence/flowFile";
import { basename } from "@/lib/persistence/flowPaths";
import { attachFlowAutosave, noteOpened, readFlowAt } from "@/lib/persistence/flowSession";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";
import { applySideColors } from "@/lib/theme/applySideColors";

import Workspace from "./Workspace";

/**
 * AppRoot - boots the editor for the flow file named by ?path=.
 *
 * The path is the flow's identity, so it rides in the URL the way the database
 * id used to: a reload, or the relaunch after an update installs, reopens the
 * same file. Anything that cannot be read sends the user back to the start
 * screen with a reason, because a flow silently not opening is indistinguishable
 * from a flow that is gone.
 */
export default function AppRoot() {
    const router = useRouter();
    const params = useSearchParams();
    const path = params.get("path");
    const round = useFlowStore((s) => s.round);
    const flowFont = useFlowStore((s) => s.flowFont);
    const affColor = useFlowStore((s) => s.affColor);
    const negColor = useFlowStore((s) => s.negColor);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        applyFlowFont(flowFont);
    }, [flowFont]);

    useEffect(() => {
        applySideColors({ aff: affColor, neg: negColor });
    }, [affColor, negColor]);

    useEffect(() => {
        let mounted = true;
        const autosave = attachFlowAutosave(useFlowStore, useSaveStatus.getState().report);

        const leave = () => {
            mounted = false;
            autosave.detach();
            useSaveStatus.getState().reset();
            void reportOpenPath(null);
        };

        if (!path) {
            router.replace("/");
            return leave;
        }

        // Save As rewrites the URL to the file it just wrote, which the store
        // is already editing. Reloading it would discard nothing but would
        // flash the loading frame for no reason. Priming is what makes the
        // shortcut safe: this subscriber never witnesses a load, so without it
        // the next edit looks like one and is skipped.
        if (useFlowStore.getState().docPath === path) {
            autosave.prime();
            void reportOpenPath(path);
            setLoaded(true);
            return leave;
        }

        readFlowAt(path)
            .then((opened) => {
                if (!mounted) return;
                if (!opened) {
                    toast.error(`${basename(path)} no longer exists`);
                    router.replace("/");
                    return;
                }
                const r = opened.round;
                const newFlow = params.get("new") != null;
                useFlowStore.getState().loadRound(r, { docPath: path, newFlow });
                // loadRound already seeded the replica from the file, which is
                // the fallback; this upgrades it to the sidecar when one still
                // matches. Anything typed in the gap is repaired by the drift
                // check that runs before the next sidecar write.
                //
                // The session is desktop-only, like every other effect in this
                // app that needs the shell: shared editing is an iroh endpoint
                // and a browser cannot bind one. Opening a flow is not consent
                // to be reachable either, so the resume itself only re-dials
                // while Listen for invites is on - the rule the runtime holds,
                // and why this call is made for every flow regardless: it is
                // also where the session for the round being left ends.
                void recoverReplica(r, serializeFlow(r))
                    .then(() => (collabLive() ? resumeSession(r) : null))
                    .catch((err: unknown) => {
                        // A round nobody can be reached about is still a round
                        // to flow, so this reports and stops rather than taking
                        // the open down with it.
                        toast.error(errorMessage(err, "Could not reconnect to your partners"));
                    });
                // The round just came off disk, so it is already saved - unless
                // it came from the recovery copy, which the file never got.
                // Left unprimed, the load itself is the change autosave writes.
                if (opened.recovered) {
                    toast.success(`Recovered unsaved changes to ${basename(path)}`);
                } else {
                    autosave.prime();
                }
                void noteOpened(path);
                void reportOpenPath(path);
                // Drop the one-shot marker so a later refresh loads this flow
                // as existing and restores the persisted RFD preference.
                if (newFlow) router.replace(flowRouteFor(path));
            })
            .catch((err: unknown) => {
                toast.error(errorMessage(err, "Could not open that flow"));
                router.replace("/");
            })
            .finally(() => {
                if (mounted) setLoaded(true);
            });

        return leave;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- path keys the load; params is read as a one-shot snapshot
    }, [path, router]);

    if (!loaded || !round) {
        // Held frame mirroring the editor shell, so loading a round never
        // flashes a blank screen that reads as data loss.
        return (
            <div className="flex h-screen flex-col" data-testid="editor-loading">
                <div className="border-border bg-card flex h-12 flex-none items-center border-b px-4">
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex min-h-0 flex-1">
                    <div className="border-border bg-card w-[220px] shrink-0 space-y-2 border-r p-2">
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-2/3" />
                    </div>
                    <div className="flex-1 p-4">
                        <Skeleton className="h-40 w-full" />
                    </div>
                </div>
            </div>
        );
    }
    return <Workspace />;
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errorMessage";
import { getFlowFs } from "@/lib/persistence/flowFs";
import { allowEbbInControlledFolders, blockedFlowsDir } from "@/lib/persistence/folderAccess";
import { useFlowStore } from "@/lib/store/useFlowStore";

/**
 * Asks Windows to let ebb save, when it is refusing to.
 *
 * Shown on any launch the flows folder refuses a write, not just the first:
 * Controlled Folder Access can be turned on after install, and until it lets
 * ebb in, no flow can be created or saved there. Allow ebb is the answer that
 * keeps the folder a debater already knows, so it holds the focus. Choosing
 * another folder is offered beside it because a school-managed laptop often
 * cannot approve the prompt, or can and still enforces the school's own list.
 */
export default function FolderAccessDialog() {
    const setFlowsDir = useFlowStore((s) => s.setFlowsDir);
    const [dir, setDir] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        void blockedFlowsDir()
            .then((blocked) => {
                if (mounted) setDir(blocked);
            })
            .catch(() => undefined);
        return () => {
            mounted = false;
        };
    }, []);

    function done(message: string) {
        setDir(null);
        setNote(null);
        toast.success(message);
    }

    async function allow() {
        if (!dir) return;
        setBusy(true);
        try {
            const accepted = await allowEbbInControlledFolders();
            const fs = await getFlowFs();
            if ((await fs.probeDir(dir)) === "ok") {
                done("ebb can save your flows now.");
                return;
            }
            setNote(
                accepted
                    ? "Windows took the change but still blocks this folder. Your school may manage this setting. Choose another folder instead."
                    : "Windows did not allow ebb. Choose another folder instead.",
            );
        } finally {
            setBusy(false);
        }
    }

    async function choose() {
        setBusy(true);
        try {
            const fs = await getFlowFs();
            const picked = await fs.pickDirectory();
            if (!picked) return;
            if ((await fs.probeDir(picked)) !== "ok") {
                setNote(
                    "Windows blocks that folder too. Pick one outside Documents, such as a new folder in your user folder.",
                );
                return;
            }
            setFlowsDir(picked);
            done(`New flows will be saved to ${picked}.`);
        } catch (err) {
            toast.error(errorMessage(err, "Could not choose that folder"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={dir !== null} onOpenChange={(next) => !next && setDir(null)}>
            <DialogContent className="max-w-lg" data-testid="folder-access">
                <DialogHeader>
                    <DialogTitle>Windows is blocking ebb from saving</DialogTitle>
                    <DialogDescription>
                        Controlled folder access in Windows Security stops apps it does not know
                        from writing to {dir}. Until ebb is allowed, flows there cannot be created
                        or saved.
                    </DialogDescription>
                </DialogHeader>
                {note && (
                    <p className="text-destructive text-sm" data-testid="folder-access-note">
                        {note}
                    </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-testid="folder-access-later"
                        onClick={() => setDir(null)}
                    >
                        Not now
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-testid="folder-access-choose"
                        onClick={() => void choose()}
                    >
                        Choose another folder
                    </Button>
                    <Button
                        autoFocus
                        type="button"
                        size="sm"
                        disabled={busy}
                        data-testid="folder-access-allow"
                        onClick={() => void allow()}
                    >
                        Allow ebb
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

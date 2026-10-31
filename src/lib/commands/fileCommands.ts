/**
 * Document-level commands: open, save, save as, reveal, close.
 *
 * These are the only commands that are asynchronous and that can fail in a way
 * the user needs told about, so unlike the editor commands they surface a toast
 * rather than failing silently. Each still no-ops when there is no open flow,
 * so the keyboard layer and the native menu can fire them unconditionally.
 */

import { toast } from "sonner";

import { errorMessage } from "@/lib/errorMessage";
import { commitOpenEdit } from "@/lib/grid/hotInstance";
import { getFlowFs } from "@/lib/persistence/flowFs";
import { pickFlowToOpen, saveFlowAs, saveFlowNow } from "@/lib/persistence/flowSession";
import { useFlowStore } from "@/lib/store/useFlowStore";
import { useSaveStatus } from "@/lib/store/useSaveStatus";

import { navigateToFlow, navigateToStart } from "./flowNav";

function report(fallback: string, err: unknown): void {
    toast.error(errorMessage(err, fallback));
}

export async function openFlowFromPicker(): Promise<void> {
    try {
        const path = await pickFlowToOpen();
        if (path) navigateToFlow(path);
    } catch (err) {
        report("Could not open that flow", err);
    }
}

/**
 * Write the open flow now rather than waiting out the autosave debounce, and
 * report whether it reached disk.
 *
 * Autosave means it is already saved a half-second after every keystroke; this
 * exists because Cmd+S is muscle memory and pressing it should say so - and
 * because anything about to discard the round needs a real answer first.
 */
export async function saveOpenFlow(): Promise<boolean> {
    const { round, docPath } = useFlowStore.getState();
    // Nothing open is nothing to lose, which counts as safe.
    if (!round || !docPath) return true;
    return saveFlowNow(docPath, round, useSaveStatus.getState().report);
}

/**
 * Write the open flow on the way out of it - closing the flow or the window,
 * quitting, or relaunching into an update - and report whether it reached disk.
 *
 * A half-typed cell is in the editor and not yet in the round, and a menu
 * accelerator moves no focus, so Meta+W or Meta+Q arriving mid-word would
 * write the round without the word and then throw the editor away. Closing the
 * editor first is what puts it in the write. Meta+S does not do this: the
 * debater keeps typing after it, and a keystroke on a cell with no editor open
 * starts a fresh one over the cell.
 */
export async function saveBeforeLeaving(): Promise<boolean> {
    commitOpenEdit();
    return saveOpenFlow();
}

export async function saveOpenFlowAs(): Promise<void> {
    const { round, setDocPath } = useFlowStore.getState();
    if (!round) return;
    try {
        const path = await saveFlowAs(round);
        if (!path) return;
        // Keep editing the new file, and keep the URL in step so a reload
        // reopens the copy the user is now looking at rather than the original.
        setDocPath(path);
        navigateToFlow(path);
        toast.success(`Saved to ${path}`);
    } catch (err) {
        report("Could not save that flow", err);
    }
}

export async function revealOpenFlow(): Promise<void> {
    const { docPath } = useFlowStore.getState();
    if (!docPath) return;
    try {
        const fs = await getFlowFs();
        await fs.reveal(docPath);
    } catch (err) {
        report("Could not show that flow", err);
    }
}

/**
 * Drag the open flow out of ebb, into a message or an email. The file on disk
 * is what travels, so it is written first: the last half-second of edits would
 * otherwise still be waiting on the autosave debounce. A flow that will not
 * save is not sent at all, since the copy on disk is not the round on screen.
 */
export async function dragOpenFlow(): Promise<void> {
    const { docPath } = useFlowStore.getState();
    if (!docPath) return;
    if (!(await saveOpenFlow())) {
        toast.error("This flow could not be saved, so it was not sent.");
        return;
    }
    try {
        const fs = await getFlowFs();
        await fs.dragOut(docPath);
    } catch (err) {
        report("Could not drag that flow", err);
    }
}

/**
 * Leave the flow, but only once it is safely written.
 *
 * Closing is the instinctive thing to do when something looks wrong, which is
 * exactly when the save is failing - a full disk, or an ejected drive holding
 * the flows folder. Discarding the round on the way out would destroy it at the
 * worst possible moment, so a failed write cancels the close and leaves the
 * round on screen where the user can still act on it.
 */
export async function closeOpenFlow(): Promise<void> {
    if (!(await saveBeforeLeaving())) {
        toast.error(
            "This flow could not be saved, so it is still open. Free up space, reconnect the drive, or use Save As to put it somewhere else.",
        );
        return;
    }
    useFlowStore.getState().closeRound();
    navigateToStart();
}

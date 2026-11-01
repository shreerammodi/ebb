/**
 * useLeaveDialog - what to do with a round the flow file did not receive.
 *
 * Autosave means a debater leaving a flow almost never has anything unsaved,
 * so the question is only asked when the last write to the file failed: a
 * flows folder the OS will not let ebb write, a full disk, a drive pulled out,
 * or a file changed outside ebb. Asking on every close would be a dialog they
 * learn to dismiss without reading, on the one day it matters.
 *
 * The command layer must not reach for a component, so the two meet here, as
 * they do for the sharing consent.
 */

import { create } from "zustand";

export type LeaveChoice = "save" | "saveAs" | "discard" | "cancel";

export interface LeaveDialogState {
    open: boolean;
    answer(choice: LeaveChoice): void;
}

let pending: ((choice: LeaveChoice) => void) | null = null;

function settle(choice: LeaveChoice): void {
    const waiting = pending;
    pending = null;
    waiting?.(choice);
}

export const useLeaveDialog = create<LeaveDialogState>((set) => ({
    open: false,
    answer: (choice) => {
        set({ open: false });
        settle(choice);
    },
}));

/**
 * Ask, and resolve to the answer. A question still open is answered cancel
 * first, so no caller is left holding a promise that never settles.
 */
export function askToLeave(): Promise<LeaveChoice> {
    settle("cancel");
    return new Promise((resolve) => {
        pending = resolve;
        useLeaveDialog.setState({ open: true });
    });
}

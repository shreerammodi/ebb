"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useUpdate } from "./UpdateProvider";

/**
 * Component 6 — the critical-update bypass.
 *
 * A release marked `critical: true` in the manifest is the one thing allowed to
 * surface while Tournament Mode is on — but only here, via an explicit confirm,
 * never silently and never automatically. Choosing "Later" holds the update
 * exactly as Tournament Mode would. Reuses the app's in-app ConfirmDialog rather
 * than an OS modal, consistent with the local-first voice.
 */
export default function CriticalUpdateModal() {
    const { state, installCritical, dismissCritical } = useUpdate();
    const open = state.status === "critical";
    const version = open ? state.manifest.version : "";

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={(o) => {
                if (!o) dismissCritical();
            }}
            title="Critical update available"
            description={`A critical fix (version ${version}) is ready. It's normally held while Tournament Mode is on — install it now anyway?`}
            confirmLabel="Install and Restart"
            cancelLabel="Later"
            onConfirm={() => void installCritical()}
        />
    );
}

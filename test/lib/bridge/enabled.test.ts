import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cardmirrorLive, cardmirrorPushLive } from "@/lib/bridge/enabled";
import { useFlowStore } from "@/lib/store/useFlowStore";

/** isDesktop() reads this global, so the web build is its absence. */
function setDesktop(on: boolean) {
    if (on) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

beforeEach(() => {
    setDesktop(true);
    useFlowStore.setState({ cardmirrorEnabled: true, cardmirrorPushEdits: true });
});

afterEach(() => {
    setDesktop(false);
});

describe("cardmirrorPushLive", () => {
    it("is on only when the desktop build has both switches on", () => {
        expect(cardmirrorLive()).toBe(true);
        expect(cardmirrorPushLive()).toBe(true);
    });

    it("is off on the web build even with both switches on", () => {
        setDesktop(false);
        expect(cardmirrorPushLive()).toBe(false);
    });

    it("is off with the integration off, whatever the push switch says", () => {
        useFlowStore.setState({ cardmirrorEnabled: false });
        expect(cardmirrorPushLive()).toBe(false);
    });

    it("is off with the push switch off while the integration stays live", () => {
        useFlowStore.setState({ cardmirrorPushEdits: false });
        expect(cardmirrorLive()).toBe(true);
        expect(cardmirrorPushLive()).toBe(false);
    });
});

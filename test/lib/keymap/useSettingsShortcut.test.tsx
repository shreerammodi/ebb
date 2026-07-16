import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { useSettingsShortcut } from "@/lib/keymap/useSettingsShortcut";
import { useFlowStore } from "@/lib/store/useFlowStore";

function Host() {
    useSettingsShortcut();
    return <input data-testid="field" />;
}

/** Meta on mac, Ctrl elsewhere - the preset binds whichever this platform uses. */
const mod = navigator.platform.toLowerCase().includes("mac")
    ? { metaKey: true }
    : { ctrlKey: true };

beforeEach(() => useFlowStore.getState().setSettingsOpen(false));
afterEach(cleanup);

describe("useSettingsShortcut", () => {
    it("opens settings on the mod+, chord", () => {
        render(<Host />);
        window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", ...mod }));
        expect(useFlowStore.getState().settingsOpen).toBe(true);
    });

    it("ignores other commands' chords", () => {
        render(<Host />);
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", ...mod }));
        expect(useFlowStore.getState().settingsOpen).toBe(false);
    });

    it("stops listening after unmount", () => {
        render(<Host />).unmount();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", ...mod }));
        expect(useFlowStore.getState().settingsOpen).toBe(false);
    });
});

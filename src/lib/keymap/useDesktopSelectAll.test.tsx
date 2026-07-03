import { render } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { isMacPlatform } from "@/lib/platform";

import { useDesktopSelectAll } from "./useDesktopSelectAll";

const mod = isMacPlatform() ? "metaKey" : "ctrlKey";

function Harness() {
    useDesktopSelectAll();
    return <div data-testid="harness" />;
}

/** Dispatches Meta+A / Ctrl+A as if it originated from `target`. */
function dispatchSelectAll(target: EventTarget, init: Partial<KeyboardEventInit> = {}) {
    const e = new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
        [mod]: true,
        ...init,
    });
    Object.defineProperty(e, "target", { value: target });
    act(() => {
        window.dispatchEvent(e);
    });
    return e;
}

function enableDesktop() {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function disableDesktop() {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    delete (window as Record<string, unknown>).__TAURI__;
}

describe("useDesktopSelectAll", () => {
    beforeEach(disableDesktop);
    afterEach(() => {
        disableDesktop();
        vi.restoreAllMocks();
    });

    it("selects all and swallows Meta+A in a focused input on desktop", () => {
        enableDesktop();
        const input = document.createElement("input");
        input.value = "hello world";
        document.body.appendChild(input);
        const select = vi.spyOn(input, "select");

        render(<Harness />);
        const e = dispatchSelectAll(input);

        expect(select).toHaveBeenCalledOnce();
        expect(e.defaultPrevented).toBe(true);
        input.remove();
    });

    it("selects all in a focused textarea on desktop", () => {
        enableDesktop();
        const textarea = document.createElement("textarea");
        textarea.value = "some flow text";
        document.body.appendChild(textarea);
        const select = vi.spyOn(textarea, "select");

        render(<Harness />);
        dispatchSelectAll(textarea);

        expect(select).toHaveBeenCalledOnce();
        textarea.remove();
    });

    it("does nothing when Meta+A fires outside a text field (leaves sheet.newAff alone)", () => {
        enableDesktop();
        render(<Harness />);
        const e = dispatchSelectAll(document.body);

        expect(e.defaultPrevented).toBe(false);
    });

    it("is inert on the web build (browser handles Meta+A natively)", () => {
        // desktop disabled by beforeEach
        const input = document.createElement("input");
        const select = vi.spyOn(input, "select");

        render(<Harness />);
        const e = dispatchSelectAll(input);

        expect(select).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
    });

    it("ignores modified variants like Shift+Meta+A", () => {
        enableDesktop();
        const input = document.createElement("input");
        const select = vi.spyOn(input, "select");

        render(<Harness />);
        const e = dispatchSelectAll(input, { shiftKey: true });

        expect(select).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
    });

    it("removes its listener on unmount", () => {
        enableDesktop();
        const input = document.createElement("input");
        const select = vi.spyOn(input, "select");

        const { unmount } = render(<Harness />);
        unmount();
        dispatchSelectAll(input);

        expect(select).not.toHaveBeenCalled();
    });
});

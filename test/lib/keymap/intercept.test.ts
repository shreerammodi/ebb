import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
    isTextEntryFocus,
    isNativeEditingChord,
    selectAllInElement,
    shouldIntercept,
} from "@/lib/keymap/intercept";
import { isMacPlatform } from "@/lib/platform";

const mod = isMacPlatform() ? "Meta" : "Ctrl";

describe("isTextEntryFocus", () => {
    it("returns true for an INPUT element", () => {
        const el = document.createElement("input");
        expect(isTextEntryFocus(el)).toBe(true);
    });

    it("returns true for a TEXTAREA element", () => {
        const el = document.createElement("textarea");
        expect(isTextEntryFocus(el)).toBe(true);
    });

    it("returns true for a contentEditable element", () => {
        const el = document.createElement("div");
        // jsdom doesn't implement isContentEditable; stub it to simulate a real browser.
        Object.defineProperty(el, "isContentEditable", { value: true, configurable: true });
        expect(isTextEntryFocus(el)).toBe(true);
    });

    it("returns true for an element with data-native-keys", () => {
        const el = document.createElement("div");
        el.dataset.nativeKeys = "true";
        expect(isTextEntryFocus(el)).toBe(true);
    });

    it("returns false for a regular div", () => {
        const el = document.createElement("div");
        expect(isTextEntryFocus(el)).toBe(false);
    });

    it("returns false for null target", () => {
        expect(isTextEntryFocus(null)).toBe(false);
    });

    it("returns false for a button element", () => {
        const el = document.createElement("button");
        expect(isTextEntryFocus(el)).toBe(false);
    });
});

describe("isNativeEditingChord", () => {
    function makeKeyEvent(init: Partial<KeyboardEventInit>): KeyboardEvent {
        return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    }

    it("returns true for Cmd+A / Ctrl+A (select all)", () => {
        const e = makeKeyEvent({ key: "a", [mod === "Meta" ? "metaKey" : "ctrlKey"]: true });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns true for Cmd+C / Ctrl+C (copy)", () => {
        const e = makeKeyEvent({ key: "c", [mod === "Meta" ? "metaKey" : "ctrlKey"]: true });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns true for Cmd+V / Ctrl+V (paste)", () => {
        const e = makeKeyEvent({ key: "v", [mod === "Meta" ? "metaKey" : "ctrlKey"]: true });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns true for Cmd+X / Ctrl+X (cut)", () => {
        const e = makeKeyEvent({ key: "x", [mod === "Meta" ? "metaKey" : "ctrlKey"]: true });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns true for Cmd+Z / Ctrl+Z (undo)", () => {
        const e = makeKeyEvent({ key: "z", [mod === "Meta" ? "metaKey" : "ctrlKey"]: true });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns true for Cmd+Shift+Z / Ctrl+Shift+Z (redo)", () => {
        const e = makeKeyEvent({
            key: "Z",
            shiftKey: true,
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns true for Cmd+Backspace / Ctrl+Backspace (delete word/line back)", () => {
        const e = makeKeyEvent({
            key: "Backspace",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        expect(isNativeEditingChord(e)).toBe(true);
    });

    it("returns false for Cmd+N / Ctrl+N (new aff, not a native editing chord)", () => {
        const e = makeKeyEvent({ key: "n", [mod === "Meta" ? "metaKey" : "ctrlKey"]: true });
        expect(isNativeEditingChord(e)).toBe(false);
    });

    it("returns false for a plain typing key", () => {
        const e = makeKeyEvent({ key: "k" });
        expect(isNativeEditingChord(e)).toBe(false);
    });
});

describe("selectAllInElement", () => {
    it("selects an input's contents and reports success", () => {
        const input = document.createElement("input");
        input.value = "hello";
        let selected = false;
        input.select = () => {
            selected = true;
        };
        expect(selectAllInElement(input)).toBe(true);
        expect(selected).toBe(true);
    });

    it("selects a textarea's contents", () => {
        const textarea = document.createElement("textarea");
        let selected = false;
        textarea.select = () => {
            selected = true;
        };
        expect(selectAllInElement(textarea)).toBe(true);
        expect(selected).toBe(true);
    });

    it("selects a contentEditable's node contents", () => {
        const div = document.createElement("div");
        Object.defineProperty(div, "isContentEditable", { value: true, configurable: true });
        document.body.appendChild(div);
        expect(selectAllInElement(div)).toBe(true);
        div.remove();
    });

    it("returns false for a non-editable element", () => {
        expect(selectAllInElement(document.createElement("div"))).toBe(false);
    });

    it("returns false for null", () => {
        expect(selectAllInElement(null)).toBe(false);
    });
});

describe("shouldIntercept", () => {
    const originalNavigator = globalThis.navigator;

    beforeEach(() => {
        // Ensure we're testing with a known platform.
        vi.stubGlobal("navigator", originalNavigator);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function makeKeyEvent(init: Partial<KeyboardEventInit>): KeyboardEvent {
        return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    }

    // --- Cmd+A / Ctrl+A ---

    it("does NOT intercept Cmd+A inside a text input (native select-all)", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        const e = makeKeyEvent({
            key: "a",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        // Simulate the event originating from the input.
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
        document.body.removeChild(input);
    });

    it("does NOT intercept Cmd+A inside a textarea (grid cell-input)", () => {
        const textarea = document.createElement("textarea");
        textarea.className = "cell-input";
        document.body.appendChild(textarea);
        const e = makeKeyEvent({
            key: "a",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: textarea });
        expect(shouldIntercept(e)).toBe(false);
        document.body.removeChild(textarea);
    });

    it("does NOT intercept Cmd+A inside a contentEditable element", () => {
        const div = document.createElement("div");
        // jsdom doesn't implement isContentEditable; stub it to simulate a real browser.
        Object.defineProperty(div, "isContentEditable", { value: true, configurable: true });
        document.body.appendChild(div);
        const e = makeKeyEvent({
            key: "a",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: div });
        expect(shouldIntercept(e)).toBe(false);
        document.body.removeChild(div);
    });

    it("DOES intercept Cmd+A when focus is NOT in a text box (navigation focus, new aff)", () => {
        const e = makeKeyEvent({
            key: "a",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: document.body });
        expect(shouldIntercept(e)).toBe(true);
    });

    // --- Copy / Paste / Cut ---

    it("does NOT intercept Cmd+C inside a text input (native copy)", () => {
        const input = document.createElement("input");
        const e = makeKeyEvent({
            key: "c",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
    });

    it("does NOT intercept Cmd+V inside a text input (native paste)", () => {
        const input = document.createElement("input");
        const e = makeKeyEvent({
            key: "v",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
    });

    it("does NOT intercept Cmd+X inside a text input (native cut)", () => {
        const input = document.createElement("input");
        const e = makeKeyEvent({
            key: "x",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
    });

    // --- Undo / Redo ---

    it("does NOT intercept Cmd+Z inside a text input (native undo)", () => {
        const input = document.createElement("input");
        const e = makeKeyEvent({
            key: "z",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
    });

    it("does NOT intercept Cmd+Shift+Z inside a text input (native redo)", () => {
        const input = document.createElement("input");
        const e = makeKeyEvent({
            key: "Z",
            shiftKey: true,
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
    });

    it("DOES intercept Cmd+Z outside a text input (app undo)", () => {
        const e = makeKeyEvent({
            key: "z",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: document.body });
        expect(shouldIntercept(e)).toBe(true);
    });

    // --- Row delete ---

    it("does NOT intercept Cmd+Backspace inside a text input (native delete word/line back, not row delete)", () => {
        const input = document.createElement("input");
        const e = makeKeyEvent({
            key: "Backspace",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: input });
        expect(shouldIntercept(e)).toBe(false);
    });

    it("DOES intercept Cmd+Backspace outside a text input (row delete)", () => {
        const e = makeKeyEvent({
            key: "Backspace",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: document.body });
        expect(shouldIntercept(e)).toBe(true);
    });

    // --- Other reserved chords ---

    it("intercepts Cmd+N / Ctrl+N regardless of focus (new neg)", () => {
        const e = makeKeyEvent({
            key: "n",
            [mod === "Meta" ? "metaKey" : "ctrlKey"]: true,
        });
        Object.defineProperty(e, "target", { value: document.body });
        expect(shouldIntercept(e)).toBe(true);
    });

    it("does NOT intercept unreserved chords", () => {
        const e = makeKeyEvent({ key: "k" });
        Object.defineProperty(e, "target", { value: document.body });
        expect(shouldIntercept(e)).toBe(false);
    });
});

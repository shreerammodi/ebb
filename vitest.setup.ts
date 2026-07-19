import "@testing-library/jest-dom";

// jsdom in this environment does not provide localStorage. Supply a minimal
// in-memory polyfill so code that persists settings can run under test.
if (typeof window !== "undefined" && window.localStorage == null) {
    const store = new Map<string, string>();
    const localStorageMock: Storage = {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        key(index: number) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, String(value));
        },
    };
    Object.defineProperty(window, "localStorage", {
        value: localStorageMock,
        writable: true,
    });
}

// Base UI components (Menu, Dialog, Select) dispatch PointerEvents and branch
// on `pointerType`. jsdom doesn't implement PointerEvent; provide a MouseEvent
// subclass that carries pointerType so interactions open on click under test.
if (typeof window !== "undefined") {
    class PointerEventPolyfill extends window.MouseEvent {
        pointerId: number;
        pointerType: string;
        constructor(type: string, params: PointerEventInit = {}) {
            super(type, params);
            this.pointerId = params.pointerId ?? 1;
            this.pointerType = params.pointerType ?? "mouse";
        }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof window.PointerEvent;
}

// Base UI components (Tooltip) use ResizeObserver. jsdom doesn't implement it;
// provide a minimal polyfill.
if (typeof window !== "undefined" && !window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof window.ResizeObserver;
}

// Handsontable watches its root for visibility changes. jsdom doesn't implement
// IntersectionObserver; provide a minimal polyfill.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof window.IntersectionObserver;
}

// Base UI Select calls these during pointer interaction and keyboard
// navigation; jsdom implements neither.
if (typeof window !== "undefined") {
    if (!Element.prototype.hasPointerCapture) {
        Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.setPointerCapture) {
        Element.prototype.setPointerCapture = () => {};
    }
    if (!Element.prototype.releasePointerCapture) {
        Element.prototype.releasePointerCapture = () => {};
    }
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }
}

// matchMedia polyfill for responsive hook tests
if (typeof window !== "undefined" && !window.matchMedia) {
    window.matchMedia = () =>
        ({
            matches: false,
            media: "",
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        }) as unknown as typeof window.matchMedia;
}

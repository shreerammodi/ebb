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

// Radix UI components (DropdownMenu, Dialog) dispatch PointerEvents.
// jsdom doesn't implement PointerEvent; alias it to MouseEvent so Radix
// event handlers fire correctly under test.
if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).PointerEvent = window.MouseEvent;
}

// Radix UI components (Tooltip) use ResizeObserver. jsdom doesn't implement it;
// provide a minimal polyfill.
if (typeof window !== "undefined" && !window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof window.ResizeObserver;
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

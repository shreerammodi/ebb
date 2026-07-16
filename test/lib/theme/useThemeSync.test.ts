import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useFlowStore } from "@/lib/store/useFlowStore";
import { useThemeSync } from "@/lib/theme/useThemeSync";

function mockMatchMedia(matches: boolean) {
    window.matchMedia = (() => ({
        matches,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

describe("useThemeSync", () => {
    beforeEach(() => {
        document.documentElement.classList.remove("dark");
    });

    afterEach(() => {
        document.documentElement.classList.remove("dark");
    });

    it("adds the dark class when theme is dark", () => {
        mockMatchMedia(false);
        useFlowStore.setState({ theme: "dark" });
        const { unmount } = renderHook(() => useThemeSync());
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        unmount();
    });

    it("removes the dark class when theme is light", () => {
        mockMatchMedia(true);
        useFlowStore.setState({ theme: "light" });
        const { unmount } = renderHook(() => useThemeSync());
        expect(document.documentElement.classList.contains("dark")).toBe(false);
        unmount();
    });

    it("follows the OS preference when theme is system", () => {
        mockMatchMedia(true);
        useFlowStore.setState({ theme: "system" });
        const { unmount } = renderHook(() => useThemeSync());
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        unmount();
    });
});

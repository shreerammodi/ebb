"use client";

import { useEffect, useState } from "react";

/**
 * Hook to track window width for responsive UI decisions.
 */
export function useWindowWidth(): number {
    const [width, setWidth] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth : 0,
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const onChange = () => setWidth(window.innerWidth);

        // Initial value
        setWidth(window.innerWidth);

        // Listen for changes - fallback for environments without matchMedia
        window.addEventListener("resize", onChange);

        // Use matchMedia if available for cleaner updates
        let mql: MediaQueryList | undefined;
        if (window.matchMedia) {
            mql = window.matchMedia("(min-width: 640px)");
            mql.addEventListener("change", onChange);
        }

        return () => {
            window.removeEventListener("resize", onChange);
            if (mql && mql.removeEventListener) {
                mql.removeEventListener("change", onChange);
            }
        };
    }, []);

    return width;
}

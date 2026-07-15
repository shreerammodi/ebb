"use client";

import { domMax, LazyMotion, MotionConfig } from "motion/react";

/** Shared curve for every app animation; matches --ease-out-quart in globals.css. */
export const MOTION_TRANSITION = {
    duration: 0.2,
    ease: [0.25, 1, 0.5, 1],
} as const;

/**
 * Installs Motion once for the whole app: LazyMotion defers the feature bundle
 * (domMax, needed for layout animations) off the initial load, and MotionConfig
 * makes every animation honor prefers-reduced-motion and share one curve. strict
 * forces `m.*` usage so no eager `motion.*` import sneaks the full bundle back in.
 */
export default function MotionRoot({ children }: { children: React.ReactNode }) {
    return (
        <LazyMotion features={domMax} strict>
            <MotionConfig reducedMotion="user" transition={MOTION_TRANSITION}>
                {children}
            </MotionConfig>
        </LazyMotion>
    );
}

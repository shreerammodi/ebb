import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MotionRoot, { MOTION_TRANSITION } from "./MotionRoot";

describe("MotionRoot", () => {
    it("renders its children", () => {
        render(
            <MotionRoot>
                <p>flow content</p>
            </MotionRoot>,
        );
        expect(screen.getByText("flow content")).toBeInTheDocument();
    });

    it("exposes a shared transition matching the ease-out-quart curve", () => {
        expect(MOTION_TRANSITION.ease).toEqual([0.25, 1, 0.5, 1]);
        expect(MOTION_TRANSITION.duration).toBeLessThanOrEqual(0.22);
    });
});

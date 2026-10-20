import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import SkipRowsRow from "@/components/settings/SkipRowsRow";
import { useFlowStore } from "@/lib/store/useFlowStore";

beforeEach(() => {
    window.localStorage.clear();
    useFlowStore.setState({ skipRows: 3 });
});

describe("SkipRowsRow", () => {
    it("stores a typed count once the field commits", async () => {
        const user = userEvent.setup();
        render(<SkipRowsRow />);
        const input = screen.getByTestId("skip-rows-input");

        await user.clear(input);
        expect(useFlowStore.getState().skipRows).toBe(3);
        await user.type(input, "6{Enter}");

        expect(useFlowStore.getState().skipRows).toBe(6);
        expect(input).toHaveValue("6");
    });

    it("clamps a count past the bounds and restores the stored one for junk", async () => {
        const user = userEvent.setup();
        render(<SkipRowsRow />);
        const input = screen.getByTestId("skip-rows-input");

        await user.clear(input);
        await user.type(input, "0{Enter}");
        expect(input).toHaveValue("1");

        await user.clear(input);
        await user.type(input, "lots{Enter}");
        expect(input).toHaveValue("1");
    });
});

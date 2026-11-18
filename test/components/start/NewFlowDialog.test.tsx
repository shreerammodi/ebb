import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowStore } from "@/lib/store/useFlowStore";

import { FLOWS_DIR, installFakeFlowFs, type FakeFlowFs } from "../../support/fakeFlowFs";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import NewFlowDialog from "@/components/start/NewFlowDialog";

let fs: FakeFlowFs;

beforeEach(() => {
    fs = installFakeFlowFs();
    replace.mockReset();
    useFlowStore.setState({ newFlowOpen: true });
});
/** Base UI moves focus into the popup after mount; keys typed before land nowhere. */
async function openDialog() {
    render(<NewFlowDialog />);
    await waitFor(() =>
        expect(document.activeElement?.closest("[data-testid=new-flow-dialog]")).toBeTruthy(),
    );
}

async function createdPath(): Promise<string> {
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const paths = [...fs.files.keys()].filter((p) => p.startsWith(FLOWS_DIR + "/"));
    expect(paths).toHaveLength(1);
    return paths[0];
}

describe("NewFlowDialog", () => {
    it("offers the suggested name selected, so typing replaces it", async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.keyboard("l");
        const input = (await screen.findByTestId("new-flow-name")) as HTMLInputElement;
        expect(input.value).toMatch(/^ld-\d{4}-\d{2}-\d{2}$/);
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe(input.value.length);

        await user.keyboard("semis{Enter}");
        expect(await createdPath()).toBe(`${FLOWS_DIR}/semis.ebb`);
        expect(useFlowStore.getState().newFlowOpen).toBe(false);
    });

    it("keeps the suggestion when Enter is pressed alone", async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.keyboard("p{Enter}");
        expect(await createdPath()).toMatch(/\/policy-\d{4}-\d{2}-\d{2}\.ebb$/);
    });

    it("falls back to the suggestion when the field is cleared", async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.keyboard("p");
        await screen.findByTestId("new-flow-name");
        await user.keyboard("{Backspace}{Enter}");
        expect(await createdPath()).toMatch(/\/policy-\d{4}-\d{2}-\d{2}\.ebb$/);
    });

    it("steps back to the event list on Escape without closing", async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.keyboard("p");
        await screen.findByTestId("new-flow-name");
        await user.keyboard("{Escape}");

        expect(await screen.findByTestId("new-flow-policy")).toBeTruthy();
        expect(screen.queryByTestId("new-flow-name")).toBeNull();
        expect(useFlowStore.getState().newFlowOpen).toBe(true);

        await user.keyboard("{Escape}");
        expect(useFlowStore.getState().newFlowOpen).toBe(false);
    });
});

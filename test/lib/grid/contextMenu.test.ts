import { invoke } from "@tauri-apps/api/core";
import Handsontable from "handsontable/base";
import { registerAllModules } from "handsontable/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runExtend } = vi.hoisted(() => ({ runExtend: vi.fn() }));

vi.mock("@/lib/commands/commands", () => ({ runExtend }));

import { FLOW_CONTEXT_MENU } from "@/lib/grid/contextMenu";
import type { CellSource } from "@/lib/model/flow";
import { useFlowStore } from "@/lib/store/useFlowStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

registerAllModules();

const invoked = vi.mocked(invoke);

const SRC: CellSource = {
    app: "cardmirror",
    token: "cmsrc1abc",
    key: "doc1|perm solves",
    title: "AT - Cap K",
};

/**
 * Driven against a real grid and the real ContextMenu plugin, because what is
 * under test is which items Handsontable's own hidden-item filter keeps.
 */
describe("flow context menu", () => {
    let hot: Handsontable;

    beforeEach(() => {
        runExtend.mockReset();

        invoked.mockReset();
        invoked.mockResolvedValue({ ok: true });
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        useFlowStore.setState({ cardmirrorEnabled: true });
        const el = document.createElement("div");
        document.body.appendChild(el);
        hot = new Handsontable(el, {
            data: [
                ["Perm solves", "b"],
                ["c", "d"],
            ],
            contextMenu: FLOW_CONTEXT_MENU as unknown as string[],
            licenseKey: "non-commercial-and-evaluation",
        });
        hot.setCellMeta(0, 0, "source", SRC);
    });

    afterEach(() => {
        hot.destroy();
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    /** The item labels the menu actually renders, after hidden items are dropped. */
    function openOver(row: number, col: number): string[] {
        const plugin = hot.getPlugin("contextMenu");
        hot.selectCell(row, col);
        plugin.open({ top: 0, left: 0 });
        return Array.from(
            document.querySelectorAll<HTMLElement>(".htContextMenu .htCore td"),
            (td) => td.textContent ?? "",
        );
    }

    it("offers the jump on a cell a document sent in", () => {
        expect(openOver(0, 0)).toContain("Jump to source");
    });

    it("leaves the jump and its separator out on a cell typed here", () => {
        const items = openOver(1, 1);
        expect(items).not.toContain("Jump to source");
        expect(items.at(-1)).toBe("Extend to next speech");
    });

    it("drops the jump while the integration is switched off", () => {
        useFlowStore.setState({ cardmirrorEnabled: false });
        expect(openOver(0, 0)).not.toContain("Jump to source");
    });

    it("offers Extend for the selected flow cell", () => {
        expect(openOver(1, 1)).toContain("Extend to next speech");
    });

    it("hands Extend the grid that opened the menu", () => {
        hot.selectCell(0, 0);
        hot.getPlugin("contextMenu").executeCommand("extend_to_next_speech");
        expect(runExtend).toHaveBeenCalledWith(hot);
    });

    it("hands the cell's own token to the host", async () => {
        hot.selectCell(0, 0);
        hot.getPlugin("contextMenu").executeCommand("jump_to_source");
        await vi.waitFor(() =>
            expect(invoked).toHaveBeenCalledWith("cardmirror_jump", { source: SRC.token }),
        );
    });
});

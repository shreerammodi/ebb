import { describe, it, expect } from "vitest";

import { uid } from "./ids";

describe("uid", () => {
    it("produces unique values on successive calls", () => {
        const a = uid();
        const b = uid();
        expect(a).not.toBe(b);
    });

    it("starts with the given prefix", () => {
        const id = uid("node");
        expect(id.startsWith("node_")).toBe(true);
    });

    it('uses "id" as the default prefix', () => {
        const id = uid();
        expect(id.startsWith("id_")).toBe(true);
    });
});

import { describe, it, expect } from "vitest";

import { teamCode } from "@/lib/model/teamCode";
import type { Debater } from "@/lib/model/types";

const d = (first: string, last: string): Debater => ({ first, last });

describe("teamCode", () => {
    it("returns empty string when school is blank", () => {
        expect(teamCode("", d("Al", "Smith"), d("Bo", "Jones"))).toBe("");
    });

    it("orders two debaters by last-name initial alphabetically", () => {
        // Jones (J) before Smith (S)
        expect(teamCode("Westwood", d("Al", "Smith"), d("Bo", "Jones"))).toBe("Westwood JS");
    });

    it("keeps order when already alphabetical", () => {
        expect(teamCode("Westwood", d("Al", "Adams"), d("Bo", "Baker"))).toBe("Westwood AB");
    });

    it("falls back to first+last initial of the single debater present", () => {
        expect(teamCode("Westwood", d("Carol", "Diaz"), d("", ""))).toBe("Westwood CD");
    });

    it("uses the second debater alone if first is empty", () => {
        expect(teamCode("Westwood", d("", ""), d("Carol", "Diaz"))).toBe("Westwood CD");
    });

    it("returns just the school when no debater names are present", () => {
        expect(teamCode("Westwood", d("", ""), d("", ""))).toBe("Westwood");
    });
});

import { describe, it, expect } from "vitest";

import { parsePairing } from "./parsePairing";

describe("parsePairing", () => {
    it("LD with a named debater: name wins, code fills last", () => {
        const text = `Round 5 of Varsity Lincoln-Douglas
Start: 11:00 CDT
Room: A108
Competitors
AFF Lynbrook VV
Vikrant : he/him/his
NEG Lynbrook OM
Access Your Ballot
Judging
Shreeram Modi
he/him`;
        expect(parsePairing(text)).toEqual({
            round: "Round 5",
            affSchool: "Lynbrook",
            aff: { first: { first: "Vikrant", last: "V" } },
            negSchool: "Lynbrook",
            neg: { first: { first: "O", last: "M" } },
            judge: "Shreeram Modi",
        });
    });

    it("LD with no debater names: code splits into first/last", () => {
        const text = `Round 4 of Varsity Lincoln-Douglas
Start: 9:00 CDT
Room: L216
Competitors
AFF Strake Jesuit SW
NEG Marlborough KM
Access Your Ballot
Judging
Shreeram Modi
he/him`;
        expect(parsePairing(text)).toEqual({
            round: "Round 4",
            affSchool: "Strake Jesuit",
            aff: { first: { first: "S", last: "W" } },
            negSchool: "Marlborough",
            neg: { first: { first: "K", last: "M" } },
            judge: "Shreeram Modi",
        });
    });

    it("Policy: code is two partners' last initials; name goes on debater 1", () => {
        const text = `Round 5 of Policy Debate
Start: 2:30 EDT
Room: 309
Competitors
AFF Stuyvesant WN
NEG McDonogh LK
Henry : He/They
Access Your Ballot
Judging
Shreeram Modi
he/him`;
        expect(parsePairing(text)).toEqual({
            round: "Round 5",
            affSchool: "Stuyvesant",
            aff: { first: { first: "", last: "W" }, second: { first: "", last: "N" } },
            negSchool: "McDonogh",
            neg: { first: { first: "Henry", last: "L" }, second: { first: "", last: "K" } },
            judge: "Shreeram Modi",
        });
    });

    it("elim FLIP FOR SIDES: first team aff, judge panel joined", () => {
        const text = `Quarterfinals of Lincoln Douglas
Start: 9:00 PDT
Room: 31 (ONLINE HYBRID)
Competitors
FLIP FOR SIDES:
Marlborough OO
Olivia : she/her
Harker SS
Access Your Ballot
Judging
Ari Davidson
she/they
Shreeram Modi
he/him
Temitope Ogundare`;
        expect(parsePairing(text)).toEqual({
            round: "Quarterfinals",
            affSchool: "Marlborough",
            aff: { first: { first: "Olivia", last: "O" } },
            negSchool: "Harker",
            neg: { first: { first: "S", last: "S" } },
            judge: "Ari Davidson, Shreeram Modi, Temitope Ogundare",
        });
    });

    it("schematic row, flight number leading", () => {
        const text = `1
Peninsula SU
Coppell KT
Fox, Patrick`;
        expect(parsePairing(text)).toEqual({
            affSchool: "Peninsula",
            aff: { first: { first: "S", last: "U" } },
            negSchool: "Coppell",
            neg: { first: { first: "K", last: "T" } },
            judge: "Patrick Fox",
        });
    });

    it("schematic row, flight number trailing", () => {
        const text = `College Prep NT
Head-Royce AJ
Lopez, Delmy
2`;
        expect(parsePairing(text)).toEqual({
            affSchool: "College Prep",
            aff: { first: { first: "N", last: "T" } },
            negSchool: "Head-Royce",
            neg: { first: { first: "A", last: "J" } },
            judge: "Delmy Lopez",
        });
    });

    it("schematic row with a judge panel joins every judge", () => {
        const text = `2
Harvard-Westlake AS
Harker AA
Modi, Shreeram
Castillo, Chris
Taylor-Ward, Nigel`;
        expect(parsePairing(text)).toEqual({
            affSchool: "Harvard-Westlake",
            aff: { first: { first: "A", last: "S" } },
            negSchool: "Harker",
            neg: { first: { first: "A", last: "A" } },
            judge: "Shreeram Modi, Chris Castillo, Nigel Taylor-Ward",
        });
    });

    it("returns {} for unrecognized text", () => {
        expect(parsePairing("hello world")).toEqual({});
    });
});

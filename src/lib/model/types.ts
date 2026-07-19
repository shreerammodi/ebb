/** Participant roles in a round. */
export type Role = "aff" | "neg" | "judge";

/** Competitive sides (excludes judge). */
export type Side = "aff" | "neg";

/** One debater's name. */
export interface Debater {
    first: string;
    last: string;
}

/** Round result as recorded for scouting. */
export interface Decision {
    vote?: "aff" | "neg";
    rfd?: string;
}

/** Scouting / Info-sheet data, mirroring the Excel Info sheet. */
export interface Scouting {
    affSchool?: string;
    negSchool?: string;
    /** Aff debaters: first = 1A, second = 2A. */
    aff: { first: Debater; second: Debater };
    /** Neg debaters: first = 1N, second = 2N. */
    neg: { first: Debater; second: Debater };
    tournament?: string;
    round?: string;
    /** Flight within the round (e.g. "1"/"2"), for events that split a round into flights. */
    flight?: string;
    date?: string;
    judge?: string;
    decision?: Decision;
}

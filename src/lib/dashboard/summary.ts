import type { Round, Role, Decision } from "@/lib/model/types";
import { teamCode } from "@/lib/model/teamCode";

/** Lightweight per-flow summary for the dashboard grid (no node loading). */
export interface RoundSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  role: Role;
  /** teamCode(affSchool, 1A, 2A); "" when unscouted. */
  affTeam: string;
  /** teamCode(negSchool, 1N, 2N); "" when unscouted. */
  negTeam: string;
  tournament?: string;
  round?: string;
  date?: string;
  judge?: string;
  decision?: Decision;
}

/** Derive a RoundSummary from a full round. */
export function buildSummary(round: Round): RoundSummary {
  const sc = round.scouting;
  return {
    id: round.id,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    role: round.role,
    affTeam: teamCode(sc.affSchool ?? "", sc.aff.first, sc.aff.second),
    negTeam: teamCode(sc.negSchool ?? "", sc.neg.first, sc.neg.second),
    tournament: sc.tournament,
    round: sc.round,
    date: sc.date,
    judge: sc.judge,
    decision: sc.decision,
  };
}

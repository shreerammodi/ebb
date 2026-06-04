/** Participant roles in a round. */
export type Role = "aff" | "neg" | "judge";

/** Competitive sides (excludes judge). */
export type Side = "aff" | "neg";

/** Status a debater can assign to an opponent's argument. */
export type NodeStatus = "conceded" | "extended";

/** A single speech slot within a debate format. */
export interface Speech {
  id: string;
  name: string;
  side: Side;
  /** Allocated speaking time in seconds. */
  seconds: number;
  /** Optional grouping label for consecutive speeches that share a column header. */
  group?: string;
}

/** A debate format describing its speeches and prep time allocations. */
export interface Format {
  id: string;
  name: string;
  speeches: Speech[];
  prepSeconds: { aff: number; neg: number };
}

/** A single argument on the flow; forms a tree via parentId. */
export interface ArgumentNode {
  id: string;
  /** The sheet (flow page) this node belongs to. */
  sheetId: string;
  /** The speech column this node belongs to. */
  speechId: string;
  /** Parent node id, or null for root-level arguments. */
  parentId: string | null;
  /** Vertical sort key within a (sheet, speech) column. */
  order: number;
  text: string;
  statuses: NodeStatus[];
  /** Emphasis decoration (renders bold). */
  bold: boolean;
  /** Override the auto-generated display number for this node. */
  numberOverride?: number | null;
}

/** A flow sheet (page) grouping arguments. */
export interface Sheet {
  id: string;
  title: string;
  group: "aff" | "neg";
  /** Display order among sheets. */
  order: number;
  /** Sheet variety. Absent / 'flow' = the normal argument grid. 'cx' = the cross-ex sheet. */
  kind?: "flow" | "cx";
  /** Leftmost speech column shown (absent = derive from side). */
  startSpeechId?: string;
}

/** Live timer state for the current round. */
export interface TimerState {
  activeSpeechId: string | null;
  speechRemaining: number | null;
  running: boolean;
  prepRemaining: { aff: number; neg: number };
  /** Which side's prep timer is currently counting down, or null if neither. */
  prepRunning: Side | null;
}

/** Optional round metadata (tournament context, participants). */
export interface RoundMeta {
  tournament?: string;
  roundLabel?: string;
  judge?: string;
  affName?: string;
  negName?: string;
  opponent?: string;
}

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
  date?: string;
  judge?: string;
  decision?: Decision;
}

/** Top-level aggregate representing a complete debate round. */
export interface Round {
  id: string;
  createdAt: number;
  updatedAt: number;
  role: Role;
  format: Format;
  meta: RoundMeta;
  scouting: Scouting;
  sheets: Sheet[];
  nodes: ArgumentNode[];
  timers: TimerState;
}

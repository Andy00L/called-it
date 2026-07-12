/**
 * Types derived from docs/txline-openapi.yaml (TxLINE OpenAPI spec).
 * Fields we do not consume yet are kept as unknown-typed passthrough.
 */

export interface Fixture {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

/** One odds record: a single bookmaker line, plus demargined StablePrice percentages. */
export interface OddsPayload {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  /** Market type, e.g. match odds, totals, handicaps. */
  SuperOddsType: string;
  GameState?: string;
  InRunning: boolean;
  MarketParameters?: string;
  MarketPeriod?: string;
  /** Outcome labels, aligned with Prices and Pct. */
  PriceNames: string[];
  /** Odds in integer format. */
  Prices: number[];
  /** StablePrice demargined percentages: "NN.NNN" or "NA". */
  Pct?: string[];
}

export interface SoccerPeriodScore {
  Goals?: number;
  YellowCards?: number;
  RedCards?: number;
  Corners?: number;
}

/** Period keys observed in the spec: H1, HT, H2, ET1, ET2, PE, ETTotal, Total. */
export interface SoccerTotalScore {
  H1?: SoccerPeriodScore;
  HT?: SoccerPeriodScore;
  H2?: SoccerPeriodScore;
  ET1?: SoccerPeriodScore;
  ET2?: SoccerPeriodScore;
  PE?: SoccerPeriodScore;
  ETTotal?: SoccerPeriodScore;
  Total?: SoccerPeriodScore;
}

export interface SoccerFixtureScore {
  Participant1?: SoccerTotalScore;
  Participant2?: SoccerTotalScore;
}

/**
 * Event-specific payload under `Data`. Shape varies by Action (ground truth from
 * the live devnet feed, not the OpenAPI camelCase schema):
 * - goal: { GoalType, PlayerId }
 * - yellow_card: { PlayerId }
 * - red_card: { PlayerId, Type }        e.g. Type "StraightRed"
 * - var: { Type }                        e.g. Type "Goal" (what is under review)
 * - var_end: { Outcome }                 e.g. "Overturned" (review verdict)
 * - shot: { Outcome }                    e.g. "OffTarget"
 * - possible: { Corner, Goal, Penalty }  pre-signal booleans
 * - substitution: { Participant, PlayerInId, PlayerOutId }
 * - action_amend: { Action, New, Previous }  correction diff of a prior event
 *   (observed in the USA vs Bosnia capture; not in the OpenAPI spec)
 */
export interface SoccerData {
  GoalType?: string;
  PlayerId?: number;
  PlayerInId?: number;
  PlayerOutId?: number;
  Participant?: number;
  Type?: string;
  Outcome?: string;
  Corner?: boolean;
  Goal?: boolean;
  Penalty?: boolean;
  /** jersey action only: the team's shirt color, e.g. "white". */
  Color?: string;
  /** action_amend only: which action kind was corrected. */
  Action?: string;
  /** action_amend only: corrected and prior event payloads. */
  New?: unknown;
  Previous?: unknown;
}

export interface MatchClock {
  Running: boolean;
  Seconds: number;
}

/**
 * Lineups payload (ground truth from the live mainnet feed, 2026-07-12,
 * Argentina vs Switzerland; absent from the OpenAPI spec). One entry per
 * team; `lineups` is the full squad, `starter` marks the eleven.
 */
export interface LineupPlayerIdentity {
  /** Stable player id; joins the PlayerStats map keys. */
  normativeId?: number;
  country?: string;
  dateOfBirth?: string;
  /** Display name as served, e.g. "Messi, Lionel". */
  preferredName?: string;
}

export interface LineupRosterEntry {
  fixturePlayerId?: number;
  statusId?: number;
  /** Position group id; observed live: 34 GK, 35 DEF, 36 MID, 37 FWD. */
  positionId?: number;
  unitId?: number;
  /** Shirt number, served as a string. */
  rosterNumber?: string;
  starter?: boolean;
  starred?: boolean;
  player?: LineupPlayerIdentity;
}

export interface LineupTeamEntry {
  /** Team id; matches the record's Participant1Id / Participant2Id. */
  normativeId?: number;
  preferredName?: string;
  lineups?: LineupRosterEntry[];
}

/** Per-player cumulative counters; keys are player normativeIds as strings. */
export interface PlayerStatLine {
  goals?: number;
  yellowCards?: number;
  redCards?: number;
}

/**
 * PlayerStats rides only SOME score records (goals, cards); it is a cumulative
 * snapshot, so the newest occurrence replaces the previous one wholesale.
 * Observed live 2026-07-12; absent from the OpenAPI spec.
 */
export interface PlayerStatsRecord {
  Participant1?: Record<string, PlayerStatLine>;
  Participant2?: Record<string, PlayerStatLine>;
}

export type SoccerPossessionType =
  | 'AttackPossession'
  | 'DangerPossession'
  | 'HighDangerPossession'
  | 'SafePossession';

/**
 * One scores-feed record. The live API returns PascalCase keys (the OpenAPI spec
 * documents camelCase, which does not match reality). `Score` carries the
 * cumulative per-period state; `Data` carries the event payload.
 */
export interface ScoresUpdate {
  FixtureId: number;
  Ts: number;
  Seq?: number;
  Id?: number;
  /** Sport tag, e.g. "Soccer". */
  Type?: string;
  /** snake_case event kind: goal, corner, yellow_card, red_card, var, shot, possible, substitution, ... */
  Action?: string;
  GameState?: string;
  StatusId?: number;
  /** Only settle on confirmed events (VAR-safe). */
  Confirmed?: boolean;
  /** Acting team: 1 or 2. */
  Participant?: number;
  Clock?: MatchClock;
  /** Cumulative score/stat state per period. Primary source of truth for resolution. */
  Score?: SoccerFixtureScore;
  Data?: SoccerData;
  /** Encoded stat map: key = (period * 1000) + base_key. Often empty; prefer Score. */
  Stats?: Record<string, number>;
  Possession?: number;
  PossessionType?: SoccerPossessionType;
  PossibleEvent?: Record<string, boolean>;
  Parti1State?: unknown;
  Parti2State?: unknown;
  Lineups?: LineupTeamEntry[];
  /** Cumulative per-player counters; rides only some records (see type). */
  PlayerStats?: PlayerStatsRecord;
  /** kickoff_team action: which side kicks off. */
  Kickoff?: { Team?: number };
  CompetitionId?: number;
  CountryId?: number;
  SportId?: number;
  FixtureGroupId?: number;
  StartTime?: number;
  IsTeam?: boolean;
  Participant1Id?: number;
  Participant2Id?: number;
  Participant1IsHome?: boolean;
}

/**
 * Merkle proof material served by GET /api/scores/stat-validation, used to
 * call Txoracle validate_stat on-chain (read-only .view()). The spec marks
 * binary fields as strings, but the live API serves raw JSON byte arrays
 * (verified on mainnet 2026-07-09); both shapes are accepted.
 */
export type OracleBinary = number[] | string;

export interface OracleProofNode {
  hash: OracleBinary;
  isRightSibling: boolean;
}

/** One provable key-value statistic; key encodes (period * 1000) + base_key. */
export interface OracleScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface OracleScoresUpdateStats {
  updateCount: number;
  minTimestamp: number;
  maxTimestamp: number;
}

export interface OracleScoresBatchSummary {
  fixtureId: number;
  updateStats: OracleScoresUpdateStats;
  eventStatsSubTreeRoot: OracleBinary;
}

/** Response of GET /api/scores/stat-validation (legacy one or two stat mode). */
export interface ScoresStatValidation {
  ts: number;
  statToProve: OracleScoreStat;
  eventStatRoot: OracleBinary;
  summary: OracleScoresBatchSummary;
  /** List_ProofNode is nullable in the spec (Nil variant). */
  statProof: OracleProofNode[] | null;
  subTreeProof: OracleProofNode[] | null;
  mainTreeProof: OracleProofNode[] | null;
  statToProve2?: OracleScoreStat;
  statProof2?: OracleProofNode[] | null;
}

/** Parsed SSE frame before JSON decoding of data. */
export interface SseFrame {
  id?: string;
  event?: string;
  data: string;
  retryMs?: number;
}

export interface Heartbeat {
  Ts: number;
}

export type StreamMessage<T> =
  | { kind: 'data'; id?: string; payload: T }
  | { kind: 'heartbeat'; ts: number };

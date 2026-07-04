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
  Lineups?: unknown[];
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

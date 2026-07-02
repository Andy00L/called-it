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

export interface SoccerData {
  Action?: string;
  Goal?: boolean;
  GoalType?: string;
  Minutes?: number;
  PlayerId?: number;
  PlayerInId?: number;
  PlayerOutId?: number;
  Penalty?: boolean;
  YellowCard?: boolean;
  RedCard?: boolean;
  VAR?: boolean;
  Conditions?: unknown[];
}

export interface SoccerPossibleNeutralEvent {
  RedCard?: boolean;
  YellowCard?: boolean;
  VAR?: boolean;
}

export interface SoccerPossiblePartiEvent {
  Goal?: boolean;
  Penalty?: boolean;
  Corner?: boolean;
}

export interface SoccerPartiState {
  PossibleEvent?: SoccerPossiblePartiEvent;
}

export type SoccerPossessionType =
  | 'AttackPossession'
  | 'DangerPossession'
  | 'HighDangerPossession'
  | 'SafePossession';

/** One scores-feed update. Soccer-relevant subset of the Scores schema. */
export interface ScoresUpdate {
  fixtureId: number;
  gameState?: string;
  startTime?: number;
  isTeam?: boolean;
  fixtureGroupId?: number;
  competitionId?: number;
  countryId?: number;
  sportId?: number;
  participant1IsHome?: boolean;
  participant1Id?: number;
  participant2Id?: number;
  action?: string;
  id?: number;
  ts: number;
  seq?: number;
  confirmed?: boolean;
  statusSoccerId?: number | string;
  scoreSoccer?: SoccerFixtureScore;
  dataSoccer?: SoccerData;
  /** Encoded stat map: key = (period * 1000) + base_key. */
  stats?: Record<string, number>;
  participant?: number;
  possession?: number;
  possessionType?: SoccerPossessionType;
  possibleEventSoccer?: SoccerPossibleNeutralEvent;
  parti1StateSoccer?: SoccerPartiState;
  parti2StateSoccer?: SoccerPartiState;
  lineups?: unknown[];
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

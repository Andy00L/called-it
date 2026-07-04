import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { err, ok, type Result } from '@calledit/txline';

/**
 * Tapes: one append-only NDJSON file per fixture, every payload the worker
 * receives from either stream, stamped with the arrival wall clock.
 *
 * Why tapes exist: judging happens after the final with zero live matches,
 * and the API's scores/historical endpoint returned invalid JSON on devnet
 * (docs/FEEDBACK.md, finding 2). Self-recorded tapes make the Time Machine
 * independent of that bug, feed deterministic engine tests, and preserve
 * demo material that cannot be re-captured once a match ends.
 */

export type TapeStream = 'scores' | 'odds';

export interface TapeEntry {
  /** Wall-clock arrival time at the worker, epoch milliseconds. */
  receivedAtMs: number;
  stream: TapeStream;
  payload: unknown;
}

export interface TapeDeck {
  directory: string;
}

/** Create the tape directory (idempotent) and return the deck handle. */
export function openTapeDeck(directory: string): Result<TapeDeck, string> {
  try {
    mkdirSync(directory, { recursive: true });
    return ok({ directory });
  } catch (cause) {
    return err(`openTapeDeck: cannot create ${directory}: ${describeCause(cause)}`);
  }
}

export function tapeFilePath(deck: TapeDeck, fixtureId: number): string {
  return resolve(deck.directory, `fixture-${fixtureId}.ndjson`);
}

/**
 * Append one entry to a fixture tape. Synchronous append keeps every line
 * whole on crash; at match event rates (a few lines per second across all
 * fixtures) the write cost is negligible.
 */
export function appendTapeEntry(
  deck: TapeDeck,
  fixtureId: number,
  entry: TapeEntry,
): Result<void, string> {
  try {
    appendFileSync(tapeFilePath(deck, fixtureId), `${JSON.stringify(entry)}\n`);
    return ok(undefined);
  } catch (cause) {
    return err(`appendTapeEntry: fixture ${fixtureId}: ${describeCause(cause)}`);
  }
}

export interface TapeReadResult {
  entries: TapeEntry[];
  /** Lines that failed to parse or validate (for example a torn final line after a crash). */
  skippedLineCount: number;
}

/** Load a tape in arrival order, tolerating torn or foreign lines. */
export function readTape(filePath: string): Result<TapeReadResult, string> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (cause) {
    return err(`readTape: cannot read ${filePath}: ${describeCause(cause)}`);
  }

  const entries: TapeEntry[] = [];
  let skippedLineCount = 0;
  for (const line of raw.split('\n')) {
    if (line === '') {
      continue;
    }
    const parsed = parseTapeLine(line);
    if (parsed === null) {
      skippedLineCount += 1;
      continue;
    }
    entries.push(parsed);
  }
  return ok({ entries, skippedLineCount });
}

function parseTapeLine(line: string): TapeEntry | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const receivedAtMs = record['receivedAtMs'];
  const stream = record['stream'];
  if (typeof receivedAtMs !== 'number') {
    return null;
  }
  if (stream !== 'scores' && stream !== 'odds') {
    return null;
  }
  return { receivedAtMs, stream, payload: record['payload'] };
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

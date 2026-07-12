import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  appendTapeEntry,
  openTapeDeck,
  readTape,
  readTapeFinalScore,
  tapeFilePath,
} from './tape.js';

const scratchDirectory = mkdtempSync(join(tmpdir(), 'calledit-tape-'));

after(() => {
  rmSync(scratchDirectory, { recursive: true, force: true });
});

test('tape round-trip preserves entries in arrival order', () => {
  const deckResult = openTapeDeck(join(scratchDirectory, 'deck-a'));
  assert.ok(deckResult.ok);
  const deck = deckResult.value;

  const first = appendTapeEntry(deck, 18198205, {
    receivedAtMs: 1000,
    stream: 'scores',
    payload: { FixtureId: 18198205, Action: 'goal' },
  });
  const second = appendTapeEntry(deck, 18198205, {
    receivedAtMs: 2000,
    stream: 'odds',
    payload: { FixtureId: 18198205, SuperOddsType: '1X2_PARTICIPANT_RESULT' },
  });
  assert.ok(first.ok);
  assert.ok(second.ok);

  const readResult = readTape(tapeFilePath(deck, 18198205));
  assert.ok(readResult.ok);
  assert.equal(readResult.value.entries.length, 2);
  assert.equal(readResult.value.skippedLineCount, 0);
  assert.equal(readResult.value.entries[0]?.stream, 'scores');
  assert.equal(readResult.value.entries[1]?.receivedAtMs, 2000);
});

test('tapes for different fixtures land in different files', () => {
  const deckResult = openTapeDeck(join(scratchDirectory, 'deck-b'));
  assert.ok(deckResult.ok);
  const deck = deckResult.value;
  assert.notEqual(tapeFilePath(deck, 1), tapeFilePath(deck, 2));
});

test('readTape skips torn and foreign lines instead of failing', () => {
  const deckResult = openTapeDeck(join(scratchDirectory, 'deck-c'));
  assert.ok(deckResult.ok);
  const deck = deckResult.value;

  const appended = appendTapeEntry(deck, 42, {
    receivedAtMs: 1,
    stream: 'scores',
    payload: {},
  });
  assert.ok(appended.ok);
  // Simulate a crash mid-write plus a line some other tool dropped in.
  appendFileSync(tapeFilePath(deck, 42), '{"receivedAtMs": 2, "stream": "sco');
  appendFileSync(tapeFilePath(deck, 42), '\n{"unrelated": true}\n');

  const readResult = readTape(tapeFilePath(deck, 42));
  assert.ok(readResult.ok);
  assert.equal(readResult.value.entries.length, 1);
  assert.equal(readResult.value.skippedLineCount, 2);
});

test('readTape reports a missing file as an error value', () => {
  const readResult = readTape(join(scratchDirectory, 'does-not-exist.ndjson'));
  assert.equal(readResult.ok, false);
});

test('readTapeFinalScore prefers game_finalised over later odds ticks', () => {
  const deckResult = openTapeDeck(join(scratchDirectory, 'deck-d'));
  assert.ok(deckResult.ok);
  const deck = deckResult.value;

  appendTapeEntry(deck, 77, {
    receivedAtMs: 1,
    stream: 'scores',
    payload: {
      FixtureId: 77,
      Action: 'goal',
      Score: { Participant1: { Total: { Goals: 1 } } },
    },
  });
  appendTapeEntry(deck, 77, {
    receivedAtMs: 2,
    stream: 'scores',
    payload: {
      FixtureId: 77,
      Action: 'game_finalised',
      Score: {
        Participant1: { Total: { Goals: 3 } },
        Participant2: { Total: { Goals: 1 } },
      },
    },
  });
  // Post-match odds ticks after the whistle must not hide the final.
  appendTapeEntry(deck, 77, {
    receivedAtMs: 3,
    stream: 'odds',
    payload: { FixtureId: 77, SuperOddsType: '1X2_PARTICIPANT_RESULT' },
  });

  const score = readTapeFinalScore(tapeFilePath(deck, 77));
  assert.ok(score !== null);
  assert.equal(score.Participant1?.Total?.Goals, 3);
  assert.equal(score.Participant2?.Total?.Goals, 1);
});

test('readTapeFinalScore is null for a scoreless (pre-match) tape', () => {
  const deckResult = openTapeDeck(join(scratchDirectory, 'deck-e'));
  assert.ok(deckResult.ok);
  const deck = deckResult.value;
  appendTapeEntry(deck, 78, {
    receivedAtMs: 1,
    stream: 'odds',
    payload: { FixtureId: 78, SuperOddsType: '1X2_PARTICIPANT_RESULT' },
  });
  assert.equal(readTapeFinalScore(tapeFilePath(deck, 78)), null);
  assert.equal(readTapeFinalScore(join(scratchDirectory, 'absent.ndjson')), null);
});

# TxLINE API feedback (CALLED IT build log)

Running notes on the TxLINE developer experience, kept as we build. This is the feedback
deliverable for the submission. Environment: devnet, Service Level 1 (60s delayed World Cup),
observed 2026-07-02.

## What worked well

- **Access flow is clean and fast.** Guest JWT -> on-chain `subscribe` -> `token/activate`
  worked end to end in minutes. The two-tier auth (JWT + `X-Api-Token`) is simple to wire.
- **Free World Cup tier on devnet serves real fixtures.** `fixtures/snapshot` returned the
  actual tournament: USA vs Bosnia, Spain vs Austria, Portugal vs Croatia, Argentina vs Cape
  Verde, etc. Great for building against real data before mainnet real-time (SL12).
- **StablePrice consensus is exactly as advertised and genuinely useful.** For Spain vs Austria
  the `1X2_PARTICIPANT_RESULT` market returned `Pct` = 55.804 / 34.710 / 9.524, summing to
  ~100% (properly de-margined). Clean probabilities with no bookmaker vig to strip. This is the
  single most valuable field for a consumer product.
- **Rich soccer event vocabulary.** `Action` covers goal, corner, yellow_card, red_card, var,
  var_end, shot, substitution, free_kick, throw_in, goal_kick, injury, plus possession states
  (attack/danger/high_danger/safe) and a `possible` pre-signal event. Far more than "scores".
- **`Confirmed` flag on events** makes VAR-safe settlement possible: wait for confirmation
  before resolving. For a "provable outcomes" product this is essential and much appreciated.
- **`Clock` = { Running, Seconds }** gives an authoritative match clock, so call windows can be
  expressed in real match minutes rather than wall-clock guesses.

## Frictions and discrepancies (would help to fix)

1. **Scores payloads are PascalCase, but the OpenAPI spec documents camelCase.** The spec
   `Scores` schema lists `fixtureId`, `gameState`, `action`, `scoreSoccer`, `dataSoccer`,
   `stats`, `possessionType`. The live feed actually returns `FixtureId`, `GameState`,
   `Action`, `Score`, `Data`, `Stats`, `PossessionType`. We lost time typing against the spec
   before discovering this from real payloads. Either the spec or the serializer should be
   aligned. (Odds payloads, by contrast, match the spec's PascalCase.)

2. **`scores/historical/{fixtureId}` returned invalid JSON** on devnet for a finished match
   (18172379). The call succeeds at the HTTP layer but the body does not parse as JSON. We fell
   back to `scores/snapshot`. Worth checking the historical serializer. (This endpoint is
   important for us: it powers a post-tournament "replay" mode, which matters because judging
   happens after the final.)

3. **`subscribe` requires weeks to be a multiple of 4**, enforced on-chain
   (`InvalidWeeks`, code 6041), but the quickstart example uses `DURATION_WEEKS = 4` without
   stating the constraint. A one-line note in the docs would save a failed transaction.

4. **`scores/snapshot` semantics are non-obvious.** It returns one latest record per `Action`
   type (a state snapshot), not a chronological event log. For a finished match we got 40
   records, one per distinct action. This is fine once understood, but the docs could say so,
   and clarify that the full timeline comes from the stream (or historical, once fixed).

5. **`GameState` looked unreliable in snapshots** (a finished match still showed
   `GameState: "scheduled"` while `Clock.Seconds` was ~4900 and `StatusId: 4`). We plan to key
   match phase off `StatusId` + `Clock` instead. Documenting the `StatusId` enum would help.

6. **Odds snapshot is empty for finished/late fixtures.** `odds/snapshot` returned 0 records
   for a finished match and for a match ~10h out (Portugal vs Croatia), but 32 records for one
   ~6h out (Spain vs Austria). The in-running vs pre-match availability window is undocumented.

## Confirmed schema (ground truth, for our own reference)

- Score event top-level (PascalCase): `FixtureId, Ts, Seq, Id, Type, Action, GameState,
  StatusId, Confirmed, Participant, Clock{Running,Seconds}, Score, Data, Stats, Possession,
  PossessionType, PossibleEvent, Parti1State, Parti2State, Lineups, CompetitionId, CountryId,
  SportId, ...`
- `Score.ParticipantN.{H1,HT,H2,ET1,ET2,PE,Total}.{Goals,YellowCards,RedCards,Corners}` =
  cumulative per-period state. Primary resolution source (diff between updates).
- `Data` by action: goal `{GoalType, PlayerId}`, red_card `{PlayerId, Type}`, yellow_card
  `{PlayerId}`, var `{Type}`, shot `{Outcome}`, possible `{Corner, Goal, Penalty}`,
  substitution `{Participant, PlayerInId, PlayerOutId}`.
- Odds markets seen: `1X2_PARTICIPANT_RESULT`, `ASIANHANDICAP_PARTICIPANT_GOALS`,
  `OVERUNDER_PARTICIPANT_GOALS`. `Pct` aligns with `PriceNames` / `Prices`.

## Still to verify (needs a live match)

- Live SSE latency on SL12 (mainnet real-time). Target: goal visible in-app < 5s.
- `possible` / `PossessionType` frequency and lead time during live play (drives the
  anticipation UX).
- JWT/token behavior across long-lived stream reconnects (401 handling).

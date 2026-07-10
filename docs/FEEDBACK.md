# TxLINE API feedback (CALLED IT build log)

Running notes on the TxLINE developer experience, kept as we build. This is the feedback
deliverable for the submission. Environments: devnet, Service Level 1 (60s delayed World Cup),
observed 2026-07-02; mainnet Service Level 12 (real-time) in 24/7 production use since
2026-07-04; Txoracle stat-validation exercised on mainnet on 2026-07-09.

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

7. **Snapshot `Ts` ordering does not match `Score` content across action types.** In the USA
   vs Bosnia snapshot, the `var_end` record (Ts ...697480) already carried the post-overturn
   2-0 `Score`, while a `yellow_card` record with a LATER Ts (...787970) still carried the 1-0
   state. Consumers reconstructing a final from a snapshot must read the `game_finalised`
   record, not the latest-Ts record of any type and not file order. Related: `Score` is not
   strictly monotonic under corrections (a VAR decision can add or remove goals), which makes
   the `Confirmed` flag the only safe settlement trigger. Documenting both would save
   consumers from subtle scoring bugs.

8. **Undocumented lifecycle and correction actions exist and look useful.** The same capture
   contains `action_amend` (with `Data = { Action, New, Previous }`, a diff of a corrected
   earlier event), `action_discarded`, `var_end` carrying `Data.Outcome` (`"Overturned"`),
   plus `clock_adjustment` (zeroes the clock at full time: `Clock = { Running: false,
   Seconds: 0 }`), `status`, and `disconnected`. None of these appear in the OpenAPI spec.
   The correction actions are exactly what a consumer app needs to display VAR drama
   correctly, and `clock_adjustment` matters to anyone keying UI off the clock, so
   documenting them would be high value.

## Oracle stat-validation (mainnet, observed 2026-07-09)

The headline first: the full proof chain works. `scores/stat-validation` returns a Merkle
proof that `Txoracle.validate_stat(...).view()` (read-only, free) confirms against the
`daily_scores_roots` PDA. We verified our settled finals (goals, corners, cards) for a real
finished match, including a negative control (value + 1 -> false). A consumer app can prove
its displayed outcomes against TxODDS's own on-chain roots with no wallet cost. That is a
strong, differentiating capability. The frictions below are all documentation gaps around it.

9. **Binary proof fields are raw JSON byte arrays; the spec types them as strings.**
   In the `scores/stat-validation` response, the summary root, proof nodes, and related
   binary fields arrive as arrays of numbers (raw bytes). A client generated from the
   OpenAPI spec fails to parse them. Easy to decode once discovered, but the spec should
   match the serializer.

10. **The statKey encoding is undocumented.** We derived it empirically:
    `key = period * 1000 + base`, with periods 0=Total, 1=H1, 2=HT, 3=H2, 4..7=ET1/ET2/PE/
    ET-Total, and bases 1=P1 goals, 2=P2 goals, 3=P1 yellows, 4=P2 yellows, 5=P1 reds,
    6=P2 reds, 7=P1 corners, 8=P2 corners. A small table in the docs would save every
    integrator a discovery session.

11. **The response `period` field is always 100** (an internal id), regardless of the period
    encoded in the requested statKey, and it must be passed through unchanged into
    `validate_stat`. One line in the docs would prevent second-guessing.

12. **The mainnet `fixtures/snapshot` window is future-only.** Finished fixtures drop out of
    the snapshot, so team names for a match that just ended cannot be fetched after the
    fact. Any product joining stats to names post-match needs its own cache (we persist a
    fixtures-seen file). Documenting the window, or offering a fixture lookup by id, would
    remove that burden.

13. **Daily root posting cadence is undocumented.** The `daily_scores_roots` entry for an
    epoch day appears well after the day's matches end: our receipts show "proof pending"
    on match night and "VERIFIED" the next morning. Publishing the posting schedule would
    let products set user expectations precisely.

14. **The mainnet Txoracle IDL was not fetchable on-chain.** `anchor idl fetch` returned
    nothing for the mainnet program, so we carry a local IDL copy in the repo. Publishing
    the IDL on-chain or in the docs would remove a manual, error-prone step.

## Confirmed schema (ground truth, for our own reference)

- Score event top-level (PascalCase): `FixtureId, Ts, Seq, Id, Type, Action, GameState,
  StatusId, Confirmed, Participant, Clock{Running,Seconds}, Score, Data, Stats, Possession,
  PossessionType, PossibleEvent, Parti1State, Parti2State, Lineups, CompetitionId, CountryId,
  SportId, ...`
- `Score.ParticipantN.{H1,HT,H2,ET1,ET2,PE,Total}.{Goals,YellowCards,RedCards,Corners}` =
  cumulative per-period state. Primary resolution source (diff between updates).
- `Data` by action: goal `{GoalType, PlayerId}`, red_card `{PlayerId, Type}`, yellow_card
  `{PlayerId}`, var `{Type}`, var_end `{Outcome}` (e.g. `"Overturned"`), shot `{Outcome}`,
  possible `{Corner, Goal, Penalty}`, substitution `{Participant, PlayerInId, PlayerOutId}`,
  action_amend `{Action, New, Previous}`, action_discarded `{}`.
- Odds markets seen: `1X2_PARTICIPANT_RESULT`, `ASIANHANDICAP_PARTICIPANT_GOALS`,
  `OVERUNDER_PARTICIPANT_GOALS`. `Pct` aligns with `PriceNames` / `Prices`.

## Verified live on mainnet SL12 (24/7 since 2026-07-04)

- **Latency target met.** Our worker measures feed latency continuously (event `Ts` to
  arrival): odds stream p50 around 245 ms and p95 around 475 ms on rolling samples; scores
  events during live play typically arrive in 150 to 500 ms. Goal-to-screen in the app is
  comfortably under the 5 s target; the in-app latency HUD shows last/p50/p95 per stream.
- **Long-lived streams behave.** SSE reconnect plus guest JWT re-acquisition on 401 are
  wired in; the worker has run continuously since 2026-07-04 across multiple redeploys with
  no manual token intervention.
- Still open: quantifying `possible` / `PossessionType` pre-signal lead time during live
  play (we display the danger states but have not measured how far they lead the event).

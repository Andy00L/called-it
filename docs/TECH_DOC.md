# CALLED IT: technical brief

The submission tech doc for the TxODDS World Cup Hackathon (Consumer and Fan
Experiences track). Core idea, architecture, the exact TxLINE endpoints used,
the Solana integrations, and the business path, on one page.

| Deliverable | Where |
| --- | --- |
| Live app | [called-it-web-murex.vercel.app](https://called-it-web-murex.vercel.app) |
| Live API | [worker-production-6555.up.railway.app/health](https://worker-production-6555.up.railway.app/health) |
| Public repo | [github.com/Andy00L/called-it](https://github.com/Andy00L/called-it) |
| API feedback | [docs/FEEDBACK.md](FEEDBACK.md) |

## 🎯 Core idea

CALLED IT is a free live prediction game for the 2026 World Cup where the
betting market itself is the scoring rule and every call is provable on
Solana. During a live match a fan locks short-window calls (a corner in the
next 10 minutes, a goal before half-time). A hit pays `round(100 / p)` points,
capped at 2000, where `p` is the de-margined market probability at the moment
of the lock, so calling a 12 percent upset pays 833 and following the crowd
pays little. Consecutive hits multiply the next one by 1.1, up to 3.0x.

Two mechanisms make it more than a quiz:

- **The Bookie.** A ghost opponent mirrors every human call with the market
  favorite. The leaderboard question is not "did you guess", it is "did you
  beat the market". A calibration profile (edge vs market, Brier score,
  confidence buckets) tells each player whether their reads are real.
- **Receipts, anchored before the outcome.** Every locked pick is hashed into
  a Merkle tree whose root posts to Solana in a Memo transaction on a 60
  second batch, before the event resolves. The public receipt page recomputes
  the Merkle proof and, once TxODDS publishes its daily root, cross-checks
  the settled final against the Txoracle program on-chain. A win is a
  verifiable object, not a screenshot.

Because judging happens after the final, the app ships a **Time Machine**:
the worker records every match feed to a tape, and a finished match can be
replayed through the same engine at 1x, 10x, or 60x, with the same lock flow
and settlements (replay scores never touch the official leaderboard).

## 🏗 Architecture

```mermaid
flowchart TD
    subgraph txline["TxLINE by TxODDS"]
        scores["scores SSE stream"]
        odds["odds SSE stream, StablePrice"]
        statval["scores/stat-validation"]
    end
    subgraph worker["Worker, Node 22 on Railway, 24/7"]
        ingest["ingest: dual SSE, reconnect, 401 refresh"]
        state["match state reducer"]
        engine["engine: pricing, windows, Bookie, calibration"]
        tapes["NDJSON tapes"]
        replay["Time Machine replay sessions"]
        commit["commitment batcher, 60s Merkle root"]
        verify["oracle verifier, validate_stat view"]
        fanout["HTTP + SSE fan-out"]
    end
    subgraph solana["Solana mainnet"]
        memo["Memo tx with Merkle root"]
        txoracle["Txoracle daily_scores_roots"]
    end
    subgraph web["Web app, Next.js 16 on Vercel"]
        lobby["lobby, live match, replay"]
        receipt["public receipt /r/pickId"]
    end
    scores -->|"Confirmed events"| ingest
    odds -->|"de-margined percentages"| ingest
    ingest --> state
    state --> engine
    ingest -->|"append"| tapes
    tapes --> replay
    engine --> fanout
    replay --> fanout
    engine --> commit
    commit -->|"root, before outcomes"| memo
    statval -->|"Merkle proof"| verify
    verify -->|"view(), read-only"| txoracle
    verify --> fanout
    lobby -->|"POST /picks, SSE /live"| fanout
    receipt -->|"GET /receipts/:pickId"| fanout
    classDef feed fill:#F0EBDD,stroke:#67705F,color:#12170F
    classDef svc fill:#EAF4EB,stroke:#2C8C3C,color:#1F6B2C
    classDef chain fill:#F6F3EA,stroke:#B87514,color:#12170F
    class scores,odds,statval feed
    class ingest,state,engine,tapes,replay,commit,verify,fanout,lobby,receipt svc
    class memo,txoracle chain
```

Beige, TxLINE inputs; green, CALLED IT services; paper, Solana.

Failure paths are engineered, not hoped away: settlement credits only events
the feed marks `Confirmed`, so a VAR overturn cannot pay a dead call; a failed
memo posts nothing and retries, so no pick is ever marked committed without a
real transaction; oracle verification failing leaves the receipt intact with a
distinct `pending` or `unavailable` status; if Supabase is unreachable the
worker degrades to in-memory persistence and says so in its logs.

## 🔗 TxLINE endpoints used

Live product inputs (running 24/7 on mainnet Service Level 12, real-time):

| Endpoint | Role in CALLED IT |
| --- | --- |
| `POST {origin}/auth/guest/start` | guest JWT (re-acquired automatically on 401) |
| `POST /api/token/activate` | API token from the on-chain subscription + wallet signature |
| `GET /api/fixtures/snapshot` | fixture catalog and team names (30 day forward window) |
| `GET /api/scores/stream` (SSE) | every match event; `Confirmed` drives all settlements |
| `GET /api/odds/stream` (SSE) | StablePrice de-margined probabilities; prices every call |
| `GET /api/scores/stat-validation` | Merkle proofs of final stats, fed into on-chain verification |

Research and verification tooling (spike runbooks, committed):

| Endpoint | Used for |
| --- | --- |
| `GET /api/odds/snapshot/{fixtureId}`, `GET /api/odds/updates/{fixtureId}` | market shape study, model rates |
| `GET /api/scores/snapshot/{fixtureId}`, `GET /api/scores/updates/{fixtureId}` | schema ground truth, finals extraction |
| `GET /api/scores/historical/{fixtureId}` | replay research (devnet serializer bug reported in FEEDBACK.md) |

## ⛓ Solana integrations

| Integration | Mechanism | Proof |
| --- | --- | --- |
| TxLINE subscription | Anchor `subscribe(serviceLevelId, weeks)` to Service Level 12 | [tx DnHr...5bGx](https://explorer.solana.com/tx/DnHrZaGbp8fd84hsGJa1EeTAkfHMjvjZUrpT6Ktb8K2Dk5rKz6LQSsXgLRnWVRtdX9VcCjTfKxtc3ajvMN75bGx) |
| Pick commitments | Merkle root of each 60s pick batch in a Memo tx, posted before outcomes; receipts carry the inclusion proof and recompute it | [tx 5Ppi...pqsQM](https://explorer.solana.com/tx/5PpiUYU6WgsfsN1cDwntTxK9XaWcdg5b1fZd5b2kRA3F8KQwMnXLE8GSaU9eoNMKjrGAcbGudEQLX54qDxDpqsQM) |
| Outcome verification | `Txoracle.validate_stat(...).view()` (read-only, free) checks settled finals against the `daily_scores_roots` PDA | [program 9Exb...cKaA](https://explorer.solana.com/address/9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA) |

The chain of custody a judge can click: the receipt shows the pick, its lock
time and probability, the memo transaction that anchored it before the event,
the recomputed Merkle check, and the oracle line proving the final stat
against TxODDS's own on-chain root. Example:
[a real pick from live Paraguay vs France](https://called-it-web-murex.vercel.app/r/836a7729-6ae0-4139-9248-5b79cfb87de1),
settled +150 on a confirmed corner, merkle VALID, oracle VERIFIED (corners
2-12).

## ⚡ Technical highlights

- **One subscriber, many fans.** The worker reads each TxLINE stream once and
  fans out over SSE; the app shows a latency HUD with measured last/p50/p95
  feed latency (odds p50 around 245 ms from the Railway region; live scores
  events typically land on screen in well under a second).
- **VAR-safe settlement.** Only `Confirmed` events settle; the committed test
  fixture (USA vs Bosnia) contains a VAR overturn the engine must not pay
  early.
- **Time Machine.** Tapes record automatically for every tracked match;
  replay sessions push them through the same state and game pipeline at 1x,
  10x, or 60x, capped at 6 concurrent sessions with a 30 minute idle TTL, and
  fast-forward the pre-match head so a viewer lands at kickoff.
- **93 tests** (42 engine, 51 worker) run against committed captures of real
  matches, no network needed.
- **Free-to-play by design.** No wallet, no signup: two taps from lobby to a
  locked call under a guest identity. The chain work happens server-side.

## 💼 Business highlights and monetization path

CALLED IT is the free engagement layer that makes market data emotional: it
gives every fan a skin-in-the-game feeling with zero stakes, and every win
becomes a shareable, provable receipt (links unfurl as thermal-receipt cards).

The monetization path, in order of proximity:

1. **Sponsored call windows.** "Corner in the next 10 minutes, presented by
   [brand]" is a native ad unit priced by attention at the most tense moments
   of a match. Shown in the app today as a sample "presented by" label on the
   corner call (a demo of the ad slot, not a real sponsorship).
2. **Premium private leagues.** Free public play; paid league creation for
   friend groups, offices, and creators (custom prizes, season-long tables).
3. **B2B white-label.** Broadcasters and rights holders embed the call deck,
   probability pulse, and latency HUD next to their stream; CALLED IT supplies
   the engine, TxLINE supplies the data.
4. **A consumer showcase for TxODDS.** The game demonstrates StablePrice and
   the oracle chain to a mainstream audience, the exact audience the data was
   never able to reach.

Compliance posture: no stakes, no payouts, no odds display in betting format;
points only. That keeps the product outside gambling regulation in most
jurisdictions while preserving the thrill of being right.

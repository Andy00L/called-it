# CALLED IT

Free live micro-prediction game for the 2026 World Cup. Every call is priced by the real
global betting market (TxLINE StablePrice consensus) and every win generates a shareable
receipt proven on Solana via TxLINE Merkle proofs.

Built for the TxODDS World Cup Hackathon (Superteam Earn), Consumer and Fan Experiences track.

## Workspace

- `packages/txline` : typed TxLINE API client (auth, REST, SSE streams). No Solana deps.
- `packages/engine` : pure game engine (pricing, calls, resolution, bookie, calibration).
- `spike/` : runnable scripts to bootstrap API access and observe live data. See `spike/README.md`.
- `apps/worker` : long-lived realtime worker: consumes both TxLINE streams, records NDJSON
  tapes per fixture (Time Machine fuel), maintains live match state, serves SSE fan-out
  (`/health`, `/state/:fixtureId`, `/live/:fixtureId`). Run: `pnpm --filter @calledit/worker start`.
- `apps/web` : Next.js app (to come).
- `docs/txline-openapi.yaml` : TxLINE OpenAPI spec (reference copy).
- `submission-ideas.md` : research that led to this concept.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm typecheck
```

Then follow `spike/README.md` to activate TxLINE access (requires a Solana wallet).

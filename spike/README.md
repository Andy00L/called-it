# Spike : TxLINE access runbook

Goal: activate API access and observe real World Cup data (payloads, stat keys, latency)
before building the product. Run everything from the repo root.

## 0. Wallet

TxLINE requires a Solana wallet for every tier, including free ones. The wallet stays
server-side; app users never see it.

```bash
solana-keygen new --outfile wallet.json --no-bip39-passphrase
```

- devnet (first dry run, free SOL): `solana airdrop 2 <PUBKEY> --url devnet`
- mainnet (real-time tier SL12): send ~0.05 SOL to the wallet

`wallet.json` is gitignored. Never commit it.

## 1. Choose network and tier in .env

- Dry run: `TXLINE_NETWORK=devnet`, `TXLINE_SERVICE_LEVEL_ID=1` (60 s delay)
- Production data: `TXLINE_NETWORK=mainnet`, `TXLINE_SERVICE_LEVEL_ID=12` (real-time, free for World Cup)
- `TXLINE_DURATION_WEEKS=4` covers the tournament through July 19. The on-chain program
  only accepts multiples of 4; other values fail with `InvalidWeeks` (code 6041).

## 2. Run the sequence

```bash
pnpm --filter @calledit/spike auth        # prints TXLINE_JWT -> paste into .env
pnpm --filter @calledit/spike subscribe   # on-chain subscribe, prints TXLINE_TX_SIG -> .env
pnpm --filter @calledit/spike activate    # prints TXLINE_API_TOKEN -> .env
pnpm --filter @calledit/spike snapshots   # sanity check: fixtures list
```

If `subscribe` cannot fetch the IDL on-chain, download the JSON tab from
https://txline.txodds.com/documentation/programs/mainnet (or /devnet) and save it as
`spike/idl/txoracle.mainnet.json` (or `.devnet.json`).

## 3. Observe a live match

Pick a live fixture id from `snapshots`, then in two terminals:

```bash
pnpm --filter @calledit/spike stream:scores
pnpm --filter @calledit/spike stream:odds -- <fixtureId>
```

Both log raw payloads to `spike/logs/*.ndjson` (gitignored) for later schema analysis.

## 4. What to validate (fills the plan's open questions)

- [ ] Latency of SL12: goal event must appear in under 5 s
- [ ] Exact `stats` map keys observed for goals, cards, corners (period * 1000 + base_key)
- [ ] Which `SuperOddsType` markets carry `Pct` StablePrice values in running
- [ ] `possibleEvent` and `possessionType` frequency (pre-signal quality)
- [ ] JWT/API token behavior across reconnects (401 handling)

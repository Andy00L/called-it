-- CALLED IT: 0002 optional Solana wallet link (profile claim + restore).
-- Apply in the Supabase SQL Editor (Dashboard > SQL Editor > paste > Run).
-- Additive and idempotent: safe to run once on the existing schema.
--
-- A player MAY link one Solana wallet to claim their profile and restore it on
-- a new device by signing a fresh server challenge. The wallet is never
-- required to play (guest-first stays untouched); this only adds recovery.

alter table public.players
  add column if not exists wallet_pubkey text;

-- One wallet maps to at most one player; many players keep a null wallet, so a
-- partial unique index (not a plain unique) is used.
create unique index if not exists players_wallet_pubkey_key
  on public.players (wallet_pubkey)
  where wallet_pubkey is not null;

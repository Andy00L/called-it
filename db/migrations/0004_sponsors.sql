-- 0004: self-serve sponsorships paid in SOL.
-- A sponsor quotes a price (duration x screen-time tier x demand), pays the
-- server wallet with a memo bound to the intent id, and the worker verifies
-- the transaction on-chain before flipping the row to active. Names render
-- on the public lobby ticker.
create table if not exists sponsors (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 24),
  tagline text check (char_length(tagline) <= 80),
  weight integer not null check (weight in (1, 2, 3)),
  days integer not null check (days between 1 and 30),
  quote_lamports bigint not null check (quote_lamports > 0),
  status text not null default 'pending' check (status in ('pending', 'active')),
  payer_pubkey text,
  tx_sig text,
  paid_lamports bigint,
  created_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz
);

-- One on-chain payment activates at most one sponsorship (replay guard).
create unique index if not exists sponsors_tx_sig_unique
  on sponsors (tx_sig)
  where tx_sig is not null;

create index if not exists sponsors_active_window
  on sponsors (status, ends_at);

-- Only the worker's secret key reads or writes this table.
alter table sponsors enable row level security;

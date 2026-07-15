-- CALLED IT: terraces (0005)
-- Apply in the Supabase SQL Editor (Dashboard > SQL Editor > paste > Run).
-- A terrace is a private group room scoped to one fixture, joined by a short
-- invite code. Standings are public reads (they carry no secrets); every
-- write goes through the worker (secret key bypasses RLS; no anonymous
-- write policies), same trust model as 0001.
--
-- Codes use an alphabet without lookalike glyphs (no I, L, O, 0, 1) so a
-- code read aloud in a group chat types back correctly.

create table public.terraces (
  code text primary key check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  fixture_id bigint not null,
  name text not null check (char_length(name) between 2 and 24),
  owner_player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index terraces_fixture_idx on public.terraces (fixture_id);

create table public.terrace_members (
  terrace_code text not null references public.terraces (code) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (terrace_code, player_id)
);

create index terrace_members_player_idx on public.terrace_members (player_id);

alter table public.terraces enable row level security;
alter table public.terrace_members enable row level security;
create policy terraces_public_read on public.terraces for select using (true);
create policy terrace_members_public_read on public.terrace_members for select using (true);

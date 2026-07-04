-- CALLED IT: initial schema (0001)
-- Apply in the Supabase SQL Editor (Dashboard > SQL Editor > paste > Run).
-- Design notes:
--   * public.players instead of "users" to avoid confusion with auth.users.
--   * The worker talks to the database with the secret key (bypasses RLS).
--     Anonymous web reads go through RLS policies and views; there are NO
--     anonymous write policies: every write goes through the worker.
--   * settle_pick() makes settlement atomic (pick status + settlement row +
--     player aggregates in one transaction).

-- ---------------------------------------------------------------- players
create table public.players (
  id uuid primary key default gen_random_uuid(),
  handle text not null check (char_length(handle) between 2 and 24),
  -- sha256 hex of the player's secret token (guest auth v1)
  token_hash text not null,
  total_points bigint not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;
-- No anonymous policies on players: token_hash must never be readable.

-- Public leaderboard projection (safe columns only).
create view public.leaderboard_global as
  select id, handle, total_points, current_streak, best_streak
  from public.players
  order by total_points desc;

-- ---------------------------------------------------------------- leagues
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique,
  owner_player_id uuid not null references public.players (id),
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, player_id)
);

create index league_members_player_idx on public.league_members (player_id);

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
create policy leagues_public_read on public.leagues for select using (true);
create policy league_members_public_read on public.league_members for select using (true);

-- ------------------------------------------------------------------ picks
create table public.picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players (id),
  fixture_id bigint not null,
  option_id text not null,
  category text not null check (category in ('goal', 'corner', 'card', 'probability')),
  claim text not null,
  predicate jsonb not null,
  -- StablePrice or model probability locked at tap time, fraction in (0, 1]
  probability_fraction numeric(7, 6) not null
    check (probability_fraction > 0 and probability_fraction <= 1),
  potential_points integer not null,
  pricing_source text not null check (pricing_source in ('market', 'model')),
  locked_at timestamptz not null default now(),
  lock_clock_seconds integer not null,
  -- The Bookie: ghost pick auto-locked with the market favorite. player_id is
  -- null for ghost picks; bookie_of_pick_id links back to the human pick.
  is_bookie boolean not null default false,
  bookie_of_pick_id uuid references public.picks (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'hit', 'miss')),
  -- Solana commitment fields, filled by the commitments batcher
  commitment_id uuid,
  leaf_index integer,
  merkle_proof jsonb,
  constraint bookie_shape check (
    (is_bookie = false and player_id is not null)
    or (is_bookie = true and player_id is null and bookie_of_pick_id is not null)
  )
);

create index picks_fixture_pending_idx on public.picks (fixture_id) where status = 'pending';
create index picks_player_idx on public.picks (player_id);

alter table public.picks enable row level security;
-- Receipts and leaderboards are public by design; picks carry no secrets.
create policy picks_public_read on public.picks for select using (true);

-- One active (pending) human pick per player, category, and fixture.
create unique index picks_one_active_per_category
  on public.picks (player_id, fixture_id, category)
  where status = 'pending' and is_bookie = false;

-- ------------------------------------------------------------ settlements
create table public.settlements (
  pick_id uuid primary key references public.picks (id) on delete cascade,
  outcome text not null check (outcome in ('hit', 'miss')),
  points_awarded integer not null,
  streak_multiplier numeric(4, 2) not null default 1,
  resolution_clock_seconds integer not null,
  resolved_at timestamptz not null default now()
);

alter table public.settlements enable row level security;
create policy settlements_public_read on public.settlements for select using (true);

-- Per-fixture leaderboard projection.
create view public.leaderboard_fixture as
  select picks.fixture_id,
         picks.player_id,
         players.handle,
         sum(settlements.points_awarded)::bigint as fixture_points
  from public.settlements settlements
  join public.picks picks on picks.id = settlements.pick_id
  join public.players players on players.id = picks.player_id
  where picks.is_bookie = false
  group by picks.fixture_id, picks.player_id, players.handle;

-- ------------------------------------------------------------ commitments
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  root_hash text not null,
  memo_tx_sig text,
  pick_count integer not null,
  created_at timestamptz not null default now()
);

alter table public.commitments enable row level security;
create policy commitments_public_read on public.commitments for select using (true);

-- -------------------------------------------------------- replay_sessions
create table public.replay_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  fixture_id bigint not null,
  points bigint not null default 0,
  started_at timestamptz not null default now()
);

alter table public.replay_sessions enable row level security;
create policy replay_sessions_public_read on public.replay_sessions for select using (true);

-- -------------------------------------------------- atomic settlement RPC
-- Settles one pick and updates the owner's aggregates in one transaction.
-- Ghost (bookie) picks pass a null player and only flip the pick status.
create function public.settle_pick(
  p_pick_id uuid,
  p_outcome text,
  p_points_awarded integer,
  p_streak_multiplier numeric,
  p_resolution_clock_seconds integer,
  p_new_streak integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
begin
  update public.picks
     set status = p_outcome
   where id = p_pick_id and status = 'pending'
   returning player_id into v_player_id;
  if not found then
    raise exception 'pick % is not pending', p_pick_id;
  end if;

  insert into public.settlements
    (pick_id, outcome, points_awarded, streak_multiplier, resolution_clock_seconds)
  values
    (p_pick_id, p_outcome, p_points_awarded, p_streak_multiplier, p_resolution_clock_seconds);

  if v_player_id is not null then
    update public.players
       set total_points = total_points + p_points_awarded,
           current_streak = p_new_streak,
           best_streak = greatest(best_streak, p_new_streak)
     where id = v_player_id;
  end if;
end;
$$;

-- The function runs as its owner; block direct anonymous calls.
revoke execute on function public.settle_pick from anon, authenticated;

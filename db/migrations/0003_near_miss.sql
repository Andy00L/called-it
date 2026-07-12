-- 0003: honest near-miss post-mortem.
-- A missed event-window pick whose matching event arrived just after the
-- window records the factual margin (seconds past the window end). The worker
-- degrades gracefully while this column is absent: the SSE notice still
-- fires, only durability waits for this migration.
alter table settlements
  add column if not exists near_miss_seconds integer;

comment on column settlements.near_miss_seconds is
  'Seconds past the window end the matching event arrived; null when none within the horizon.';

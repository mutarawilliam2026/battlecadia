-- Battlecadia — persistence slice (auth wired but OFF).
--
-- Four tables: profiles, battles, matchups, saved_champions.
-- Everyone plays anonymously for now: battles carry a null user_id and a
-- per-browser session_id so the rows can be claimed once login ships.
--
-- RLS is enabled on all four. profiles + saved_champions get owner-only
-- policies (ready for auth). battles + matchups get NO policies on purpose:
-- with RLS on and no policy, anon/authenticated are denied everything, and all
-- writes/reads happen server-side with the SECRET key, which bypasses RLS.
-- That's how anonymous battles are persisted without a public insert path
-- anyone could abuse.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.battles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete set null, -- null = anonymous
  session_id          uuid,          -- browser id, for claiming anon battles after login
  arena               text not null default 'movies',
  prompt              text not null,
  resolved_query      jsonb,         -- the MovieQuery / plan Gemini produced
  applied_refinements jsonb,         -- the chips applied
  champion_tmdb_id    integer,
  total_matches       integer,
  rounds              integer,
  created_at          timestamptz not null default now()
);

create table public.matchups (       -- one row per single 1v1; this is the asset
  id                   uuid primary key default gen_random_uuid(),
  battle_id            uuid not null references public.battles (id) on delete cascade,
  winner_tmdb_id       integer not null,
  loser_tmdb_id        integer not null,
  match_number         integer not null,
  was_champion_defense boolean not null
);

create table public.saved_champions (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  tmdb_id  integer not null,
  saved_at timestamptz not null default now(),
  unique (user_id, tmdb_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index matchups_battle_id_idx      on public.matchups (battle_id);
create index battles_user_id_idx         on public.battles (user_id);
create index battles_session_id_idx      on public.battles (session_id);
create index matchups_winner_tmdb_id_idx on public.matchups (winner_tmdb_id);
create index matchups_loser_tmdb_id_idx  on public.matchups (loser_tmdb_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.battles         enable row level security;
alter table public.matchups        enable row level security;
alter table public.saved_champions enable row level security;

-- profiles: a user sees and edits only their own row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = id);

-- saved_champions: a user sees and edits only their own saves.
create policy "saved_champions_select_own" on public.saved_champions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "saved_champions_insert_own" on public.saved_champions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "saved_champions_update_own" on public.saved_champions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "saved_champions_delete_own" on public.saved_champions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- battles + matchups: intentionally NO policies. RLS is on, so anon and
-- authenticated are denied all access; only the secret-key service client
-- (which bypasses RLS) reads or writes these. Aggregate reads run server-side.

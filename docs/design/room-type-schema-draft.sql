-- ============================================================
-- DRAFT, NOT A MIGRATION. Hotel room types and evidence (step 3 of
-- docs/design/room-type-sun-proposal.md §7).
--
-- This file lives under docs/ on purpose: nothing here is applied by merging.
-- To ship it, copy it into supabase/migrations/ with a new timestamp in its own
-- PR, after Shannon's explicit approval (merging under supabase/ deploys).
--
-- Tested 22 Oct 2026 on a local Postgres 16 with stand-in auth roles and a
-- venues table holding three real roomTypes shapes (see the PR). Not run on
-- production or a Supabase branch.
--
-- Shape (proposal §2): Stay (venues) → facade side → room type → evidence.
--   stay_facades            computed sides, moved out of venues."roomTypes"
--   stay_room_types         the hotel's bookable product, entered or approved by staff
--   stay_room_type_facades  which side(s) a room type faces (corner rooms: two)
--   stay_room_type_facts    evidence per fact: modelled → hotel_confirmed → on_site_checked
--
-- Access: RLS on every table. anon/authenticated may only SELECT, and only
-- published rows. No client writes: staff tools and the import job write with
-- service_role, which bypasses RLS. venues."roomTypes" is left untouched, so the
-- current app keeps working until the client switches over.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Types
-- ------------------------------------------------------------
create type public.stay_facade_source as enum ('estimated', 'estimated-buildings');
create type public.stay_outdoor_space as enum ('balcony', 'juliet', 'terrace', 'window_only', 'none');
create type public.stay_fact_evidence as enum ('modelled', 'hotel_confirmed', 'on_site_checked');

-- ------------------------------------------------------------
-- 2. Facade sides (computed; one row per side of the building)
-- ------------------------------------------------------------
create table public.stay_facades (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id) on delete cascade,
  -- Kept so the client and the import job can match today's roomTypes ids.
  legacy_key text not null,
  bearing_deg real not null check (bearing_deg >= 0 and bearing_deg < 360),
  wall_m real check (wall_m is null or wall_m > 0),
  -- Obstruction arcs keyed by reference height in metres, e.g.
  -- {"16": [{"start":0,"end":9,"minAltitude":38}, ...], "40": [...]}.
  -- The engine needs angles at each room type's lowest and highest floor (§4).
  obstructions_by_height jsonb not null default '{}'::jsonb
    check (jsonb_typeof(obstructions_by_height) = 'object'),
  source public.stay_facade_source not null,
  computed_at timestamptz not null default now(),
  unique (venue_id, legacy_key)
);
create index stay_facades_venue_id_idx on public.stay_facades (venue_id);

-- ------------------------------------------------------------
-- 3. Room types (the hotel's own product names)
-- ------------------------------------------------------------
create table public.stay_room_types (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  floor_min int not null check (floor_min >= 0),
  floor_max int not null,
  outdoor_space public.stay_outdoor_space not null,
  balcony_depth_m real check (balcony_depth_m is null or balcony_depth_m between 0.3 and 10),
  -- {"depth": metres, "height": metres above the balcony floor}
  overhang jsonb check (
    overhang is null or (
      jsonb_typeof(overhang) = 'object'
      and jsonb_typeof(overhang->'depth') = 'number'
      and jsonb_typeof(overhang->'height') = 'number')),
  -- The hotel's own booking page only. Shown as "Check rates".
  rate_url text check (rate_url is null or rate_url ~ '^https://'),
  -- Corner rooms are deferred (§8): the pilot shows this note instead.
  corner_note boolean not null default false,
  published_revision int not null default 0 check (published_revision >= 0),
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  check (floor_max >= floor_min),
  check (outdoor_space in ('balcony', 'terrace') or (balcony_depth_m is null and overhang is null))
);
create index stay_room_types_venue_id_idx on public.stay_room_types (venue_id) where active;

-- ------------------------------------------------------------
-- 4. Room type ↔ facade (one side normally; two for a corner room later)
-- ------------------------------------------------------------
create table public.stay_room_type_facades (
  room_type_id uuid not null references public.stay_room_types(id) on delete cascade,
  facade_id uuid not null references public.stay_facades(id) on delete cascade,
  share real not null default 1 check (share > 0 and share <= 1),
  primary key (room_type_id, facade_id)
);
create index stay_room_type_facades_facade_idx on public.stay_room_type_facades (facade_id);

-- A room type and its facades must belong to the same stay.
create function public.stay_room_type_facade_same_venue()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select venue_id from public.stay_room_types where id = new.room_type_id)
     is distinct from (select venue_id from public.stay_facades where id = new.facade_id) then
    raise exception 'room type and facade belong to different venues';
  end if;
  return new;
end $$;
revoke all on function public.stay_room_type_facade_same_venue() from public, anon, authenticated;
create trigger stay_room_type_facades_same_venue
  before insert or update on public.stay_room_type_facades
  for each row execute function public.stay_room_type_facade_same_venue();

-- ------------------------------------------------------------
-- 5. Evidence per fact (sanitised projection of the #207 review workflow:
--    no contacts, tokens or reviewer identities live here)
-- ------------------------------------------------------------
create table public.stay_room_type_facts (
  room_type_id uuid not null references public.stay_room_types(id) on delete cascade,
  fact text not null check (fact in ('room_facade', 'floor_range', 'outdoor_space', 'balcony_depth', 'overhang')),
  evidence public.stay_fact_evidence not null default 'modelled',
  confirmed_at timestamptz,
  expires_at timestamptz,
  primary key (room_type_id, fact),
  -- Anything above "modelled" needs a date, and expiry must come after it.
  check (evidence = 'modelled' or confirmed_at is not null),
  check (expires_at is null or confirmed_at is null or expires_at > confirmed_at)
);

-- What the card reads: expired facts fall back to "modelled" (§5), never stay higher.
create view public.stay_room_type_facts_current
with (security_invoker = true) as
select room_type_id, fact,
       case when expires_at is not null and expires_at <= now() then 'modelled'::public.stay_fact_evidence
            else evidence end as evidence,
       case when expires_at is not null and expires_at <= now() then null else confirmed_at end as confirmed_at,
       expires_at
  from public.stay_room_type_facts;

-- ------------------------------------------------------------
-- 6. Row Level Security and grants
--    Revoke by name first: this project grants new public tables to anon and
--    authenticated by default (CLAUDE.md).
-- ------------------------------------------------------------
alter table public.stay_facades enable row level security;
alter table public.stay_room_types enable row level security;
alter table public.stay_room_type_facades enable row level security;
alter table public.stay_room_type_facts enable row level security;

revoke all on public.stay_facades, public.stay_room_types, public.stay_room_type_facades,
  public.stay_room_type_facts, public.stay_room_type_facts_current
  from public, anon, authenticated;
grant select on public.stay_facades, public.stay_room_types, public.stay_room_type_facades,
  public.stay_room_type_facts, public.stay_room_type_facts_current
  to anon, authenticated;

create policy "Public read stay_facades"
  on public.stay_facades for select to anon, authenticated using (true);
create policy "Public read active stay_room_types"
  on public.stay_room_types for select to anon, authenticated using (active);
create policy "Public read links of active room types"
  on public.stay_room_type_facades for select to anon, authenticated
  using (exists (select 1 from public.stay_room_types r where r.id = room_type_id and r.active));
create policy "Public read facts of active room types"
  on public.stay_room_type_facts for select to anon, authenticated
  using (exists (select 1 from public.stay_room_types r where r.id = room_type_id and r.active));
-- No insert/update/delete policies: clients cannot write. service_role bypasses RLS.

-- ------------------------------------------------------------
-- 7. Backfill facades from today's venues."roomTypes" (48 entries, 13 stays
--    on 21 Oct). Each entry's single obstruction list is stored under its
--    floorHeight. Rerunnable: existing (venue_id, legacy_key) rows are skipped.
--    No room types are created: those come from hotels (§6) or staff entry.
-- ------------------------------------------------------------
insert into public.stay_facades (venue_id, legacy_key, bearing_deg, wall_m, obstructions_by_height, source)
select v.id,
       e->>'id',
       mod((e->>'orientation')::numeric, 360)::real,
       nullif(e->>'wallMetres', '')::real,
       jsonb_build_object(e->>'floorHeight', coalesce(e->'obstructions', '[]'::jsonb)),
       (e->>'source')::public.stay_facade_source
  from public.venues v
 cross join lateral jsonb_array_elements(v."roomTypes") as e
 where jsonb_typeof(v."roomTypes") = 'array'
   and e ? 'id' and e ? 'orientation' and e ? 'floorHeight'
   and e->>'source' in ('estimated', 'estimated-buildings')
on conflict (venue_id, legacy_key) do nothing;

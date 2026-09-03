-- Sunstay venues — matches src/data/demoVenues.js (48 Melbourne venues).
-- CamelCase columns are quoted so supabase-js can insert JS objects as-is.

create table if not exists public.venues (
  id                      text primary key,
  "companyName"           text,
  "venueName"             text not null,
  address                 text,
  suburb                  text,
  city                    text,
  state                   text,
  lat                     double precision,
  lng                     double precision,
  emoji                   text,
  vibe                    text,
  "typeCategory"          text,
  "typeLabel"             text,
  tags                    text[] not null default '{}',
  heating                 text,
  "hasBalcony"            boolean,
  "hasCozy"               boolean,
  "hasFireplace"          boolean,
  price                   text,
  capacity                integer,
  opening_hours           text,
  venue_description        text,
  official_website_url    text,
  contact_phone            text,
  notes                   text,
  "proTip"                text,
  "sunIntelligence"       text,
  image                   text,
  "happyHour"             jsonb,
  shielding               jsonb,
  "roomTypes"             jsonb,
  -- Live-ops columns already written by OwnerDashboard
  hours                   jsonb,
  "heatersOn"             boolean,
  "fireplaceOn"           boolean,
  "hasUmbrellas"          boolean,
  "hasWindProtection"     boolean,
  "sunshineNow"           boolean,
  created_at              timestamptz not null default now()
);

-- ── Grants ──────────────────────────────────────────────────────────
revoke all on table public.venues from public;
grant select on table public.venues to anon, authenticated;
grant insert, update, delete on table public.venues to authenticated;

-- ── Row Level Security ──────────────────────────────────────────────
alter table public.venues enable row level security;

drop policy if exists "venues_public_select" on public.venues;
create policy "venues_public_select"
  on public.venues
  for select
  to anon, authenticated
  using (true);

drop policy if exists "venues_authenticated_insert" on public.venues;
create policy "venues_authenticated_insert"
  on public.venues
  for insert
  to authenticated
  with check (true);

drop policy if exists "venues_authenticated_update" on public.venues;
create policy "venues_authenticated_update"
  on public.venues
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "venues_authenticated_delete" on public.venues;
create policy "venues_authenticated_delete"
  on public.venues
  for delete
  to authenticated
  using (true);

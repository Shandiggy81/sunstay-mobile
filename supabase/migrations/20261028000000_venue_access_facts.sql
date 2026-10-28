-- ============================================================
-- "Getting in and around": access facts per venue.
--
-- Why (Shannon, Oct 2026): guests who use a wheelchair or pram, or who find
-- stairs hard, need to know about steps, lifts and how far the toilet is.
-- Listings rarely say. These columns hold what a venue declares on the SunStay
-- venue facts form, or what SunStay checked in person, and nothing guessed.
--
-- Every column is nullable: NULL means "not known yet", never "no".
-- The card shows only known facts (src/utils/venueAccess.js).
--
-- Additive only: nullable columns with no default are a metadata-only change,
-- so existing rows, policies and the public SELECT on venues are untouched
-- (RLS is row-level; there are no column grants on venues).
-- ============================================================

alter table public.venues
  add column if not exists access_step_free_entry boolean,
  add column if not exists access_entry_steps smallint,
  add column if not exists access_lift boolean,
  add column if not exists access_lift_floors text,
  add column if not exists access_stairs_only_areas text,
  add column if not exists access_accessible_toilet boolean,
  add column if not exists access_accessible_toilet_floor text,
  add column if not exists access_toilet_level text,
  add column if not exists access_toilet_distance_m smallint,
  add column if not exists access_source text,
  add column if not exists access_verified_at timestamptz;

alter table public.venues
  drop constraint if exists venues_access_entry_steps_range,
  add constraint venues_access_entry_steps_range
    check (access_entry_steps is null or access_entry_steps between 0 and 200),
  drop constraint if exists venues_access_toilet_level_values,
  add constraint venues_access_toilet_level_values
    check (access_toilet_level is null or access_toilet_level in ('same floor', 'upstairs', 'downstairs')),
  drop constraint if exists venues_access_toilet_distance_range,
  add constraint venues_access_toilet_distance_range
    check (access_toilet_distance_m is null or access_toilet_distance_m between 0 and 500),
  drop constraint if exists venues_access_source_values,
  add constraint venues_access_source_values
    check (access_source is null or access_source in ('venue', 'sunstay_visit'));

comment on column public.venues.access_step_free_entry is 'Step-free entry from the street. NULL = not known.';
comment on column public.venues.access_entry_steps is 'Steps at the main entry. NULL = not known.';
comment on column public.venues.access_lift is 'Lift reaches every guest area. NULL = not known.';
comment on column public.venues.access_lift_floors is 'Floors the lift reaches, as the venue says it.';
comment on column public.venues.access_stairs_only_areas is 'Guest areas reached only by stairs (e.g. rooftop).';
comment on column public.venues.access_accessible_toilet is 'Has an accessible (disability) toilet. NULL = not known.';
comment on column public.venues.access_accessible_toilet_floor is 'Floor of the nearest accessible toilet.';
comment on column public.venues.access_toilet_level is 'Nearest toilet relative to the main bar: same floor, upstairs or downstairs.';
comment on column public.venues.access_toilet_distance_m is 'Rough walk from the main bar to the nearest toilet, metres.';
comment on column public.venues.access_source is 'Who stated the access facts: venue (facts form) or sunstay_visit.';
comment on column public.venues.access_verified_at is 'When the access facts were last confirmed.';

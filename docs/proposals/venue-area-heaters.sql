-- PROPOSAL ONLY. Not an automatically applied migration.
-- Exercise only in the isolated pilot database until a separate rollout is approved.
create schema if not exists private;

create table private.venue_pilot_managers (
  venue_id text not null references public.venues(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role = 'manager'),
  active boolean not null default false,
  verified_via text not null check (verified_via in ('in_person', 'published_phone')),
  verified_at timestamptz not null,
  primary key (venue_id, user_id)
);

create table private.venue_guest_areas (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id),
  name text not null check (char_length(name) between 1 and 80 and char_length(btrim(name)) > 0),
  kind text not null check (kind in ('terrace', 'courtyard', 'beer_garden', 'indoor', 'other')),
  active boolean not null default true,
  public_visible boolean not null default false,
  unique (id, venue_id)
);

create table private.venue_area_heater_reports (
  id uuid primary key default gen_random_uuid(),
  revision bigint generated always as identity unique,
  venue_id text not null,
  area_id uuid not null,
  publisher_id uuid not null references auth.users(id),
  request_id uuid not null,
  heaters_on boolean not null,
  publication_state text not null check (publication_state in ('draft', 'published')),
  valid_for_minutes integer not null check (valid_for_minutes in (30, 60, 120, 240)),
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  foreign key (area_id, venue_id) references private.venue_guest_areas(id, venue_id),
  unique (publisher_id, request_id),
  check (expires_at = updated_at + valid_for_minutes * interval '1 minute')
);
create index venue_area_heater_latest on private.venue_area_heater_reports(area_id, revision desc);
create index venue_area_heater_actor_time on private.venue_area_heater_reports(publisher_id, updated_at desc);
alter table private.venue_pilot_managers enable row level security;
alter table private.venue_guest_areas enable row level security;
alter table private.venue_area_heater_reports enable row level security;
revoke all on private.venue_pilot_managers, private.venue_guest_areas,
  private.venue_area_heater_reports from public, anon, authenticated;
revoke all on sequence private.venue_area_heater_reports_revision_seq from public, anon, authenticated;

-- Latest publication first, THEN expiry/role checks: an old positive must not
-- reappear when a newer "off" report expires or its publisher is revoked.
create function public.get_venue_area_heaters(p_venue_id text default null)
returns table(report_id uuid, venue_id text, area_id uuid, area_name text, area_kind text,
  heaters_on boolean, source text, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  with latest as (
    select distinct on (r.area_id) r.* from private.venue_area_heater_reports r
    where r.publication_state = 'published' and (p_venue_id is null or r.venue_id = p_venue_id)
    order by r.area_id, r.revision desc
  )
  select r.id, r.venue_id, r.area_id, a.name, a.kind, r.heaters_on, 'venue_staff'::text,
    r.updated_at, r.expires_at
  from latest r join private.venue_guest_areas a on a.id = r.area_id and a.venue_id = r.venue_id
  join private.venue_pilot_managers m on m.user_id = r.publisher_id and m.venue_id = r.venue_id
  where a.active and a.public_visible and m.active and m.role = 'manager'
    and r.expires_at > statement_timestamp()
  order by r.updated_at desc, r.id limit 500;
$$;

create function public.get_venue_guest_areas(p_venue_id text)
returns table(area_id uuid, venue_id text, area_name text, area_kind text)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select a.id, a.venue_id, a.name, a.kind from private.venue_guest_areas a
  where a.venue_id = p_venue_id and a.active and a.public_visible
  order by a.name, a.id limit 20;
$$;

create function public.get_managed_venue_areas(p_venue_id text)
returns table(area_id uuid, venue_id text, area_name text, area_kind text)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null or not exists (
    select 1 from private.venue_pilot_managers m
    where m.user_id = auth.uid() and m.venue_id = p_venue_id and m.active and m.role = 'manager'
  ) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query select a.id, a.venue_id, a.name, a.kind from private.venue_guest_areas a
    where a.venue_id = p_venue_id and a.active and a.public_visible order by a.name, a.id limit 20;
end;
$$;

create function public.publish_venue_area_heaters(p_venue_id text, p_area_id uuid,
  p_heaters_on boolean, p_valid_for_minutes integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  actor uuid := auth.uid();
  saved private.venue_area_heater_reports%rowtype;
  area private.venue_guest_areas%rowtype;
  stamp timestamptz;
begin
  if actor is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform 1 from private.venue_pilot_managers m
    where m.user_id = actor and m.venue_id = p_venue_id and m.active and m.role = 'manager' for share;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into area from private.venue_guest_areas a
    where a.id = p_area_id and a.venue_id = p_venue_id and a.active and a.public_visible for share;
  if not found then raise exception 'area_not_available' using errcode = '22023'; end if;
  if p_heaters_on is null or p_request_id is null or p_valid_for_minutes is null
    or p_valid_for_minutes not in (30, 60, 120, 240) then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  -- Serialize a publisher's retries and rate checks across different areas.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  select * into saved from private.venue_area_heater_reports r
    where r.publisher_id = actor and r.request_id = p_request_id;
  if found then
    if saved.venue_id <> p_venue_id or saved.area_id <> p_area_id
      or saved.heaters_on <> p_heaters_on or saved.valid_for_minutes <> p_valid_for_minutes then
      raise exception 'request_conflict' using errcode = '22023';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(p_area_id::text, 1));
    if (select count(*) from private.venue_area_heater_reports r where r.publisher_id = actor
      and r.updated_at > clock_timestamp() - interval '1 minute') >= 12 then
      raise exception 'report_rate_limited' using errcode = '54000';
    end if;
    stamp := clock_timestamp();
    insert into private.venue_area_heater_reports(venue_id, area_id, publisher_id, request_id,
      heaters_on, publication_state, valid_for_minutes, updated_at, expires_at)
      values (p_venue_id, p_area_id, actor, p_request_id, p_heaters_on, 'published',
        p_valid_for_minutes, stamp, stamp + p_valid_for_minutes * interval '1 minute') returning * into saved;
  end if;
  return jsonb_build_object('report_id', saved.id, 'venue_id', saved.venue_id, 'area_id', saved.area_id,
    'area_name', area.name, 'area_kind', area.kind, 'heaters_on', saved.heaters_on,
    'source', 'venue_staff', 'updated_at', saved.updated_at, 'expires_at', saved.expires_at);
end;
$$;

revoke all on function public.get_venue_area_heaters(text), public.get_venue_guest_areas(text),
  public.get_managed_venue_areas(text), public.publish_venue_area_heaters(text, uuid, boolean, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.get_venue_area_heaters(text), public.get_venue_guest_areas(text) to anon, authenticated;
grant execute on function public.get_managed_venue_areas(text),
  public.publish_venue_area_heaters(text, uuid, boolean, integer, uuid) to authenticated;

-- Enrollment is deliberately NOT exposed as a public RPC. Only an approved
-- staff operation may add independently verified managers and named pilot areas.
-- Rollback after a separately approved rollout: revert app code first. Leave
-- these objects unused until all readers/writers have stopped. Any later removal
-- needs a reviewed migration; never drop venues, geometry or report history here.

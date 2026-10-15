-- geometry_confidence = how much we trust the building heights around a venue,
-- not just how many buildings are nearby. Outside the City of Melbourne most
-- buildings are OSM with no height tag (6 m default), so suburban venues used
-- to score ~1.0. The venue card labels readings below 0.5 as "Modelled from
-- street geometry, not measured on site".
-- Patches only the confidence line of the live seed_venue_morphology; sun,
-- wind and horizon calculations are unchanged. Then rescores existing rows.
-- Applied 16 Oct 2026: 30 venues measured, 37 estimated.
do $$
declare
  def text;
  old_h text := 'coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)::real as height_m,';
  new_h text := 'coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)::real as height_m,
      (b.source = ''com2023'' or b.levels is not null or (b.height_m is not null and b.height_m <> 6)) as measured,';
  old_c text := 'least(1.0, count(*)::real / 12.0)::real as conf';
  new_c text := '(least(1.0, count(*)::real / 12.0)
        * (count(*) filter (where measured))::real / nullif(count(*), 0))::real as conf';
begin
  select pg_get_functiondef('public.seed_venue_morphology(text, real, real[])'::regprocedure) into def;
  if position(old_h in def) = 0 or position(old_c in def) = 0 then
    raise exception 'seed_venue_morphology lines not found; not changed';
  end if;
  execute replace(replace(def, old_h, new_h), old_c, new_c);
end $$;

revoke all on function public.seed_venue_morphology(text, real, real[]) from public, anon, authenticated;
grant execute on function public.seed_venue_morphology(text, real, real[]) to service_role;

update public.microclimate_profiles m
set geometry_confidence = s.conf, updated_at = now()
from (
  select v.id,
    (least(1.0, count(b.*)::real / 12.0)
      * (count(b.*) filter (where b.source = 'com2023' or b.levels is not null or (b.height_m is not null and b.height_m <> 6)))::real
      / nullif(count(b.*), 0))::real as conf
  from public.venues v
  left join public.buildings b
    on not b.superseded
   and b.geom && st_expand(st_setsrid(st_makepoint(v.lng, v.lat), 4326), 0.002)
   and st_dwithin(st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography, b.geom::geography, 150)
  group by v.id
  having count(b.*) >= 3
) s
where m.venue_id = s.id;

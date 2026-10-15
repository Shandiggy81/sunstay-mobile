-- needs_pin_check only for what a person must look at: the street side is
-- unconfirmed, there is no open footpath, a rooftop height is estimated, or
-- the council point sits within 5 m of buildings without being inside one
-- (an arcade or an unmapped building). Corners, long moves and points in open
-- space (plazas, promenades) stay in pin_check_reasons as information.
do $$
declare
  def text;
  old_a text := '    v_place := v_pt;
    v_reasons := v_reasons || ''no_building_at_point''::text;';
  new_a text := '    v_place := v_pt;
    v_reasons := v_reasons || ''no_building_at_point''::text;
    if exists (select 1 from public.buildings b where not b.superseded and b.geom && st_expand(v_pt, 0.0001)
               and st_dwithin(b.geom::geography, v_pt::geography, 5)) then
      v_reasons := v_reasons || ''covered_or_unmapped''::text;
    end if;';
  old_b text := 'needs_pin_check = cardinality(v_reasons) > 0
                      and v_reasons <> array[''upper_floor'']::text[],';
  new_b text := 'needs_pin_check = v_reasons && array[''street_side_unconfirmed'', ''no_open_footpath'',
                      ''rooftop_height_estimated'', ''covered_or_unmapped'']::text[],';
begin
  select pg_get_functiondef('public.place_venue_candidate(text)'::regprocedure) into def;
  if position(old_a in def) = 0 or position(old_b in def) = 0 then
    raise exception 'place_venue_candidate lines not found; not changed';
  end if;
  execute replace(replace(def, old_a, new_a), old_b, new_b);
end $$;

revoke all on function public.place_venue_candidate(text) from public, anon, authenticated;
grant execute on function public.place_venue_candidate(text) to service_role;

-- Large shared properties (Southern Cross, Queen Victoria Market strips) give
-- every shop the same council point; a move over 60 m means the pin is on the
-- right street but may be off by a block, so a person should check it.
do $$
declare
  def text;
  old_a text := 'if st_distance(v_pt::geography, v_place::geography) > 30 then v_reasons := v_reasons || ''moved_far''::text; end if;';
  new_a text := 'if st_distance(v_pt::geography, v_place::geography) > 30 then v_reasons := v_reasons || ''moved_far''::text; end if;
  if st_distance(v_pt::geography, v_place::geography) > 60 then v_reasons := v_reasons || ''large_property''::text; end if;';
  old_b text := '''rooftop_height_estimated'', ''covered_or_unmapped'']::text[],';
  new_b text := '''rooftop_height_estimated'', ''covered_or_unmapped'', ''large_property'']::text[],';
begin
  select pg_get_functiondef('public.place_venue_candidate(text)'::regprocedure) into def;
  if position(old_a in def) = 0 or position(old_b in def) = 0 then
    raise exception 'place_venue_candidate lines not found; not changed';
  end if;
  execute replace(replace(def, old_a, new_a), old_b, new_b);
end $$;

revoke all on function public.place_venue_candidate(text) from public, anon, authenticated;
grant execute on function public.place_venue_candidate(text) to service_role;

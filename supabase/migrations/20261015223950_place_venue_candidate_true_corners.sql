-- A corner is an open wall at right angles (60-120 deg) within 12 m of the
-- chosen footpath spot. The first version also counted the opposite side of
-- shallow buildings (~180 deg) and walls up to 20 m away, which flagged most
-- mid-block venues.
do $$
declare
  def text;
  old_clause text := 'where st_dwithin(o.pt::geography, b.pt::geography, 20)
                     and abs(((o.az - b.az)::numeric % 360 + 540) % 360 - 180) >= 60)';
  new_clause text := 'where st_dwithin(o.pt::geography, b.pt::geography, 12)
                     and abs(((o.az - b.az)::numeric % 360 + 540) % 360 - 180) between 60 and 120)';
begin
  select pg_get_functiondef('public.place_venue_candidate(text)'::regprocedure) into def;
  if position(old_clause in def) = 0 then
    raise exception 'place_venue_candidate corner clause not found; not changed';
  end if;
  execute replace(def, old_clause, new_clause);
end $$;

revoke all on function public.place_venue_candidate(text) from public, anon, authenticated;
grant execute on function public.place_venue_candidate(text) to service_role;

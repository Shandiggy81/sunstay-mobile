-- Applied 15 Oct 2026 with approval. Borsch, Vodka & Tears (dv-stay-08) was
-- pinned on Holy Grail (67 Chapel St); moved to the OpenStreetMap address
-- point for 173 Chapel St, Windsor (node 12418989551, see PR #148), then its
-- sun profile and building horizon were rebuilt.
update public.venues set lat = -37.85212, lng = 144.99313, updated_at = now()
where id = 'dv-stay-08' and lat = -37.8552;
select public.seed_venue_morphology('dv-stay-08');

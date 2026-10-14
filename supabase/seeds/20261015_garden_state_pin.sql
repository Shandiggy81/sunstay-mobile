-- Not applied. Apply only with explicit approval.
-- Garden State Hotel (dv-06): move the pin from the Collins Street towers to
-- 101 Flinders Lane (Apple Maps listing, inside City of Melbourne footprint
-- com2023:s809638), then rebuild its sun profile and building horizon.
begin;

update public.venues set lat = -37.8153433, lng = 144.9710353, updated_at = now() where id = 'dv-06';

select public.seed_venue_morphology('dv-06');

commit;

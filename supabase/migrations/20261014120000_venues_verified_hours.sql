-- Verified opening hours and happy hours from the 2026-10-14 website check
-- (PR #120, src/data/demoVenues.js), plus that PR's address and pin fixes.
--
-- Rows are matched by primary key id: the demo venues were seeded into
-- venues with their demoVenues.js ids. An id that is not in the table
-- updates nothing and is reported by the warning at the end.
--
-- Adds nullable columns only, with no defaults, so nothing is marked
-- verified unless set below. Does not change RLS policies or grants.

alter table public.venues add column if not exists "hoursVerifiedAt" date;
alter table public.venues add column if not exists "hoursSourceUrl" text;
alter table public.venues add column if not exists "happyHourVerifiedAt" date;
alter table public.venues add column if not exists "happyHourSourceUrl" text;

comment on column public.venues."hoursVerifiedAt" is 'Date opening_hours was checked against hoursSourceUrl. Null = unverified; the app then shows no hours.';
comment on column public.venues."hoursSourceUrl" is 'Page opening_hours was checked on.';
comment on column public.venues."happyHourVerifiedAt" is 'Date "happyHour" was checked against happyHourSourceUrl. Null = unverified; the app then shows no happy hour.';
comment on column public.venues."happyHourSourceUrl" is 'Page "happyHour" was checked on.';

update public.venues set
  opening_hours = 'Tue–Fri 3pm–late; Sat 12pm–late; Sun 3pm–late; closed Mon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://wonderlandbar.com.au/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null
where id = 'dv-01';

update public.venues set
  opening_hours = 'Rooftop: Fri 5pm–late; Sat 12pm–late; Sun 3pm–late. Lounge/club Fri–Sun 9pm–late. Mon–Wed private functions only. Hours may vary.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://theemerson.com.au/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null,
  address = '141–145 Commercial Road, South Yarra VIC 3141'
where id = 'dv-02';

update public.venues set
  opening_hours = 'Bar daily 12pm–3am. Kitchen Mon–Sat 12pm–9pm; Sun 12pm–5pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://thevineyard.com.au/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null
where id = 'dv-03';

update public.venues set
  opening_hours = 'Wed–Sat 11:30am–10pm; Sun 11:30am–5pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://venues.cbco.beer/port-melbourne/',
  "happyHour" = '{"days":["Wed","Thu","Fri","Sat"],"start":"16:00","end":"18:00","deal":"$8 schooners (also Sun 1pm–2pm)"}',
  "happyHourVerifiedAt" = '2026-10-14',
  "happyHourSourceUrl" = 'https://venues.cbco.beer/port-melbourne/'
where id = 'dv-04';

update public.venues set
  opening_hours = 'Sun–Wed 10am–midnight; Thu–Sat 10am–1am. Kitchen lunch Wed–Sun 12–2:30pm, dinner Tue–Sun 5–8:30pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://thedick.au/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null
where id = 'dv-05';

update public.venues set
  opening_hours = 'Mon–Thu 11:30am–late; Fri 11am–late; Sat–Sun 12pm–late.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://gardenstatehotel.com.au/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null
where id = 'dv-06';

update public.venues set
  opening_hours = 'Wed–Fri 4pm–late; Sat–Sun 12pm–late; closed Mon–Tue.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.welcometothornbury.com/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null
where id = 'dv-07';

update public.venues set
  opening_hours = 'Tue–Sun 11am–11pm; closed Mon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.royalstandardhotel.com.au/',
  "happyHour" = null,
  "happyHourVerifiedAt" = null,
  "happyHourSourceUrl" = null,
  address = '333 William Street, West Melbourne VIC 3003',
  suburb = 'West Melbourne',
  lat = -37.80777,
  lng = 144.95439
where id = 'dv-08';

update public.venues set
  opening_hours = 'Tue 11am–10pm; Wed–Thu 11am–late; Fri 11am–1am; Sat 1pm–1am; closed Sun–Mon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.cqbar.com.au/',
  address = 'Level 1, 113 Queen Street, Melbourne VIC 3000'
where id = 'dv-09';

update public.venues set
  opening_hours = 'Tue 5pm–10pm; Wed–Thu 5pm–11pm; Fri 5pm–1am; Sat 12pm–1am; Sun 2pm–10pm; closed Mon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.howlerbrunswick.com/'
where id = 'dv-10';

update public.venues set
  opening_hours = 'Daily 12pm–1am.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.goodheavens.com.au/'
where id = 'dv-11';

update public.venues set
  opening_hours = 'Main Bar & Deck: Wed from 4pm; Thu–Sun midday–late. Bottleshop 24/7 (closed Anzac Day 3am–midday).',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.therailway.com.au/'
where id = 'dv-12';

update public.venues set
  opening_hours = 'Daily from 11am till late.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.chinchin.melbourne/'
where id = 'dv-13';

update public.venues set
  opening_hours = 'Weekdays 7am–3:30pm; weekends 8am–3:30pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://industrybeans.com/pages/fitzroy-cafe-and-roastery'
where id = 'dv-14';

update public.venues set
  opening_hours = 'Mon–Tue 9am–9pm; Wed–Thu 9am–10pm; Fri–Sat 8am–11pm; Sun 8am–9pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://theboatbuildersyard.com.au/'
where id = 'dv-15';

update public.venues set
  opening_hours = 'Daily 12pm–late.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://buildersarmshotel.com.au/'
where id = 'dv-16';

update public.venues set
  opening_hours = 'Hotel always open; Stretch on Six (Level 6) 6am–9pm daily.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://lancemore.com.au/hotels/lancemore-crossley-st/'
where id = 'dv-17';

update public.venues set
  opening_hours = 'Rooftop bar Tue–Sun 12pm–late; closed Mon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://cornerhotel.com/'
where id = 'dv-18';

update public.venues set
  opening_hours = 'Mon–Fri 8am–5pm; Sat–Sun 8:30am–5pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.mrtulk.com.au/'
where id = 'dv-20';

update public.venues set
  opening_hours = 'Sun–Thu 12pm–11pm; Fri–Sat 12pm–3am.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://hotelesplanade.com.au/'
where id = 'dv-21';

update public.venues set
  opening_hours = 'Sun–Wed 5pm–1am; Thu–Sat 5pm–3am.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.lalaland.com.au/windsor'
where id = 'dv-25';

update public.venues set
  opening_hours = 'Daily from 4pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://pausebar.com.au/',
  "happyHour" = '{"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"19:00","deal":"$13 pints, $7.50 pots"}',
  "happyHourVerifiedAt" = '2026-10-14',
  "happyHourSourceUrl" = 'https://pausebar.com.au/'
where id = 'dv-26';

update public.venues set
  opening_hours = 'Sun–Wed 11am–10pm; Thu–Sat 11am–midnight.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://goodnaturehotel.com.au/'
where id = 'dv-28';

update public.venues set
  opening_hours = 'Daily 3pm–1am.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://gcbg.com.au/venues/holy-grail',
  address = '67 Chapel Street, Windsor VIC 3181',
  lat = -37.85519,
  lng = 144.99258
where id = 'holy-grail';

update public.venues set
  opening_hours = 'Mon–Thu 12pm–11pm; Fri–Sat 12pm–late; Sun 12pm–11pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.unionhotelwindsor.com.au/',
  address = '90 Chapel Street, Windsor VIC 3181',
  lat = -37.85485,
  lng = 144.99301
where id = 'union-hotel';

update public.venues set
  opening_hours = 'Open daily; downstairs from noon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://nakedforsatan.com.au/'
where id = 'dv-stay-02';

update public.venues set
  opening_hours = 'Daily 7am–late.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://botanicalhotel.com.au/'
where id = 'dv-stay-05';

update public.venues set
  opening_hours = 'Mon–Thu 12pm–11pm; Fri–Sat 12pm–1am; Sun 1pm–11pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.cookiemelbourne.com.au/'
where id = 'dv-stay-06';

update public.venues set
  opening_hours = 'Tue–Thu 4pm–late; Fri–Sun 12pm–late; closed Mon.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://thegracedarlinghotel.com.au/'
where id = 'dv-stay-09';

update public.venues set
  opening_hours = 'Mon–Tue 12pm–9pm; Wed–Thu 12pm–10pm; Fri–Sat 11am–11pm; Sun 11am–10pm.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.riverlandbar.com/',
  address = 'Vaults 1–9 Federation Wharf, Melbourne VIC 3000',
  lat = -37.81872,
  lng = 144.9687
where id = 'dv-nat-01';

update public.venues set
  opening_hours = 'Daily from 11:30am.',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.stompingground.beer/pages/collingwood'
where id = 'dv-nat-03';

update public.venues set
  opening_hours = 'Daily 10am–late (may vary on public holidays).',
  "hoursVerifiedAt" = '2026-10-14',
  "hoursSourceUrl" = 'https://www.youngandjacksons.com.au/',
  address = '1 Flinders Street, Melbourne VIC 3000'
where id = 'dv-nat-05';

update public.venues set
  address = '2 Flinders Walk, Melbourne VIC 3000'
where id = 'dv-22';

do $$
declare
  missing text;
begin
  select string_agg(expected.id, ', ' order by expected.id) into missing
  from unnest(array['dv-01', 'dv-02', 'dv-03', 'dv-04', 'dv-05', 'dv-06', 'dv-07', 'dv-08', 'dv-09', 'dv-10', 'dv-11', 'dv-12', 'dv-13', 'dv-14', 'dv-15', 'dv-16', 'dv-17', 'dv-18', 'dv-20', 'dv-21', 'dv-25', 'dv-26', 'dv-28', 'holy-grail', 'union-hotel', 'dv-stay-02', 'dv-stay-05', 'dv-stay-06', 'dv-stay-09', 'dv-nat-01', 'dv-nat-03', 'dv-nat-05', 'dv-22']) as expected(id)
  where not exists (select 1 from public.venues v where v.id = expected.id);
  if missing is not null then
    raise warning 'verified venue data: no venues row for id(s) %', missing;
  end if;
end $$;

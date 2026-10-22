-- ============================================================
-- Six Melbourne cultural venues for SunStay's day and After Dark modes.
--
-- Why (Shannon, 22 Oct 2026): the Ticketmaster feed covers none of them, yet
-- they anchor a night out and free days: NGV, ACMI, Fed Square, Arts Centre
-- Melbourne, the Sidney Myer Music Bowl and the Forum. Free exhibitions are
-- modelled as places with opening hours; their events come later through
-- partnerships, ATDW or hand-checked venue entries (src/utils/venueEvents.js).
--
-- Facts only, each from the venue's own site or OpenStreetMap, checked 22 Oct 2026:
--   dv-29 NGV International  OSM way 23764181. "Open daily 10am–5pm", free entry
--         to the collection, fees may apply to special exhibitions (ngv.vic.gov.au/visit).
--   dv-30 ACMI               OSM way 22963244. "Daily from 10am to 5pm", "FREE entry,
--         with some ticketed events" (acmi.net.au/visit).
--   dv-31 Federation Square  OSM way 1098427843 (place=square). Public square.
--   dv-32 Arts Centre Melbourne  OSM node 13626510201 (Theatres Building). Hours vary by show.
--   dv-33 Sidney Myer Music Bowl  OSM way 24488865. Outdoor concerts; hours vary by event.
--   dv-34 Forum Melbourne    OSM way 46278368, 154 Flinders Street. Live music and shows.
-- Locations (c) OpenStreetMap contributors, ODbL 1.0.
-- Tags are only what those sources state ("Free Entry", "Live Music").
-- No images, descriptions or event listings are copied.
--
-- Guard: inserts only ids that don't exist yet, so a rerun changes nothing
-- and an edited row is never overwritten. New venues appear without a
-- microclimate profile until the next geometry run (venues_in_bbox left-joins).
-- ============================================================

insert into public.venues
  (id, "venueName", "typeLabel", "typeCategory", tags, suburb, address, lat, lng,
   emoji, vibe, official_website_url, opening_hours)
values
  ('dv-29', 'NGV International', 'Art gallery', null, '["Free Entry"]'::jsonb,
   'Southbank', '180 St Kilda Road, Melbourne VIC 3006', -37.8229117, 144.9686548,
   '🎨', 'Art gallery', 'https://www.ngv.vic.gov.au/', 'Daily 10am–5pm; closed Christmas Day.'),
  ('dv-30', 'ACMI', 'Screen culture museum', null, '["Free Entry"]'::jsonb,
   'CBD', 'Fed Square, Flinders Street, Melbourne VIC 3000', -37.8174356, 144.9690684,
   '🎬', 'Screen culture museum', 'https://www.acmi.net.au/', 'Daily 10am–5pm; closed Christmas Day.'),
  ('dv-31', 'Federation Square', 'Public square', null, '["Free Entry"]'::jsonb,
   'CBD', 'Corner Swanston and Flinders Streets, Melbourne VIC 3000', -37.8177396, 144.9691559,
   '🏛️', 'Public square', 'https://fedsquare.com/', null),
  ('dv-32', 'Arts Centre Melbourne', 'Performing arts centre', null, '[]'::jsonb,
   'Southbank', '100 St Kilda Road, Southbank VIC 3006', -37.8213258, 144.9684577,
   '🎭', 'Performing arts centre', 'https://www.artscentremelbourne.com.au/', 'Varies by performance.'),
  ('dv-33', 'Sidney Myer Music Bowl', 'Outdoor concert venue', null, '["Live Music"]'::jsonb,
   'Melbourne', 'Linlithgow Avenue, Melbourne VIC 3004', -37.8233051, 144.9746822,
   '🎵', 'Outdoor concert venue', 'https://www.artscentremelbourne.com.au/visit/theatres-and-spaces/sidney-myer-music-bowl/venue-information', 'Varies by event.'),
  ('dv-34', 'Forum Melbourne', 'Live music and theatre venue', null, '["Live Music"]'::jsonb,
   'CBD', '154 Flinders Street, Melbourne VIC 3000', -37.8164414, 144.9693768,
   '🎤', 'Live music and theatre venue', 'https://forummelbourne.com.au/', 'Varies by event.')
on conflict (id) do nothing;

-- ============================================================
-- Labels for the 21 curated venues with no typeLabel, and sourced tags in
-- place of the placeholder tags on df-01…df-11.
--
-- Why (docs/data/venue-kind-audit.md, PR #213): these 21 venues have no
-- typeLabel, so they match no food-type filter (Pub & bar, Restaurant…) and
-- venueKind() calls them 'other'. The 11 df-* rows also all carry the same
-- placeholder tags ["Pet Friendly","Beer Garden"], so a vegan restaurant and
-- an Italian restaurant were shown as dog-friendly beer gardens.
--
-- Labels use the wording public.clue_venue_label() already produces where it
-- fits ('Pub & bar', 'Restaurant', 'Bar'), and otherwise text the food-type
-- matchers in src/utils/venueFoodType.js map to the right filter: 'Brewery',
-- 'Beer garden & food trucks' (Pub & bar), 'Rooftop bar' (Cocktail & wine
-- bar), 'Bar & restaurant' (both). Checked against venueKind() on 21 Oct.
--
-- Tags: only the two placeholder tags are touched, and only on df-* rows.
-- A tag stays when a source below supports it, otherwise it is removed.
-- Unsourced is not "no": a removed tag can come back through the venue
-- attribute confirmation workflow (docs/design/venue-attributes-proposal.md).
-- Evidence, 21 Oct 2026 (venue sites first, then listings):
--   df-01 Ascot Vale Hotel  pub (ascotvalehotel.com.au). Dogs: outside only
--         (isitdogfriendly.com.au). Beer garden: not confirmed, removed.
--   df-02 Lion & Wombat     "British-inspired neighbourhood pub & beer garden";
--         "We allow dogs in the Beer Garden and at the Bar" (lionandwombat.com.au/bookings).
--   df-03 Mona Castle Hotel pub; "Public Bar + Beer Garden" and a post to dog
--         owners (venue Instagram); dogs welcome in the beer garden
--         (pawscapes.com.au). Wheelchair Accessible: no source, removed.
--   df-04 Royal Oak Hotel   corner pub; "Dog Friendly" (OpenTable listing);
--         "pub with beer garden" (corner.inc). Venue site now royaloakhotel.co.
--   df-05 Sister of Soul    "Vegetarian / Vegan Restaurant" (sisterofsoul.com.au).
--         No beer garden or dog source: both removed.
--   df-06 Sporting Club Hotel pub; "Dogs are welcome" (Broadsheet); deck,
--         laneway and courtyard/beer garden (OpenTable).
--   df-07 Stags Head Hotel  pub; "spacious beer garden" (Hobsons Bay City
--         Council directory); OpenTable Top 50 pet-friendly restaurants.
--   df-08 Tesoro Gastronomia "Modern Italian Restaurant" (tesorogastronomia.com).
--         Both tags removed.
--   df-09 Morning Star Hotel pub with "Restaurant, Bar and Beer Garden"
--         (Tripadvisor; Mamma Knows West). Dogs: not confirmed, removed.
--   df-10 Standard Hotel    "Best beer garden in Fitzroy" (venue Instagram);
--         dogs in the beer garden, on lead (isitdogfriendly.com.au, OpenTable).
--         Same address and website as dv-23 "The Standard": a duplicate,
--         left for a separate decision.
--   df-11 Three Crowns Hotel "West Melbourne Local Pub"; "bring your perfectly
--         behaved pup" (threecrownshotel.com.au); Beer Garden (OpenTable).
-- dv-* rows: label only, from the curated vibe and the venue's own site.
-- Their tags are curated, not placeholders, and are not changed here.
--
-- Guards: a label is written only while typeLabel is still empty, and tags
-- only while they still equal the placeholder set, so a later hand edit is
-- never overwritten. Rerunning this migration changes nothing.
-- ============================================================

update public.venues as v
   set "typeLabel" = l.label
  from (values
    ('df-01', 'Pub & bar'),
    ('df-02', 'Pub & bar'),
    ('df-03', 'Pub & bar'),
    ('df-04', 'Pub & bar'),
    ('df-05', 'Restaurant'),
    ('df-06', 'Pub & bar'),
    ('df-07', 'Pub & bar'),
    ('df-08', 'Restaurant'),
    ('df-09', 'Pub & bar'),
    ('df-10', 'Pub & bar'),
    ('df-11', 'Pub & bar'),
    ('dv-04', 'Brewery'),
    ('dv-06', 'Pub & bar'),
    ('dv-07', 'Beer garden & food trucks'),
    ('dv-08', 'Pub & bar'),
    ('dv-09', 'Rooftop bar'),
    ('dv-11', 'Rooftop bar'),
    ('dv-12', 'Pub & bar'),
    ('dv-23', 'Pub & bar'),
    ('dv-25', 'Bar & restaurant'),
    ('dv-26', 'Bar')
  ) as l(id, label)
 where v.id = l.id
   and coalesce(trim(v."typeLabel"), '') = '';

update public.venues as v
   set tags = t.tags
  from (values
    ('df-01', '["Pet Friendly"]'::jsonb,                 '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-02', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-03', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden", "Wheelchair Accessible"]'::jsonb),
    ('df-04', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-05', '[]'::jsonb,                               '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-06', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-07', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-08', '[]'::jsonb,                               '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-09', '["Beer Garden"]'::jsonb,                  '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-10', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden"]'::jsonb),
    ('df-11', '["Pet Friendly", "Beer Garden"]'::jsonb,  '["Pet Friendly", "Beer Garden"]'::jsonb)
  ) as t(id, tags, placeholder)
 where v.id = t.id
   and v.tags = t.placeholder
   and v.tags is distinct from t.tags;

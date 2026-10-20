# Venue kind audit

Written 20 October 2026, against `main` at `d4e5f9c`. Production data comes from project
`fksuqgvsazoxarocmaii`, using `SELECT` queries only. No data, migration or function was changed.

**Starting point:** the 20 Oct audit (P0‑1) found that 1,030 of 1,053 venues have
`typeCategory = 'Bar'`, cafés included. Both import migrations,
`20261016000000_promote_venue_candidates.sql` and `20261016030000_clue_venue_labels_osm.sql`, say
that `'Bar'` only means "not a stay". What people see is `typeLabel`, set by
`public.clue_venue_label()`. So two things could go wrong:

- **(a)** code reads `typeCategory = 'Bar'` literally, as "this is a bar";
- **(b)** a venue has the wrong `typeLabel`.

## Summary

- **(a) Code:** one live path showed a café-type venue as a bar.
  - The map pin preview subtitle fell back to `typeCategory`, so the 11 curated venues with no
    `typeLabel` and no `vibe` showed **"Bar · St Kilda"** and similar. Two examples are Sister of
    Soul and Tesoro Gastronomia.
  - **Fixed in this PR:** `typeCategory` is now used only for stays.
  - Nothing else in `src/`, `supabase/functions/` or `sunstay-admin/` treats a café or bakery as a
    bar. Filters, search, Sunny's context and map pins all read `typeLabel` (or `vibe`).
  - Two remaining literal "bar" readings are unreachable: a legacy `all-bars` filter branch and an
    unused category detector. Both are listed below.
- **(b) Labels:** the CLUE labels look sound.
  - Of 1,053 venues, `venueKind` gives:

    | Kind | Venues |
    |---|---:|
    | restaurant | 358 |
    | cafe | 334 |
    | takeaway | 116 |
    | pub | 72 |
    | bar | 70 |
    | bakery | 29 |
    | stay | 13 |
    | other | 61 |

  - The real gap is **21 curated venues with no `typeLabel`**. Most of them are Melbourne pubs
    named "Hotel".
  - Name-pattern flags found no clear mislabels. They did find a short list worth a human look:
    see "Name flags" under Task 3.
- **New:** `src/utils/venueKind.js` gives one tested kind (`cafe`, `bakery`, `bar`, `pub`,
  `restaurant`, `takeaway`, `stay`, `other`).
  - It is derived from `typeLabel` through the same matchers as the food filters.
  - Stays come from `typeCategory`.
  - It never reads the name.

## Task 1: every read of `typeCategory` and `category`

`category` is the `venues_in_bbox` RPC's copy of `typeCategory`.

**Café → bar?** says whether a café or bakery ends up treated as a bar on that path.

| # | File:line | What it does | Café → bar? |
|---|---|---|---|
| 1 | `src/utils/mapVenuePreview.js:8` (before this PR) | Map pin preview subtitle: `typeLabel \|\| vibe \|\| typeCategory`. | **Yes, live.** 11 production venues (`df-01`…`df-11`) have typeCategory `Bar` and no label or vibe, so the preview said "Bar · St Kilda". The list row and venue card show no type for the same venues, so the preview also disagreed with them. **Fixed:** the fallback applies only when `venueKind(venue) === 'stay'`. |
| 2 | `src/utils/propertyTypes.js:24,28` `matchesPropertyTypeFilters` | `all-bars` matches `typeCategory === 'Bar'`, and a missing category defaults to `'Bar'`. | **Would be yes**: every café would pass a "bars" filter. **But it is unreachable.** No chip, preset, URL or saved state produces `all-bars` today. Its only other mention is `discoveryExperience.js:17` (`OWNED_FILTERS`). The live drink filters are `all-pubs` and `all-cocktail-bars` in `venueFoodType.js`, which read `typeLabel`. Left unchanged; recommend deleting the branch. |
| 3 | `src/utils/propertyTypes.js:14` `isStayVenue` | Stay = typeCategory Hotel / Serviced apartment / Short stay. | No. `'Bar'` is correctly "not a stay". |
| 4 | `src/utils/propertyTypes.js:18` `isPropertyVenue` | Stay or `Residential` (homes). | No. |
| 5 | `src/App.jsx:274` (list row subtitle) | `typeLabel \|\| (property ? typeCategory : vibe)`. | No. A non-property never shows its category. |
| 6 | `src/components/VenueListPanel.jsx:20` | Same rule as #5. | No. The component is also not imported anywhere. |
| 7 | `src/components/VenueCard.jsx:695` | "Your property" vs "Your stay" heading for `Residential`. | No. |
| 8 | `src/utils/accommodation.js:12` `checkIsAccommodation` | With a typeCategory, defers to `isPropertyVenue`. | No. |
| 9 | `src/utils/hotelSunReportRoute.js:18` | Hotel sun report route: accommodation and not `Residential`. | No. |
| 10 | `src/utils/venueSeed.js:12`, `src/utils/stressVenues.js:14–16,51` | Column type map for `scripts/` seeding; synthetic `?stress=` venues. | No. They write the field and never branch on it. |
| 11 | `venues_in_bbox` → `category` (`supabase/migrations/20261014150000_real_horizon_sun_and_bbox_hour.sql:52,89`) | The RPC returns `typeCategory as category`. | No. **No client code reads `category`.** `useVenuesInBbox` and `microclimate.js` use only the sun and wind fields. |
| 12 | `supabase/functions/*` | — | No reads of `typeCategory` or `category`. |
| 13 | `sunstay-admin/src` | — | No reads of venue type at all. |

Paths that decide what kind a venue is without `typeCategory` (checked because the brief named
them):

| File:line | Reads | Café → bar? |
|---|---|---|
| `src/utils/venueFoodType.js:35` `matchesFoodTypeFilters` (Café, Pub & bar, Cocktail & wine bar… chips) | `typeLabel`, accent and case folded | No. "Bakery cafe" is excluded from Café and counted as Bakery. |
| `src/utils/locationSearch.js:48` `venueMatchesSearch` | Name, suburb and `vibe` (+ `venueTypeLabel`) | No. Searching "bar" finds `vibe` "Pub & bar" or "Cocktail & wine bar", never a café. |
| `src/utils/clayVenuePins.js:91` `pinIconName` (map pins, list and card icons) | `typeLabel` rules, then emoji, then tags | No. Cafe → coffee cup, Bakery cafe keeps 🥐. Note: the 11 unlabelled `df-*` venues all carry the tags `["Pet Friendly","Beer Garden"]`, so they get the beer-garden table icon. That comes from tag data, not the kind (see Task 3). |
| `src/utils/sunnyTools.js:300` (Sunny's chat context) | `typeLabel ?? vibe` → `type` | No. `chat-sunny` only passes `type` into the prompt. |
| `src/utils/venueAmenities.js:33` `isBarVenue` (Sunny's "bar" focus) | `typeLabel`, `vibe` and tags | No. "Cafe" and "Bakery cafe" contain no bar word. |
| `src/utils/cafeCardTiles.js:32` `isCafeVenue` (café sun card, café list row) | `typeLabel` exactly `Cafe` or `Bakery cafe` | Not a bar error. But two curated cafés, **"Cafe & Roastery"** and **"Library Cafe"**, don't get the café card or row graph. This scope was set by #206 for CLUE labels. Widening it to `venueKind ∈ {cafe, bakery}` is a product decision, so it is not changed here. |
| `src/data/venueCategories.js:17` `detectVenueCategory` | Guesses from `vibe`, name, tags and notes; **defaults to `'bar'`** | Would be yes, but it is **dead code**. Its callers are `PhotoUpload` / `PhotoGallery` through `categoryConfig`, and nothing passes one. `PhotoDashboard` isn't imported. Recommend deleting, or switching it to `venueKind`, before anyone wires photo upload back in. |

## Task 2: `venueKind`

`src/utils/venueKind.js` returns one of `cafe | bakery | bar | pub | restaurant | takeaway | stay |
other`.

1. **Stay:** `isStayVenue` (typeCategory Hotel, Serviced apartment or Short stay, from
   `propertyTypes.js`). `Residential` homes are `other`; no home exists in production or the demo
   data.
2. **Otherwise from `typeLabel` only.** The label goes through `venueTypeLabel`, so "Eatery" counts
   as "Food & drink" and has no kind. It is then matched with the food-filter matchers
   (`venueFoodType.js`). First match wins:
   1. bakery
   2. cafe
   3. cocktail/wine bar → `bar`
   4. "Pub & bar" matcher → `pub` if the label says pub, tavern, brewery or beer, else `bar`
   5. restaurant
   6. takeaway
3. **Missing or unknown label → `other`.** The name, `vibe` and emoji are never read.

`venueKind.test.js` covers:

- every label `clue_venue_label()` can produce;
- every curated label in production;
- accents, casing and spacing;
- null, empty and non-text labels;
- names that must not be guessed;
- stays.

Labels with no kind of their own, and so `other`:

| Label | Venues |
|---|---:|
| Gelato & dessert | 16 |
| Hotel dining | 10 |
| Eatery | 8 |
| No label | 21 |
| Six one-off curated labels ("Rooftop Club", "High-Exposure Rooftop", "Beach House Dining", "Warehouse & Garden", "Foreshore Pavilion", "Outdoor Streetside") | 6 |

**Client change:** only `mapVenuePreview` (row #1 in Task 1). No other live path mistreats cafés.

## Task 3: labels in production

### `typeCategory` × `typeLabel`

| typeCategory | typeLabel | Source | Venues |
|---|---|---|---:|
| Bar | Restaurant | clue | 355 |
| Bar | Cafe | clue | 332 |
| Bar | Takeaway | clue | 116 |
| Bar | Pub & bar | clue | 56 |
| Bar | Cocktail & wine bar | clue 37, osm 19 | 56 |
| Bar | Bakery cafe | clue | 29 |
| Bar | Gelato & dessert | clue | 16 |
| Bar | *(none)* | curated | 11 |
| Bar | Hotel dining | clue | 10 |
| Bar | Eatery | clue | 8 |
| Bar | Bar | clue 7, osm 1 | 8 |
| Bar | 33 distinct curated labels (Rooftop Bar, Historic Pub, Library Cafe, Cafe & Roastery…) | curated | 33 |
| Hotel | Hotel / Boutique Hotel | curated | 9 |
| Serviced apartment | Serviced apartment | curated | 4 |
| *(none)* | *(none)* | curated | 10 |
| **Total** | | | **1,053** |

Notes:

- There are 20 `data_source = 'osm'` venues (19 cocktail and wine bars, 1 bar). Neither migration
  above creates them, so their labels come from another import path.
- 21 venues have no `typeLabel`:
  - **`df-01`…`df-11`** have typeCategory `Bar`, no vibe, emoji ☀️, and the identical tags
    `["Pet Friendly","Beer Garden"]` (`df-03` also has Wheelchair Accessible).
    - The names are Ascot Vale Hotel, Lion and Wombat, Mona Castle Hotel, Royal Oak Hotel, Sister
      of Soul, Sporting Club Hotel, Stags Head Hotel, Tesoro Gastronomia, The Morning Star Hotel,
      The Standard Hotel and Three Crowns Hotel.
    - The identical tags look like a placeholder rather than evidence. Sister of Soul and Tesoro
      Gastronomia are unlikely to be beer gardens.
  - **`dv-04`, `dv-06`…`dv-09`, `dv-11`, `dv-12`, `dv-23`, `dv-25`, `dv-26`** have no
    typeCategory either. They do have a `vibe` ("Classic Pub", "Brewery & Beer Garden",
    "Neighbourhood Bar"…), so the app shows that.

### Name flags

These are names that suggest one kind while the label says another. **Name matches are flags, not
proof.** Each needs a human look (OSM, the venue's site) before any change.

| Pattern | Rule | Flags |
|---|---|---:|
| cafe / café / coffee / espresso | label has no "caf" | 7 |
| bakery / bakehouse / patisserie / boulangerie | label has no "bak" | 0 |
| pizza | label not Restaurant / Takeaway / Eatery | 1 |
| pub / tavern | label has no pub / tavern / bar | 0 |
| hotel (not a stay) | label has no hotel / pub / bar / tavern | 12 |
| Reverse: label Cafe or Bakery cafe | name says bar / pub / hotel / restaurant / pizza / sushi / kebab / wine / cocktail / beer | 25 |

**cafe / coffee / espresso (7).** All are CLUE. Most look right:

| Name | Label | Read |
|---|---|---|
| Asian Beer Cafe (`clue-2024-105746-825`) | Pub & bar | Beer hall, by design (migration comment) |
| Belgian Beer Cafe Melbourne (`clue-2024-559161-991`) | Pub & bar | Beer hall |
| Renzo's Bar Cafe Italiano (`clue-2024-560001-654`) | Cocktail & wine bar | Check: OSM "bar" |
| The Moat Bar & Cafe (`clue-2024-109388-486`) | Cocktail & wine bar | Check |
| Victoria's Secret Bar & Cafe (`clue-2024-109669-238`) | Cocktail & wine bar | Check |
| Achelya Cafe & Kebab Restaurant (`clue-2024-560004-1031`) | Restaurant | Plausible |
| Market Kebab Cafe (`clue-2024-110679-846`) | Takeaway | Plausible |

**pizza (1).** Evergreen Cafe And Pizzeria (`clue-2024-601815-1036`) is labelled Cafe. That is
plausible: the name says cafe.

**hotel, not a stay (12).** All are curated. In Melbourne a "Hotel" name usually means a pub.

- Eight have no label and typeCategory `Bar`: Ascot Vale Hotel (`df-01`), Mona Castle Hotel
  (`df-03`), Royal Oak Hotel (`df-04`), Sporting Club Hotel (`df-06`), Stags Head Hotel (`df-07`),
  The Morning Star Hotel (`df-09`), The Standard Hotel (`df-10`) and Three Crowns Hotel (`df-11`).
- Three have no label and no typeCategory: Garden State Hotel (`dv-06`), Railway Hotel (Windsor)
  (`dv-12`) and Royal Standard Hotel (`dv-08`).
- Transport Hotel (`dv-27`) is labelled "High-Exposure Rooftop".
- These are kind `other` until labelled. "Pub & bar" is the likely label, but that needs
  confirming per venue.

**Reverse: Cafe-labelled, bar/restaurant-ish name (25).** All are CLUE.

- Most are fine: espresso and coffee bars, a juice bar, sandwich bar, kebab/sushi cafés, and
  "Cafe & Bar" names. Examples: Pellegrini's Espresso Bar, The Potter Espresso Bar, Koffi Bar,
  Moody Brew Coffee Bar, Tropicana Juice Bar, Reynolds Street sandwich bar, Gordons Cafe and Bar,
  Williams Bar & Café, Pawa Cafe & Bar, Betwixt Cafe & Bar, East Side Story Bar + Cafe, Ample Cafe
  Bar, Kebab & Gozleme Cafe, Bolte Cafe & Kebab, My Sushi Japanese Cafe, Hi Chong Qing Cafe &
  Noodle Bar.
- **Worth checking** (possible restaurants or bars):

  | Name | Id |
  |---|---|
  | Strozzi Restaurant | `clue-2024-102089-368` |
  | Bar Scopa | `clue-2024-592858-905` |
  | Grocery Bar East Melbourne | `clue-2024-593697-581` |
  | Mixity Restaurant and Cafe | `clue-2024-106102-876` |
  | Queenie's Restaurant & Cafe | `clue-2024-110456-252` |
  | Dodee Paidang Thai Bar And Cafe - Takeaway | `clue-2024-110669-37` |
  | Market Cafe / Station Cafe / Mercury Restaurant | `clue-2024-623345-177` |
  | University Cafe / Universita Bar Restaurant | `clue-2024-106130-509` |

  A Cafe label on a "Restaurant" name comes from an OSM `cafe` tag or a hand override, because the
  name rule would have said Restaurant. So the next step is to read `venue_import_candidates`
  (`osm_amenity`, `label_override`) for these ids.

**Other small labels.**

- **"Eatery" (8):** LE SHOPPE, Melbourne Cellar Door, Nando's, Slater St Bench, Subway, The Fresh
  Collective, Yakimono, Zouki on the Park. Nando's and Subway are likely Takeaway; Yakimono is
  likely Restaurant.
- **"Hotel dining" (10):** hotel restaurants such as Hilton, Rydges and Quincy, plus two oddities:
  Graduate Union Of The University Of Melbourne Inc and Zagame's House.
- **Plain "Bar" (8):** Bar Bellamy, Bar Holiday, CQ Bar, DRP Bar, Jimmy Watson's Wine Bar, Pilgrim
  Bar, White Rabbit Record Bar, Solace (osm).
  - The Pub & bar filter chip includes these (its matcher matches "bar"); `venueKind` calls them
    `bar`.
  - Jimmy Watson's Wine Bar would sit better as "Cocktail & wine bar". The rule checks "wine bar"
    only after OSM and the name rules, which explains it.

### Fixes that would need `supabase/` (not done; reporting only)

Any write here goes through a migration or a service-role run, and merging under `supabase/`
deploys to production.

1. **Label the 21 unlabelled curated venues.** For example, "Pub & bar" for the "Hotel" pubs after
   checking each one; set real labels for Sister of Soul and Tesoro Gastronomia. Also replace the
   placeholder `["Pet Friendly","Beer Garden"]` tags on `df-*` with real ones or remove them.
2. **Review the "worth checking" list** above and set `venue_import_candidates.label_override`
   where wrong, then run `relabel_clue_venues()`. This flow is described in the migration header.
3. **Optional rule tweak** in `clue_venue_label()`: check `wine bar|cocktail` before the plain
   `\mbar\M` fallback, so "Jimmy Watson's Wine Bar" becomes "Cocktail & wine bar".

## Should `typeCategory` be renamed or split? (proposal only)

Yes, eventually. Today one column carries two unrelated things: **listing type** (stay / home /
food-and-drink venue) and a stale "Bar" value that reads like a venue kind. It is safe now only
because every reader except the one fixed here checks for stays. The next person to write
`typeCategory === 'Bar'` reintroduces the bug.

Proposed, in separate reviewed PRs:

1. **Add `listing_type text not null check (listing_type in ('venue','stay','home'))`.**
   - Backfill it: Hotel, Serviced apartment and Short stay → `stay`; Residential → `home`;
     everything else (`Bar`, null) → `venue`.
   - Point `isStayVenue` / `isPropertyVenue` at it, with `typeCategory` as a fallback during the
     switch.
2. **Optionally add `venue_kind`** with the same eight values as `venueKind()`.
   - It would be set by `clue_venue_label()` alongside the label, or kept client-side only.
   - Client-side only is simpler and avoids a second source of truth. Store it only if a
     server-side consumer (an RPC filter, `chat-sunny`) needs it.
3. **Stop writing `typeCategory = 'Bar'`** in `promote_venue_candidates`, and in any OSM import
   path. Once no client reads it, deprecate the column. Keep `venues_in_bbox.category` until
   then, since it is unused but part of the RPC's return type.

New columns follow the project rules: RLS stays on `venues`, and there are no new grants. No
migration file is part of this PR.

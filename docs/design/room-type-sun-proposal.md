# Hotel room-type sun: data model proposal

**Status: proposal only.** Written 21 October 2026 (Australia/Melbourne) against main
`d4e5f9c` and production project `fksuqgvsazoxarocmaii` (read-only SELECTs). This change adds
only this document. No migration, seed, database write, function deployment or hotel outreach is
authorised or performed by it.

Read first: [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), the
[venue sun-card brief](venue-sun-cards-brief.md) (stage 6 and §4, §6) and the
[venue-confirmed attributes proposal](venue-attributes-proposal.md), whose contact, invite and
review workflow this document reuses rather than duplicates.

Goal (Shannon, 21 Oct 2026): a stay page where a guest can **pick the room that gets the sun**,
with each room type's balcony or window sun shown honestly, and a clear path for hotel groups to
improve the data. Design reference: the "Hotel: balcony sun by room" artboard in the SunStay
Discovery Redesign canvas.

## 1. Current state, verified

| Finding | Consequence |
| --- | --- |
| 13 venues are stays (`typeCategory` Hotel or Serviced apartment). All 13 have `roomTypes jsonb`; together they hold **48 entries**. | The data covers every listed stay, but see the next rows. |
| Every entry is a **facade side at one representative floor**, named like "North-facing rooms · Level 19". Keys: `id`, `name`, `orientation` (bearing in degrees), `floorLevel`, `floorHeight`, `obstructions`, `source`, plus `wallMetres` on 42. | These are building sides, not the hotel's bookable room types. A guest can't book "North-facing rooms · Level 19". |
| `source` is `estimated-buildings` (42) or `estimated` (6). No entry has a balcony flag, overhang, floor range, room name from the hotel or any confirmation. | Every room sun number today is modelled from the footprint and neighbours. None is hotel-confirmed or checked on site. |
| `src/utils/balconySunEngine.js` and `src/utils/hotelSunReport.js` already take `orientation`, `obstructions` and `overhang`, compute sun per day and per month, and keep a bad room as "unavailable" without hiding the others. `floorLevel` is carried through for display only: the obstruction angles are measured once, from one floor height, by `calculateFacadeSun(footprint, neighbours, floorHeight)` in `src/utils/facadeSun.js`. | **The sun maths is ready.** What's missing is room-type identity, outdoor-space geometry, evidence, and obstruction angles for more than one floor height. |
| `venue_outdoor_points` exists but is empty and has no link to rooms. Its `label` already allows `balcony`. | It can't express "this balcony belongs to the King Harbour room type". It stays the venue-level terrace/courtyard model. |
| There is no rate source. Demo rooms carry `baseNightlyRateDemo`. | Prices stay out of production. The action is "Check rates" to the hotel's own URL (audit P0‑5, brief §1.9). |

## 2. The model: three layers

```
Stay (venues row)
 └─ Facade side            computed geometry: bearing, wall, neighbours        ← exists today as roomTypes[]
     └─ Room type          the hotel's product: name, floors, outdoor space     ← new
         └─ Evidence       modelled → hotel-confirmed → on-site checked         ← new, reuses #207 workflow
```

- **Facade side** is what we already have. It's computed, needs no hotel input and covers every stay.
- **Room type** is what a guest books. One room type sits on one facade side, or two for a corner
  room. It carries a floor range and the outdoor space (balcony, Juliet, terrace, window only).
- **Evidence** says how sure we are about each room type's facts. It never upgrades the sun
  numbers themselves: they are always calculated by the engine, never typed (brief §4).

Until a stay has real room types, the UI shows **"Sun by side of the building"** using facade sides.
"Pick the room that gets the sun" appears only when a stay has at least two room types on
different facades. This removes today's implied precision without hiding anything useful.

## 3. Proposed objects

Names are design names, not created tables or migration files. All new tables enable RLS and revoke
`public, anon, authenticated` by name at creation (CLAUDE.md, Supabase rules).

| Object | Purpose and fields |
| --- | --- |
| `public.stay_facades` | One row per computed facade side, moved out of `venues.roomTypes`: `id uuid`, `venue_id text` FK, `bearing_deg real`, `wall_m real`, `obstructions_by_height jsonb` (obstruction angles keyed by floor height in metres), `source` enum (`estimated`, `estimated-buildings`), `computed_at`. Public read. Written only by the import job. |
| `public.stay_room_types` | The hotel's bookable product, as currently published: `id uuid`, `venue_id text` FK, `name text` (the hotel's own room name), `floor_min int`, `floor_max int`, `outdoor_space` enum (`balcony`, `juliet`, `terrace`, `window_only`, `none`), `balcony_depth_m real null`, `overhang` jsonb null (`depth`, `height`), `rate_url text null` (the hotel's official booking page only), `published_revision`, `active bool`. Public read of approved rows only. |
| `public.stay_room_type_facades` | Join table: `room_type_id`, `facade_id`, `share` (for corner rooms). Lets a corner suite use two sides without inventing a third bearing. |
| Evidence | **Not a new workflow.** Extend the #207 attribute registry with a `room_type` scope and room-type keys (`room_facade`, `floor_range`, `outdoor_space`, `balcony_depth`, `overhang`). Hotel answers go through the same `private.venue_contacts`, invites, submissions, reviewers and append-only review events. Approval writes the sanitised `stay_room_types` row in the same transaction. |
| `public.stay_room_type_facts` view model | Per room type: the current evidence state for each fact (`modelled`, `hotel_confirmed`, `on_site_checked`), `confirmed_at`, `expires_at`. Same sanitised-projection rule as #207: no contacts, tokens or reviewer identities. |

Why tables, not more JSON on `venues`: room types need per-fact evidence, expiry and history, a
corner room needs two facades, and approved hotel data must not be overwritten by the next
building import. JSON on `venues` can't do any of those safely.

## 4. What the engine computes per room type

Inputs per room type: the linked facade bearing(s) and obstructions, `floor_min` and `floor_max`,
`outdoor_space`, `balcony_depth_m` and `overhang`.

- Obstructions depend on height, so the facade import computes obstruction angles at **both**
  `floor_min` and `floor_max` (`calculateFacadeSun` with each floor's height), and the card runs
  `buildHotelSunReport` for each. If the totals differ by more than 15 minutes, show a range
  ("4h 10m – 5h 30m, higher floors get more"). Never show the best floor's number alone.
  `stay_facades` therefore stores obstructions per reference height, not one array.
- `window_only` and `none` rooms show **"window sun"**, not balcony sun (brief §1.3, facade vs usable sun).
- Without `overhang`, show "Balcony roof not modelled" beside the number, as the café card does for awnings.
- Totals always equal the sum of windows (existing tested invariant). Sunniest months stay
  computed per room type (brief §1.4).
- No sun minutes are stored. Everything is computed client-side from geometry, so a geometry fix
  updates every number at once.

## 5. Display contract for the stay card

| Evidence for the room's facade and floors | Headline label | Trust line (the "How sure are we?" ladder) | Allowed extras |
| --- | --- | --- | --- |
| Facade sides only, no room types | Sun by side of the building | Modelled from building footprint and neighbours | No room picker, no "room" wording |
| Room types, all facts `modelled` | Balcony sun / Window sun | Modelled · Hotel-confirmed (next) · On-site checked (not yet) | Room picker |
| `room_facade` and `floor_range` `hotel_confirmed` | Same | Hotel-confirmed, with the date | "Confirmed by the hotel" chip, no tick |
| `on_site_checked` record exists | Same | On-site checked, with the date | The future "SunStay Verified" badge (brief §6) |

Facts past `expires_at` fall back to `modelled`. They never stay at a higher level by default.
The action button is always **"Check rates"** to `rate_url`, or hidden when there isn't one.

## 6. Hotel partner flow (the B2B offer)

This is the premium product for hotel groups, built on the #207 invite workflow:

1. Staff send a reviewed invite to a verified hotel contact.
2. The hotel lists its room types and, for each, taps the side of its own building outline (we
   already hold the footprint from City of Melbourne buildings), enters the floor range, and
   picks the outdoor space and balcony depth.
3. A reviewer approves. The room types publish as `hotel_confirmed`.
4. Optional paid on-site check: SunStay staff confirm orientation and shading and add a dated
   record, which unlocks the Verified badge.

Hotels see why the ladder matters: confirmed rooms rank with accurate sun, and "Verified" is earned.

## 7. Rollout, one reviewed PR each

1. **UI honesty, no schema change.** Relabel today's entries as "Sun by side of the building" and
   hide the room picker for facade-only stays. Small Codex PR.
2. **Adapter.** A pure `src/utils/stayRoomTypes.js` that turns facades plus room types plus facts
   into the display contract above, with tests for every row of §5 and the floor-range rule.
   Fixture data only.
3. **Migration proposal PR** for §3. Reviewed SQL, grants and RLS. **Not applied** without
   Shannon's explicit approval, because merging under `supabase/` deploys.
4. **Pilot**: two or three Melbourne hotels through the partner flow, with manual entry by staff
   if the invite flow isn't built yet, still recorded as `hotel_confirmed` with a real contact.
5. **Stay card build** from the redesign canvas once real room types exist.

## 8. Decisions (Shannon, 21 Oct 2026)

- **Pilot hotels: three stays already in SunStay, one of each partner type.**
  - Quest St Kilda Bayside (serviced apartments): a local franchisee decides, and the balconies
    by the bay show the room picker best.
  - Lancemore Crossley St (boutique): the fastest likely yes, to prove the flow.
  - Mantra on Little Bourke or the Grand Hyatt (major brand): slower, but the credibility
    hotel groups and investors look for.
- **Floor range: show it, kept simple.** "4h 10m – 5h 30m of balcony sun · higher floors get
  more". Never show the best floor's number alone. A single "typical floor" figure would
  mislead guests on low floors.
- **Corner rooms: deferred.** In the pilot, a corner room uses its main facade with the note
  "Corner room, may get extra sun". `stay_room_type_facades` keeps the two-facade option for later.
- **On-site checks: later, as a paid tier.** The pilot is free and reaches `hotel_confirmed`.
  A paid on-site check unlocking "SunStay Verified" is offered once two or three pilot hotels
  have seen the benefit.

## 9. Not covered here

Real-time availability or prices, room photos and their provenance rules (brief §1.7–1.8),
Airbnb or serviced-apartment hosts (same model, different contact flow), and Vicmap 3D building
heights (pending). The engine and the current `roomTypes` JSON are unchanged by this document.

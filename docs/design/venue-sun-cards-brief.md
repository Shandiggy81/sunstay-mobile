# Venue & room sun cards: design brief

Status: approved direction, staged implementation. Owner: Shannon.
References: `docs/design/card-references/*.jpg` (ChatGPT mockups, Oct 2026; example data only —
the numbers in them are illustrative and do not add up).
Icons: 12 new clay icons in `src/assets/clay/` (see "Icons" below).

The mockups are the **visual reference only**. Every number, label and icon on a
shipped card must be backed by real data or code. Where data doesn't exist yet,
the element is hidden or clearly labelled — never faked.

## 1. Non-negotiable data rules

1. **Sun times come from the sun engine** (SunCalc + facade bearing + any
   obstruction data), never hand-entered. Windows and the headline total must
   add up exactly (`total = sum(windows)`), with a unit test.
2. **Sun path is not weather.** The headline is "direct sun on a clear day".
   Show the forecast separately with `DataBadge kind="forecast"`
   (e.g. "Forecast · mostly sunny"). Never imply a sunny day from the sun path.
3. **Facade sun vs usable sun.** Label which one the number is ("on the balcony
   facade" vs "at the outdoor tables"). If overhangs/neighbouring buildings are
   not modelled, say so beside the number.
4. **Sunniest months are calculated per venue** from the engine (average daily
   direct-sun minutes per month for that location + bearing). Never hard-coded.
   Note: north-facing Melbourne spaces often get MORE facade sun in winter.
5. **Heat ≠ sun.** Heaters/fireplaces are warmth features, shown separately.
   "Cosiest months" (if used) must state its basis (climate averages + heaters).
6. **Source + confidence are one slim line**, derived from data quality — e.g.
   "Estimated from venue layout · Medium confidence ⓘ". Confidence rules live in
   one tested util. "Very good" can't appear next to "estimate".
7. **No fabricated trust signals.** No ratings/review counts without a licensed
   source. No "Verified" tick unless a real verification record exists
   (see §6). No "Actual room photo" unless the image is flagged as such in data.
8. **Real photos only** on real venues. AI mockup images are references, never
   shipped as a venue's photo.
9. **Prices/availability** only from a real rate source. Until then: "Check rates".
10. Use `DataBadge` kinds (live / forecast / calculated / estimated / demo) for
    every data-bearing value: wind, noise, temperature, sun.

## 2. Components

### `SunWindowsGraph` (the sun-shaped graph — Shannon's idea)
Primary visual reference: `card-references/hotel-room-card-v2.jpg` (top right):
a soft sky band, one golden "hill" per sun window with a sun at its peak, grey
dips for shade and night, "Now" marker, and a "2 sun windows" summary.
- Input: `{ windows: [{start, end}], date, timezone, now? }` from the engine.
- Curve is filled amber **only during sun windows**; gaps dip grey.
- One clay/vector sun per window at its midpoint, sized by window duration.
- "Now" marker only when `date` is today in the venue's timezone.
- Axis 6am / 12pm / 6pm; window chips below ("9:15am – 12:05pm · 2h 50m").
- Pure layout maths in a tested util; respects reduced motion; accessible text
  summary ("Sun 9:15am to 12:05pm and 1:30pm to 4:15pm, 5 hours 35 minutes").

### Compact card vs detail sheet
- **List/map card (compact):** photo, name, type chip, headline sun number,
  mini `SunWindowsGraph` (no labels), forecast badge.
- **Detail sheet (full):** everything in the mockups, per venue type.

## 3. Per-type content

| Type | Headline | Feature tiles (max 4) | "Best for" |
|---|---|---|---|
| Café | Outdoor Table Sun | Outdoor tables · Dog-friendly (`brucey`) · Pram-friendly (`pram`) · Wind-sheltered | morning coffee + brunch |
| Beer garden / pub | Beer Garden Sun | Beer garden (`beer-garden`) · Covered area (`pergola`) · Dog-friendly · Heaters | long lunches + pints |
| Rooftop bar | Rooftop Sun | Rooftop (`rooftop-sunset`) · Views · Wind-sheltered · Heaters | sunset drinks |
| Winter courtyard | Courtyard Sun (real sun hours) | Heater · Fireplace · Wind-sheltered · Covered | heaters + fireside drinks |
| Hotel room / stay | Balcony Sun | Private balcony (`sunny-balcony`) · Views · Building side (`sun-facing-facade`) · Outdoor comfort | per room type |

Tiles only appear when the venue data has the field. "Best for" copy is chosen
by rule from sun windows (morning / midday / afternoon / sunset), not free text.

## 4. Hotel/room card specifics
- Sun data is **per room type** (floor + facade bearing), not per hotel.
- Outdoor comfort tiles (Wind / Noise / Temperature) each carry a DataBadge:
  wind & temp = forecast; noise = estimated (state the method) unless measured.
- Mockup bug to avoid: windows 6:42–11:15 + 1:05–5:05 = 8h 33m but headline said
  6h 25m. The total must be computed, never typed.
- Overshadowing: use `overshadowed` icon + note when neighbouring buildings may
  block sun and aren't modelled yet (pending Vicmap 3D Buildings).

## 5. Icons (new, 256px WebP, soft palette)
`sun-calendar`, `pergola`, `garden`, `balcony-coffee`, `courtyard-terrace`,
`beer-garden`, `sunny-balcony`, `rooftop-sunset`, `sun-facing-facade`,
`overshadowed`, `sheltered-balcony`, `wind-sheltered`.
- Use at **≥56px** (tiles, section headers). Not for map pins or ≤32px chips.
- Existing icons stay for amenities/weather (`deck`, `heater`, `house`,
  `hotel-views`, `brucey`, `pram`, `fireplace` …).
- Not adopted: floor-plan, new heater (reads as lamp). On hold: verified-balcony
  tick (needs §6).

## 6. Future: "SunStay Verified" (business idea, not built)
A verification record per room/venue (on-site or venue-confirmed orientation,
outdoor area geometry, photo provenance) would unlock a genuine Verified badge
and a premium B2B offer for hotel groups. Until a record exists, no tick.

## 7. Stages (one PR each, 390px screenshots, no merge without review)
1. Assets + this brief + data-availability report (no UI).
2. `SunWindowsGraph` + window/total/months utils with tests (dev preview only).
3. Café detail sheet pilot (incl. dog/pram tiles, forecast badge, source line).
4. Compact list/map card variant.
5. Other venue types.
6. Hotel/room card (needs per-room-type data model — propose first).

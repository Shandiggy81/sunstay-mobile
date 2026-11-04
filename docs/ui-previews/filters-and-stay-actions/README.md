# Filters and stay-card action — approval previews

Design study dated **4 November 2026**. Branch: `codex/filter-and-stay-action-previews`, created from the latest fetched `origin/main`, **0689b3a** (PR #293 included).

**Approval requested; no production implementation.** Only this directory was added. App code, data, settings and deployments are unchanged. No PR, merge, push or deployment was performed.

[Open the review gallery](index.html). Screens are static design documents; filter buttons and Clear all deliberately do not change application state. A's disclosures open, and B's category links open separate static states, to expose the full inventory for review.

## Recommendation

**Choose A: Quick picks + groups.** Six compact, inline clay-icon choices replace the large tile inventory. A fixed Clear all / results footer keeps completion within thumb reach. All remaining choices are in four named disclosure groups, with counts of options rather than invented venue totals. The six quick picks are a design hypothesis based on existing prominent app filters, **not measured usage analytics**. Validate that priority with Shannon before implementation.

**B: Thumb-level categories** trades a longer sheet for one section at a time, with its category rail immediately above the fixed footer. This keeps category switching in reach and gives long labels more room. It introduces an extra navigation step and makes selections in other sections easier to overlook. The badge on Stays must persist while browsing other categories. A needs less new interface state and is the clearer first change.

Both use the stage 1/2 warm-white, ink and amber palette, Plus Jakarta Sans, the existing clay assets, light dividers, 44px-or-larger targets and 12px-or-larger text. Selected filters have a check as well as colour. Filters retain their current IDs and labels. There are **36 distinct filters**, with no removals or new filter rules; Quick picks repeat the same IDs rather than creating new filters.

### Stay action

**Promote “Visit property website”** to the full-width primary action; retain “Get directions” as a separate 44px secondary link. A globe and external-link indicator identify the handoff. The caption names the destination: “Opens Quest’s official website”. This uses an action that the current card already supports and gives a future guest a useful next step without suggesting SunStay can reserve a room.

The context is **Quest St Kilda Bayside**, a serviced apartment already in the app. It has a property-specific `official_website_url`. The proposal does not say Book, Check availability, View live rates, or promise particular rooms or amenities. No dates, prices or sun times were invented.

The stay body is condensed to real side labels and provenance **for this footer study only**. Approval of the footer is not approval to remove graphs, times, weather, comparisons, source labels, or any existing stay content. An implementation should preserve the whole body.

For a genuine stay with no safe, known official website URL, retain today's directions action; do not guess a URL or introduce a disabled booking promise. Restrict the change to the current stay types (`isStayVenue`), not a pub with “Hotel” in its name or a Residential/Home listing. Food-and-drink venue actions remain unchanged.

## Preview files and screenshots

| Proposal | Static preview | 390 × 844 | 320 × 568 |
| --- | --- | --- | --- |
| A — Quick picks + groups | [filters-a.html](filters-a.html) | [filters-a-390.png](screenshots/filters-a-390.png) | [filters-a-320.png](screenshots/filters-a-320.png) |
| B — Thumb-level categories | [filters-b.html](filters-b.html) | [filters-b-390.png](screenshots/filters-b-390.png) | [filters-b-320.png](screenshots/filters-b-320.png) |
| Stay — property website primary | [stay-action.html](stay-action.html) | [stay-action-390.png](screenshots/stay-action-390.png) | [stay-action-320.png](screenshots/stay-action-320.png) |
| A — group expanded and scrolled | Same document, Stays & homes expanded | [filters-a-expanded-390.png](screenshots/filters-a-expanded-390.png) | [filters-a-expanded-320.png](screenshots/filters-a-expanded-320.png) |

B's additional static states: [Food & drink](filters-b-places.html), [Stays](filters-b-stays.html), [Sun & comfort](filters-b-comfort.html), [Needs](filters-b-needs.html). The default screenshot shows Stays so its selection and count match A.

At 320 × 568, the contents scroll internally while the main action remains visible; not every filter or stay fact fits in the initial frame. The stay's three side labels are modelled estimates, not available room inventory. Background context behind the filter sheet is deliberately minimal and contains no fabricated map, weather or sun score.

## Data and references

Read and visually inspected before designing:

- `AGENTS.md`, `CLAUDE.md`.
- `docs/ui-previews/sun-comfort/after-390.png` — existing PNG preview convention; its illustrative prices and old icon treatment were **not** copied.
- `docs/screenshots/home-declutter-stage1/README.md`, `home-390.png`, `expanded-390.png` — brand mark, warm palette, clay icons, compact controls and pinned sheet actions.
- Current stage 2 components on main: `FilterSheet.jsx`, `VenueCard.jsx`, `VenueCardSections.jsx`, `VenueCard.css`, `RoomSunCard.jsx`.

The authoritative snapshot for these mockups is [facts.json](facts.json), generated by reading existing files:

- `src/data/demoVenues.js`: all filter labels/IDs; property ID `dv-melb-stay-08`, name, address, type, description and official website URL.
- `src/utils/propertyTypes.js`: **13 stays** among **56 fallback venues**. The “Show 13 venues” button is that real local count with only `all-stays` selected. It is not the live 1,053-venue production inventory, a result fetched from Supabase, or an availability count.
- `src/utils/stayRoomTypes.js`: South-east, North-west and North-east side labels; Level 2; “Modelled · not yet confirmed by the hotel”. These inherit the catalogue's estimate status and do not assert surveyed floors, balcony access or bookable rooms.
- `src/utils/clayFilterIcons.js` and existing `src/assets/clay/` images: current artwork. Additional preview-only mappings use existing general icons where the old filter falls back to an emoji; no artwork or dependency was added.

Property URL used verbatim:

<https://www.questapartments.com.au/properties/vic/st-kilda/quest-st-kilda-bayside>

It was checked against the current repository field, not independently live-verified or scraped. The previews perform no API or database calls.

## Files a later approved implementation would change

This is a plan, **not a list of edits made in this branch**.

| File | Proposed implementation scope |
| --- | --- |
| `src/components/FilterSheet.jsx` | A: Quick picks, four disclosure groups, fixed footer and internal scrolling. Preserve every ID, controlled selection, clear/count callback, Escape and overlay behaviour. B would instead add local category navigation state. |
| `src/index.css` | Only `.ss-filter-sheet*` layout/type/spacing and selected/focus treatment. Respect existing overlay/z-index tokens and safe areas. |
| `src/utils/clayFilterIcons.js` | Fill the existing icon lookup gaps with approved existing clay assets; no matching or data-rule changes. |
| `src/components/VenueCard.jsx` | In `VenueCardFooterActions`, promote the safe official property URL only for genuine stays; retain directions and missing-URL fallback. No stay-body or calculation changes. |
| `src/components/VenueCard.css` | Stay footer hierarchy, 52px primary link, 44px secondary link and external-destination caption; leave café/pub footer styling intact. |
| `e2e/mobile-smoke.spec.js` | Keep existing filter/count assertions; add group visibility, keyboard/focus, sticky-footer and small-screen checks. Retain the café directions assertion; add stay URL/label and missing-URL coverage. |
| `e2e/experience-finder.spec.js` | Keep stays/date/Compare and future-date behaviour checks green with the new entry layout. |

No changes should be needed to `FILTER_CATEGORIES`, filter matching, rankings, venue records, sun/weather engines, map lifecycle, Supabase or deployment configuration. Partner preview, After Dark and Sunny chat are outside this study.

## Risks and checks for implementation

- **Filter semantics:** grouping must be presentation only. Do not turn category tabs into exclusive filters or change existing property/food OR and practical-needs AND behaviour. Counts still come from the app.
- **Duplicate controls:** A's quick Stays and its disclosure Stays must always share the same controlled state; screen-reader labels should identify the section when necessary. B must retain selections and badges across tabs.
- **Disclosure height:** expanding a group at 320px must scroll content without pushing Clear/results off screen. The prototype's footer is outside the scroller. Production needs touch/keyboard testing and native iPhone safe-area/keyboard checks.
- **Accessibility:** production should retain/complete focus containment, initial focus, Escape, scrim dismissal, focus return and expanded/selected semantics. The static document is not a test of the app's modal or drag implementation.
- **Website trust:** only use a known safe official URL; allow appropriate web protocols, preserve `noopener noreferrer`, expose the destination and avoid booking/rate promises. Do not infer accommodation from a venue name. Check missing URLs, long property names and names with “Hotel” that are pubs.
- **Visual scope:** keep full existing stay content; this body is a condensed context study. Keep Sun and other surfaces unchanged. No live forecast, calendar, results filtering or weather condition has been simulated.
- **Evidence limits:** fallback data is not live production data. Phone browser emulation cannot certify physical thumb reach, iOS scroll feel, VoiceOver, safe areas or opening an external site on iPhone.

## Verification and reproduction

`node docs/ui-previews/filters-and-stay-actions/generate.mjs` regenerates the static documents and data snapshot from the catalogue. It writes only this preview directory.

`node docs/ui-previews/filters-and-stay-actions/capture.mjs` runs a local static-file server, blocks external requests, captures all six primary viewport states plus two expanded states and records [checks.json](checks.json). Uses the installed system Chromium by default; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another installed Chromium.

Passed:

- 390 × 844 and 320 × 568: no horizontal page overflow, no broken images, primary action receives pointer hit-testing.
- Visible controls measure at least 44 × 44px; preview text is at least 12px.
- Every current filter ID is present exactly once in A's full groups; its Quick picks are deliberate shared-state duplicates. B's four category pages cover those same groups.
- Property link matches the existing official URL and has `_blank` / `noopener noreferrer`.
- No unhandled browser errors. No external network or database calls.

Text contrast pairs (WCAG ratio; all normal text ≥ 4.5:1):

| Text | Background | Ratio |
| --- | --- | --- |
| Ink `#0f172a` | White `#ffffff` | 17.85:1 |
| White `#ffffff` | Ink `#0f172a` | 17.85:1 |
| Slate `#64748b` | White | 4.76:1 |
| Slate `#64748b` | Warm white `#fffbf3` | 4.61:1 |
| Amber ink `#92400e` | Pale gold `#fffbeb` | 6.84:1 |
| Amber ink `#92400e` | White | 7.09:1 |
| Slate `#475569` | White | 7.58:1 |
| Ink `#0f172a` | Warm white | 17.30:1 |

Selected checkmarks and borders supplement colour. Control boundary/keyline colour alone is not the selection indicator. Native controls retain visible keyboard focus; a production build still needs the repository's accessibility regression scan.

App unit tests/build/smoke were not rerun: this branch changes no app code, and the checks above apply specifically to the static previews. **Awaiting Shannon's design approval before any implementation.**

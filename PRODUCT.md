# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: punters.** Melbourne locals and visitors on their phone, deciding where to go in the next few hours: somewhere in the sun now, somewhere cosy and dry when it rains, something on tonight. Often outdoors, often one-handed.
- **Secondary: partners.** Cafés, pubs, bars, restaurants, hotels and short-stays, who see their own venue through the partner preview.
- **Current audience (pre-launch):** investors and prospective partners, shown the live site. Punters are the target, but not yet the main audience.

## Product Purpose

SunStay helps people find Melbourne venues and stays by sun, weather and comfort. It's a map of venues with sun-score pins, a venue list, and a venue card covering sun, wind, forecast, UV and air quality.

Success measures are not set yet (pre-launch).

## Positioning

SunStay says how much direct sun a specific spot gets, not just what the city forecast is.
- For venues, the sun is modelled from mapped buildings around each venue (microclimate horizon profiles, refreshed by the `enrich-microclimate` job every 20 minutes).
- For stays, it is modelled per side of the building at a given level, and summarised in a printable sun report.
- Live weather is combined with that geometry, so the answer is the sun at this table or this window, today.

## Operating Context

- Used on a phone outdoors, mid-decision, often in poor light or on the move. Times are Melbourne time.
- Weather comes from Open-Meteo (city forecast at the CBD). Venue sun is modelled, not observed.
- Venue data comes from Supabase (about 1,087 venues on production on 27 Nov 2026), with `src/data/demoVenues.js` as the fallback.
- After Dark lists tonight's events from Ticketmaster, with walk times and warm-and-dry suggestions nearby.
- Sunny, the chat, answers quick replies, chip-like typed asks and fireplace or heater asks on the phone. Everything else goes to the `chat-sunny` Edge Function, which calls Gemini.
- Demos run on the production site and Netlify deploy previews. The partner preview is device-local: it makes no Supabase writes.

## Capabilities and Constraints

- **Capabilities:**
  - map-first home with sun-score pins, a venue list and filters;
  - venue card (sun now, today outside, wind, hour-by-hour forecast, good to know);
  - stays with sun by side of the building and a sun report;
  - After Dark;
  - Sunny chat;
  - a partner preview for hotels, short-stays and pubs.
- **Melbourne only:** the map is bounded to greater Melbourne. Expansion to other cities is undecided.
- **Sun is modelled:** it is labelled "Modelled" or "Estimated" wherever it isn't confirmed by the venue or hotel. Clear-sky figures and forecast-aware figures are different claims.
- **No accounts or bookings:** the main app has no user accounts and no booking (removed in #294). Owner edits cannot persist; there is no write path to `venues` from the browser.
- **Weather data licence:** Open-Meteo's free API is non-commercial, so a paid plan is needed before launch. Third-party keys are client-side `VITE_*` values (see `docs/agents/known-risks.md`).
- **Deployment:** merging to `main` deploys to production, including Supabase functions.
- **Undecided:** expansion beyond Melbourne, success measures, and how partners would pay.
- **Terminology:**
  - **sun score:** 0–100.
  - **sun moments:** Morning coffee, Long lunch, Afternoon, Sunset drinks.
  - **After Dark:** the evening mode.
  - **stays and homes:** accommodation.
  - **sun report:** the per-side report for a stay.
  - **partner preview:** a venue's own view of its listing.
  - **microclimate:** a venue's modelled sun and shelter.

## Brand Commitments

- **Binding: the mascots.** Sunny, the clay sun in sunglasses, is the guide and the chat. Thunder Buddy stands in for Sunny in storms. Brucey, the dog, presents dog-friendly picks. Their images stay ES-module imports in `src/assets/mascots/`.
- **Not binding (asked 27 Nov 2026):** the clay 3D icon set, the Aussie voice ("G'day", "Ripper!") and the logo tile on the home screen. They are current practice and open to change.
- **Name:** the app and docs say "SunStay"; the PWA manifest says "Sunstay Global" / "Sunstay". Which spelling is canonical is undecided.
- **Visual rules** (type scale, accent colour, touch targets) live in `CLAUDE.md` and `docs/agents/pr-review-checklist.md`, not here.

## Evidence on Hand

- **Data:**
  - venue rows in Supabase `venues` (read-only to the public);
  - microclimate profiles for about 1,081 venues;
  - room profiles for stays;
  - Ticketmaster events;
  - Open-Meteo forecasts.
- **Live demonstration:** the production site, plus a deploy preview for every PR.
- **Absent, never to be fabricated:** confirmed partners, testimonials, customer quotes, usage or growth metrics, pricing, press, guarantees. Fake metric and guarantee code was removed in #294. Hotel sun data is modelled and "not yet confirmed by the hotel".

## Product Principles

1. **Say only what the data supports.** Label modelled sun as modelled. Never claim a fire is lit, heaters are on, or that it's sunny when the forecast rules sun out.
2. **Answer the next-few-hours question first:** where to go now or tonight, and what it will feel like. Detail comes after, for those who want it.
3. **Built for a phone, outdoors and one-handed.**
4. **Spend carefully.** Answer on the phone before calling a paid or quota-bound service. Add no new paid call without approval.
5. **No fake proof.** Demos for investors and partners show the same honest product a punter sees.

## Accessibility & Inclusion

- **Standard:** WCAG 2.2 AA, checked with axe-core (tags in `AGENTS.md`). The bar is 0 violations on the main screens.
- **Interaction:** touch targets of at least 44×44. Dialogs take focus, keep Tab inside, close on Escape and return focus to their opener. Visible labels appear in accessible names.
- **Motion:** honour reduced motion.
- **On a physical iPhone:** safe areas, sheet drag, VoiceOver and WebGL recovery need checking, since automated tests cannot cover them.

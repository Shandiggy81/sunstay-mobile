# Venue and stay card patterns

Research date: 20 October 2026 (Australia/Sydney). Destination: SunStay mobile at **390px**. This is design research, not an implementation or a claim that the referenced UI is still the apps' current release.

Read first: [AGENTS.md](../../../AGENTS.md) and the [approved venue and room sun-card brief](../venue-sun-cards-brief.md), at main commit `337f5d0206a24b4734661b4d8a1ff452eb7a9982`. The branch `docs/venue-card-research` was created from that latest remote main through the GitHub MCP; local origin/main was stale and a local fetch could not resolve GitHub.

## Method, coverage and limits

Used the **Mobbin MCP** to search iOS screens and flows, and visually inspected the returned previews. Names below describe the visible screen; they are not invented Mobbin screen titles. Each example links to its canonical Mobbin screen or flow. No screenshots, preview files or expiring image URLs are stored here. Interface references belong to the named apps and their respective rights holders; Mobbin supplies the reference library. [Mobbin's terms](https://mobbin.com/terms), retrieved through Firecrawl, informed the links-only approach.

| Prioritised app | What the searches actually returned |
| --- | --- |
| Airbnb | List/map selection flow, listing/gallery, amenities, reviews and filters. |
| Booking.com | Results, property and room selection, facilities, reviews and guest/pet selector. |
| OpenTable | Results, restaurant detail, seating options and party/date/time selector. |
| EatClub | Named screen search returned DoorDash/talabat; named dining-flow retry returned Zomato. No EatClub evidence used. |
| Hotels.com | Named screen search returned Peerspace/Agoda; named property-search flow retry returned Booking.com. No Hotels.com evidence used. |
| Tripadvisor | Restaurant discovery cards and dated hotel reviews. |
| Google Maps | Place sheets, source-disclosure entry, hours and typical/live busyness. |
| Resy | List/map cards, restaurant detail and reservation slots. |
| Uber Eats | Restaurant feed and store detail. |

EatClub and Hotels.com are **retrieval gaps in this search**, not proof that Mobbin lacks those apps. Substituted search results were not attributed to the requested app. The targeted retries were “EatClub discovering restaurants and selecting a dining deal” and “Hotels.com searching hotels and viewing a property”.

Observations describe screenshots, not production behaviour verified by interacting with the apps. The Airbnb flow provides a sequence of map selection states; it does not establish animation timing, focus management or all swipe behaviour. Mobbin did not return capture dates/app versions in the used metadata. Research date, screenshot clock and review date must not be mistaken for source freshness. Pixel dimensions below are **proposed SunStay constraints**, not measurements of competitor screens.

For card density, a “text group” is a meaningful decision item: title; rating plus count; location plus distance; etc. Controls and photos are excluded; badges and booking actions are called out separately. This avoids counting every star or word as a separate data point.

## 1. Compact list and map cards — six examples

### C1. Airbnb — selected home over a map

[Selected map card](https://mobbin.com/screens/24072f6f-71d3-47f1-92e3-3b63bf4b1b43) · [list → map → selection flow](https://mobbin.com/flows/ed7d4a94-2729-44f9-92c1-f82c7a078333)

**Observed / what works:** A broad photo occupies the upper part of a floating card. Name and rating/count share a row; description, dates and total price sit below. That is five main text groups plus the Guest favourite badge. The preceding list state adds cancellation information. The selected map pin becomes dark and its price matches the card total; other pins remain light. The floating card retains map context and offers a close control.

**SunStay at 390px:** Use a 358px card with 16px outer gutters, a roughly 120px photo, two-line name maximum and one compact type chip. Let the headline sun value replace price as the primary comparison. Keep the same venue/room ID selected across card and pin; tapping either should select its counterpart, with shape/outline as well as colour indicating selection. Preserve the date and map position on dismissal. Swipe synchronization and keyboard/focus behaviour are recommendations, not observed facts.

**Brief conflict:** Guest favourite, ratings and prices are not reusable SunStay facts (§1.7, §1.9). Do not manufacture a similar award or a price-shaped sun rating.

### C2. Booking.com — dense hotel result rows

[Tokyo accommodation results](https://mobbin.com/screens/b5c6f8bd-7657-4c76-b117-d86d40bdf073)

**Observed / what works:** Tall left-hand photos let several offers share the viewport. On the second visible property, eight core groups cover name, class/tier, review score/count, location/distance, dates, room/beds, nightly rate and trip total; two benefit lines add pet and cancellation information. Review scores use a solid square, distinct from property stars. The total is bold. This is effective for detailed price comparison but expensive in attention.

**SunStay at 390px:** Borrow the separation of different metrics, not the density. Start with five text groups: name, type, calculated sun total, sun scope/limitation, forecast. The mini graph is an additional visual summary. Put facilities and secondary comfort metrics in the detail sheet. Allow the limitation and source lines to wrap rather than squeeze them beside the value.

**Brief conflict:** Property stars, guest scores and confidence describe different things. A blue score badge must never become an invented SunStay review rating. Use “Check rates” until a genuine rate source exists (§1.6–§1.10).

### C3. OpenTable — reservation-led compact rows

[Restaurant search with seating facts](https://mobbin.com/screens/001011e3-d7fc-4368-b542-a05fa67364d6)

**Observed / what works:** A small square photo anchors a tight row. Approximately seven text groups cover name, review/count, cuisine, neighbourhood, seating, price tier and distance, followed by a time action. Some rows identify promotion. The top filter strip includes Seating, and outdoor seating appears explicitly in result metadata.

**SunStay at 390px:** Keep one short row for the outdoor-area type and place detailed attributes behind the sheet. On a map peek, use a single “View sun windows” action rather than a strip of three apparent reservations. If a thumbnail variant is explored, reserve around 88px for the image and test long venue names before choosing it over the wider-photo card.

**Brief conflict:** Seating type is not proof that a table is available, nor that it receives direct sun. Empty time placeholders must not imply real SunStay inventory (§1.1, §1.9).

### C4. Resy — deliberately smaller map card

[Selected restaurant card on map](https://mobbin.com/screens/eab03be9-df2b-445f-9068-5df01f50d72b) · [larger list card](https://mobbin.com/screens/e4f524c1-e8e3-4e25-bb4c-b736d43c28a1)

**Observed / what works:** The map variant moves the photo to a small right-hand thumbnail and condenses the information into name, rating/count with cuisine/price metadata, and neighbourhood. Reservation buttons remain underneath. A larger highlighted pin gives a selection cue, but the static image alone cannot establish the exact pin/card identity mapping. The list version gives photography substantially more room.

**SunStay at 390px:** Share one information model between list and map variants, with map-only reductions in photo height and secondary copy. Both must retain photo, name, type, sun headline, unlabeled mini graph and forecast as the brief requires. Use a clear selected-pin outline and preserve card selection while the sheet expands; validate the interaction later.

**Brief conflict:** Resy's ratings, notification and booking inventory depend on its product's data. Do not imply SunStay can reserve an outdoor table or notify on availability without that integration (§1.7, §1.9).

### C5. Uber Eats — broad imagery, few facts

[All stores restaurant feed](https://mobbin.com/screens/4bf66ea2-f582-4274-871e-0954a2168951)

**Observed / what works:** Wide food photography and a save control dominate. Each visible card keeps about three text groups below: name, membership/arrival metadata and rating/count. A promotion sits on the image instead of adding another metadata row. The low density makes scanning straightforward, although the food photo says little about seating.

**SunStay at 390px:** Choose a real photo of the actual outdoor space or relevant room type as the card image. Keep text off the image except a necessary, backed provenance label. Use a text-and-symbol forecast badge below the sun block. Do not add a promotional strip merely to occupy a familiar badge position.

**Brief conflict:** A delivery estimate is not a sun window; popularity or reorder counts are not SunStay verification. Photos must depict the real venue, and an “Actual room photo” label needs its own flag (§1.7–§1.8).

### C6. Tripadvisor — curated rails with explicit advertising labels

[Restaurant discovery / reserve rail](https://mobbin.com/screens/2d017dd5-80b3-45a0-b38a-1c59c40b4f9c)

**Observed / what works:** Large square-ish photos sit above three main text groups: name, score/count and price/cuisine. A reservation action follows. Sponsorship is labeled near the card, while a separate advertisement is marked on its image. The partially visible adjacent card advertises horizontal continuation, but truncation cuts secondary information.

**SunStay at 390px:** Prefer a full-width vertical comparison list for the main sun search. If using a discovery rail, keep the sun total, scope and forecast fully visible within each card, with a visible next-card edge. Any future paid placement needs an explicit label independent of sun ranking.

**Brief conflict:** Editorial or commercial placement must not look like calculated “best sun”. A Tripadvisor score or award cannot be copied into SunStay without a licensed source (§1.1, §1.7).

### Recommended compact hierarchy

Within the 358px card, keep this reading order: **real photo → name and type → sun total with calculated/estimated badge and scope → unlabeled mini SunWindowsGraph → separate forecast badge → slim source/confidence line**. The brief's source and obstruction disclosures are more important than fitting an arbitrary card height. Treat roughly 300–340px as an initial map-peek budget, then allow expansion for long names, disclosures and larger text.

Label the headline “direct sun on a clear day”; identify outdoor tables, courtyard, rooftop or balcony facade. Do not add a review row by default. Show no clay icons in pins or small chips; the brief reserves them for at least 56px.

## 2. Detail sheets — five examples

### D1. Airbnb — photo-first listing with persistent booking context

[Hero, identity and footer](https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3) · [amenity preview further down](https://mobbin.com/screens/b7e64cd3-2019-4efd-b6bb-b4b21165b8e3)

**Observed / what works:** The hero has a gallery counter and overlay actions. Title/type/room facts precede reputation and host information. Further down, **five amenity rows** use monochrome line icons, followed by an all-amenities button with a real count, then location. Price and Reserve remain at the bottom in both captures. These are rows, not a four-tile grid.

**SunStay at 390px:** Use a 390 × roughly 220px hero with an accurate gallery count and accessible photo captions. Place the sun block directly after identity, ahead of amenities. Show **at most four** supported feature tiles in a two-column grid, then “Show all features” only when additional known fields exist. Keep a 52px primary CTA in a bottom bar plus device safe-area padding.

**Brief conflict:** Do not inherit the captured scarcity banner, review score or host award. The four-tile cap and data-backed tiles in §3 take precedence over Airbnb's larger preview.

### D2. Booking.com — property highlights versus room-specific choices

[Property gallery and two highlights](https://mobbin.com/screens/1a472580-fa63-4577-801b-671f9366cf02) · [expanded highlights sheet](https://mobbin.com/screens/8044118b-ce7f-4738-a177-bd5f2ec25dc6) · [selected room and bottom Reserve](https://mobbin.com/screens/55b568c2-e539-4ea1-9ff4-18ad4343f5fa)

**Observed / what works:** Property identity/address precedes a photo mosaic; **two highlight tiles** follow, using small line icons. The expanded sheet repeats those highlights and offers all facilities. Room selection attaches bed/size/facility facts to each room, then rate terms and selection. A bottom reservation bar appears in the selected-room state.

**SunStay at 390px:** Use a single hero on the phone rather than many tiny gallery cells. Make room type and facade/floor context explicit before Balcony Sun. Show 2–4 known highlight tiles; never fill missing slots. Let “Check rates” link to a real provider destination when available; do not present a synthetic quote or selection state.

**Brief conflict:** Whole-hotel photography, ratings or facilities do not establish a specific room's balcony, orientation or sun. Sun is per room type (§4); scarcity and rates require real source data (§1.9).

### D3. OpenTable — gallery, practical identity, then booking

[Vitello's detail](https://mobbin.com/screens/c3625d03-b440-465c-890a-5d0bbe91e275)

**Observed / what works:** A broad hero offers the full photo set. Name, review/count, price/cuisine and address come before a tab strip; party/time context and reservation slots precede booking notes. Small line icons accompany practical facts. No amenity grid is visible in this capture, and its bottom navigation is not evidence of a sticky reservation CTA.

**SunStay at 390px:** Bring practical outdoor-area identity ahead of long descriptive copy. Place the graph and window chips in the main scroll, not behind a tab. Put opening hours and access notes after the four feature tiles, then location. Use one persistent venue action such as “Get directions” when a real destination exists.

**Brief conflict:** A restaurant's “booked today” counter cannot become a trust or sun-quality signal (§1.7). Sun windows are explanatory data, not selectable reservations.

### D4. Resy — hero with editorial context and bottom time controls

[Jean-Georges detail](https://mobbin.com/screens/3befa160-2161-42ad-9410-aeeff7fc1be9)

**Observed / what works:** A large hero has a gallery-count action, followed by name, rating/cuisine/price, neighbourhood and short editorial copy. Reservation slots and party/day context occupy the lower screen. No amenity grid is visible; a single capture does not prove these controls stay fixed while scrolling.

**SunStay at 390px:** Keep useful context short enough that the sun block is reached without scrolling through an essay. Put rule-derived “Best for” after the graph, not as an ungrounded editorial award. Use bottom actions that fit one row and leave the final content accessible above them.

**Brief conflict:** Editorial praise is not measured outdoor comfort. Derive morning/lunch/afternoon/sunset suitability from actual windows, and keep heaters separate from direct sun (§1.5, §3).

### D5. Google Maps — expandable place information with stable actions

[Map with place sheet](https://mobbin.com/screens/63d311b0-bdd4-44b8-b2ac-72f715cd834e) · [lower sheet with actions](https://mobbin.com/screens/754af39e-53d8-467e-a7ad-083dc0f01cf1)

**Observed / what works:** The partial sheet preserves the map above place identity, open status, actions and imagery. Lower in the expanded detail, a bottom action row remains visible. Tabs divide the long content. There is no amenity tile grid in these captures.

**SunStay at 390px:** Provide a compact peek and an expanded detail state with the same identity and selection. Use a drag handle plus a labeled expand action; keep save secondary and one primary CTA. Budget scroll padding for the footer so source notes and the last window chip cannot be covered.

**Brief conflict:** An open-hours label and an immersive-view image are not confirmation of outdoor-table sun or an actual room photo (§1.3, §1.7).

### Recommended detail order and tile treatment

1. Real hero/gallery; venue identity and, for stays, selected room type.
2. Sun scope, direct-sun total, DataBadge, obstruction note and the one-line source/confidence disclosure.
3. Full SunWindowsGraph, dated window chips and accessible text total.
4. Rule-derived “Best for”, then **separate** weather forecast and outdoor comfort values with their respective DataBadges.
5. Up to four known, type-appropriate feature tiles; show-all disclosure if needed.
6. Source-backed hours, attribute/access conditions, location, then licensed reviews only if available.

At 390px, use 16px content gutters, a 12px grid gap and two 173px-wide tiles. Use the approved clay icons at **56px or larger**, with text below, rather than imitating competitor line icons inside tiny clay chips. Let tiles grow with text. Wind and temperature are forecast; noise is estimated unless measured. No fixed four-slot skeleton should survive when data is missing.

The footer is a recommendation for later UI work: one primary action, room for the real rate/source context if present, safe-area padding and sufficient content clearance. Availability of the action/destination must be checked before showing it.

## 3. Time-based information — five examples

### T1. Google Maps — typical busyness with a selected hour

[Wednesday popular-times graph](https://mobbin.com/screens/e1bd5737-de4e-4ed6-b6d1-65dd58b72b1b)

**Observed / what works:** A day selector, sparse time ticks, one highlighted bar and a short tooltip explain the selected time. “Usually” marks the pattern as typical rather than a current reading.

**SunStay at 390px:** Put date/timezone context above a 358px graph. Use the brief's 6am / 12pm / 6pm ticks and explicit window chips below it; a short text summary should answer the question without needing a tooltip. Retain the approved sun-shaped windows rather than copying busyness bars.

**Brief conflict:** Bar height represents a different quantity from duration. Sun hills must not imply irradiance, temperature or booking demand. Amber exists only inside engine windows; headline duration equals their sum (§1.1, §2).

### T2. Google Maps — live versus typical state

[Tuesday live busyness](https://mobbin.com/screens/7ea41bb3-66b5-49b6-a1e3-fa887e9731dc)

**Observed / what works:** The typical blue series remains while a contrasting “Live” annotation calls out the current hour. This is a strong visual distinction between categories of evidence; the screenshot does not reveal the live feed's refresh interval or methodology.

**SunStay at 390px:** Keep the sun graph calculated/estimated and place forecast in a separate labeled block. Show “Now” only for today in the venue's timezone. If a real live measurement is introduced later, give it its own source, timestamp and visual treatment.

**Brief conflict:** A moving Now line does not make SunCalc output live observation. Never label sun exposure “live” merely because weather refreshes (§1.2, §1.10).

### T3. Google Maps — weekly opening-hours disclosure

[Expanded weekly hours](https://mobbin.com/screens/dd7fda51-b299-4ebe-aa49-951454abe659)

**Observed / what works:** A compact open-status row expands into seven day/hour rows, alongside a correction entry point. The full week is available without making the map card carry it all.

**SunStay at 390px:** Show today's sourced hours in one row and expand the week on demand. Keep hours separate from direct-sun windows. If calculating “usable while open”, label it as an additional intersection of sourced hours and engine windows; retain the original direct-sun total.

**Brief conflict:** Do not silently clip sun windows to hours and leave the headline unchanged. Unknown hours are not “closed”, and sun availability does not establish opening status (§1.1, §1.3).

### T4. Resy — availability has time and seating context

[Time slots with bar/dining-room labels](https://mobbin.com/screens/e4f524c1-e8e3-4e25-bb4c-b736d43c28a1)

**Observed / what works:** Repeated time buttons carry both clock time and seating context. Notification sits beside availability; the party/day context remains visible lower down. The pairing avoids treating all times as interchangeable.

**SunStay at 390px:** Use wrapping **informational** window chips containing start–end and duration, not booking-button styling. Keep the target area named beside the graph. At larger text sizes, use one chip per row instead of hiding the final duration in a horizontal strip.

**Brief conflict:** Sun windows do not guarantee an available outdoor seat. Do not add a Notify/Book affordance without real inventory (§1.9).

### T5. OpenTable — party, date and time selector

[Party size and date/time sheet](https://mobbin.com/screens/afab03a3-291f-4de2-af14-cea74a6f9aab)

**Observed / what works:** Party count sits above paired date/time wheels, with an explicit commit action. The visible date and time make the reservation context concrete instead of leaving “available” ambiguous.

**SunStay at 390px:** Put one labeled date control above the graph and recompute all windows, total and rule-derived suitability together when it changes. Use a readable date label and a textual time summary; do not require precise wheel gestures to understand the sun forecast.

**Brief conflict:** A changed date must also update venue-local Now eligibility. Never retain yesterday's total, forecast or room context next to a newly selected day (§1.1–§1.4, §2, §4).

### Sun graph safeguards carried forward

Keep one golden hill and one midpoint sun per engine window; grey gaps remain visible. Hill decoration is not a new measurement. Respect reduced motion, provide a complete spoken/text summary and never use colour alone to distinguish sun/shade. An empty window array with valid inputs means no direct sun; missing inputs mean unavailable/unknown. Distinguish those states rather than drawing an attractive placeholder graph.

No inspected reference establishes SunStay's monthly best-sun claim. Calculate months per venue/room facade as required by §1.4; do not substitute a generic seasonal travel recommendation.

## 4. Trust, provenance and freshness — six examples

### P1. Google Maps — an explicit source-disclosure entry

[Place sheet with “About data sources”](https://mobbin.com/screens/754af39e-53d8-467e-a7ad-083dc0f01cf1)

**Observed / what works:** The lower sheet includes a discoverable source-information entry. It keeps explanatory material out of the main identity block. The linked disclosure's contents were not inspected.

**SunStay at 390px:** Keep source plus confidence on one slim, wrapping line directly beside/below the sun result, with an information control opening methodology, scope, input dates and known gaps. Do not bury the obstruction caveat at the end of the sheet.

**Brief conflict:** Source/confidence must come from data-quality rules; an information icon alone does not justify “Verified” or a positive quality adjective (§1.3, §1.6–§1.7).

### P2. Airbnb — reputation has a visible basis and review context

[Guest favourite review detail](https://mobbin.com/screens/46121124-5628-4434-8c25-60e5f7872d0c)

**Observed / what works:** The reputation panel explains that the status depends on rating/review/reliability inputs, provides category scores and links to review methodology. An individual review includes author context, month and stay length. This exposes more basis than a free-standing trophy.

**SunStay at 390px:** If licensed reviews arrive, show provider, score scale and count together in one secondary row, with methodology behind a link. Put the sun method in a separate disclosure; do not combine review quality with sun confidence.

**Brief conflict:** Neither Guest favourite nor a SunStay version of it exists without eligibility rules and source records. The captured badge cannot stand in for SunStay Verified (§1.6–§1.7, §6).

### P3. Booking.com — reviews attached to a specific stay context

[Dated guest review](https://mobbin.com/screens/c46d2bef-5d94-4938-93f3-55e9a7cf7e6f) · [stay-context excerpts](https://mobbin.com/screens/980c1122-d12e-4e46-b074-e65ab44597bb)

**Observed / what works:** A property-specific review total sits above sorting/filtering. Individual feedback has author/country, score and date. Another screen explicitly frames excerpts as feedback from guests who stayed. The screenshots do not prove the backend verification policy.

**SunStay at 390px:** Preserve the original provider and review context if contractually available. In an expandable evidence panel distinguish a visitor report, an operator assertion and an on-site record. Use each record's real observation/confirmation date, not the time the UI fetched it.

**Brief conflict:** A competitor's guest framing is not permission to claim “verified guest” for imported text. No review count, provenance claim or verification tick without matching source data (§1.7, §6).

### P4. Tripadvisor — review recency and visit date are different

[Dated review with visit and trip context](https://mobbin.com/screens/251ba205-1b82-4c73-9d5b-f408e67366bf)

**Observed / what works:** The review shows relative publication recency, a separate visited month, trip type and a translation label. That distinguishes when someone wrote from when they experienced the place. It does not prove the reviewer's visit.

**SunStay at 390px:** Put “Observed/confirmed [date]” in source details only when backed by a record; label forecast issue time separately from venue verification time. If photos have capture dates, distinguish those from upload dates. Allow an unknown state.

**Brief conflict:** “Updated today” from an API response is not an on-site check today. Do not imply freshness or a verified visit from publication metadata (§1.6–§1.7).

### P5. Airbnb — a room-organised photo tour establishes scope, not authenticity

[Living room and shared kitchen photo tour](https://mobbin.com/screens/aeff1ea6-3d3f-4c2f-90c1-9b2ea0133e29)

**Observed / what works:** Room labels organise photos into meaningful spaces, helping guests see which image belongs to which area. No explicit authenticity/actual-room certification is visible in this capture.

**SunStay at 390px:** Label gallery images by their actual associated area or room type when known. A balcony photo should retain that room association. Show “Actual room photo” only when the image record carries the approved flag and provenance; otherwise omit the claim.

**Brief conflict:** A room caption, realistic appearance or hotel-level gallery is not authenticity evidence. Real venue photos only; reference mockups and AI images are not venue photography (§1.7–§1.8, §4).

### P6. Google Maps — a live label is a claim with limited visible support

[Live popular-times annotation](https://mobbin.com/screens/7ea41bb3-66b5-49b6-a1e3-fa887e9731dc)

**Observed / what works:** The current observation is explicitly distinguished from the usual pattern. However, no last-updated timestamp or sample confidence appears in the visible graph.

**SunStay at 390px:** Show the correct DataBadge per value; disclose a real update/issue time and stale state in the evidence panel when available. Keep calculated sun, forecast temperature/wind and estimated noise separately labeled.

**Brief conflict:** Do not borrow “Live” for a model output or hide uncertainty behind a green dot. “Estimated” cannot be paired with an unsupported quality claim (§1.2, §1.6, §1.10).

No inspected screen substantiated an “actual room photo” certification or SunStay-style on-site sun verification. That is a documented evidence gap, not an invitation to invent either badge.

## 5. Attribute filters and conditions — five examples

### F1. Airbnb — compact amenity chips with persistent results action

[Amenities and pet chips](https://mobbin.com/screens/dff722d1-6762-4915-8428-697c692fe009)

**Observed / what works:** Rounded icon/text chips wrap into rows. Selection uses a strong outline, a disclosure reveals additional amenities, and clear/apply actions stay at the bottom with a result count. “Allows pets” is a separate criterion from the amenity group.

**SunStay at 390px:** Start with quick chips for Dog-friendly, Pram-friendly and Outdoor seating, plus a Filters entry for the full set. Use 44px minimum proposed hit areas and wrap within 358px rather than shrinking labels. A result count must come from the actual filtered dataset.

**Brief conflict:** Do not infer dog permission from a pet photo or a review, or pram access from a family label. Only supported fields should satisfy filters (§3; §1.7).

### F2. Airbnb — accessibility has its own disclosure

[Dedicated accessibility section](https://mobbin.com/screens/7d5a6cb9-429b-4ccc-a658-2b8e8778628a)

**Observed / what works:** Accessibility has a separate accordion instead of being lost among generic amenities. It is collapsed in the captured screen; individual step-free or doorway criteria were not observed.

**SunStay at 390px:** Give Accessibility a dedicated section with only attributes the data actually supports. Prefer specific future criteria such as step-free entry over a single blanket promise. Keep dog access, pram access, family suitability and disability access independent, with explanatory conditions when known.

**Brief conflict:** A lift or wide-looking photo does not establish an accessible route. Do not expose a specific accessibility filter until the schema and source can support it (§3's known-field rule).

### F3. Booking.com — family/party needs and pets are explicit inputs

[Rooms, adults, children and pets selector](https://mobbin.com/screens/a1bf0150-f1d3-4079-ba52-f0d658fce6e3)

**Observed / what works:** Rooms, adults and children have separate controls; travelling with pets is a distinct switch. The sheet has an explicit apply action. It separates different needs rather than collapsing them into “family-friendly”.

**SunStay at 390px:** Keep family suitability and pram access as separate filter choices when sourced. Avoid adding party-size or room-availability controls unless backed by an actual stay search. For a general venue search, a short labeled choice is enough.

**Brief conflict:** A property's family rooms do not establish stroller access; pet travel support does not guarantee dog access to the outdoor area (§3, §1.9).

### F4. OpenTable — outdoor seating is a concrete choice with availability context

[Seating-options sheet](https://mobbin.com/screens/2bd1aac9-77b6-4bb7-a3b4-fd8d6a4fd6d3) · [seating filter entry in search](https://mobbin.com/screens/001011e3-d7fc-4368-b542-a05fa67364d6)

**Observed / what works:** A seating picker separates standard, bar, high-top and outdoor options. Named areas can show no tables. The search has a Seating entry, although the exact search-filter expansion is not shown. The picker is a reservation step, not evidence of a generic attribute filter.

**SunStay at 390px:** Offer Outdoor seating as an attribute, with area-specific details in the card sheet. Keep permission/type distinct from current availability and sun exposure. If a real booking integration later supplies availability, show that as a separate sourced status.

**Brief conflict:** A sunny window is not an available table, and outdoor seating does not establish direct sun (§1.1, §1.3, §1.9).

### F5. Booking.com — detailed policy text qualifies simple attributes

[Facilities and pet conditions](https://mobbin.com/screens/e8f5a25c-763f-408f-ab8e-f82724fd89be) · [family-service details](https://mobbin.com/screens/93ae57fa-7d51-44b4-a491-0424b243bc09)

**Observed / what works:** The facilities page distinguishes family rooms, lift, pet policy, children's meals and family services; the pet permission is conditional on request. This is a **detail-policy analogue**, not a captured search-filter panel. It demonstrates why a chip needs supporting details.

**SunStay at 390px:** Let a supported positive chip open its condition, for example an area restriction or confirmation requirement, when the source has one. In strict filtered results, require an explicit positive match; keep unknown records available after clearing the filter. Show “Not confirmed” in details when useful rather than turning missing data into a negative.

**Brief conflict:** Pet permission does not necessarily include dogs at outdoor tables; provision of strollers does not prove a step-free pram route. Preserve the original qualification instead of flattening it into a fabricated yes (§3).

No inspected screen showed a dedicated pram-friendly search control. Booking.com supplied related family-service information, which is not equivalent. The proposed SunStay pram filter therefore depends on SunStay's own sourced attribute, not on a competitor label.

### Proposed filter behaviour at 390px

Use one scrollable sheet with clear group names, an always-reachable close control, Clear all, and a full-width “Show N venues” action derived from real results. Put quick attributes first, then area type and supported accessibility details. Keep selected choices visible on return to the list/map and preserve the selected date.

Model each attribute as known yes / known no / unknown; maintain conditional details where supplied. Selecting several different attributes should require all to match and show that behaviour plainly. An empty result offers a clear way to remove a filter; it must not silently include unconfirmed venues. Family suitability must not automatically select Pram-friendly or Accessibility.

## Steal this — the ten best ideas

1. **Airbnb's selected-pin/card pairing (C1):** one shared venue/room ID and a clearly outlined active pin.
2. **Resy's separate map density (C4):** reduce photo/secondary copy while preserving the required sun essentials.
3. **Uber Eats' restrained metadata (C5):** a large, relevant real-space photo and a short comparison stack.
4. **Airbnb's persistent action/context (D1):** one reachable primary CTA with safe-area and scroll clearance.
5. **Booking.com's room-level choice (D2):** attach sun scope to the room type, floor and facade.
6. **Progressive amenity disclosure (D1–D2):** up to four known tiles, followed by show-all only when needed.
7. **Google Maps' typical/live distinction (T1–T2):** visibly separate calculated sun, forecast and actual observation.
8. **Google Maps' expandable hours (T3):** today at a glance, full schedule on demand, separate from sun windows.
9. **Visible methodology and dates (P1–P4):** a slim source/confidence line backed by detailed evidence.
10. **Independent attributes with conditions (F1–F5):** dog, pram, family, outdoor and accessibility must each earn their own positive match.

## Avoid

- Booking-style 8–10-group information density on the compact sun card.
- A hero so tall, or editorial paragraph so long, that the sun answer is pushed below the first screen.
- Recreating Guest favourite, Rare find, platform stars, score counts or “Verified” without the requisite source/record.
- Price, scarcity or booking-time buttons before rate/inventory integration; use “Check rates” for stays.
- An “Actual room photo” tag inferred from a caption, realism or a general hotel photo.
- A bell curve that bridges shade gaps, implies solar intensity or disagrees with the computed total.
- Treating forecast sunshine, heaters, busyness or opening hours as direct-sun evidence.
- Generic “best season” or “best for sunset” copy without per-venue engine results.
- Tiny clay icons in map pins/chips, empty filler tiles, or more than four feature tiles in the initial detail view.
- Treating unknown pet/pram/accessibility data as yes or no, or deriving pram/accessibility from “family”.
- Calling fetched data “verified today”, or adding Now to a non-today venue-local date.
- Assuming static screenshots prove sticky positioning, interaction timing, freshness or verification policy.

## Recommendation to carry into the next design stage

At 390px, the core decision should remain **which real outdoor space or room gets how much direct sun, at what times, and how certain is that answer**. Use the brief's compact essentials and four-tile detail cap; borrow interaction structure and disclosure patterns from these references. Competitor ratings, awards, photos, availability and verification remain references, not SunStay data.

This research changes no UI, data schema, database, assets or calculation rules. A later implementation review should validate long names, missing/zero sun data, larger text, wrapping disclosures, unknown attributes and per-room selection at 390 × 844, as well as sun-window totals and venue-local dates. No application build or test run is needed to validate this Markdown-only change.

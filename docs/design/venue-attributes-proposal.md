# Venue-confirmed attributes: proposal

**Status: proposal only.** Reviewed 20 October 2026 (Australia/Sydney) against main `a5b11b037efe2eb1e7d1bcdce3a7d71e3661fba7` and production project `fksuqgvsazoxarocmaii`. This change adds only this document. No migration, seed, database write, function deployment or outreach email is authorised or performed by it.

Read first: [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md) and the [venue sun-card brief](venue-sun-cards-brief.md). Venue confirmation establishes particular amenity facts; it does **not** establish direct-sun times, weather, photo authenticity, prices, or the brief's future “SunStay Verified” status.

## 1. Current state, verified read-only

Supabase MCP inspection used table metadata, SELECT queries against schema/policy/privilege catalogs, and aggregate counts. No contact records, Auth users, tokens or private venue notes were read.

| Finding | Consequence |
| --- | --- |
| `public.venues` has 1,053 rows, including 361 with `typeLabel` Cafe or Bakery cafe. Its primary key is **text**, not UUID. | New venue foreign keys must match `venues.id`'s text type. |
| Existing fields include `tags jsonb`, `heating text`, `hasFireplace`, `fireplaceOn`, `heatersOn`, `sunshineNow` and `roofClosed`; the booleans commonly default to false. | Legacy false is not a sourced “no”; installed amenities must remain separate from current operating conditions. |
| None of `dog_friendly`, `pram_friendly`, `outdoor_heaters`, `fireplace` or their `_source` columns exists. There is no venue contact email/owner identifier in the inspected venues schema. | A new confirmation and provenance model is needed. Do not promote demo tags or legacy flags. |
| `outdoor_seats integer`, `data_source`, `source_ref`, website/phone and dated hours-source fields exist. Outdoor seats: 966 positive, 87 NULL, zero explicit zero counts. | Existing sourced seat counts can keep supporting the outdoor-tables tile; missing counts do not mean no outdoor area. These are whole-table counts, not café-only counts. |
| `venues` has RLS enabled and exactly one policy, “Allow public read access on venues”, SELECT to PUBLIC with `true`. No INSERT/UPDATE/DELETE policies were returned. | Ordinary anon/authenticated row writes have no permitting policy. Preserve that boundary. |
| Table grants nevertheless include INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for anon and authenticated, as well as SELECT. Default public-schema privileges grant broad table access and function EXECUTE to those roles. | RLS is not a substitute for revoking unnecessary grants. In particular, TRUNCATE is not protected by row policies; no truncate operation was attempted. New objects must be private/revoked from creation. This does not assert that a public HTTP truncate endpoint exists. |
| Application-table discovery found no owner, claim, invitation, attribute, confirmation, contact or reviewer-membership structures. `venue_import_candidates` is private import staging with no public policy, not an owner-claim system. `venue_outdoor_points` is empty; microclimate tables hold calculated/forecast data. | Do not pretend an ownership or moderation system already exists, or repurpose microclimate confidence as confirmation confidence. The inspection covered application tables/catalogs, not the identities in Auth. |
| The inspected venue-related write/admin RPCs are not executable by anon/authenticated. `venues_in_bbox` is security-invoker and publicly executable; its return type contains map/microclimate data, not amenity confirmations. | No new public write RPC is needed. Keep attributes separate from the bbox RPC initially. |

Repository observations:

- [cafeCardTiles.js](../../src/utils/cafeCardTiles.js) requires literal `true` plus a non-empty source string for the four missing amenities. Its [tests](../../src/utils/cafeCardTiles.test.js) explicitly reject demo tags, names, heating strings, `hasFireplace` and local live toggles.
- Tile order is outdoor tables → dog → pram → current estimated wind shelter → heaters → fireplace, capped at **four**. Eligible heaters/fireplace can still fall beyond the cap.
- [normalizeVenueRow](../../src/hooks/interpretVenueResponse.js) spreads row fields but does not fetch/join attributes; [useVenues](../../src/hooks/useVenues.js) pages `venues.select('*')` and retains demo data on failure. A new table alone will not switch tiles on.
- [OwnerDashboard](../../src/components/OwnerDashboard.jsx) is an unsigned, device-local preview. [sunstay-admin](../../sunstay-admin/src/App.jsx) has a session gate and email/password sign-in, but its inspected shell has no review workflow or staff-role check. Signing in is not sufficient reviewer authorisation.
- Other paths are less strict: [venueAmenities](../../src/utils/venueAmenities.js) derives dog/pram/accessibility icons and Sunny matches from tags; [venueOfferings](../../src/utils/venueOfferings.js) reads tags/heating; [App](../../src/App.jsx) falls back to tags/heating for filters. [venueFilters](../../src/utils/venueFilters.js) ANDs practical needs. These must share the new evidence resolver before a sourced-attribute rollout is described as consistent.

## 2. Data model: recommend a separate table

| Option | Advantages | Costs / limitations |
| --- | --- | --- |
| Nullable boolean and provenance columns on `venues` for every feature | Small initial query change; existing helper sees the fields directly. NULL can represent unknown if never defaulted to false. | Each attribute needs source, actor, time, expiry, review and evidence fields. Inside/outdoor distinctions multiply columns; public `select('*')` risks disclosing contacts/evidence. Pending changes, history and conflicts still need separate tables. |
| Separate `venue_attributes` records, with private workflow and public approved facts | One consistent tri-state/provenance model, area-specific answers, per-attribute expiry and audit history. New features do not require another family of columns. Private identity stays out of the public venue response. | Requires a batch read/adapter and a controlled publication transaction. More initial workflow work than four booleans. |

**Recommend the separate table**, keeping `venues` as venue identity and existing import data. Do not add eight loosely controlled boolean/source columns just to satisfy the current helper. Produce those fields in an app adapter from current approved facts.

### Proposed logical objects

Names are design names, not created tables or executable migration files.

| Object | Purpose and fields |
| --- | --- |
| `private.venue_contacts` | Contact UUID, `venue_id text`, private email/name/role, independently checked contact channel, verification method/date, active/revoked state. Email delivery proves mailbox access, not legal ownership. Store only the details needed for this purpose. |
| `private.venue_attribute_invites` | Invite UUID, contact/venue FKs, unique token hash, allowed questions/scopes, expiry, revoked/consumed timestamps, created-by reviewer, submission ID/idempotency reference. Never store a usable raw token. |
| `private.venue_attribute_submissions` | Submission UUID, invite FK, server submission time, attestation/form version, pending/approved/partially-approved/rejected review outcome. No public access. |
| `private.venue_attributes` | Versioned per-attribute claims: fields below. This is the canonical evidence history, including explicit no and unknown answers. |
| `private.venue_attribute_reviewers` and review events | Active staff Auth-user allowlist with role; append-only decision records identifying reviewer, claim, decision/reason/time and previous publication revision. The existing admin login does not populate this automatically. |
| `public.venue_attribute_facts` | Physical, sanitized projection of the **current approved decision** per venue/attribute/scope. Holds only public value, source/provider/attribution, confirmation/review/expiry dates, approved condition text, active/suspended publication state and opaque revision/claim IDs. Excludes contacts, token hashes, private evidence and reviewer identities. |

Using a physical public projection avoids exposing a private evidence table through an accidentally privileged view. Approval writes both canonical review state and the sanitized projection in one database transaction. If a view is chosen later, the default owner-permission behaviour must be addressed; a security-invoker view also needs appropriate underlying grants, so it is not a shortcut to safely exposing private columns. [Supabase view security](https://supabase.com/docs/guides/database/views)

### Claim fields and invariants

| Field | Proposed meaning / constraint |
| --- | --- |
| `id`, `submission_id`, `venue_id` | UUID claim/submission IDs; text venue FK. Values and evidence are versioned, not silently edited in place. |
| `attribute` | Allowlisted key, e.g. `dogs_allowed`, `step_free_entry`, `pram_space`, `outdoor_heaters`, `fireplace`. Use a small definition registry/check, not arbitrary client-supplied keys. |
| `scope`, `scope_label` | Allowlisted venue / inside / outdoor scope and reviewer-approved area description. MVP supports one named outdoor area per venue. Mixed answers across multiple terraces remain unresolved until areas can be modeled explicitly; do not collapse them into a global yes. |
| `value` | Non-null enum `yes | no | unknown`; unanswered questions default to unknown in the form, never no. Missing claim = not collected; explicit unknown = respondent cannot confirm. Both resolve to unknown publicly, while remaining distinct in the audit record. |
| `source` | Enum `venue_confirmed | sunstay_visit | licensed_listing | open_dataset`. Only the server/reviewer selects this. A venue form always enters the first category; it cannot claim an on-site visit or licensed provider. |
| `confirmed_by`, `confirmed_at` | Private actor/contact FK and server-recorded attestation/visit time. Staff publication time is separately `reviewed_at`; imports retain the actual source observation date when supplied, not fetch time relabeled as confirmation. |
| `provider`, `source_ref`, `license_ref` | Required for imported evidence; identify provider, original record/version and approved reuse basis. A non-empty source string alone is insufficient. Store only content the licence permits. |
| `evidence_note`, `public_condition` | Private factual note, e.g. how contact control was checked; a separately reviewed short public condition, e.g. “front terrace, on lead”. Never auto-publish arbitrary free text or contact information. |
| `review_due_at`, `expires_at` | Non-null for publishable yes/no facts. Proposed venue-confirmation policy: reminder/review due at 150 days, hard expiry at 180 days from confirmation. These are proposed product intervals, not an existing rule; use shorter validity for seasonal heaters or dated licensing. |
| `review_state`, `reviewed_by`, `reviewed_at`, `supersedes_id` | Pending → approved/rejected, with superseded/disputed/retracted states and an audit event. Reviewer identity comes from authenticated, authorised server context. Unknown can supersede an old yes; do not “fall back” to an older convenient positive. |

Use a unique key on the public current tuple `(venue_id, attribute, scope)`; index private claims by venue/key/scope and submissions by pending status/time. Foreign keys, allowed scope/key combinations, bounded note lengths, date ordering and required provenance are database constraints as well as server validation. Serialize review decisions per tuple and compare the expected current revision to reject stale approvals.

**Effective state:** only the current approved, unretracted, unexpired decision with a permitted source is eligible. Latest pending claims never become public automatically. Expired/missing/unresolved records resolve to unknown. A published no remains a genuine negative until superseded or expired. Do not fill the table with inferred negatives from legacy default-false columns.

## 3. How a venue confirms without main-app auth

Recommend an **invite-only short form with a one-time submission capability**, rather than enabling OwnerDashboard writes or introducing customer accounts.

1. **Staff establishes the contact.** Use the venue's independently obtained official website or a callback through its published business phone to confirm an appropriate manager/contact. Record that check privately and bind the invitation to that venue. Do not let anyone type an arbitrary email and immediately obtain owner access.
2. **Create an invitation server-side.** Generate 32 cryptographically random bytes; store only its SHA-256 hash, venue/contact binding, allowed questions and a proposed seven-day expiry. Reissuing revokes older unused invitations. No public invitation-creation endpoint.
3. **Send from `sunstayglobal@gmail.com` in the existing manual outreach process.** The email identifies SunStay, venue, purpose, link expiry and how to decline/correct. Sending is future operational work, not part of this proposal. If later automated, sender credentials remain server-side; nothing grants the browser Gmail access.
4. **Open a clear, small form.** Show the venue/address and named outdoor area, explain “published only after review”, then Yes / No / Not sure questions and relevant condition fields. Do not pre-check answers from demo or third-party data. Collect a representative-role attestation and permission to publish factual answers with a source/date label.
5. **Handle the link as a bearer secret.** Prefer a URL fragment read by the first-party page, removed from browser history before external resources load; exchange over HTTPS in a POST for a short-lived, restricted session. Use Secure/HttpOnly/SameSite cookies, no-store responses, no-referrer policy and no third-party analytics on the form. Redact tokens from request/error logs. Opening/previewing the email link must not consume it; email security scanners often follow GET links.
6. **Submit atomically.** Check token hash, server expiry, revocation, venue binding, allowed fields/scopes, payload limits and CSRF/session token. Lock the invite, insert pending submission/claims and mark consumed in one transaction. Repeat requests return an idempotent receipt, not duplicate claims; concurrent submissions yield at most one accepted submission. A replacement or correction needs a fresh invitation.
7. **Review before publication.** An allowlisted staff reviewer compares the contact check, exact area, qualifiers, contradictions and source rights. Accept/reject individual claims with a reason; no tickbox “approve everything” default. Publication records the reviewer and decision and atomically replaces current public facts. Contradictory or access-safety reports can be placed on review hold with the disputed public claim suspended.
8. **Reconfirm and correct.** Track due dates in the review queue, request a fresh confirmation, and expire claims even if nobody sends a reminder. A public “Report incorrect information” path may create a rate-limited private report; it can never edit published facts. Do not infer “no” from nonresponse.

A forwarded link remains a bearer capability. Mitigate with an independently verified recipient, short validity, restricted scope, revocation and human review; describe the result as **venue-confirmed**, not independently verified ownership.

### Authorisation, RLS and abuse protection

[Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) supports combining row policies with explicit privileges. Keep the main app and OwnerDashboard read-only:

| Principal | Permitted path |
| --- | --- |
| Browser anon / ordinary authenticated user | Read current sanitized facts only. No private-schema access, table writes or confirmation/review RPC execution. Authenticated role by itself is never proof of ownership or staff membership. |
| Invited venue representative | HTTPS form endpoints validate the scoped invitation; the representative never receives database credentials or general venue editing rights. May create pending claims once, not approve them. |
| Submission backend | Prefer a dedicated non-owner Postgres role with no BYPASSRLS, via a server-only pooled connection. Restrict grants and RLS to contacts/invites as needed and pending submissions/claims. No ability to publish facts, change reviewer membership or write `venues`. |
| Review backend | Separate restricted server role. Verify the staff JWT server-side and check an active reviewer row on every request; require MFA for staff review. May execute the constrained review/publication transaction and manage invitations. Membership administration is separately restricted. |
| Schema/deployment administrator | Future, explicitly approved migrations and credential provisioning only. Not a public or venue capability. |

Enable RLS on every new table, including private tables as defense in depth. Explicitly revoke schema usage/table privileges and function EXECUTE from PUBLIC, anon and authenticated **in the same migration that creates each object**, then grant only the public SELECT surface needed. New public facts have SELECT policies on their own active publication state and unexpired dates; only the review transaction may create that approved projection. Do not make anonymous policies query private evidence tables. There is no client write policy. Include USING and WITH CHECK where an updating server role needs both, and grant its required SELECT permission. Keep functions security-invoker and non-exposed where feasible; never add a broadly callable SECURITY DEFINER escape hatch.

Dedicated server credentials are a proposed addition, not a claim about the existing backend. If implementation instead uses a service-role/secret key, acknowledge that it bypasses RLS: all token/staff authorisation must then be enforced by server code, and that broader compromise boundary needs separate implementation review. No service key or secret can enter `VITE_*`, JavaScript bundles, emailed links or the form. Do not authorise from user-editable `user_metadata`.

Use shared/durable rate limits, not the existing Sunny function's instance-local limiter. Initial limits can be small: invitation creation only by staff, a small daily outreach quota, bounded attempts per invite/session/IP, one accepted submission per invite, at most the allowlisted questions, 500-character notes and an approximately 8KB request body. Return generic invalid/expired responses; do not expose contact lookup or email enumeration. Validate Origin and CSRF tokens (CORS alone is not authentication), render notes as text, and avoid uploads in the pilot. A honeypot/challenge can supplement limits if abuse appears.

Proposed retention: no raw tokens ever retained; remove expired/consumed token hashes and short-lived request metadata after 30 days. Retain restricted claim/review history for a proposed 24 months for corrections, then minimise identity details under a documented retention policy. Contacts can be revoked without destroying the factual audit trail. No emails, names or IPs in the public projection.

## 4. Start with these questions

The four requested card features need several atomic facts. Every question supports yes/no/unknown and an area/condition where relevant.

| Feature / question | Canonical facts | Display and mapping |
| --- | --- | --- |
| Dogs: allowed inside? At the named outdoor tables? Any lead/size/time restrictions? | `dogs_allowed` independently for inside and outdoor. | For the café outdoor card, `dog_friendly=true` requires approved outdoor yes. Indoor yes alone is insufficient. If outdoor yes + inside no: “Dogs outdoors only”. If indoor unknown: say indoor policy is unconfirmed; do not invent “only”. Ask about pet dogs; do not conflate this with assistance-animal access. |
| Prams: step-free entry **and route to this seating area**? Enough space to keep a pram safely at the table? | `step_free_entry` (question includes the route) and `pram_space`, scoped to the relevant area. | `pram_friendly=true` only when both are approved/current yes for that area. Any unknown means the composite is unknown; a confirmed no prevents a positive tile. Keep the individual access facts available. |
| Outdoor heaters installed and available to guests? Which area, months and operating conditions? | `outdoor_heaters` in outdoor scope, with seasonal/operating condition. | Means the feature exists under the stated conditions, not “heaters on now”. Never write `heatersOn` from this confirmation. Expire at a seasonal end date if earlier than the normal interval. |
| Fireplace available to guests? Inside/outside, real fire/electric decorative unit, seasonal limits? | `fireplace` with explicit scope and factual type/conditions. | Show qualified “Indoor fireplace” when appropriate, separately from Outdoor Table Sun. Do not treat a firepit or decorative lamp as an unspecified fireplace, or write `fireplaceOn`. |
| **Additional 1: outdoor seating** | `outdoor_seating`, named area; optional separately sourced capacity. | Already wanted by café tiles and `venueOfferings`. Preserve CLUE seat-count provenance. A venue yes is not permission to fabricate a count; a conflict with CLUE needs review, not a silent count overwrite. |
| **Additional 2: covered outdoor seating** | `covered_outdoor_seating`, fixed roof versus deployable umbrella, restrictions. | Already wanted by the brief's covered-area tiles and “Cozy & Covered”/Covered/Umbrellas offerings. Cover does not prove rainproof seating, wind shelter or extra direct sun. |
| **Additional 3: specific wheelchair access** | Separate entrance/route, seating and toilet-access facts, with measurements/conditions where available. | `Wheelchair Accessible` is already a practical filter and key amenity. Start with precise labels such as “Step-free entry”; do not derive a blanket accessibility claim from a pram answer, a lift or one entrance boolean. Broader “Accessible” matching must have an explicit published criterion before enabling. |

At 390px, use a single-column form, 44×44 minimum targets and conditional follow-ups. Group the extra access questions behind a clear expansion so the primary confirmation remains short. Do not ask venues to type sun hours, monthly sun rankings, forecast weather or wind-shelter scores; those remain engine/forecast outputs.

## 5. Third-party sources and rights

Default to independent venue answers or an actual recorded SunStay visit. An absent provider attribute is unknown, not false. Import source/provider, observation/fetch dates, attribution and permitted uses separately; never relabel imported claims as venue-confirmed.

| Option | Useful coverage | Restrictions / decision |
| --- | --- | --- |
| **Google Places API (New)** | The current schema includes `allowsDogs`, `outdoorSeating`, `goodForChildren` and separate accessibility booleans. Those do not establish indoor/outdoor dog permission or pram space. [Place resource](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places) | Raw Places API content generally cannot be used with a non-Google map or stored as a permanent SunStay attribute database. SunStay uses Mapbox. Attribution alone does not fix this; do not import these booleans into the proposed persistent facts table. [Service-specific terms §14](https://cloud.google.com/maps-platform/terms/maps-service-terms) |
| **OpenStreetMap** | Potential community dog, outdoor-seating and access records; coverage and observation dates must be checked per venue, not assumed. | ODbL attribution and applicable database share-alike duties, not a Google-only-map rule. Keep source IDs/versions and a separable licensed dataset; review the combined-database/public distribution design before importing. Missing tags are unknown; a fresh download is not a new on-site check. [OSM copyright/licence](https://www.openstreetmap.org/copyright) |
| **City of Melbourne CLUE** | Existing `outdoor_seats` path. Dataset has indoor/outdoor seating type, counts and census year; it does not supply the four missing amenity confirmations. | Metadata links CC BY 4.0. Retain City of Melbourne attribution, dataset/year/reference and indicate transformations. The retrieved dataset describes 2002–2024 coverage; do not call it a current venue visit because the portal was processed in 2026. [Dataset and licence](https://data.melbourne.vic.gov.au/explore/dataset/cafes-and-restaurants-with-seating-capacity/) · [catalog metadata](https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/cafes-and-restaurants-with-seating-capacity) |
| **Venue's own website or written response** | Can describe current pet, access and heating policies with useful conditions. | Public visibility is not a general licence to copy photos/descriptions or scrape restricted sites. Prefer fresh factual answers and recorded permission through the form; a website claim without direct confirmation needs its own provider/rights basis and cannot be silently called venue-confirmed. |
| **Commercial listing/accessibility provider under contract** | Possible additional structured access/amenity coverage. No particular supplier's coverage or licence is assumed here. | Require written permission for retention, Mapbox/map-associated display, attribution, transformations/derived filters and post-termination handling. “Licensed listing” becomes publishable only after that provider/field use is allowlisted. No scraping Booking.com/Tripadvisor/Google to fill gaps. |

Google exceptions matter: place IDs can be retained indefinitely; the raw API's specified latitude/longitude cache exception is up to 30 days, **not** a blanket 30-day permission for all attributes. Standalone permitted display requires Google attribution and applicable third-party credits. [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

The current non-EEA service terms also give **Places UI Kit** a distinct permission for use with non-Google maps (§15). That is not permission to extract raw Places attributes into SunStay's own long-lived table or custom tiles. Check the actual account agreement/billing jurisdiction before any future Google integration. For this Mapbox/custom-card proposal, venue confirmation remains the default. [Service-specific terms §§14–15](https://cloud.google.com/maps-platform/terms/maps-service-terms)

Do not prefill the confirmation form with restricted provider answers and treat a click as independent evidence. Collect the representative's own answers, preserving their provenance.

## 6. Rollout and how tiles become eligible

These are **future** migrations and implementation steps; none is included or applied here. Logical order is given without inventing timestamped filenames. Implementation must follow CLAUDE.md's migration-history reconciliation and explicit production-approval requirements. A later PR touching `supabase/` is a production-deploy concern, even if described as “just migrations”.

| Order | Future work | Gate / acceptance |
| --- | --- | --- |
| 1 | Recheck production history/schema; migration for private workflow, attribute definitions/value/source types, contacts, invites, claims, reviewer allowlist, review events, constraints/indexes and least-privilege server roles. | Enable RLS and revoke default client grants/EXECUTE in the creating transaction. No backfill from tags/default-false flags. Provision reviewers through a restricted process; never grant every Auth user review access. |
| 2 | Migration for sanitized public current facts and the atomic, role-restricted consume/review/publication operations. Include a narrowly scoped review of unnecessary anon/authenticated `venues` write/TRUNCATE grants, preserving SELECT and existing RLS. | Anonymous clients can only SELECT eligible public facts; venue submission cannot publish; approval cannot change venue identity/sun data. New objects remain fail-closed even before the server deploys. |
| 3 | Deploy the confirmation page, server endpoints, durable limits, secrets and authenticated staff review queue. Use the separate admin app for review after adding server-side staff checks. | Invitation expiry/replay/concurrency, revocation, venue binding, scanner-safe GET, CSRF and staff authorisation tests pass in a non-production test environment. OwnerDashboard remains a local preview. |
| 4 | Batch-load facts alongside venues; add one pure evidence resolver/adapter; update café labels/details and migrate amenity/filter/offerings/Sunny consumers to it. | Pending/expired/unknown/failed loads cannot reuse legacy tags or stale confirmed positives. Preserve the currently valid CLUE seat and estimated wind-shelter paths. |
| 5 | Invite a staff-selected pilot of about ten cafés, review answers and enable the projection for that cohort. | No live tile before approval; review queues, disputes and expiry are usable. Confirm 390px layout and larger text, including qualified dog/fireplace labels and the four-tile cap. |
| 6 | Expand only after pilot review; automate due-date reminders if useful. | Hard expiry is enforced at read/resolve time, so missed reminders never keep an old yes active. Rollback disables publication/adapter and revokes invites; no invented replacement values. |

No migration is needed merely to turn a reminder into an automated job if the date fields already exist; a future scheduler/deployment still needs its own approval. No cron job or email automation is created by this proposal.

### Adapter contract

The proposed public fact batch is keyed by venue ID and paged like the venue list; avoid one request per card. Validate at read/resolve time, including expiry, source allowlist, scope and approval revision. Do not store a flattened boolean permanently as a second source of truth.

| Fields supplied to the existing helper | Rule |
| --- | --- |
| `dog_friendly` + `dog_friendly_source` | true only for current approved outdoor dog permission; attach inside/outdoor condition metadata for the revised label. Inside-only yes does not qualify. |
| `pram_friendly` + `pram_friendly_source` | true only for both approved step-free route and pram-space yes in the same area. Retain both evidence references and earliest expiry. If sources differ, the source summary must honestly name both, not pretend one provider confirmed the composite. |
| `outdoor_heaters` + `outdoor_heaters_source` | true only for current approved installed outdoor heaters with applicable conditions. Not today's on/off state. |
| `fireplace` + `fireplace_source` | true only for a current approved real fireplace claim; carry indoor/outdoor/type conditions into tile copy. |

For a current explicit no, emit false and retain its provenance for details; for unknown/missing/stale/error, emit null and no positive source. The `_source` strings are derived from accepted evidence, not trusted merely because they are non-empty. Clear previously projected fields before resolving new facts so reload/expiry cannot leave an old true on the venue object.

The current helper then includes eligible amenities via its existing true-plus-source checks. It **does not** currently enforce source enums, approval, expiry or area, and its labels lack these qualifications; the proposed resolver and copy changes are necessary before enabling publication. A database-only change is insufficient.

Keep the order and four-tile maximum. If outdoor tables, dog, pram and wind shelter fill four slots, heaters/fireplace belong in the full features disclosure. Do not reorder merely to make every confirmed feature appear. No new “venue_confirmed” DataBadge kind is needed; use a source/date text disclosure for amenities and preserve the brief's existing sun/forecast/estimated badge rules.

For practical dog/pram/access filters, match only approved effective yes and retain AND behaviour for multiple needs. No/unknown both fail a positive filter, but remain different in detail/audit. Apply the same rule to offerings/icons/Sunny, including when demo fallback is active; hand-entered “Pet Friendly”/“Pram Friendly” and legacy heating strings must never satisfy the new confirmations. “Family” must stop being an automatic pram synonym for sourced claims.

### Effort estimate and validation

Planning estimate for one engineer: **8–12 working days**, excluding venue response time and production approval. Approximate allocation: model/RLS/transactions/tests 2–3 days; confirmation endpoints/form/security 2–3; reviewer queue 1–2; batch adapter/consumer migration/tests 2–3; pilot checks and fixes about 1. Existing deployment/email access and an agreed staff allowlist are assumptions. A full multi-area owner-account portal would expand scope; it is not needed for the pilot.

Operational pilot estimate: roughly 5–10 minutes of contact checking/review per venue, plus correspondence and any access clarification; this is a planning allowance, not measured throughput.

Later tests must cover tri-state values, partial/conditional answers, scope mismatches, source allowlists, expired/retracted facts, earlier-positive supersession, forged venue/source/review fields, direct anon/auth writes, invitation replay/concurrency, stale reviewer sessions/removed membership and publication rollback. Confirm no private column is returned by public reads and a leaked submission credential cannot publish. Use an isolated test database for write/RLS tests; production inspection here remained SELECT-only.

UI checks later: 390×844 and larger text; expiry while a card is open; failed/offline attribute refresh; demo fallback; explicit no versus unconfirmed details; qualified area labels; source visibility and overflow past four tiles. Run the repository's relevant unit tests and build with those later code changes. This Markdown-only proposal does not require application build/test execution.

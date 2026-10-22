# Venue sign-in for gigs and warmth: proposal

**Status: proposal for Shannon's approval.** Written 22 October 2026 (Australia/Melbourne) against
main `538574f`+ and production project `fksuqgvsazoxarocmaii`. This document authorises nothing: no
migration, Auth setting change, function deployment or venue outreach.

Read first: [CLAUDE.md](../../CLAUDE.md), the
[venue-confirmed attributes proposal](venue-attributes-proposal.md) (#207, whose contact checks,
review rules and least-privilege model this reuses), the After Dark engine
(`src/utils/afterDarkEvents.js`, `src/utils/venueEvents.js`, #234–#237) and the
[After Dark brief](https://claude.ai/artifact/3agFLsj2ryYjgZcJm4EBCb).

## 1. Problem

After Dark needs pub gigs, trivia and comedy nights. The live Ticketmaster feed had 4–11 CBD events
a night on 22–24 Oct, none at pubs, and the other sources need permission (What's On, Beat, Musick,
ATDW). Venues entering their own events is the source that needs nobody's permission, and #237
already turns those entries into tonight's events. The same applies to warmth ("Fireplace lit
tonight"), which only the venue knows.

What's missing is somewhere to **save** entries. Today the partner preview (`OwnerDashboard`) is
device-local by design: production has no write policy on `venues`, and CLAUDE.md requires "an
authenticated, server-side write path" for owner edits.

#207 avoids venue accounts on purpose. It uses a one-time invite link per confirmation, which suits
facts that rarely change. Gigs change weekly, so one link per update would be too much friction.
This proposal adds **sign-in for venue staff**, while keeping #207's rule that **nothing a venue
enters is public until approved**.

## 2. Goals

1. A verified venue can add, edit and cancel its own events (one-off and weekly) and set tonight's
   warmth status from a phone, in under 2 minutes, without a password.
2. Nothing reaches guests until approved. Approval is per entry at first, and per venue
   ("trusted") once the venue has a clean record.
3. A venue can only ever change its own events and status. Guests and other venues can't.
4. Pilot: 5 venues saving events in the first month, with 80% of their entries approved first time.

## 3. Non-goals (this version)

- **Editing venue facts** (name, tags, hours, sun): that stays with the #207 confirmation flow and
  staff. Mixing the two would let a signed-in venue change its own sun claims.
- **Guest accounts.** Guests stay anonymous; this is for venue staff only.
- **Payments, ticket sales or promoted listings.** These come later, after there's traffic.
- **Images or long descriptions.** Facts only, as for every other source (copyright guardrail).
- **Hotel room types.** These have their own flow (the room-type proposal).

## 4. User stories

**Venue manager**
- As a pub manager, I want to add "Trivia, every Thursday, 7:30pm" once, so that it shows every
  week without re-entering it.
- As a pub manager, I want to cancel this Thursday only, so that guests aren't sent to a night that
  isn't on.
- As a bar manager, I want to tap "Fireplace lit tonight", so that cold guests find us, and I want
  it to switch itself off after closing.
- As a venue manager, I want to see what's waiting for approval and why something was declined.

**SunStay staff (Shannon)**
- As the reviewer, I want one queue of new and changed entries, with the venue's past record, so
  that I can approve in seconds.
- As the reviewer, I want to mark a venue "trusted" so that its routine edits publish without me,
  and to take that away at any time.

**Guest**
- As a hotel guest, I want venue events to look the same as other events, with a "From the venue"
  label, so I know where the information came from.

## 5. Design

### Sign-in: email codes, no passwords
Supabase Auth with **email one-time codes** (6 digits), not magic links: email scanners can
consume links, and codes work across devices. No passwords to forget. Signing in proves only that
someone controls that inbox, nothing more (#207 §3).

### Membership: staff link a person to a venue
A signed-in user can do nothing until **SunStay staff** add them to a venue, after checking the
contact through an independent channel (the venue's published phone, or an in-person visit). This
reuses #207's `private.venue_contacts` verification. Without that step, anyone could sign up with
any email and claim any pub.

| Object (design name) | Purpose |
|---|---|
| `private.venue_members` | `user_id` (Auth), `venue_id`, role (`manager`), `verified_via`, `verified_by` staff, active/revoked. Staff-only writes. |
| `private.venue_event_entries` | The venue's entries in the #237 shape (`validateVenueEvent`), plus `venue_id`, `created_by`, `review_state` (pending/approved/rejected), `review_reason`, `revision`. |
| `private.venue_live_status` | Tonight's warmth: `fireplace_lit`, `heaters_on`, `set_by`, `expires_at` (forced to the venue's next 5am). |
| `public.venue_events` | A **sanitised projection of approved entries only**, with no user IDs. This is what the app reads. |
| `public.venue_live_status_current` | A view of unexpired approved status only. |
| `private.venue_trust` | Per-venue `trusted` flag, set by staff, with history. |

### Writes: one server-side function, never client table writes
A `venue-portal` Edge Function, with `verify_jwt = true`, that:
1. reads the caller's Auth user from the JWT (never from the request body or `user_metadata`);
2. checks for an **active** `venue_members` row for that venue on every request;
3. validates with the same `validateVenueEvent` rules the app uses (shared code);
4. writes to `private` tables as `pending`, or as `approved` when the venue is trusted and the change
   is routine (time, skip date or cancel); new or retitled events always go to review;
5. rate limits per user and venue in a durable store (not the in-memory limiter `chat-sunny` uses).

Every new table: RLS on, and revoked from `public, anon, authenticated` by name in the migration
that creates it (CLAUDE.md). There is no client write policy anywhere. Public reads only see the
approved projection.

### Review
A small queue in the existing `sunstay-admin` app, which already has sign-in. Server-side staff
check on every action (a staff allowlist, as in #207). Approve or reject each entry with a reason.
Every decision is logged.

### In the app
- `OwnerDashboard`: "Sign in to save" (email, then code). Signed-out stays the device-local preview,
  as now.
- After Dark: reads `public.venue_events` through `venueEventsTonight`, merges with Ticketmaster
  using `dedupeEvents` (#237) and labels them "From the venue".
- Warmth pins: "Fireplace lit" only from the unexpired status view, never from old flags.

## 6. Requirements

**P0 (pilot can't ship without)**
- Email-code sign-in; staff-only membership; one venue per member to start.
- Add, edit and cancel events (one-off and weekly) with skip dates; validation errors shown in
  plain words (#237).
- Every entry pending until approved; review queue with reasons; audit log.
- Public projection plus app read path; "From the venue" label.
- RLS and revoke-by-name on every object; tests for: no client writes, no cross-venue writes,
  revoked members locked out at once, forged `venue_id` refused, pending entries never public.

**P1 (fast follow)**
- Tonight's warmth status with automatic expiry.
- Trusted venues: routine edits publish straight away.
- An email to the venue when an entry is approved or rejected.

**P2 (design for, don't build)**
- Several staff per venue, and groups with several venues (hotel chains).
- Paid promotion of a venue's event.
- Venues importing from their own website or ticketing calendar.

## 7. Success measures

- **Leading (first 4 weeks):** 5 pilot venues signed in; median time to add a weekly event under
  2 minutes; 80%+ approved first time; review turnaround under 24 hours.
- **Lagging (3 months):** share of After Dark events "From the venue"; guests tapping through to
  venue pages; pilot venues still updating after 8 weeks.

## 8. Open questions

| # | Question | Who | Blocking? |
|---|---|---|---|
| 1 | Approve every entry for the whole pilot, or trust venues after (say) 5 clean entries? | Shannon | No (default: approve all) |
| 2 | How do we verify a venue contact: call the published number, visit in person, or both? | Shannon | **Yes** |
| 3 | Which 5 pilot venues? Suggest Union Hotel, Lion & Wombat, the Standard and two from the cultural six. | Shannon | **Yes** |
| 4 | Supabase Auth email: the built-in sender has low limits; a custom SMTP sender (e.g. Resend) may cost money. | Engineering → Shannon (cost) | Yes, before launch |
| 5 | Are venue-entered events counted in Ticketmaster's terms as "mixed with" their data? Show them as separate rows? | Engineering (terms check) | No |
| 6 | Privacy notice for venue staff emails and retention (#207 proposes 24 months for review history). | Shannon / legal | Yes, before launch |

## 9. Rollout (each a reviewed PR; anything under `supabase/` needs explicit approval)

1. **Migration, private first:** members, entries, live status, trust, review log; RLS and
   revokes. No public surface yet.
2. **Public projection and `venue-portal` function,** tested against an isolated database, not
   production.
3. **Admin review queue** in `sunstay-admin`.
4. **App:** OwnerDashboard sign-in and form (Codex UI); After Dark reads approved events.
5. **Pilot** with 5 venues, then decide on trust and warmth status (P1).

**Effort (one engineer, planning only):** about 6–9 working days: steps 1–2, 3 days; review
queue, 1–2; app wiring and UI, 2–3; pilot fixes, 1. This excludes venue response time, approvals
and any email-sender setup.

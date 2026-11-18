const COUNT_KEY = 'ss-demo-area-booking-count';

export function demoBookingTimes(now = Date.now()) {
  const first = Math.ceil((now + 60000) / 900000) * 900000;
  return Array.from({ length: 8 }, (_, index) => new Date(first + index * 1800000).toISOString());
}

/** Local demonstration receipt only. Never sends a booking, enquiry or contact details. */
export function demoAreaBooking({ venueId, venueName, area, time, partySize }, now = Date.now()) {
  const when = Date.parse(time);
  if (!venueId || area?.venue_id !== venueId || !area.area_id || !area.area_name || !Number.isInteger(partySize)
    || partySize < 1 || partySize > 12 || !Number.isFinite(when) || when <= now || when > now + 86400000) return null;
  return { kind: 'demo_booking', venue_id: venueId, venue_name: venueName,
    area_id: area.area_id, area_name: area.area_name, time, party_size: partySize };
}

export function countDemoBooking(storage) {
  try {
    const prior = Number(storage.getItem(COUNT_KEY));
    const next = (Number.isSafeInteger(prior) && prior >= 0 ? prior : 0) + 1;
    storage.setItem(COUNT_KEY, String(next));
    return next;
  } catch { return null; }
}

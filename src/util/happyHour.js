/**
 * Happy Hour Utilities
 * Determines if a venue's happy hour is currently active
 * and formats the offer for display.
 */
const DAY_MAP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/**
 * Check if happy hour is active right now for a venue.
 * @param {object} happyHour - { days, start, end, deal }
 * @returns {{ isActive: boolean, isUpcoming: boolean, minutesUntil: number, minutesLeft: number, deal: string, timeRange: string }}
 */
export function getHappyHourStatus(happyHour) {
  const empty = { isActive: false, isUpcoming: false, minutesUntil: null, minutesLeft: null, deal: null, timeRange: null };
  if (!happyHour?.start || !happyHour?.end || !happyHour?.days) return empty;
  const now = new Date();
  const todayKey = DAY_MAP[now.getDay()];
  if (!happyHour.days.includes(todayKey)) return empty;
  const [startH, startM] = happyHour.start.split(':').map(Number);
  const [endH, endM]     = happyHour.end.split(':').map(Number);
  const nowMins   = now.getHours() * 60 + now.getMinutes();
  const startMins = startH * 60 + startM;
  const endMins   = endH   * 60 + endM;
  const isActive   = nowMins >= startMins && nowMins < endMins;
  const isUpcoming = !isActive && nowMins < startMins && (startMins - nowMins) <= 60;
  const fmt = (h, m) => {
    const suffix = h >= 12 ? 'pm' : 'am';
    const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2, '0')}${suffix}`;
  };
  return {
    isActive,
    isUpcoming,
    minutesUntil: isUpcoming ? startMins - nowMins : null,
    minutesLeft:  isActive   ? endMins - nowMins   : null,
    deal:      happyHour.deal || null,
    timeRange: `${fmt(startH, startM)} – ${fmt(endH, endM)}`,
  };
}
/**
 * Short badge label for list cards.
 */
export function getHappyHourBadge(happyHour) {
  const s = getHappyHourStatus(happyHour);
  if (s.isActive)   return { show: true, label: `HH ends ${s.minutesLeft}m`,  color: 'amber',   icon: '🍺' };
  if (s.isUpcoming) return { show: true, label: `HH in ${s.minutesUntil}m`,   color: 'emerald', icon: '⏰' };
  return { show: false };
}

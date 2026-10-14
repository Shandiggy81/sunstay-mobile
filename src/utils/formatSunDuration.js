/** Format a sun duration in whole minutes for compact guest-facing UI. */
export function formatSunDuration(minutes) {
  if (minutes == null || minutes === '') return 'Unavailable';
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes)) return 'Unavailable';
  const totalMinutes = Math.max(0, Math.round(numericMinutes));

  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

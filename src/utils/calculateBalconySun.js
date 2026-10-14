import {
  calculateBalconySunDay, DEFAULT_TIME_ZONE, facingLabel, formatSunWindows, parseFacing,
} from './balconySunEngine.js';

export { DIRECTION_MAP } from './balconySunEngine.js';

/** Legacy return shape; defaults now use the front half-plane and altitude > 0°.
 * Explicit narrower fov/minAltitude arguments still work. Missing facing is an open rooftop.
 */
export function calculateBalconySun(lat, lng, date = new Date(), balconyFacing = null, fovDeg = 180, minAltitudeDeg = 0, options = {}) {
  const empty = { totalSunHours: 0, peakWindow: null, sunnyHours: [], balconyFacingDeg: null, balconyFacingLabel: 'Unknown' };
  try {
    const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
    const result = calculateBalconySunDay({ ...options, lat, lng, date, facing: balconyFacing, fovDeg, minAltitude: minAltitudeDeg, timeZone });
    const longest = result.windows.reduce((best, window) => !best || window.end - window.start > best.end - best.start ? window : best, null);
    const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
    const hours = new Set();
    for (const { start, end } of result.windows) {
      for (let t = start.getTime(); t < end.getTime(); t += 60000) hours.add(Number(hourFormatter.format(new Date(t))));
      hours.add(Number(hourFormatter.format(new Date(end.getTime() - 1))));
    }
    return {
      totalSunHours: result.totalMinutes / 60,
      peakWindow: longest ? formatSunWindows([longest], timeZone).replace('–', ' to ') : null,
      sunnyHours: [...hours].sort((a, b) => a - b),
      balconyFacingDeg: parseFacing(balconyFacing), balconyFacingLabel: facingLabel(balconyFacing),
    };
  } catch {
    return empty;
  }
}

export default calculateBalconySun;

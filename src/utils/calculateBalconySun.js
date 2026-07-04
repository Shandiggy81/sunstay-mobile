import SunCalc from 'suncalc';

/**
 * Direction string → centre azimuth in degrees (0 = North, clockwise)
 */
const DIRECTION_MAP = {
  N:   0,
  NNE: 22.5,
  NE:  45,
  ENE: 67.5,
  E:   90,
  ESE: 112.5,
  SE:  135,
  SSE: 157.5,
  S:   180,
  SSW: 202.5,
  SW:  225,
  WSW: 247.5,
  W:   270,
  WNW: 292.5,
  NW:  315,
  NNW: 337.5,
};

/**
 * Convert SunCalc azimuth (radians, 0 = South, clockwise) → degrees (0 = North, clockwise)
 */
function suncalcAzimuthToDeg(azimuthRad) {
  const deg = (azimuthRad * 180) / Math.PI;
  return (deg + 180) % 360;
}

/**
 * Parse balconyFacing into a centre azimuth (degrees, 0=N clockwise).
 * Accepts compass strings ('N', 'NE', 'SSW' etc.) or numeric degrees.
 */
function parseFacing(balconyFacing) {
  if (balconyFacing === null || balconyFacing === undefined) return null;
  if (typeof balconyFacing === 'number') return ((balconyFacing % 360) + 360) % 360;
  const key = String(balconyFacing).trim().toUpperCase();
  if (key in DIRECTION_MAP) return DIRECTION_MAP[key];
  const num = parseFloat(key);
  if (Number.isFinite(num)) return ((num % 360) + 360) % 360;
  return null;
}

/**
 * Angular difference between two azimuths, result in [0, 180]
 */
function angularDiff(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Format a decimal hour (e.g. 13.5) to a readable string (e.g. "1:30pm")
 */
function formatHour(decimalHour) {
  if (!Number.isFinite(decimalHour)) return null;
  const h = Math.floor(decimalHour);
  const m = Math.round((decimalHour - h) * 60);
  const period = h < 12 ? 'am' : 'pm';
  const displayH = h === 0 || h === 12 ? 12 : h % 12;
  return m > 0 ? `${displayH}:${String(m).padStart(2, '0')}${period}` : `${displayH}${period}`;
}

/**
 * calculateBalconySun
 *
 * @param {number}        lat            Venue latitude
 * @param {number}        lng            Venue longitude
 * @param {Date}          date           Date to calculate for (defaults to today)
 * @param {string|number} balconyFacing  Compass string ('N','NE','W', etc.) or degrees (0=North)
 * @param {number}        [fovDeg=90]    Field of view in degrees (default ±45° either side)
 *                                       90° reflects real hotel balcony geometry with side partitions.
 *                                       Use 120 only for open-ended terraces.
 * @param {number}        [minAltitudeDeg=5]  Minimum solar altitude to count as direct sun
 *
 * @returns {{
 *   totalSunHours:     number,
 *   peakWindow:        string | null,
 *   sunnyHours:        number[],
 *   balconyFacingDeg:  number | null,
 *   balconyFacingLabel: string,
 * }}
 */
export function calculateBalconySun(
  lat,
  lng,
  date = new Date(),
  balconyFacing = null,
  fovDeg = 90,           // ← tightened from 120 to 90 (±45° either side)
  minAltitudeDeg = 5,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { totalSunHours: 0, peakWindow: null, sunnyHours: [], balconyFacingDeg: null, balconyFacingLabel: 'Unknown' };
  }

  const facingDeg = parseFacing(balconyFacing);
  const halfFov   = fovDeg / 2;

  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0);

  const sunnyHours = [];

  for (let hour = 0; hour < 24; hour++) {
    const t = new Date(baseDate);
    t.setHours(hour, 30, 0, 0); // sample at HH:30 — mid-hour is more representative

    const pos = SunCalc.getPosition(t, lat, lng);
    const altitudeDeg = (pos.altitude * 180) / Math.PI;

    if (altitudeDeg < minAltitudeDeg) continue;

    // No facing specified → count all sunlit hours (e.g. open rooftop)
    if (facingDeg === null) {
      sunnyHours.push(hour);
      continue;
    }

    const sunAzimuthDeg = suncalcAzimuthToDeg(pos.azimuth);
    if (angularDiff(sunAzimuthDeg, facingDeg) <= halfFov) {
      sunnyHours.push(hour);
    }
  }

  const totalSunHours = sunnyHours.length;

  // Peak window → longest consecutive run of sunny hours
  let peakWindow = null;
  if (sunnyHours.length > 0) {
    let bestStart = sunnyHours[0], bestLen = 1;
    let curStart  = sunnyHours[0], curLen  = 1;

    for (let i = 1; i < sunnyHours.length; i++) {
      if (sunnyHours[i] === sunnyHours[i - 1] + 1) {
        curLen++;
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      } else {
        curStart = sunnyHours[i];
        curLen   = 1;
      }
    }

    peakWindow = `${formatHour(bestStart)} to ${formatHour(bestStart + bestLen)}`;
  }

  // Closest compass label for the facing
  let balconyFacingLabel = 'Unknown';
  if (facingDeg !== null) {
    const closest = Object.entries(DIRECTION_MAP).reduce((best, [label, deg]) => {
      const d = angularDiff(facingDeg, deg);
      return d < best.d ? { label, d } : best;
    }, { label: 'N', d: Infinity });
    balconyFacingLabel = closest.label;
  } else if (balconyFacing) {
    balconyFacingLabel = String(balconyFacing);
  }

  return { totalSunHours, peakWindow, sunnyHours, balconyFacingDeg: facingDeg, balconyFacingLabel };
}

export default calculateBalconySun;

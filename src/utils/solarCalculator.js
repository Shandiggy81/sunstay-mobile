import SunCalc from 'suncalc';

const MELBOURNE_LAT = -37.8136;
const MELBOURNE_LNG = 144.9631;
const DEFAULT_MIN_ALTITUDE = 15;

const SEASONAL_DATES = [
  { season: 'Summer', month: 11, day: 21 },
  { season: 'Autumn', month: 2, day: 21 },
  { season: 'Winter', month: 5, day: 21 },
  { season: 'Spring', month: 8, day: 21 },
];

export function getSunPositionAt(lat, lng, date) {
  const position = SunCalc.getPosition(date, lat, lng);
  return {
    altitude: position.altitude * 180 / Math.PI,
    azimuth: (position.azimuth * 180 / Math.PI + 180) % 360,
  };
}

function isAzimuthInRange(azimuth, start, end) {
  return start <= end
    ? azimuth >= start && azimuth <= end
    : azimuth >= start || azimuth <= end;
}

function aspectAllowsSun(azimuth, aspect) {
  switch (aspect) {
    case 'north':
      return isAzimuthInRange(azimuth, 290, 70);
    case 'south':
      return isAzimuthInRange(azimuth, 135, 225);
    case 'east':
      return isAzimuthInRange(azimuth, 45, 160);
    case 'west':
      return isAzimuthInRange(azimuth, 200, 315);
    case 'open':
    default:
      return true;
  }
}

function formatHour(hour) {
  if (hour === 12) return '12 PM';
  if (hour > 12) return `${hour - 12} PM`;
  return `${hour} AM`;
}

export function calculateHourlyExposure(
  lat = MELBOURNE_LAT,
  lng = MELBOURNE_LNG,
  date = new Date(),
  outdoorZone = {},
) {
  const safeLat = Number.isFinite(Number(lat)) ? Number(lat) : MELBOURNE_LAT;
  const safeLng = Number.isFinite(Number(lng)) ? Number(lng) : MELBOURNE_LNG;
  const aspect = String(outdoorZone.aspect || 'open').toLowerCase();
  const minAltitude = Number.isFinite(Number(outdoorZone.minAltitude))
    ? Number(outdoorZone.minAltitude)
    : DEFAULT_MIN_ALTITUDE;

  return Array.from({ length: 13 }, (_, index) => {
    const hour = index + 8;
    const hourDate = new Date(date);
    hourDate.setHours(hour, 0, 0, 0);
    const { altitude, azimuth } = getSunPositionAt(safeLat, safeLng, hourDate);
    const hasDirectSun = altitude > minAltitude && aspectAllowsSun(azimuth, aspect);

    return {
      hour,
      label: formatHour(hour),
      hasDirectSun,
      altitude,
      azimuth,
    };
  });
}

export function getSeasonalSummary(
  lat = MELBOURNE_LAT,
  lng = MELBOURNE_LNG,
  outdoorZone = {},
) {
  const year = new Date().getFullYear();
  return SEASONAL_DATES.map(({ season, month, day }) => {
    const date = new Date(year, month, day);
    const hourlyExposure = calculateHourlyExposure(lat, lng, date, outdoorZone);
    const directHours = hourlyExposure.filter(hour => hour.hasDirectSun).length;

    return {
      season,
      date,
      directHours,
      hourlyExposure,
    };
  });
}


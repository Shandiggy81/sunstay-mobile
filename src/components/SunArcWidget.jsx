import React, { useState, useEffect } from 'react';

// Lightweight sun position calculator (no suncalc dependency needed)
function getSunPosition(date, lat, lng) {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const declination = -23.45 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const hourAngle = (date.getHours() + date.getMinutes() / 60 - 12) * 15;
  const altitude = Math.asin(
    Math.sin(rad * lat) * Math.sin(rad * declination) +
    Math.cos(rad * lat) * Math.cos(rad * declination) * Math.cos(rad * hourAngle)
  ) / rad;
  return altitude;
}

function getSunTimes(lat, lng) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Approximate sunrise/sunset for Melbourne
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / 86400000);
  const declination = -23.45 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const hourAngle = Math.acos(
    -Math.tan(rad * lat) * Math.tan(rad * declination)
  ) / rad;

  const sunriseHour = 12 - hourAngle / 15;
  const sunsetHour = 12 + hourAngle / 15;
  const goldenMorningEnd = sunriseHour + 1;
  const goldenEveningStart = sunsetHour - 1;

  const toTime = (hour) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return new Date(year, month, day, h, m);
  };

  return {
    sunrise: toTime(sunriseHour),
    sunset: toTime(sunsetHour),
    goldenMorningEnd: toTime(goldenMorningEnd),
    goldenEveningStart: toTime(goldenEveningStart),
  };
}

/**
 * SunArcWidget — shows sun position arc, sunrise/sunset, golden hour
 * @param {number} lat - Venue latitude (default Melbourne)
 * @param {number} lng - Venue longitude (default Melbourne)
 */
export default function SunArcWidget({ lat = -37.8136, lng = 144.9631 }) {
  const [now, setNow] = useState(new Date());
  const sunTimes = getSunTimes(lat, lng);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const altitude = getSunPosition(now, lat, lng);
  const isAboveHorizon = altitude > 0;

  // Arc progress: 0 = sunrise, 1 = sunset
  const totalDayMs = sunTimes.sunset - sunTimes.sunrise;
  const elapsedMs = now - sunTimes.sunrise;
  const arcProgress = Math.max(0, Math.min(1, elapsedMs / totalDayMs));

  // Sun dot position on arc
  const arcAngle = arcProgress * Math.PI;
  const sunX = 50 + 40 * Math.cos(Math.PI - arcAngle);
  const sunY = 60 - 40 * Math.sin(arcAngle);

  const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isGoldenHour =
    (now >= sunTimes.sunrise && now <= sunTimes.goldenMorningEnd) ||
    (now >= sunTimes.goldenEveningStart && now <= sunTimes.sunset);

  return (
    <div className="bg-gradient-to-b from-amber-950/50 to-orange-950/30 border border-amber-500/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-amber-400 text-xs font-medium uppercase tracking-wider">Sun Position</p>
        {isGoldenHour && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full animate-pulse">
            ✨ Golden Hour
          </span>
        )}
      </div>

      {/* SVG Sun Arc */}
      <svg viewBox="0 0 100 65" className="w-full">
        {/* Sky gradient */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isAboveHorizon ? '#92400e' : '#1e1b4b'} stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="65" fill="url(#skyGrad)" rx="4" />

        {/* Horizon line */}
        <line x1="10" y1="60" x2="90" y2="60" stroke="#f59e0b" strokeOpacity="0.3" strokeWidth="0.5" />

        {/* Arc path */}
        <path
          d="M 10 60 A 40 40 0 0 1 90 60"
          fill="none"
          stroke="#f59e0b"
          strokeOpacity="0.25"
          strokeWidth="0.8"
          strokeDasharray="2 1"
        />

        {/* Travelled arc (filled) */}
        {arcProgress > 0 && (
          <path
            d={`M 10 60 A 40 40 0 ${arcProgress > 0.5 ? 1 : 0} 1 ${sunX} ${sunY}`}
            fill="none"
            stroke="#f59e0b"
            strokeOpacity="0.7"
            strokeWidth="1"
          />
        )}

        {/* Sun dot */}
        {isAboveHorizon && (
          <>
            <circle cx={sunX} cy={sunY} r="5" fill="#fbbf24" opacity="0.3" />
            <circle cx={sunX} cy={sunY} r="3" fill="#fbbf24" />
          </>
        )}

        {/* Sunrise label */}
        <text x="10" y="65" fontSize="4" fill="#f59e0b" opacity="0.7" textAnchor="middle">{fmt(sunTimes.sunrise)}</text>
        {/* Sunset label */}
        <text x="90" y="65" fontSize="4" fill="#f59e0b" opacity="0.7" textAnchor="middle">{fmt(sunTimes.sunset)}</text>
      </svg>

      {/* Golden hour info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-amber-500/10 rounded-xl px-3 py-2">
          <p className="text-amber-500/60">🌅 Morning Gold</p>
          <p className="text-amber-300 font-medium">{fmt(sunTimes.sunrise)} – {fmt(sunTimes.goldenMorningEnd)}</p>
        </div>
        <div className="bg-amber-500/10 rounded-xl px-3 py-2">
          <p className="text-amber-500/60">🌇 Evening Gold</p>
          <p className="text-amber-300 font-medium">{fmt(sunTimes.goldenEveningStart)} – {fmt(sunTimes.sunset)}</p>
        </div>
      </div>

      <p className="text-white/30 text-xs text-center">
        Altitude: {altitude.toFixed(1)}° {isAboveHorizon ? '☀️ Above horizon' : '🌑 Below horizon'}
      </p>
    </div>
  );
}

import React, { useState, useEffect } from 'react';

function getWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

export default function HourlyForecastStrip({ lat, lng }) {
  const [hourly, setHourly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sunshineMinsToday, setSunshineMinsToday] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;
    setLoading(true);
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly: 'temperature_2m,weathercode,precipitation_probability,cloudcover,windgusts_10m,precipitation,visibility,sunshine_duration',
      timezone: 'auto',
      forecast_days: '1',
    });
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!data?.hourly?.time) return;
        const now = new Date();
        const rows = data.hourly.time
          .map((t, i) => ({
            time: new Date(t),
            temp: Math.round(data.hourly.temperature_2m[i]),
            code: data.hourly.weathercode[i],
            precip: data.hourly.precipitation_probability[i] ?? 0,
            clouds: data.hourly.cloudcover[i] ?? 0,
            gusts: Math.round(data.hourly.windgusts_10m[i] ?? 0),
            rainMm: (data.hourly.precipitation[i] ?? 0).toFixed(1),
            visibility: Math.round((data.hourly.visibility[i] ?? 10000) / 1000),
            sunshineMins: Math.round(data.hourly.sunshine_duration[i] ?? 0) / 60,
          }))
          .filter(r => r.time >= now)
          .slice(0, 12);
        setHourly(rows);

        const totalSunshineMins = data.hourly.sunshine_duration
          ?.slice(0, 24)
          .reduce((a, b) => a + (b ?? 0), 0) / 60 ?? 0;
        setSunshineMinsToday(Math.round(totalSunshineMins));
      })
      .catch(() => setHourly([]))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 px-3 pt-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-14 h-20 bg-amber-500/10 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!hourly.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {sunshineMinsToday !== null && (
        <div className="flex items-center gap-2 px-3">
          <span className="text-amber-400 text-[11px] font-black">☀️</span>
          <span className="text-amber-300 text-[11px] font-black">
            {sunshineMinsToday >= 60
              ? `${(sunshineMinsToday / 60).toFixed(1)} hrs direct sun today`
              : `${sunshineMinsToday} mins direct sun today`}
          </span>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-3 pt-1">
        {hourly.map((hour, i) => {
          const isGolden = hour.clouds < 20 && hour.precip < 20;
          return (
            <div
              key={i}
              className="flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2.5 rounded-2xl transition-all"
              style={{
                background: isGolden ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)',
                border: isGolden ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.08)',
                minWidth: '52px'
              }}
            >
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
                {hour.time.toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(' ', '').toLowerCase()}
              </p>
              <span className="text-base">{getWeatherEmoji(hour.code)}</span>
              <p style={{ fontSize: '13px', color: '#fff', fontWeight: 800 }}>{hour.temp}°</p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>
                {hour.precip}% {hour.gusts > 20 ? `💨${hour.gusts}` : ''}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

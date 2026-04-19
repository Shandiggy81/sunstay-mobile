import React, { useEffect, useState } from 'react';

const SunTimeline = ({ sunData, weatherCode }) => {
  const [nowPct, setNowPct] = useState(null);

  useEffect(() => {
    function calcNow() {
      const now = new Date();
      const h = now.getHours() + now.getMinutes() / 60;
      const pct = Math.min(100, Math.max(0, ((h - 6) / 15) * 100));
      setNowPct(pct);
    }
    calcNow();
    const id = setInterval(calcNow, 60000);
    return () => clearInterval(id);
  }, []);

  if (
    !sunData ||
    typeof sunData.startHour !== 'number' ||
    typeof sunData.endHour !== 'number' ||
    sunData.startHour >= sunData.endHour
  ) return null;

  const timelineStart = 6;
  const timelineEnd = 21;
  const totalHours = timelineEnd - timelineStart;
  const clampedStart = Math.max(timelineStart, sunData.startHour);
  const clampedEnd = Math.min(timelineEnd, sunData.endHour);
  const left = ((clampedStart - timelineStart) / totalHours) * 100;
  const width = ((clampedEnd - clampedStart) / totalHours) * 100;
  if (width <= 0) return null;

  const isRain = weatherCode >= 51;
  const isCloud = weatherCode >= 2 && weatherCode <= 3;
  const barColor = isRain
    ? 'linear-gradient(90deg, #38bdf8, #818cf8)'
    : isCloud
    ? 'linear-gradient(90deg, #94a3b8, #cbd5e1)'
    : 'linear-gradient(90deg, #f59e0b, #f97316, #fbbf24)';

  const hourLabels = ['6a', '9a', '12p', '3p', '6p', '9p'];
  const hourPositions = [0, 20, 40, 60, 80, 100];

  return (
    <div className="w-full mt-1">
      <div className="relative w-full h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {/* Golden window bar */}
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background: barColor,
            boxShadow: isRain ? 'none' : '0 0 12px rgba(245,158,11,0.5)',
          }}
        >
          {/* Shimmer sweep */}
          {!isRain && !isCloud && (
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: 'inherit',
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.4s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* Live cursor dot */}
        {nowPct !== null && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${nowPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: isRain ? '#38bdf8' : '#fbbf24',
              border: '2px solid rgba(255,255,255,0.9)',
              boxShadow: isRain
                ? '0 0 8px rgba(56,189,248,0.8)'
                : '0 0 10px rgba(251,191,36,0.9)',
              zIndex: 10,
            }}
          >
            <div style={{
              position: 'absolute', inset: -4, borderRadius: '50%',
              background: isRain ? 'rgba(56,189,248,0.2)' : 'rgba(251,191,36,0.2)',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
          </div>
        )}
      </div>

      {/* Hour labels */}
      <div className="relative w-full mt-1.5 flex justify-between">
        {hourLabels.map((label, i) => (
          <span key={i} style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
            {label}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default SunTimeline;

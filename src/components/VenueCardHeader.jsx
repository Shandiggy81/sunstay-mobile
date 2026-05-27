import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getWeatherGuaranteeQuote } from '../utils/weatherGuarantee';
import { useWeather } from '../context/WeatherContext';

export default function VenueCardHeader({
  displayName,
  suburb,
  safeVibes,
  directSunHours,
  peakSunWindow,
  onClose,
  dragControls,
  venue,
}) {
  const { getBestWindow } = useWeather();

  // PERF: Memoize the 8-hour look-ahead projection so it only re-runs when
  // weather data actually updates — not on every requestAnimationFrame tick
  // triggered by VenueMap marker sync. getBestWindow is stable within the
  // WeatherProvider closure, so this memo has the same invalidation boundary
  // as the weather fetch cycle (~15 min).
  const projection = useMemo(() => getBestWindow(), [getBestWindow]);

  // Only render the badge when we have a real result (not the fallback UNKNOWN state)
  const showProjection = projection.type === 'CURRENT_PEAK' || projection.type === 'FUTURE_WINDOW';

  // Visual treatment: amber for current peak, sky-blue tint for a future window
  const isFuture = projection.type === 'FUTURE_WINDOW';
  const badgeBorder = isFuture ? 'rgba(14,165,233,0.35)' : 'rgba(245,158,11,0.40)';
  const badgeColor  = isFuture ? '#38BDF8'              : '#F59E0B';

  return (
    <>
      <div
        className="flex justify-center pt-3 pb-0 md:hidden"
        onPointerDown={e => dragControls.start(e)}
        style={{ touchAction: 'none' }}
      >
        <motion.div
          style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(14,165,233,0.35)' }}
          animate={{ scaleX: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        className="flex items-center gap-3"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(12px)',
          background: 'rgba(240,244,248,0.92)',
          borderBottom: '1px solid rgba(14,165,233,0.10)',
          padding: '12px 16px',
          margin: '0 -16px 0',
          borderRadius: '28px 28px 0 0',
        }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 28 }}
      >
        <motion.button
          onClick={onClose}
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.18)' }}
          whileHover={{ scale: 1.08, background: 'rgba(14,165,233,0.14)' }}
          whileTap={{ scale: 0.92 }}
        >
          <ArrowLeft size={18} color="#1E293B" />
        </motion.button>

        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate" style={{ fontSize: '18px', color: '#1E293B' }}>
            {displayName}
          </h1>
          <div className="flex flex-col gap-0.5" style={{ marginTop: 6, marginBottom: 4 }}>
            <span className="font-black leading-tight" style={{ fontSize: 24, color: '#f59e0b', letterSpacing: 0 }}>
              {directSunHours.toFixed(1)} hours direct sun today
            </span>
            {peakSunWindow && (
              <span className="font-bold" style={{ fontSize: 16, color: '#92400E' }}>
                ☀️ Peak sun: {peakSunWindow}
              </span>
            )}
            {showProjection && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, type: 'spring', stiffness: 320, damping: 28 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 4,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(15,15,30,0.72)',
                  border: `1px solid ${badgeBorder}`,
                  backdropFilter: 'blur(8px)',
                  width: 'fit-content',
                }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: badgeColor,
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {projection.label}
                </span>
              </motion.div>
            )}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
            {safeVibes.length ? `${safeVibes.join(', ')} · ${suburb}` : suburb}
          </span>
          {(() => {
            const isOutdoor = !!(venue?.outdoorArea || venue?.rooftop || venue?.beerGarden || venue?.balcony || venue?.outdoorSeating);
            if (!isOutdoor) return null;
            const quote = getWeatherGuaranteeQuote({
              bookingValue: venue?.bookingPrice || 120,
              rainProbability: venue?._weather?.precipProbability ?? 0,
              expectedRainMm: venue?._weather?.rainMm ?? 0,
              cloudCover: venue?._weather?.cloudCover ?? 0,
              isOutdoor,
            });
            if (!quote) return null;
            return (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginTop: 6, marginBottom: 2,
                padding: '3px 9px', borderRadius: 999,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${quote.riskColor}44`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: quote.riskColor, display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: quote.riskColor, letterSpacing: '0.06em' }}>
                  {quote.riskBand} Rain Risk
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', marginLeft: 2 }}>
                  · Rain Guarantee available
                </span>
              </div>
            );
          })()}
        </div>
      </motion.div>
    </>
  );
}

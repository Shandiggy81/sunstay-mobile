import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FEATURE_BADGES } from '../config/features';

const Float = ({ children, delay = 0, range = 6, duration = 4, className = '' }) => (
  <motion.div
    className={className}
    animate={{ y: [0, -range, 0] }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
  >
    {children}
  </motion.div>
);

export default function VenueCardActions({
  verdict,
  safeTags,
  safeVibes,
  isRainStartingSoon,
  minutesUntilRain,
  liveFeaturesForVenue,
  heating,
  actualHappyHour,
  isHotelOrStay,
  cozyWeatherActive,
  setShowOwnerDashboard,
  setSelectedVenue,
  venue,
}) {
  function isHappyHourNow(happyHour) {
    if (!happyHour) return false;
    const now = new Date();
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
    if (!Array.isArray(happyHour.days) || !happyHour.days.includes(day)) return false;
    if (!happyHour.start || !happyHour.end) return false;
    const [sh, sm] = String(happyHour.start).split(':').map(Number);
    const [eh, em] = String(happyHour.end).split(':').map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= sh * 60 + sm && mins < eh * 60 + em;
  }

  return (
    <>
      <motion.div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.20)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="px-4 pt-4 pb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-black uppercase tracking-widest" style={{ fontSize: '14px', color: '#D97706' }}>How's the Vibe? ✨</span>
            <span className="font-semibold" style={{ fontSize: '12px', color: '#64748B' }}>{verdict.icon} {verdict.text}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(safeTags.length ? safeTags : safeVibes.length ? safeVibes : ['Chill']).map((t, i) => (
              <span key={i} className="font-bold whitespace-nowrap" style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '999px', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.18)', color: '#0369A1' }}>{t}</span>
            ))}
          </div>
          <motion.label
            className="flex items-center justify-center gap-2 w-full rounded-2xl cursor-pointer"
            style={{ minHeight: '54px', background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)', border: '1px solid rgba(14,165,233,0.3)', boxShadow: '0 4px 20px rgba(14,165,233,0.25)' }}
            whileTap={{ scale: 0.97 }}
          >
            <motion.span className="font-black" style={{ fontSize: '15px', color: '#FFFFFF' }} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}>📸 Capture the Vibe</motion.span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={() => {}} />
          </motion.label>
        </div>
      </motion.div>

      {setShowOwnerDashboard && (
        <motion.button
          onClick={() => { setShowOwnerDashboard(true); setSelectedVenue(venue); }}
          className="w-full flex items-center justify-center rounded-xl"
          style={{ padding: '8px 0', fontSize: '0.75rem', fontWeight: 700, background: '#0d9488', color: '#fff' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95, background: '#0f766e' }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        >Manage This Venue →</motion.button>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 24 }}
        className="flex items-center gap-2 rounded-2xl px-3 py-2"
        style={{ background: `${verdict.color}0f`, border: `1px solid ${verdict.color}30`, boxShadow: `0 0 24px ${verdict.color}12` }}
      >
        <Float range={3} duration={3} delay={0}><span className="text-xl">{verdict.icon}</span></Float>
        <span className="font-black text-[0.75rem]" style={{ color: verdict.color }}>{verdict.text}</span>
      </motion.div>

      {isRainStartingSoon && minutesUntilRain > 0 && (
        <div className="w-full rounded-full py-2 px-4 mb-4 flex items-center justify-center shadow-lg" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <span className="font-semibold text-sm" style={{ color: '#D97706' }}>⚠️ Rain expected in {minutesUntilRain} mins</span>
        </div>
      )}

      {(liveFeaturesForVenue?.fireplaceOn || liveFeaturesForVenue?.heatersOn) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 0 24px rgba(239,68,68,0.10)' }}
        >
          <motion.span className="text-xl" animate={{ scale: [1, 1.2, 0.95, 1.15, 1], rotate: [-4, 4, -3, 3, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>🔥</motion.span>
          <span className="font-black text-sm" style={{ color: '#DC2626' }}>
            {liveFeaturesForVenue?.fireplaceOn ? 'Fireplace Active — On Now' : 'Outdoor Heaters — On Now'}
          </span>
        </motion.div>
      )}

      {heating && !['no heating','indoor only','heated outdoor'].includes(heating) && (
        <Float range={4} duration={4} delay={0.1}>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
            <motion.span className="text-xl" animate={{ scale: [1, 1.15, 0.95, 1.1, 1], rotate: [-3, 3, -2, 2, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>🔥</motion.span>
            <span className="text-sm font-black" style={{ color: '#D97706' }}>
              {heating === 'electric-fireplace' ? 'Premium Electric Fireplace' : heating === 'traditional-fireplace' ? 'Traditional Gas Fireplace' : 'Fireplace Active'}
            </span>
          </div>
        </Float>
      )}

      {actualHappyHour && !isHotelOrStay && (
        <Float range={3} duration={6} delay={0.4}>
          <div className="flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.18)' }}>
            <div>
              <span className="text-orange-500 text-[0.7rem] font-black uppercase tracking-widest block mb-0.5">🍻 Happy Hour · {actualHappyHour.start} – {actualHappyHour.end}</span>
              <span className="font-black text-[15px]" style={{ color: '#1E293B' }}>{actualHappyHour.deal}</span>
            </div>
            {isHappyHourNow(actualHappyHour) && (
              <motion.span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ml-3 flex-shrink-0" style={{ background: '#F97316', color: '#fff' }} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>LIVE</motion.span>
            )}
          </div>
        </Float>
      )}

      {liveFeaturesForVenue && Object.values(liveFeaturesForVenue).some(Boolean) && (
        <div className="flex flex-wrap gap-2 rounded-2xl p-3" style={{ background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.10)' }}>
          {Object.entries(liveFeaturesForVenue).map(([key, active], i) =>
            active && FEATURE_BADGES[key] ? (
              <Float key={key} range={2} duration={4 + i * 0.3} delay={i * 0.05}>
                <span className="text-[10px] font-black px-3 py-1.5 rounded-full" style={{ background: 'rgba(14,165,233,0.08)', color: '#0369A1', border: '1px solid rgba(14,165,233,0.18)' }}>{FEATURE_BADGES[key]}</span>
              </Float>
            ) : null
          )}
        </div>
      )}

      {cozyWeatherActive && (
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)' }}>
          <Float range={4} duration={4}><span>☕</span></Float>
          <span className="text-sm font-black" style={{ color: '#6366F1' }}>Cozy Indoor · Heaters · Shelter</span>
        </div>
      )}
    </>
  );
}

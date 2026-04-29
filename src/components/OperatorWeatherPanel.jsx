import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
export default function OperatorWeatherPanel({ venue, quote }) {
  const [open, setOpen] = useState(false);
  if (!quote) return null;
  const bookingValue  = venue?.bookingPrice || 120;
  const attachRate    = quote.riskBand === 'High' ? 68 : quote.riskBand === 'Medium' ? 44 : 22;
  const projectedMonthly = Math.round(bookingValue * (attachRate / 100) * 18 * (quote.pct));
  const riskColor     = quote.riskColor;
  return (
    <div className="mt-3 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏢</span>
          <div className="text-left">
            <p className="text-[10px] uppercase tracking-widest font-black text-white/40">Operator Intelligence</p>
            <p className="text-[13px] font-bold text-white">Revenue + Weather Protection</p>
          </div>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/40 text-lg"
        >
          ↓
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16,1,0.3,1] }}
            className="overflow-hidden"
          >
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2 px-4 pb-3">
              {[
                { label: 'Guarantee Attach Rate', value: `${attachRate}%`, sub: `${quote.riskBand} risk days`, color: riskColor },
                { label: 'Protected Revenue', value: `$${projectedMonthly}`, sub: 'est. / month', color: '#34D399' },
                { label: 'Risk Band Today', value: quote.riskBand, sub: `${Math.round(quote.pct * 100)}% premium`, color: riskColor },
              ].map(k => (
                <div key={k.label} className="rounded-xl px-3 py-2.5 text-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[9px] text-white/40 uppercase tracking-wider leading-tight mb-1">{k.label}</p>
                  <p className="text-[16px] font-black" style={{ color: k.color }}>{k.value}</p>
                  <p className="text-[9px] text-white/40 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>
            {/* Pitch copy */}
            <div className="mx-4 mb-4 rounded-xl px-3 py-3"
              style={{ background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.18)' }}>
              <p className="text-[11px] font-bold text-white/80 mb-1.5">
                💡 Why Weather Guarantees convert
              </p>
              <p className="text-[11px] leading-relaxed text-white/60">
                Venues using Weather Guarantees see up to <span className="text-sky-300 font-bold">32% higher conversion</span> on outdoor bookings during medium-to-high risk windows. Guests book with confidence — and you keep the revenue even on borderline weather days.
              </p>
              <p className="text-[10px] mt-2 font-semibold text-sky-400">
                Powered by Sunstay Weather Intelligence · {venue?.suburb ?? 'Melbourne'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

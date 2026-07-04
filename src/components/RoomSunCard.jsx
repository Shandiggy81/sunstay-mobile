import React from 'react';
import { motion } from 'framer-motion';

export default function RoomSunCard({ room }) {
  if (!room) return null;

  const {
    name,
    orientation,
    floorLevel,
    sunScore,
    sunProfile,
    baseNightlyRateDemo
  } = room;

  const pct = Math.max(0, Math.min(100, sunScore || 0));

  const { bg, border, text, fill } = pct >= 75
    ? { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.28)', text: '#065F46', fill: '#10B981' }
    : pct >= 50
    ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', text: '#92400E', fill: '#F59E0B' }
    : { bg: 'rgba(14,165,233,0.07)', border: 'rgba(14,165,233,0.22)', text: '#0C4A6E', fill: '#0EA5E9' };

  return (
    <motion.div
      className="rounded-2xl p-4 flex flex-col gap-3 mb-3"
      style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-black text-slate-800 text-[15px]">{name}</h4>
          <p className="text-slate-500 text-[12px] font-semibold mt-0.5">
            Level {floorLevel} &bull; {orientation} facing
          </p>
        </div>
        <div className="text-right">
          <span className="font-black text-slate-800">${baseNightlyRateDemo}</span>
          <span className="text-slate-500 text-[10px] block">/ night</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1" style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '8px 12px' }}>
        <div className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="3" />
            <motion.circle
              cx="18" cy="18" r="15" fill="none"
              stroke={fill} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 15}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 15 * (1 - pct / 100) }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-black leading-none" style={{ color: text }}>{pct}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: text }}>Sun Score</span>
          <p className="text-[13px] font-semibold mt-0.5 text-slate-700 leading-tight">
            {sunProfile?.peakTime && `Peak sun: ${sunProfile.peakTime}`}
          </p>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            {sunProfile?.useCase && `Ideal for ${sunProfile.useCase.toLowerCase()}`}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

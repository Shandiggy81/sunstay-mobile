import React from 'react';
import { Shield, CloudRain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const WeatherGuaranteeToggle = ({ enabled, onToggle, quote }) => {
  if (!quote) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mb-4 rounded-2xl border p-4 transition-all duration-300 ${
        enabled 
          ? 'bg-sky-500/15 border-sky-400/40 shadow-[0_0_20px_rgba(56,189,248,0.15)]' 
          : 'bg-white/5 border-white/10 backdrop-blur-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-2 ${enabled ? 'bg-sky-400/20 text-sky-400' : 'bg-white/10 text-white/50'}`}>
            {enabled ? <Shield size={18} /> : <CloudRain size={18} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-bold text-[14px] ${enabled ? 'text-sky-300' : 'text-white'}`}>
                Weather Guarantee
              </h3>
              <span 
                className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ 
                  backgroundColor: `${quote.riskColor}20`,
                  color: quote.riskColor,
                  border: `1px solid ${quote.riskColor}40`
                }}
              >
                {quote.riskBand} Risk
              </span>
            </div>
            <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
              <span className="text-[15px] font-black text-white">
                +${quote.price}
                <span className="text-[10px] font-normal text-white/40 ml-1">
                  ({Math.round(quote.pct * 100)}% · {quote.riskBand} risk)
                </span>
              </span>
              {!enabled && ` to your booking. ${quote.trigger}`}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            enabled ? 'bg-sky-500' : 'bg-white/20'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div
              className="mt-3 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.18)' }}
            >
              <p className="text-[11px] font-bold text-white/90 mb-1.5">✓ How it works</p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
                {quote.trigger}
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-[9px] uppercase tracking-wider text-white/40">Payout method</p>
                  <p className="text-[11px] font-bold text-white/80 mt-0.5">Automatic · No claim needed</p>
                </div>
                <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-[9px] uppercase tracking-wider text-white/40">Data source</p>
                  <p className="text-[11px] font-bold text-white/80 mt-0.5">Sunstay Weather Intel</p>
                </div>
              </div>
              <p className="text-[10px] mt-2 font-semibold" style={{ color: '#38BDF8' }}>
                Powered by Sunstay Weather Intelligence · {quote.riskBand} risk today
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default WeatherGuaranteeToggle;

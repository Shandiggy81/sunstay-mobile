import React from 'react';
import { Shield, CloudRain } from 'lucide-react';
import { motion } from 'framer-motion';

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
              <strong className={enabled ? 'text-sky-200' : 'text-white'}>+${quote.price} to your booking.</strong> {quote.trigger}
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
    </motion.div>
  );
};

export default WeatherGuaranteeToggle;

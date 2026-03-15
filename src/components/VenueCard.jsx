import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Share2, Wind, Droplets, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { getSunPositionForMap } from '../util/sunPosition';

// Helper to calc outdoor sun hours for hotels/airbnbs
function calcOutdoorSun(venue, hourlyData) {
  if (!hourlyData || !hourlyData.time) return { balcony: 0, pool: 0 };
  let balconyHours = 0;
  let poolHours = 0;
  
  for (let i = 0; i < hourlyData.time.length; i++) {
    const time = new Date(hourlyData.time[i]);
    const irrad = hourlyData.direct_normal_irradiance[i];
    const { altitude } = getSunPositionForMap(venue.lat, venue.lng, time);
    
    if (irrad > 120) {
      if (altitude > 15) balconyHours++;
      if (altitude > 20) poolHours++;
    }
  }
  
  return { balcony: balconyHours, pool: poolHours };
}

const RadialGauge = ({ score, temp, wind }) => {
  const radius = 34;
  const stroke = 6;
  const normalizedScore = Math.max(0, Math.min(100, score));
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-[84px] h-[84px] flex-shrink-0">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <motion.circle
          cx="50" cy="50" r={radius} fill="none"
          stroke="url(#sunGradient)" strokeWidth={stroke}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="sunGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fca5a5" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex flex-col items-center justify-center text-center -mt-1">
        <span className="text-xl font-black text-white leading-none">{temp}&deg;</span>
        <span className="text-[8px] text-white/60 font-medium uppercase tracking-widest mt-0.5">{wind} km/h</span>
      </div>
    </div>
  );
};

const HourlyTimeline = ({ hourlyData }) => {
  if (!hourlyData || !hourlyData.time) return null;
  const now = new Date();
  const currentHour = now.getHours();
  const indices = [0,1,2,3,4,5].map(i => Math.min(23, currentHour + i));

  return (
    <div className="flex justify-between items-end mt-4 px-1 relative h-20">
      <svg className="absolute inset-0 w-full h-full z-0" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M 0 80 Q 50 10 100 80" fill="none" stroke="rgba(245, 158, 11, 0.2)" strokeWidth="2" strokeDasharray="4 4" />
      </svg>
      {indices.map((idx, i) => {
        const time = new Date(hourlyData.time[idx]);
        const irrad = hourlyData.direct_normal_irradiance[idx];
        const temp = Math.round(hourlyData.temperature_2m[idx]);
        const isSun = irrad > 120;
        const isPartial = irrad > 40 && irrad <= 120;
        const icon = isSun ? '☀️' : (isPartial ? '⛅' : '☁️');
        
        const heightPercent = Math.sin((i / 5) * Math.PI) * 100;
        
        return (
          <motion.div 
            key={i}
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 * i }}
            className="flex flex-col items-center z-10 w-8"
            style={{ transform: `translateY(-${heightPercent * 0.45}px)` }}
          >
            <span className="text-[9px] text-white/50 mb-1 font-bold">{time.getHours()}:00</span>
            <motion.div 
              whileHover={{ rotate: [0, -10, 10, 0], scale: 1.2 }}
              className="text-lg my-0.5 filter drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] cursor-[help]"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {icon}
            </motion.div>
            <span className="text-[10px] font-black text-white mt-0.5">{temp}&deg;</span>
          </motion.div>
        );
      })}
    </div>
  );
};

export default function VenueCard({ venue, weather, onClose, onCenter }) {
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (panelExpanded) {
      const t = setTimeout(() => setPanelExpanded(false), 5000);
      return () => clearTimeout(t);
    }
  }, [panelExpanded]);

  if (!venue) return null;

  const {
    venueName: name, typeCategory: type, suburb,
    distance, image, tags = []
  } = venue;

  // Use raw weather data passed through from context
  const hourlyData = weather?.rawWeather?.hourlyData;
  const temp = weather?.rawWeather?.temperature || 22;
  const wind = weather?.rawWeather?.windSpeed || 10;
  const score = weather?.rawWeather?.sunScore ?? 75;
  const isHotelOrStay = type === 'Hotel' || type === 'ShortStay';

  // Calculate dynamic outdoor features based on demo venue types
  const isPoolMatch = name.toLowerCase().includes('pool') || tags.some(t => t.toLowerCase() === 'pool');
  const hasBalconyMatch = name.toLowerCase().includes('balcony') || tags.some(t => t.toLowerCase() === 'balcony') || true;

  const outdoorSun = isHotelOrStay ? calcOutdoorSun(venue, hourlyData) : null;
  
  // Try to define weather conditions properly
  let weatherCondition = 'clear';
  if (weather?.weather && weather.weather[0] && weather.weather[0].main) {
     weatherCondition = weather.weather[0].main.toLowerCase();
  } else if (weather?.rawWeather?.weatherCode !== undefined) {
     // Use open-meteo proxy if weather context is missing parsing
     const code = weather.rawWeather.weatherCode;
     if (code >= 51 && code <= 95) weatherCondition = 'rain';
     else if (code >= 1 && code <= 3) weatherCondition = 'cloudy';
  }
  const isRain = weatherCondition.includes('rain') || weatherCondition.includes('shower');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%', opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: '100%', opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="fixed bottom-0 left-0 right-0 z-[99999] md:bottom-auto md:top-1/2 md:left-auto md:right-4 md:-translate-y-1/2 md:w-[380px] pointer-events-none"
      >
        <div className="pointer-events-auto relative glass-card rounded-t-[32px] md:rounded-3xl overflow-hidden shadow-2xl border border-white/10 select-none m-2 md:m-0">
          
          <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 bg-[#0f111a]">
            {isRain ? (
              <motion.div 
                 animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }} 
                 transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} 
                 className="absolute inset-0 bg-blue-600/20 blur-[60px]" 
              />
            ) : (
              <motion.div 
                 animate={{ scale: [1, 1.15, 1], rotate: [0, 10, -5, 0] }} 
                 transition={{ repeat: Infinity, duration: 10, ease: 'linear' }} 
                 className="absolute -top-16 -right-16 w-72 h-72 bg-amber-500/20 blur-[70px] rounded-full" 
              />
            )}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmZiIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-50" />
          </div>

          <div className="relative z-10 p-5 pt-6 pb-6">
            <div className="w-12 h-1.5 rounded-full bg-white/10 absolute top-3 left-1/2 -translate-x-1/2 md:hidden" />

            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-3.5 flex-1 pr-2">
                <motion.div 
                  whileHover={{ rotateY: 180, scale: 1.1 }} 
                  transition={{ duration: 0.6 }}
                  className="w-[52px] h-[52px] flex-shrink-0 flex items-center justify-center text-[28px] bg-gradient-to-br from-white/10 to-white/5 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-white/20" 
                  style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
                >
                  <div style={{ transform: 'translateZ(10px)' }}>{venue.emoji}</div>
                </motion.div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-white text-[17px] leading-tight truncate drop-shadow-md">{name}</h3>
                  <div className="text-white/50 text-[11px] font-semibold mt-1 uppercase tracking-widest truncate">
                    {type || venue.vibe} &middot; {suburb}
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/20 hover:text-white transition-all border border-white/5"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            <motion.div 
              ref={panelRef}
              className="bg-[#1a1b26]/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 cursor-pointer relative overflow-hidden group shadow-inner"
              onClick={() => setPanelExpanded(!panelExpanded)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex justify-between items-center relative z-10">
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="text-white font-extrabold text-[13px] tracking-wide flex items-center gap-1.5">
                      <span className="text-amber-400">⚡</span> Sun Intelligence
                    </h4>
                  </div>
                  {isHotelOrStay && outdoorSun && (outdoorSun.balcony > 0 || outdoorSun.pool > 0) ? (
                    <div className="flex flex-col gap-1 mt-2">
                      <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Outdoor Sun Exposure</div>
                      <div className="flex gap-2 text-[11px] font-bold">
                        {outdoorSun.balcony > 0 && <span className="bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/20">Balcony: {outdoorSun.balcony}h</span>}
                        {outdoorSun.pool > 0 && <span className="bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-500/20">Pool: {outdoorSun.pool}h</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-white/60 font-medium leading-relaxed mt-1">
                      {isRain ? "Limited sun today. Great for indoor activities." : "Excellent conditions for outdoor seating and drinks."}
                    </div>
                  )}
                </div>
                
                <RadialGauge score={score} temp={Math.round(temp)} wind={Math.round(wind)} />
              </div>

              <AnimatePresence>
                {panelExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'circOut' }}
                    className="overflow-hidden border-t border-white/10 mt-4 pt-2 relative"
                  >
                    <div className="absolute top-2 right-0 text-[9px] text-white/30 uppercase tracking-widest font-bold">Hourly Path</div>
                    <HourlyTimeline hourlyData={hourlyData} />
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 opacity-30 group-hover:opacity-100 transition-opacity">
                {!panelExpanded && <div className="w-10 h-1 rounded-full bg-white/40" />}
              </div>
            </motion.div>

            <div className="flex flex-wrap gap-2 mt-4">
              {wind < 15 && !isRain && <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg flex items-center gap-1.5"><Shield size={10} /> Event-Ready ☀️</span>}
              {(new Date().getHours() >= 16 && new Date().getHours() <= 19) && !isRain && <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20 rounded-lg flex items-center gap-1.5"><span className="text-[10px]">⛅</span> Photo Prime</span>}
              {outdoorSun && outdoorSun.balcony > 4 && <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/20 rounded-lg">High Sun Score</span>}
            </div>

            <div className="flex gap-2.5 mt-5">
              <motion.button 
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                onClick={() => onCenter && onCenter(venue)}
                className="flex-[3] flex items-center justify-center py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-[13px] uppercase tracking-wide shadow-[0_4px_20px_rgba(245,158,11,0.25)] border border-white/10"
              >
                Book with Sun
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.15)' }} 
                whileTap={{ scale: 0.9 }}
                className="flex-[1] flex items-center justify-center rounded-xl bg-white/5 text-white/80 transition-all border border-white/10"
              >
                <Share2 size={16} />
              </motion.button>
            </div>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

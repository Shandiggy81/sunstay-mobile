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

const RadialGauge = ({ score, temp, wind, dark }) => {
  const radius = 34;
  const stroke = 6;
  const normalizedScore = Math.max(0, Math.min(100, score));
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-[84px] h-[84px] flex-shrink-0">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke={dark ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.1)"} strokeWidth={stroke} />
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
        <span className={`text-xl font-black ${dark ? "text-[#1A1A1A]" : "text-white"} leading-none`}>{temp}&deg;</span>
        <span className={`text-[8px] ${dark ? "text-[#4A4A4A]/60" : "text-white/60"} font-medium uppercase tracking-widest mt-0.5`}>{wind} km/h</span>
      </div>
    </div>
  );
};

const HourlyTimeline = ({ hourlyData, dark }) => {
  if (!hourlyData || !hourlyData.time) return null;
  const now = new Date();
  const currentHour = now.getHours();
  const indices = [0,1,2,3,4,5].map(i => Math.min(23, currentHour + i));

  return (
    <div className="flex justify-between items-end mt-4 px-1 relative h-20">
      <svg className="absolute inset-0 w-full h-full z-0" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M 0 80 Q 50 10 100 80" fill="none" stroke={dark ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.2)"} strokeWidth="2" strokeDasharray="4 4" />
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
            <span className={`text-[9px] ${dark ? "text-[#4A4A4A]/50" : "text-white/50"} mb-1 font-bold`}>{time.getHours()}:00</span>
            <motion.div 
              whileHover={{ rotate: [0, -10, 10, 0], scale: 1.2 }}
              className={`text-lg my-0.5 filter cursor-[help] ${isSun ? 'drop-shadow-[0_0_12px_rgba(245,158,11,0.6)] text-[#F59E0B]' : (dark ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]' : 'drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]')}`}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {icon}
            </motion.div>
            <span className={`text-[10px] font-black ${dark ? "text-[#1A1A1A]" : "text-white"} mt-0.5`}>{temp}&deg;</span>
          </motion.div>
        );
      })}
    </div>
  );
};

export default function VenueCard({ venue, weather, onClose, onCenter, cozyWeatherActive }) {
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
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
        <div 
          style={{ 
            backgroundColor: '#FFFDF5',
            boxShadow: '0 -4px 20px rgba(59, 130, 246, 0.08)'
          }}
          className="pointer-events-auto relative rounded-t-[32px] md:rounded-3xl overflow-hidden md:shadow-2xl border border-black/5 select-none m-2 md:m-0"
        >
          
          <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10" style={{ backgroundColor: '#FFFDF5' }}>
            {isRain ? (
              <motion.div 
                 animate={{ scale: [1, 1.05, 1], opacity: [0.1, 0.2, 0.1] }} 
                 transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} 
                 className="absolute inset-0 bg-blue-600/10 blur-[60px]" 
              />
            ) : (
              <motion.div 
                 animate={{ scale: [1, 1.15, 1], rotate: [0, 10, -5, 0] }} 
                 transition={{ repeat: Infinity, duration: 10, ease: 'linear' }} 
                 className="absolute -top-16 -right-16 w-72 h-72 bg-amber-500/10 blur-[70px] rounded-full" 
              />
            )}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMwMDAwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMiIvPjwvc3ZnPg==')] opacity-30" />
          </div>

          <div className="relative z-10 p-5 pt-7 pb-6">
            {/* Premium Mobile Pull Handle */}
            <div 
              style={{
                width: '48px',
                height: '6px',
                borderRadius: '999px',
                backgroundColor: '#F59E0B',
                margin: '12px auto 8px',
                display: 'block',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                opacity: 1,
                flexShrink: 0
              }}
              className="md:hidden" 
            />

            <div 
              style={{
                background: '#EFF6FF',
                borderLeft: '4px solid #3B82F6',
                padding: '12px 16px'
              }}
              className="flex justify-between items-start mb-5"
            >
              <div className="flex items-center gap-3.5 flex-1 pr-2">
                <motion.div 
                   whileHover={{ rotateY: 180, scale: 1.1 }} 
                   transition={{ duration: 0.6 }}
                   className="w-[52px] h-[52px] flex-shrink-0 flex items-center justify-center text-[28px] bg-[#FFFFFF] rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-black/5" 
                   style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
                >
                  <div style={{ transform: 'translateZ(10px)' }}>{venue.emoji}</div>
                </motion.div>
                <div className="min-w-0">
                  <h3 className="text-[#1A1A1A] text-[18px] leading-tight truncate" style={{ fontWeight: 800 }}>{name}</h3>
                  <div className="text-[#4A4A4A] text-[12px] font-semibold mt-1 uppercase tracking-widest truncate">
                    {type || venue.vibe} &middot; {suburb}
                  </div>
                  <div className="text-amber-600 text-[11px] font-bold mt-1 tracking-wide">
                    Wind {Math.round(wind)}kmh &nbsp;|&nbsp; {isRain ? '80%' : '20%'} rain &nbsp;|&nbsp; Sunny til 6pm
                  </div>
                </div>
              </div>
            </div>
            {/* High Contrast Close Button for Light Mode */}
            <button onClick={onClose} className="absolute top-3 right-3 z-50 bg-black/5 hover:bg-black/10 rounded-full p-2 text-[#1A1A1A] transition-colors" aria-label="Close">
              <X size={18} strokeWidth={2.5} />
            </button>

            <motion.div 
              ref={panelRef}
              className="bg-white border border-black/5 rounded-2xl p-4 cursor-pointer relative overflow-hidden group shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              onClick={() => setPanelExpanded(!panelExpanded)}
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
            >
              <div className="flex justify-between items-center relative z-10">
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="text-[#1A1A1A] font-extrabold text-[13px] tracking-wide flex items-center gap-1.5">
                      <span className="text-amber-500">⚡</span> Sun Intelligence
                    </h4>
                  </div>
                  {isHotelOrStay && outdoorSun && (outdoorSun.balcony > 0 || outdoorSun.pool > 0) ? (
                    <div className="flex flex-col gap-1 mt-2">
                      <div className="text-[10px] text-[#4A4A4A]/60 font-bold uppercase tracking-wider">Outdoor Sun Exposure</div>
                      <div className="flex gap-2 text-[11px] font-bold">
                        {outdoorSun.balcony > 0 && <span className="bg-amber-500/5 text-amber-700 px-2 py-0.5 rounded-md border border-amber-500/10">Balcony: {outdoorSun.balcony}h</span>}
                        {outdoorSun.pool > 0 && <span className="bg-cyan-500/5 text-cyan-700 px-2 py-0.5 rounded-md border border-cyan-500/10">Pool: {outdoorSun.pool}h</span>}
                      </div>

                      {cozyWeatherActive && (
                        <div className="bg-orange-500/5 text-orange-800 px-3 py-1 rounded-lg border border-orange-500/10 text-[10px] font-bold mt-2 flex items-center gap-2">
                           ☕ Cozy Indoor | Heaters lit | Rain shelter | Cozy Score 92/100
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 mt-2">
                      <div className="text-[12px] text-[#4A4A4A] font-medium leading-relaxed">
                        {isRain ? "Limited sun today. Great for indoor activities." : "Excellent conditions for outdoor seating and drinks."}
                      </div>
                      {cozyWeatherActive && (
                        <div className="bg-orange-500/5 text-orange-800 px-3 py-1 rounded-lg border border-orange-500/10 text-[10px] font-bold mt-1 flex items-center gap-2 w-fit">
                           ☕ Cozy Indoor | Heaters lit | Rain shelter | Cozy Score 92/100
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Gauge update for Light Mode */}
                <div className="flex-shrink-0 bg-white rounded-2xl p-1 shadow-sm border border-black/5">
                    <RadialGauge score={score} temp={Math.round(temp)} wind={Math.round(wind)} dark />
                </div>
              </div>

              <AnimatePresence>
                {panelExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'circOut' }}
                    className="overflow-hidden border-t border-black/5 mt-4 pt-2 relative"
                  >
                    <div className="absolute top-2 right-0 text-[9px] text-[#4A4A4A]/40 uppercase tracking-widest font-bold">Hourly Path</div>
                    <HourlyTimeline hourlyData={hourlyData} dark />
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 opacity-20 group-hover:opacity-40 transition-opacity">
                {!panelExpanded && <div className="w-10 h-1 rounded-full bg-black/20" />}
              </div>
            </motion.div>

            <div className="flex flex-wrap gap-2 mt-4">
              {wind < 15 && !isRain && <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-700 border border-emerald-500/10 rounded-lg flex items-center gap-1.5"><Shield size={10} /> Event-Ready ☀️</span>}
              {(new Date().getHours() >= 16 && new Date().getHours() <= 19) && !isRain && <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-fuchsia-500/10 text-fuchsia-800 border border-fuchsia-500/10 rounded-lg flex items-center gap-1.5"><span className="text-[10px]">⛅</span> Photo Prime</span>}
              {outdoorSun && outdoorSun.balcony > 4 && <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-700 border border-amber-500/10 rounded-lg">High Sun Score</span>}
            </div>

            <div className="flex gap-2.5 mt-5">
              <motion.button 
                whileHover={{ scale: 1.02, filter: 'brightness(1.05)' }} whileTap={{ scale: 0.96 }}
                onClick={() => onCenter && onCenter(venue)}
                className="flex-[3] flex items-center justify-center py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-[14px] uppercase tracking-wide shadow-[0_8px_24px_rgba(245,158,11,0.3)]"
              >
                Book with Sun
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(0,0,0,0.05)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setDemoModalOpen(true)}
                className="flex-[2] flex items-center justify-center gap-1.5 rounded-xl bg-black/[0.03] text-[#1A1A1A] font-bold text-[12px] border border-black/5 transition-all"
              >
                <span>📸</span> Demo Photo
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(0,0,0,0.08)' }} 
                whileTap={{ scale: 0.9 }}
                className="w-[48px] flex items-center justify-center rounded-xl bg-black/[0.03] text-[#1A1A1A]/70 transition-all border border-black/5 flex-shrink-0"
              >
                <Share2 size={18} />
              </motion.button>
            </div>

          </div>
        </div>

        {/* Demo Photo Modal */}
        <AnimatePresence>
          {demoModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto"
              onClick={() => setDemoModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#1a1b26] border border-white/20 rounded-3xl overflow-hidden shadow-2xl max-w-sm w-full relative"
                onClick={e => e.stopPropagation()}
              >
                <div className="absolute top-3 right-3 z-10">
                  <button onClick={() => setDemoModalOpen(false)} className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                    <X size={16} />
                  </button>
                </div>
                <div className="relative aspect-[4/5] w-full bg-gray-900">
                  <img 
                    src="https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&q=80&w=800" 
                    alt="Demo venue view" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
                    <div className="inline-flex gap-2 items-center bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-3 py-1 mb-2">
                      <span className="text-[11px] font-bold text-white">📸 Verified Sunny at 3pm</span>
                    </div>
                    <h3 className="text-white font-extrabold text-xl">{name}</h3>
                    <p className="text-white/80 text-sm mt-1">Perfect lighting verified by the Sunstay community.</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

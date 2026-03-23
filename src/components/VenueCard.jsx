import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Share2, Wind, Droplets, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { getSunPositionForMap } from '../util/sunPosition';

// Helper to check if happy hour is live
function isHappyHourNow(happyHour) {
  if (!happyHour) return false;
  const now = new Date();
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
  if (!happyHour.days.includes(day)) return false;
  const [sh, sm] = happyHour.start.split(':').map(Number);
  const [eh, em] = happyHour.end.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

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
  const isPoolMatch = (name || '').toLowerCase().includes('pool') || tags.some(t => (t || '').toLowerCase() === 'pool');
  const hasBalconyMatch = (name || '').toLowerCase().includes('balcony') || tags.some(t => (t || '').toLowerCase() === 'balcony') || true;

  const outdoorSun = isHotelOrStay ? calcOutdoorSun(venue, hourlyData) : null;

  // Generate sun hours for ALL venue types
  const getSunHoursForVenue = () => {
    if (isHotelOrStay && outdoorSun && (outdoorSun.balcony > 0 || outdoorSun.pool > 0)) {
      return { outdoor: `${outdoorSun.balcony}h`, covered: `${outdoorSun.pool}h`, labels: { outdoor: 'Balcony', covered: 'Pool' } };
    }

    // Generate sensible demo values for other venue types
    const baseOutdoor = Math.floor(6 + Math.random() * 4); // 6-10h
    const baseCovered = Math.floor(4 + Math.random() * 4); // 4-8h

    return {
      outdoor: `${baseOutdoor}h`,
      covered: `${baseCovered}h`,
      labels: { outdoor: 'Outdoor', covered: 'Covered' }
    };
  };

  const sunHours = getSunHoursForVenue();
  
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

  // Determine border accent color
  const getBorderAccent = () => {
    if (score > 75) return '#F97316'; // orange for sunny
    if (wind > 20) return '#14B8A6'; // teal for windy
    return '#64748B'; // blue-grey for cloudy
  };

  const borderAccent = getBorderAccent();

  // Calculate Sun Score badge
  const getSunScoreBadge = () => {
    if (score > 75) return { emoji: '☀️', color: '#10B981', label: 'Sun Score' };
    if (score >= 50) return { emoji: '🌤', color: '#F59E0B', label: 'Sun Score' };
    return { emoji: '☁️', color: '#9CA3AF', label: 'Sun Score' };
  };

  const sunScoreBadge = getSunScoreBadge();

  // Get category emoji
  const getCategoryEmoji = () => {
    const suburbLower = (suburb || '').toLowerCase();
    const nameLower = (name || '').toLowerCase();
    const typeLower = (type || '').toLowerCase();

    if (suburbLower.includes('cbd')) return '🏙️';
    if (suburbLower.includes('st kilda') || suburbLower.includes('beach')) return '🏖️';
    if (nameLower.includes('garden') || nameLower.includes('park') || typeLower.includes('garden')) return '🌿';
    if (typeLower.includes('pub') || typeLower.includes('bar')) return '🍺';
    return '';
  };

  const categoryEmoji = getCategoryEmoji();

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
                borderLeft: `4px solid ${borderAccent}`,
                padding: '12px 16px'
              }}
              className="flex justify-between items-start mb-5 relative"
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
                <div className="min-w-0 flex-1">
                  <h3 className="text-[#1A1A1A] text-[18px] leading-tight truncate" style={{ fontWeight: 800 }}>{name}</h3>
                  {isHappyHourNow(venue.happyHour) && (
                    <div style={{
                      background:'#F59E0B',
                      color:'#000',
                      fontSize:10,
                      fontWeight:800,
                      padding:'2px 6px',
                      borderRadius:6,
                      display:'inline-block',
                      marginTop:2
                    }}>
                      🍺 HAPPY HOUR · {venue.happyHour.deal}
                    </div>
                  )}
                  <div className="text-[#4A4A4A] text-[12px] font-semibold mt-1 uppercase tracking-widest truncate">
                    {categoryEmoji && <span className="mr-1">{categoryEmoji}</span>}
                    {type || venue.vibe} &middot; {suburb}
                  </div>
                </div>
              </div>

              {/* Sun Score Badge */}
              <div
                className="flex flex-col items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: '56px',
                  height: '56px',
                  backgroundColor: sunScoreBadge.color,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                <div className="text-[18px] leading-none mb-0.5">{sunScoreBadge.emoji}</div>
                <div className="text-white font-black text-[15px] leading-none">{Math.round(score)}</div>
                <div className="text-white/90 text-[7px] font-bold uppercase tracking-wider mt-0.5">Sun Score</div>
              </div>
            </div>

            {/* Live Sunshine Check Panel */}
            <div className="mb-4 rounded-2xl overflow-hidden" style={{ background: '#f8f5f0', padding: '16px' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] font-extrabold text-amber-800 uppercase tracking-widest">Live Sunshine Check</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center py-3 px-2 bg-white rounded-xl shadow-sm">
                  <Wind size={16} className="text-sky-500 mb-1" />
                  <span className="text-[15px] font-black text-gray-900 leading-none">{Math.round(wind)}km/h</span>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Wind</span>
                </div>
                <div className="flex flex-col items-center py-3 px-2 bg-white rounded-xl shadow-sm">
                  <Droplets size={16} className="text-blue-500 mb-1" />
                  <span className="text-[15px] font-black text-gray-900 leading-none">{isRain ? '80%' : '20%'}</span>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Rain</span>
                </div>
                <div className="flex flex-col items-center py-3 px-2 bg-white rounded-xl shadow-sm">
                  <span className="text-base leading-none mb-1">☀️</span>
                  <span className="text-[15px] font-black text-gray-900 leading-none">6pm</span>
                  <span className="text-[9px] font-bold text-green-600 uppercase tracking-wider mt-1">Optimal</span>
                </div>
              </div>
            </div>

            {venue.heating && venue.heating !== 'no heating' && venue.heating !== 'indoor only' && venue.heating !== 'heated outdoor' && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #FFF0E6 0%, #FFDAB9 100%)', border: '1px solid #FFCBA4' }}>
                <span className="text-base">🔥</span>
                <span className="text-[12px] font-extrabold text-amber-800">
                  {venue.heating === 'electric-fireplace' ? 'Premium Electric Fireplace' : venue.heating === 'traditional-fireplace' ? 'Traditional Gas Fireplace' : 'Fireplace Active'}
                </span>
              </div>
            )}

            {venue.balconyData && (
              <div className="flex justify-between mb-4 px-4 py-3 rounded-xl" style={{ background: 'linear-gradient(to right, #F0F8FF, #E6F2FF)', border: '1px solid #B0E0E6' }}>
                <div className="flex flex-col">
                  <span className="text-[10px] text-sky-600 font-extrabold uppercase tracking-wider">Balcony Sun</span>
                  <span className="text-lg text-gray-900 font-black">{venue.balconyData.hours} Hours</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-sky-600 font-extrabold uppercase tracking-wider">Optimal Views</span>
                  <span className="text-base text-gray-900 font-extrabold">{venue.balconyData.views}</span>
                </div>
              </div>
            )}

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
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="text-[10px] text-[#4A4A4A]/60 font-bold uppercase tracking-wider">Outdoor Sun Exposure</div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      {venue.balconyData ? (
                        <>
                          <span className="bg-amber-500/5 text-amber-700 px-2 py-0.5 rounded-md border border-amber-500/10">Balcony: {venue.balconyData.hours}h</span>
                          <span className="bg-orange-500/5 text-orange-700 px-2 py-0.5 rounded-md border border-orange-500/10">{venue.balconyData.direction}</span>
                          <span className="bg-blue-500/5 text-blue-700 px-2 py-0.5 rounded-md border border-blue-500/10">{venue.balconyData.views} Views</span>
                        </>
                      ) : (
                        <>
                          <span className="bg-amber-500/5 text-amber-700 px-2 py-0.5 rounded-md border border-amber-500/10">{sunHours.labels.outdoor}: {sunHours.outdoor}</span>
                          <span className="bg-cyan-500/5 text-cyan-700 px-2 py-0.5 rounded-md border border-cyan-500/10">{sunHours.labels.covered}: {sunHours.covered}</span>
                        </>
                      )}
                    </div>

                    {cozyWeatherActive && (
                      <div className="bg-orange-500/5 text-orange-800 px-3 py-1 rounded-lg border border-orange-500/10 text-[10px] font-bold mt-2 flex items-center gap-2">
                         ☕ Cozy Indoor | Heaters lit | Rain shelter | Cozy Score 92/100
                      </div>
                    )}
                  </div>
                  {false && (
                    <div className="flex flex-col gap-1 mt-2">
                      <div style={{
                        background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                        border: '1px solid #FDE68A',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        margin: '10px 0',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '16px' }}>⚡</span>
                          <span style={{ fontWeight: '800', fontSize: '14px', color: '#92400E' }}>Sun Intelligence</span>
                          <span style={{
                            marginLeft: 'auto',
                            background: '#F59E0B',
                            color: '#FFFFFF',
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '999px',
                          }}>LIVE</span>
                        </div>
                        <p style={{ fontSize: '13px', color: '#78350F', margin: 0, lineHeight: '1.5' }}>
                          {venue.sunIntelligence || 'Beautiful golden light right now — grab a seat outside and soak it in. Perfect for a long, lazy afternoon.'}
                        </p>
                      </div>
                      {cozyWeatherActive && (
                        <div className="bg-orange-500/5 text-orange-800 px-3 py-1 rounded-lg border border-orange-500/10 text-[10px] font-bold mt-1 flex items-center gap-2 w-fit">
                           ☕ Cozy Indoor | Heaters lit | Rain shelter | Cozy Score 92/100
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {venue.heating && venue.heating !== 'no heating' && (
                  <div 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      margin: '8px 0',
                      color: (venue.heating === 'electric-fireplace' || venue.heating === 'traditional-fireplace') ? '#EF4444' : '#1A1A1A'
                    }}
                  >
                    <span style={{ fontSize: '15px' }}>
                      {(venue.heating === 'electric-fireplace' || venue.heating === 'traditional-fireplace' || venue.heating === 'fireplace') ? '🔥' : '♨️'}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>
                      {(venue.heating === 'electric-fireplace' || venue.heating === 'traditional-fireplace' || venue.heating === 'fireplace') ? 'Fireplace Active' :
                       venue.heating === 'heated outdoor' ? 'Heated outdoor area' :
                       'Fully indoor'}
                    </span>
                  </div>
                )}
                
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

            <div className="flex flex-col gap-2.5 mt-5">
              {/* Top row: Demo Photo and Share */}
              <div className="flex gap-2.5">
                <motion.button
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(0,0,0,0.05)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDemoModalOpen(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black/[0.03] text-[#1A1A1A] font-bold text-[12px] border border-black/5 transition-all"
                >
                  <span>📸</span> Demo Photo
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(0,0,0,0.08)' }}
                  whileTap={{ scale: 0.95 }}
                  className="w-[48px] flex items-center justify-center py-2.5 rounded-xl bg-black/[0.03] text-[#1A1A1A]/70 transition-all border border-black/5 flex-shrink-0"
                >
                  <Share2 size={18} />
                </motion.button>
              </div>

              {/* Bottom row: Full-width Book button */}
              <motion.button
                whileHover={{ scale: 1.01, filter: 'brightness(1.08)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onCenter && onCenter(venue)}
                className="w-full flex items-center justify-center py-4 rounded-xl text-white font-black text-[14px] uppercase tracking-wide"
                style={{
                  background: 'linear-gradient(135deg, #F97316 0%, #FB923C 50%, #FBBF24 100%)',
                  boxShadow: '0 8px 24px rgba(249, 115, 22, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                ☀️ BOOK FOR SUNSHINE
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
                    src="/sunstay-mascot.png"
                    alt="Demo venue view"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src='https://via.placeholder.com/400x500?text=SunStay+Demo'; }}
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

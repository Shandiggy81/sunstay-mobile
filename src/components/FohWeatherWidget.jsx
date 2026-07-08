import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, CloudRain, AlertTriangle } from 'lucide-react';
import { fetchOpenMeteoWeather } from '../utils/weatherService';

// Fallback to Melbourne CBD
const DEFAULT_LAT = -37.8136;
const DEFAULT_LNG = 144.9631;

const formatTime = (isoString) => {
  const d = new Date(isoString);
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  h = h ? h : 12;
  return `${h}${ampm}`;
};

export default function FohWeatherWidget({ lat = DEFAULT_LAT, lng = DEFAULT_LNG }) {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState({
    peak: null,
    slow: null,
    advisory: null,
  });

  useEffect(() => {
    let controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const data = await fetchOpenMeteoWeather(lat, lng, controller.signal);
        const { hourly } = data;
        
        // Find current hour index
        const now = new Date();
        const currentHourIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString().slice(0, 16);
        let startIndex = hourly.time.findIndex(t => t.startsWith(currentHourIso));
        if (startIndex === -1) startIndex = 0;

        // Scan next 12 hours max, or until end of today
        const maxIndex = Math.min(startIndex + 12, hourly.time.length);
        
        let peakBlock = null;
        let slowBlock = null;
        let advisoryBlock = null;

        for (let i = startIndex; i < maxIndex; i++) {
          const t = hourly.time[i];
          const temp = hourly.temperature_2m[i];
          const precip = hourly.precipitation_probability[i];
          const wind = hourly.wind_gusts_10m[i];
          const uv = hourly.uv_index[i];
          const wcode = hourly.weather_code[i];

          // 1. Outdoor Seating Advisory: High wind or Extreme UV
          if (!advisoryBlock && (wind > 35 || uv > 8)) {
            advisoryBlock = {
              start: t,
              reason: wind > 35 ? 'Wind advisory. Pack down umbrellas and batten down the hatches.' : 'UV extreme. Deploy all shade immediately.'
            };
          }

          // 2. Slow Period: High rain chance or storms
          const isRaining = precip > 50 || [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(wcode);
          if (!slowBlock && isRaining) {
            slowBlock = {
              start: t,
              reason: 'Rain incoming. Prep for a quiet floor.'
            };
          }

          // 3. Peak Traffic: Comfortable temps, dry, relatively calm
          if (!peakBlock && temp >= 18 && temp <= 28 && precip < 20 && wind < 25) {
            peakBlock = {
              start: t,
              reason: 'Prime beer garden weather. Expect a rush.'
            };
          }
        }

        setInsights({
          peak: peakBlock ? `${formatTime(peakBlock.start)}+ — ${peakBlock.reason}` : null,
          slow: slowBlock ? `${formatTime(slowBlock.start)}+ — ${slowBlock.reason}` : null,
          advisory: advisoryBlock ? `${formatTime(advisoryBlock.start)}+ — ${advisoryBlock.reason}` : null,
        });

      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[FohWeatherWidget] fetch failed:', err);
        }
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [lat, lng]);

  if (loading) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <motion.div
          style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#14B8A6', borderRadius: '50%' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Loading FOH Insights...</span>
      </div>
    );
  }

  // If no insights triggered, show a neutral message
  if (!insights.peak && !insights.slow && !insights.advisory) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
          No major weather shifts expected. Standard service ahead.
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      background: 'linear-gradient(145deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9))',
      padding: 16, 
      borderRadius: 12, 
      border: '1px solid rgba(20, 184, 166, 0.3)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        {insights.peak && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(20, 184, 166, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={14} color="#34D399" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#34D399', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Traffic</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#F1F5F9', fontWeight: 500, lineHeight: 1.4 }}>{insights.peak}</p>
            </div>
          </div>
        )}

        {insights.slow && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CloudRain size={14} color="#818CF8" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#818CF8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slow Period</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#F1F5F9', fontWeight: 500, lineHeight: 1.4 }}>{insights.slow}</p>
            </div>
          </div>
        )}

        {insights.advisory && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={14} color="#F87171" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#F87171', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Advisory</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#F1F5F9', fontWeight: 500, lineHeight: 1.4 }}>{insights.advisory}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchOpenMeteoWeather } from '../utils/weatherService';

import bruceyImg from '../assets/Brucey_sit_front.png';
import thunderBuddyImg from '../assets/ThunderBuddy_cloud.png';

const DEFAULT_LAT = -37.8136;
const DEFAULT_LNG = 144.9631;

export default function MascotReaction({ lat = DEFAULT_LAT, lng = DEFAULT_LNG }) {
  const [mascotState, setMascotState] = useState(null); // 'thunder' | 'brucey' | null

  useEffect(() => {
    let controller = new AbortController();

    async function checkWeather() {
      try {
        const data = await fetchOpenMeteoWeather(lat, lng, controller.signal);
        
        // Thunder Buddy condition: precipitation > 0.5mm/hr
        if (data.precipitation > 0.5) {
          setMascotState('thunder');
        } 
        // Brucey condition: clear (clouds < 30%) and uv > 3
        else if (data.clouds.all < 30 && data.uvi > 3) {
          setMascotState('brucey');
        } 
        // Otherwise, no mascot
        else {
          setMascotState(null);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[MascotReaction] fetch failed', err);
        }
      }
    }

    checkWeather();
    return () => controller.abort();
  }, [lat, lng]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      right: 24,
      pointerEvents: 'none', // Non-blocking overlay
      zIndex: 1000
    }}>
      <AnimatePresence mode="wait">
        {mascotState === 'thunder' && (
          <motion.div
            key="thunder"
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', bounce: 0.4, duration: 0.8 }}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              filter: 'drop-shadow(0px 10px 15px rgba(0,0,0,0.5))'
            }}
          >
            {/* Using official existing image for Thunder Buddy */}
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#fff',
              border: '4px solid #F59E0B'
            }}>
              <img src={thunderBuddyImg} alt="Thunder Buddy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{
              background: '#F59E0B',
              color: '#000',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 'bold',
              marginTop: -10,
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}>
              Yikes! Heavy Rain
            </div>
          </motion.div>
        )}

        {mascotState === 'brucey' && (
          <motion.div
            key="brucey"
            initial={{ opacity: 0, x: 50, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              filter: 'drop-shadow(0px 10px 15px rgba(0,0,0,0.5))'
            }}
          >
            {/* Using the official existing image for Brucey */}
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#fff',
              border: '4px solid #14B8A6'
            }}>
              <img src={bruceyImg} alt="Brucey" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{
              background: '#14B8A6',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 'bold',
              marginTop: -10,
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}>
              Golden Hour!
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

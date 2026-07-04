// src/components/SplashScreen.jsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SplashScreen({ onComplete }) {
  const [phase, setPhase] = useState('in'); // 'in' | 'hold' | 'out'

  useEffect(() => {
    // Phase: hold after 1.2s, then exit after 3.2s total
    const holdTimer = setTimeout(() => setPhase('hold'), 1200);
    const exitTimer = setTimeout(() => {
      setPhase('out');
      setTimeout(onComplete, 700);
    }, 3200);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'out' && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(160deg, #0D1B2A 0%, #1a2f45 50%, #0D1B2A 100%)',
            overflow: 'hidden',
          }}
        >
          {/* Ambient glow behind sun */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 0.18, scale: 1.6 }}
            transition={{ duration: 2.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: 320,
              height: 320,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #FFB347 0%, #FF6B35 60%, transparent 100%)',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -68%)',
            }}
          />

          {/* Sun arc rising */}
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.7 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', zIndex: 2, marginBottom: 28 }}
          >
            {/* Sun circle */}
            <motion.div
              animate={{ boxShadow: [
                '0 0 30px 8px rgba(255,179,71,0.3)',
                '0 0 55px 18px rgba(255,179,71,0.55)',
                '0 0 30px 8px rgba(255,179,71,0.3)',
              ]}}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 35%, #FFE066 0%, #FFB347 50%, #FF8C00 100%)',
              }}
            />
            {/* Sun rays */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 0.7, scaleY: 1 }}
                transition={{ duration: 0.5, delay: 0.8 + i * 0.05 }}
                style={{
                  position: 'absolute',
                  width: 3,
                  height: 14,
                  borderRadius: 2,
                  background: '#FFD166',
                  top: '50%',
                  left: '50%',
                  transformOrigin: '50% 46px',
                  transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-46px)`,
                }}
              />
            ))}
          </motion.div>

          {/* Logo / Wordmark */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: 'easeOut' }}
            style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}
          >
            <div style={{
              fontSize: '2.6rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #FFE066 0%, #FFB347 60%, #FF8C00 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1,
              marginBottom: 8,
            }}>
              Sunstay
            </div>

            {/* Tagline */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.1 }}
              style={{
                fontSize: '0.92rem',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.62)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Book where the sun actually shines
            </motion.div>
          </motion.div>

          {/* Horizon line */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 1.0, delay: 1.3, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              bottom: '28%',
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,179,71,0.3) 30%, rgba(255,179,71,0.3) 70%, transparent 100%)',
              transformOrigin: 'center',
            }}
          />

          {/* Bottom sub-tagline */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 1.6 }}
            style={{
              position: 'absolute',
              bottom: '18%',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Live weather · Real venues · Outdoor comfort
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

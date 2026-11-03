// src/components/SplashScreen.jsx
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  SPLASH_MAX_WAIT_MS, SPLASH_MIN_MS, SPLASH_POSTER_SRC, SPLASH_POSTER_VIEW_MS, splashShouldExit,
} from '../utils/splashTiming.js';

// How long the exit animation runs before the parent should fully unmount us.
const EXIT_ANIM_MS = 700;

// A 24×43 pre-blurred copy of the poster (274 bytes), inlined so the screen is
// warm and colourful from the first frame while the full poster downloads.
// The poster is shown whole (contain); this fills the space around it on
// phones taller or wider than the 9:16 artwork.
const BACKDROP = 'data:image/webp;base64,UklGRgoBAABXRUJQVlA4IP4AAAAQCACdASoYACsAPrVKnkonJCKhtVQIAOAWiWwAnTLLvwhmO3Ake8zt9KEbCXWWXXMMRL5l43oJsayzfzrf1Nlk6OL8VMXWbDAAAP70Mrtetq+/8V890ydjSaZ6+WV1AEVzZ+sPNEevmgVUXosYRbJnR1KI8fWjR28xwDGPrKUmrdnzroUOz5idQvmP7MH9gy3S2Ab/DHR7B4vW3RHbpEZtUTuoGYvxXDFbA7Vq22OUCgyOHfjrIO1OVRLbB8+aJoHlNkGV5XHHgjqXjdpNA1qy9YPIFiVQimqC+mR5Yg/b/vWz5z/VdMrC7KWVKXzaex2NJDMglbKoAJJLHAAAAA==';

export default function SplashScreen({ isReady = false, onComplete }) {
  const reducedMotion = useReducedMotion();
  const [minElapsed, setMinElapsed] = useState(false);
  const [forceReady, setForceReady] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterDone, setPosterDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  // The parent passes a new onComplete each render; read it through a ref so
  // a re-render can't cancel the exit timer, and call it only once.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    const maxWaitTimer = setTimeout(() => setForceReady(true), SPLASH_MAX_WAIT_MS);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxWaitTimer);
    };
  }, []);

  // Give the poster a moment on screen once it has painted.
  useEffect(() => {
    if (!posterLoaded) return undefined;
    const viewTimer = setTimeout(() => setPosterDone(true), SPLASH_POSTER_VIEW_MS);
    return () => clearTimeout(viewTimer);
  }, [posterLoaded]);

  useEffect(() => {
    if (exiting || !splashShouldExit({ minElapsed, appReady: isReady, posterDone, forceReady })) return;
    setExiting(true);
  }, [isReady, forceReady, minElapsed, posterDone, exiting]);

  // Starting the exit used to re-run the effect above, whose cleanup cleared
  // this timer, so onComplete never ran and the "seen" flag was never saved.
  // The timer now depends on `exiting` alone.
  useEffect(() => {
    if (!exiting) return undefined;
    const exitTimer = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current?.();
    }, EXIT_ANIM_MS);
    return () => clearTimeout(exitTimer);
  }, [exiting]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
          transition={{ duration: reducedMotion ? 0.2 : 0.6 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            overflow: 'hidden',
            background: `#0D1B2A url("${BACKDROP}") center / cover no-repeat`,
          }}
        >
          {/* Darken the blurred fill a touch so the poster's edges read clearly. */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(13, 27, 42, 0.28)' }} />
          {/* Tapping anywhere skips the intro. */}
          <button
            type="button"
            onClick={() => setExiting(true)}
            aria-label="Skip intro"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              padding: 0, border: 0, background: 'transparent', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <motion.img
              src={SPLASH_POSTER_SRC}
              alt="SunStay: find your place in the sun. Shannon with Sunny, the gang and Brucey in a Melbourne laneway."
              width={941}
              height={1672}
              decoding="async"
              fetchPriority="high"
              draggable={false}
              onLoad={() => setPosterLoaded(true)}
              onError={() => setPosterDone(true)}
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.02 }}
              animate={posterLoaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reducedMotion ? 1 : 1.02 }}
              transition={{ duration: reducedMotion ? 0.2 : 0.5, ease: 'easeOut' }}
              style={{
                display: 'block', width: '100%', height: '100%',
                objectFit: 'contain', objectPosition: 'center',
                pointerEvents: 'none', userSelect: 'none',
              }}
            />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

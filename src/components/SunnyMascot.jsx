import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';
import { sunnyAdvice } from '../utils/sunnyAdvice';
import { shouldAutoShowSunnyTip } from '../utils/sunnyTipVisibility.js';
import sunnyMascot from '../assets/sunny-mascot.jpg';

const TIP_SESSION_KEY = 'ss-sunny-advice-shown';
let shownWithoutStorage = false;

const SunnyMascot = ({
    onClick,
    isChatOpen,
    selectedVenue,
    className = 'fixed right-4 z-[1000] pointer-events-none bottom-[calc(env(safe-area-inset-bottom)+90px)]',
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [autoVisible, setAutoVisible] = useState(false);
    const hasShown = useRef(shownWithoutStorage);
    const adviceId = useId();
    const reduceMotion = useReducedMotion();
    const { weather, theme } = useWeather();

    const advice = sunnyAdvice(weather, { proTip: selectedVenue?.proTip });
    const bubbleVisible = !isChatOpen && (isHovered || isFocused ||
        (autoVisible && (advice.basis === 'live' || advice.basis === 'tip')));

    useEffect(() => {
        try { hasShown.current ||= sessionStorage.getItem(TIP_SESSION_KEY) === '1'; }
        catch { /* Keep the in-memory guard when storage is unavailable. */ }
        if (shouldAutoShowSunnyTip({ basis: advice.basis, hasShown: hasShown.current, isChatOpen })) {
            hasShown.current = true;
            shownWithoutStorage = true;
            setAutoVisible(true);
            try { sessionStorage.setItem(TIP_SESSION_KEY, '1'); } catch { /* Private browsing. */ }
        }
        if (isChatOpen) {
            setAutoVisible(false);
            setIsHovered(false);
            setIsFocused(false);
        }
    }, [advice.basis, isChatOpen]);

    useEffect(() => {
        if (!autoVisible) return;
        const timer = setTimeout(() => setAutoVisible(false), 6000);
        return () => clearTimeout(timer);
    }, [autoVisible]);

    const handleClick = event => {
        setAutoVisible(false);
        setIsHovered(false);
        setIsFocused(false);
        onClick?.(event);
    };

    const getGlowColor = () => {
        if (isChatOpen) return 'bg-emerald-400';
        switch (theme) {
            case 'sunny': return 'bg-amber-300';
            case 'rainy': return 'bg-sky-400';
            case 'cloudy': return 'bg-slate-300';
            default: return 'bg-yellow-300';
        }
    };

    return (
        <motion.div
            className={className}
            initial={reduceMotion ? false : { scale: 0, rotate: -180 }}
            animate={reduceMotion ? undefined : { scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 15, delay: 0.5 }}
        >
            <motion.button
                onClick={handleClick}
                aria-label="Chat with Sunny"
                aria-describedby={isChatOpen ? undefined : adviceId}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                whileHover={reduceMotion ? undefined : { scale: 1.15, rotate: isChatOpen ? 0 : 5 }}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="w-20 h-20 rounded-full shadow-2xl flex items-center justify-center cursor-pointer group relative overflow-hidden pointer-events-auto"
                animate={reduceMotion ? undefined : { y: isChatOpen ? 0 : [0, -10, 0] }}
                transition={{
                    duration: 3,
                    repeat: isChatOpen ? 0 : Infinity,
                    ease: 'easeInOut',
                }}
            >
                {/* Glow effect */}
                <motion.div
                    className={`absolute inset-0 rounded-full blur-xl ${getGlowColor()}`}
                    animate={{
                        scale: reduceMotion ? 1 : isHovered || isChatOpen ? 1.6 : 1.1,
                        opacity: isHovered || isChatOpen ? 0.8 : 0.4,
                    }}
                    transition={{ duration: 0.3 }}
                />

                {/* Sunny mascot image */}
                <motion.img
                    src={sunnyMascot}
                    alt="Sunny"
                    className={`w-full h-full rounded-full object-cover relative z-10 border-4 transition-colors duration-500 ${isChatOpen ? 'border-emerald-400' : 'border-white/50'
                        }`}
                    animate={{
                        rotate: !reduceMotion && isHovered && !isChatOpen ? [0, -10, 10, 0] : 0,
                    }}
                    transition={{
                        duration: 0.5,
                        repeat: isHovered && !isChatOpen ? Infinity : 0,
                    }}
                />

                {/* Chat active indicator */}
                {isChatOpen && (
                    <motion.div
                        initial={reduceMotion ? false : { scale: 0, scaleY: 0 }}
                        animate={{ scale: 1, scaleY: 1 }}
                        className="absolute -top-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center z-20 shadow-lg"
                    >
                        <span className="text-white text-[10px] font-bold">LIVE</span>
                    </motion.div>
                )}
            </motion.button>

            {/* Premium Tooltip */}
            {!isChatOpen && (
                <motion.div
                    id={adviceId}
                    role="tooltip"
                    aria-hidden={!bubbleVisible}
                    initial={reduceMotion ? false : { opacity: 0, x: 20, scale: 0.8 }}
                    animate={reduceMotion ? { opacity: bubbleVisible ? 1 : 0 } : {
                        opacity: bubbleVisible ? 1 : 0,
                        x: bubbleVisible ? 0 : 20,
                        scale: bubbleVisible ? 1 : 0.8,
                    }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                    className="absolute right-0 bottom-[calc(100%+12px)] w-60 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] pointer-events-none border border-white/50"
                >
                    <p className="text-[13px] font-bold text-gray-800 tracking-tight line-clamp-2">
                        {advice.text}
                    </p>
                    <div className="absolute right-8 -bottom-1.5 w-3 h-3 bg-white/95 rotate-45" />
                </motion.div>
            )}
        </motion.div>
    );
};

export default SunnyMascot;

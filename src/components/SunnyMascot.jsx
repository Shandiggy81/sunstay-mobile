import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';

const SunnyMascot = ({ onClick, isChatOpen, selectedVenue }) => {
    const [isHovered, setIsHovered] = useState(false);
    const { weather, theme } = useWeather();

    const getMascotAdvice = () => {
        if (selectedVenue?.proTip) return `Pro Tip: ${selectedVenue.proTip}`;

        const temp = weather?.temperature ?? 22;
        return `It's a beautiful ${temp}°C! Perfect for a stroll. ☀️`;
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
            className="fixed bottom-40 right-6 z-[1000] pointer-events-none"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 15, delay: 0.5 }}
        >
            <motion.button
                onClick={onClick}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                whileHover={{ scale: 1.15, rotate: isChatOpen ? 0 : 5 }}
                whileTap={{ scale: 0.9 }}
                className="w-20 h-20 rounded-full shadow-2xl flex items-center justify-center cursor-pointer group relative overflow-hidden pointer-events-auto"
                animate={{
                    y: isChatOpen ? 0 : [0, -10, 0],
                }}
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
                        scale: isHovered || isChatOpen ? 1.6 : 1.1,
                        opacity: isHovered || isChatOpen ? 0.8 : 0.4,
                    }}
                    transition={{ duration: 0.3 }}
                />

                {/* Sunny mascot image */}
                <motion.img
                    src={`${import.meta.env.BASE_URL}assets/sunny-mascot.jpg`}
                    alt="Sunny"
                    className={`w-full h-full rounded-full object-cover relative z-10 border-4 transition-colors duration-500 ${isChatOpen ? 'border-emerald-400' : 'border-white/50'
                        }`}
                    animate={{
                        rotate: isHovered && !isChatOpen ? [0, -10, 10, 0] : 0,
                    }}
                    transition={{
                        duration: 0.5,
                        repeat: isHovered && !isChatOpen ? Infinity : 0,
                    }}
                />

                {/* Chat active indicator */}
                {isChatOpen && (
                    <motion.div
                        initial={{ scale: 0, scaleY: 0 }}
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
                    initial={{ opacity: 0, x: 20, scale: 0.8 }}
                    animate={{
                        opacity: isHovered ? 1 : 0,
                        x: isHovered ? 0 : 20,
                        scale: isHovered ? 1 : 0.8
                    }}
                    className="absolute right-24 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md px-5 py-3 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] whitespace-nowrap pointer-events-none border border-white/50"
                >
                    <p className="text-[13px] font-bold text-gray-800 tracking-tight">
                        {getMascotAdvice()}
                    </p>
                    <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white/95 rotate-45" />
                </motion.div>
            )}
        </motion.div>
    );
};

export default SunnyMascot;

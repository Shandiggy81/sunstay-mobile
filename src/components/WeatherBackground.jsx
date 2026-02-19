import React from 'react';
import { motion } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';

const WeatherBackground = () => {
    const { getBackgroundGradient, theme } = useWeather();

    return (
        <motion.div
            className={`fixed inset-0 bg-gradient-to-br ${getBackgroundGradient()} -z-10`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            key={theme} // Re-animate when theme changes
        >
            {/* Animated overlay for depth */}
            <motion.div
                className="absolute inset-0 bg-black/10"
                animate={{
                    opacity: [0.05, 0.15, 0.05],
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            {/* Subtle noise texture for premium feel */}
            <div
                className="absolute inset-0 opacity-[0.015]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
                }}
            />
        </motion.div>
    );
};

export default WeatherBackground;

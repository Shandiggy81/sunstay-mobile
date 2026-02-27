import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';

const WeatherBackground = () => {
    const { getBackgroundGradient, theme } = useWeather();

    // Generate stable particle positions to avoid re-renders
    const particles = useMemo(() => {
        return Array.from({ length: 15 }).map((_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            size: Math.random() * 4 + 2,
            duration: Math.random() * 20 + 20,
            delay: Math.random() * -20,
        }));
    }, []);

    const getParticleStyles = () => {
        switch (theme) {
            case 'sunny':
                return {
                    color: 'bg-white/20',
                    blur: 'blur-md',
                    animation: {
                        y: [-100, 100],
                        x: [-50, 50],
                        opacity: [0, 0.4, 0],
                        scale: [1, 1.5, 1],
                    }
                };
            case 'rainy':
                return {
                    color: 'bg-white/10',
                    blur: 'blur-[1px]',
                    animation: {
                        y: [-200, 800],
                        x: [0, -50],
                        opacity: [0, 0.2, 0],
                        scale: [1, 1, 1],
                    }
                };
            default: // cloudy
                return {
                    color: 'bg-white/10',
                    blur: 'blur-xl',
                    animation: {
                        x: [-200, 200],
                        y: [-50, 50],
                        opacity: [0, 0.3, 0],
                        scale: [1, 2, 1],
                    }
                };
        }
    };

    const particleStyle = getParticleStyles();

    return (
        <motion.div
            className={`fixed inset-0 bg-gradient-to-br ${getBackgroundGradient()} -z-10 overflow-hidden`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            key={theme}
        >
            {/* Atmospheric Particle System */}
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className={`absolute rounded-full ${particleStyle.color} ${particleStyle.blur}`}
                    style={{
                        left: p.left,
                        top: p.top,
                        width: p.size * (theme === 'rainy' ? 0.5 : 20),
                        height: p.size * (theme === 'rainy' ? 8 : 20),
                    }}
                    animate={particleStyle.animation}
                    transition={{
                        duration: p.duration,
                        repeat: Infinity,
                        repeatType: "loop",
                        delay: p.delay,
                        ease: "linear"
                    }}
                />
            ))}

            {/* Animated overlay for depth */}
            <motion.div
                className="absolute inset-0 bg-black/5"
                animate={{
                    opacity: [0.03, 0.1, 0.03],
                }}
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            {/* Subtle noise texture */}
            <div
                className="absolute inset-0 opacity-[0.015] pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
                }}
            />
        </motion.div>
    );
};

export default WeatherBackground;

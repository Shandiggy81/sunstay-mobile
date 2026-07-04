import React, { useMemo } from 'react';
import { useWeather } from '../context/WeatherContext';

// Pure CSS background — no Framer Motion particles on mobile.
// Previous version ran 15 simultaneous animated divs (y, x, opacity, scale all looping)
// which hammered the mobile GPU and caused the whole app to feel glitchy.
// CSS animations are compositor-only (no JS thread involvement) = smooth 60fps.

const THEMES = {
    sunny: {
        gradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #fed7aa 70%, #fbbf24 100%)',
        particles: '#fbbf24',
    },
    rainy: {
        gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2d5986 40%, #1e40af 100%)',
        particles: '#93c5fd',
    },
    cloudy: {
        gradient: 'linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #d1d5db 100%)',
        particles: '#e5e7eb',
    },
    default: {
        gradient: 'linear-gradient(135deg, #fef9c3 0%, #fde68a 50%, #fcd34d 100%)',
        particles: '#fbbf24',
    },
};

const WeatherBackground = () => {
    const { getBackgroundGradient, theme } = useWeather();
    const config = THEMES[theme] || THEMES.default;

    // Stable particle positions — generated once, never change
    const particles = useMemo(() =>
        Array.from({ length: 6 }, (_, i) => ({
            id: i,
            left: `${(i * 17 + 5) % 100}%`,
            top:  `${(i * 23 + 10) % 100}%`,
            size: 60 + (i % 3) * 40,
            duration: 18 + i * 4,
            delay: -(i * 3),
        }))
    , []);

    return (
        <div
            className="fixed inset-0 -z-10 overflow-hidden"
            style={{
                background: config.gradient,
                transition: 'background 2s ease',
            }}
        >
            {/* CSS-only ambient blobs — compositor thread only, no JS */}
            {particles.map(p => (
                <div
                    key={p.id}
                    className="ss-bg-particle"
                    style={{
                        left: p.left,
                        top: p.top,
                        width: p.size,
                        height: p.size,
                        background: config.particles,
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                    }}
                />
            ))}
        </div>
    );
};

export default WeatherBackground;

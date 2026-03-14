import React from 'react';
import { Sun, Cloud, CloudRain, Wind } from 'lucide-react';

export const getSunBadge = (weather) => {
    if (!weather) return { label: 'Check conditions', color: 'text-gray-400', bg: 'bg-gray-50', icon: '🌤️' };
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const temp = Math.round(weather.main?.temp || 0);
    const windSpeed = Math.round((weather.wind?.speed || 0) * 3.6);

    if (condition.includes('rain') || condition.includes('drizzle'))
        return { label: 'Rainy', color: 'text-blue-600', bg: 'bg-blue-50', icon: '🌧️' };
    if (windSpeed > 40)
        return { label: `${windSpeed} km/h wind`, color: 'text-slate-600', bg: 'bg-slate-50', icon: '💨' };
    if (condition.includes('clear') && temp >= 18)
        return { label: 'Great outdoors', color: 'text-amber-600', bg: 'bg-amber-50', icon: '☀️' };
    if (condition.includes('cloud'))
        return { label: 'Overcast', color: 'text-gray-500', bg: 'bg-gray-50', icon: '☁️' };
    return { label: `${temp}° · Mild`, color: 'text-green-600', bg: 'bg-green-50', icon: '🌤️' };
};

export const getMarkerQuality = (weather, venue) => {
    if (!weather) return 'best';
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windSpeed = weather.wind?.speed || 0;
    const temp = weather.main?.temp || 20;

    const isOutdoor = (venue?.tags || []).some(t =>
        ['Beer Garden', 'Rooftop', 'Waterfront', 'Outdoor Seating'].includes(t)
    );

    if (condition.includes('rain')) {
        return isOutdoor ? 'poor' : 'okay';
    }
    if (windSpeed > 12) return isOutdoor ? 'okay' : 'best';
    if (condition.includes('cloud')) return 'okay';
    if (temp >= 16 && temp <= 28) return 'best';
    return 'okay';
};

const WeatherBadgeRow = ({ weather, compact = false }) => {
    const badge = getSunBadge(weather);
    const temp = weather ? Math.round(weather.main?.temp || 0) : null;
    const windSpeed = weather ? Math.round((weather.wind?.speed || 0) * 3.6) : null;

    if (compact) {
        return (
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${badge.bg}`}>
                <span className="text-[10px]">{badge.icon}</span>
                <span className={`text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {temp !== null && (
                <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full">
                    <Sun size={10} className="text-amber-500" />
                    <span className="text-[11px] font-bold text-amber-700">{temp}°C</span>
                </div>
            )}
            {windSpeed !== null && windSpeed > 0 && (
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-full">
                    <Wind size={10} className="text-slate-500" />
                    <span className="text-[11px] font-semibold text-slate-600">{windSpeed} km/h</span>
                </div>
            )}
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${badge.bg}`}>
                <span className="text-[10px]">{badge.icon}</span>
                <span className={`text-[11px] font-semibold ${badge.color}`}>{badge.label}</span>
            </div>
        </div>
    );
};

export default WeatherBadgeRow;

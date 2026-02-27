import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Shield, AlertTriangle, Info, Clock } from 'lucide-react';
import { getUVConfig, getSunProtectionAdvice, getBestSunSafeTimes } from '../data/uvIntelligence';

const UVIntelligencePanel = ({ venue, uvi = 0 }) => {
    const config = getUVConfig(uvi);
    const advice = getSunProtectionAdvice(venue, uvi);
    const bestTimes = getBestSunSafeTimes(venue, uvi);

    const levels = [
        { label: 'Low', range: '0-2', color: 'bg-green-500' },
        { label: 'Mod', range: '3-5', color: 'bg-yellow-500' },
        { label: 'High', range: '6-7', color: 'bg-orange-500' },
        { label: 'Very High', range: '8-10', color: 'bg-red-500' },
        { label: 'Extreme', range: '11+', color: 'bg-purple-600' }
    ];

    return (
        <div className="space-y-6 text-gray-800">
            <div className="flex items-center gap-3 mb-2">
                <Sun className="text-amber-500" size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight">UV Exposure Analysis</h3>
            </div>

            {/* UV Gauge */}
            <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 shadow-inner">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current UV Index</p>
                        <p className={`text-4xl font-black ${config.color.replace('text-', 'text-')}`}>{Math.round(uvi)}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full ${config.bgColor} border ${config.color.replace('text-', 'border-')} border-opacity-20`}>
                        <span className={`text-[10px] font-black uppercase ${config.color}`}>{config.label}</span>
                    </div>
                </div>

                <div className="relative h-3 w-full bg-gray-200 rounded-full flex overflow-hidden mb-2">
                    {levels.map((level, i) => (
                        <div
                            key={i}
                            className={`h-full ${level.color}`}
                            style={{ width: level.label === 'Extreme' ? '18%' : '20.5%' }}
                            title={level.label}
                        />
                    ))}
                    <motion.div
                        initial={{ left: 0 }}
                        animate={{ left: `${Math.min(100, (uvi / 12) * 100)}%` }}
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-md z-10"
                    />
                </div>
                <div className="flex justify-between text-[8px] font-black text-gray-400 uppercase tracking-tighter">
                    <span>Low</span>
                    <span>Mod</span>
                    <span>High</span>
                    <span>V. High</span>
                    <span>Extreme</span>
                </div>
            </div>

            {/* Advice Grid */}
            <div className="grid grid-cols-1 gap-3">
                <div className={`flex items-start gap-4 p-4 rounded-3xl ${config.bgColor} border border-white/50 backdrop-blur-sm`}>
                    <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-xl shadow-sm">
                        {advice.icon}
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Protection Strategy</p>
                        <p className="text-sm font-bold text-gray-800 leading-tight">{advice.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{advice.detail}</p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-3xl bg-amber-50 border border-amber-100/50">
                    <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-xl shadow-sm">
                        <Clock className="text-amber-500" size={18} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sun Safety Window</p>
                        <p className="text-sm font-bold text-gray-800 leading-tight">{bestTimes}</p>
                        <p className="text-xs text-gray-500 mt-1">Based on venue orientation and shade.</p>
                    </div>
                </div>
            </div>

            {/* Protection Checklist */}
            <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Shield size={14} className="text-emerald-500" />
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Recommended Gear</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-gray-700">Broad-spectrum SPF</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-gray-700">Polarized Lenses</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-gray-700">Breathable Hat</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-gray-700">Hydration Layer</span>
                    </div>
                </div>
            </div>

            {/* Note */}
            <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-2xl">
                <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-600 font-medium leading-relaxed italic">
                    UV levels are predicted for this specific venue location and may differ from regional averages due to coastal reflection.
                </p>
            </div>
        </div>
    );
};

export default UVIntelligencePanel;

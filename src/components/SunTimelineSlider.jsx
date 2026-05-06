import React, { useState } from 'react';

const SunTimelineSlider = () => {
  const [hour, setHour] = useState(new Date().getHours());

  const minHour = 6;
  const maxHour = 20;
  const displayHour = Math.max(minHour, Math.min(maxHour, hour));

  const percentage = (displayHour - minHour) / (maxHour - minHour);
  const angle = percentage * Math.PI;
  const radius = 120;
  const cx = 150;
  const cy = 130;

  const sunX = cx - radius * Math.cos(angle);
  const sunY = cy - radius * Math.sin(angle);

  let status = 'Shaded / Night';
  if (displayHour >= 8 && displayHour <= 11) status = 'Morning Light';
  if (displayHour >= 12 && displayHour <= 15) status = 'Peak Outdoor Sun';
  if (displayHour >= 16 && displayHour <= 18) status = 'Golden Hour';

  const formatTime = (h) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:00 ${ampm}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mt-4 border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Live Sun Track</h3>
        <span className="text-xs font-bold px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
          {status}
        </span>
      </div>

      <div className="relative w-full flex justify-center mb-2">
        <svg width="300" height="150" viewBox="0 0 300 150">
          <line x1="10" y1="130" x2="290" y2="130" stroke="#e5e7eb" strokeWidth="2" />
          <path d="M 30 130 A 120 120 0 0 1 270 130" fill="none" stroke="#f3f4f6" strokeWidth="4" strokeDasharray="6 6" />
          <circle cx={sunX} cy={sunY} r="12" fill="#fbbf24" className="transition-all duration-300 ease-out" />
          <circle cx={sunX} cy={sunY} r="18" fill="#fbbf24" opacity="0.3" className="transition-all duration-300 ease-out" />
        </svg>
        <div className="absolute bottom-0 text-center text-xl font-black text-gray-800">
          {formatTime(displayHour)}
        </div>
      </div>

      <input
        type="range"
        min={minHour}
        max={maxHour}
        value={displayHour}
        onChange={(e) => setHour(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-2 font-medium">
        <span>6 AM</span>
        <span>Noon</span>
        <span>8 PM</span>
      </div>
    </div>
  );
};

export default SunTimelineSlider;

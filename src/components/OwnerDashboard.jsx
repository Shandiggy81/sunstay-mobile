import { useState } from 'react';

export default function OwnerDashboard({ venue }) {
  const [fireplaceOn, setFireplaceOn] = useState(false);
  const [heatersOn, setHeatersOn] = useState(false);
  const [blindsDown, setBlindsDown] = useState(false);
  const [roofClosed, setRoofClosed] = useState(false);
  const [mistersOn, setMistersOn] = useState(false);
  const [umbrellasOut, setUmbrellasOut] = useState(false);
  const [dogsAllowed, setDogsAllowed] = useState(false);
  const [mulledWine, setMulledWine] = useState(false);
  const [frozenMargs, setFrozenMargs] = useState(false);

  const w = venue?.weatherNow || {};

  const getHeroStatus = () => {
    if (fireplaceOn)  return { icon: '🔥', label: 'Cozy & Warm – Fireplace Active', bg: 'from-orange-100 to-red-50' };
    if (mistersOn)    return { icon: '💨', label: 'Cool Breeze – Misters Running',  bg: 'from-sky-50 to-blue-50' };
    if (roofClosed)   return { icon: '🏗️', label: 'Fully Covered – Roof Closed',    bg: 'from-gray-50 to-slate-100' };
    if (umbrellasOut) return { icon: '⛱️', label: 'Sun Shaded – Umbrellas Out',     bg: 'from-yellow-50 to-orange-50' };
    return              { icon: '☀️', label: 'Open & Sunny',                       bg: 'from-orange-50 to-amber-50' };
  };
  const hero = getHeroStatus();

  const Toggle = ({ label, icon, value, onChange, recommended }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-lg flex-shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-gray-700 truncate">{label}</span>
        {recommended && (
          <span className="flex-shrink-0 text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
            Rec
          </span>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`ml-3 flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-300 relative ${value ? 'bg-teal-500' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );

  return (
    <div className="p-5">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Partner Control Center</p>
        <h2 className="text-2xl font-black text-gray-900">{venue?.name || 'Your Venue'}</h2>
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
          <span>🌡️ UV {w.uvIndex ?? '--'}</span>
          <span>💨 Wind {w.windSpeed ?? '--'} km/h</span>
          <span>🌧️ Rain {w.precipProb ?? '--'}%</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Toggles */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Climate & Structural</p>
            <Toggle label="Ignite Main Fireplace"       icon="🔥" value={fireplaceOn}  onChange={setFireplaceOn} />
            <Toggle label="Outdoor Gas Heaters"         icon="🍄" value={heatersOn}    onChange={setHeatersOn} />
            <Toggle label="Cafe Blinds / PVC Down"      icon="⛺" value={blindsDown}   onChange={setBlindsDown}   recommended={w.windSpeed > 25} />
            <Toggle label="Retractable Roof Closed"     icon="🏗️" value={roofClosed}   onChange={setRoofClosed}   recommended={w.precipProb > 60} />
            <Toggle label="Evaporative Misters On"      icon="💨" value={mistersOn}    onChange={setMistersOn} />
            <Toggle label="Umbrellas Deployed"          icon="⛱️" value={umbrellasOut} onChange={setUmbrellasOut} recommended={w.uvIndex >= 6} />
          </div>

          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vibe & Atmosphere</p>
            <Toggle label="Dogs Allowed Indoors Today"  icon="🐶" value={dogsAllowed} onChange={setDogsAllowed} />
            <Toggle
              label="Flash Deal: $10 Mulled Wine"
              icon="🍷"
              value={mulledWine}
              onChange={(v) => { setMulledWine(v); if (v) setFrozenMargs(false); }}
            />
            <Toggle
              label="Flash Deal: $12 Frozen Margs"
              icon="🧉"
              value={frozenMargs}
              onChange={(v) => { setFrozenMargs(v); if (v) setMulledWine(false); }}
            />
          </div>
        </div>

        {/* Live Preview */}
        <div className={`lg:w-60 bg-gradient-to-br ${hero.bg} rounded-2xl p-5 flex flex-col gap-3`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Customer View</p>
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <span className="text-6xl">{hero.icon}</span>
            <p className="text-sm font-bold text-gray-800 text-center mt-2">{hero.label}</p>
          </div>
          <div className="flex flex-col gap-2">
            {dogsAllowed   && <span className="bg-white/70 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">🐶 Dogs Welcome Today</span>}
            {mulledWine    && <span className="bg-white/70 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">🍷 $10 Mulled Wine On Now</span>}
            {frozenMargs   && <span className="bg-white/70 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">🧉 $12 Frozen Margs On Now</span>}
            {blindsDown    && <span className="bg-white/70 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">⛺ Wind Protected</span>}
            {heatersOn     && <span className="bg-white/70 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">🍄 Heaters Running</span>}
            {umbrellasOut  && <span className="bg-white/70 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">⛱️ Umbrellas Out</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

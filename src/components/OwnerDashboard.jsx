import { useState, useRef, useEffect } from 'react';

export default function OwnerDashboard({ venue, onClose }) {
  // STEP 2: Declare updated State Variables
  // Climate
  const [fireplaceOn, setFireplaceOn] = useState(false);
  const [blindsDown, setBlindsDown] = useState(false);
  const [roofClosed, setRoofClosed] = useState(false);
  const [heatersOn, setHeatersOn] = useState(false);

  // Space
  const [walkinsWelcome, setWalkinsWelcome] = useState(false);
  const [atCapacity, setAtCapacity] = useState(false);
  const [rooftopOpen, setRooftopOpen] = useState(false);
  const [sunnyTables, setSunnyTables] = useState(false);

  // Venue Experience
  const [dogFriendly, setDogFriendly] = useState(false);
  const [familyFriendly, setFamilyFriendly] = useState(false);
  const [accessibleVenue, setAccessibleVenue] = useState(false);

  // Entertainment
  const [liveSports, setLiveSports] = useState(false);
  const [djPlaying, setDjPlaying] = useState(false);
  const [triviaTonight, setTriviaTonight] = useState(false);
  const [acousticLiveTonight, setAcousticLiveTonight] = useState(false);

  // Mutual Exclusivity Logic
  const handleWalkinsChange = (val) => {
    setWalkinsWelcome(val);
    if (val) setAtCapacity(false);
  };
  const handleCapacityChange = (val) => {
    setAtCapacity(val);
    if (val) setWalkinsWelcome(false);
  };

  const w = venue?.weatherNow || {};

  // STEP 5: Hero Icon Logic
  const heroIcon = fireplaceOn ? '🔥' : (roofClosed ? '🏗️' : (heatersOn ? '🍄' : '☀️'));

  // STEP 5: Active Badges Array
  const activeBadges = [];
  if (fireplaceOn) activeBadges.push({ text: "🔥 Fireplace On", color: "bg-orange-100 text-orange-700" });
  if (blindsDown) activeBadges.push({ text: "⛺ Blinds Down", color: "bg-blue-100 text-blue-700" });
  if (roofClosed) activeBadges.push({ text: "🏗️ Roof Closed", color: "bg-slate-100 text-slate-700" });
  if (heatersOn) activeBadges.push({ text: "🍄 Heaters Running", color: "bg-orange-100 text-orange-800" });
  
  if (walkinsWelcome) activeBadges.push({ text: "🟢 Walk-ins Welcome", color: "bg-green-100 text-green-700" });
  if (atCapacity) activeBadges.push({ text: "🔴 At Capacity", color: "bg-red-100 text-red-700" });
  if (rooftopOpen) activeBadges.push({ text: "🍻 Rooftop Open", color: "bg-indigo-100 text-indigo-700" });
  if (sunnyTables) activeBadges.push({ text: "🌤️ Sunny Tables Available", color: "bg-amber-100 text-amber-700" });

  if (dogFriendly) activeBadges.push({ text: "🐶 Dog Friendly", color: "bg-emerald-100 text-emerald-700" });
  if (familyFriendly) activeBadges.push({ text: "👨‍👩‍👧 Family Friendly", color: "bg-pink-100 text-pink-700" });
  if (accessibleVenue) activeBadges.push({ text: "♿ Accessible", color: "bg-sky-100 text-sky-700" });

  if (liveSports) activeBadges.push({ text: "🏉 Live Sports", color: "bg-blue-100 text-blue-800" });
  if (djPlaying) activeBadges.push({ text: "🎧 DJ Playing", color: "bg-purple-100 text-purple-700" });
  if (triviaTonight) activeBadges.push({ text: "🧠 Trivia Tonight", color: "bg-teal-100 text-teal-700" });
  if (acousticLiveTonight) activeBadges.push({ text: "🎸 Acoustic Live", color: "bg-amber-100 text-amber-800" });

  const Toggle = ({ label, icon, value, onChange }) => (
    <div className={`flex items-center justify-between py-3.5 px-3 border-b border-gray-50 last:border-0 transition-colors ${value ? 'bg-teal-50/30' : ''}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold text-gray-700 leading-tight">{label}</span>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`ml-4 flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 relative ${value ? 'bg-teal-500' : 'bg-gray-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Sticky Top Bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏢</span>
          <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Venue Operations</span>
        </div>
        <button
          onClick={onClose}
          className="bg-gray-900 hover:bg-black text-white font-bold text-xs px-4 py-2 rounded-full transition-all active:scale-95"
        >
          ✕ Close
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* STEP 4: Main Operational Area (with mobile scroll fix) */}
        <div className="flex-1 overflow-y-auto max-h-[85vh] md:max-h-none pb-32 p-4 md:p-6 lg:p-8 space-y-6">
          <header className="mb-8">
            <p className="text-[10px] font-black text-teal-500 uppercase tracking-[0.2em] mb-1">Partner Control Center</p>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{venue?.name || 'Your Venue'}</h1>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* GROUP 1: CLIMATE & STRUCTURAL */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
              <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 1: Climate & Structural</p>
              </div>
              <Toggle label="Ignite Main Fireplace" icon="🔥" value={fireplaceOn} onChange={setFireplaceOn} />
              <Toggle label="Cafe Blinds / PVC Down" icon="⛺" value={blindsDown} onChange={setBlindsDown} />
              <Toggle label="Retractable Roof Closed" icon="🏗️" value={roofClosed} onChange={setRoofClosed} />
              <Toggle label="Outdoor Gas Heaters On" icon="🍄" value={heatersOn} onChange={setHeatersOn} />
            </section>

            {/* GROUP 2: CAPACITY & SPACE */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
              <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 2: Capacity & Space</p>
              </div>
              <Toggle label="Tables Available (Walk-ins Welcome)" icon="🟢" value={walkinsWelcome} onChange={handleWalkinsChange} />
              <Toggle label="Currently at Capacity" icon="🔴" value={atCapacity} onChange={handleCapacityChange} />
              <Toggle label="Beer Garden / Rooftop Open" icon="🍻" value={rooftopOpen} onChange={setRooftopOpen} />
              <Toggle label="Sunny Outdoor Tables Available" icon="🌤️" value={sunnyTables} onChange={setSunnyTables} />
            </section>

            {/* GROUP 3: VENUE EXPERIENCE */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
              <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 3: Venue Experience</p>
              </div>
              <Toggle label="Dog-Friendly Courtyard Open" icon="🐶" value={dogFriendly} onChange={setDogFriendly} />
              <Toggle label="Family / Pram Friendly" icon="👨‍👩‍👧" value={familyFriendly} onChange={setFamilyFriendly} />
              <Toggle label="Accessible Entrance & Parking" icon="♿" value={accessibleVenue} onChange={setAccessibleVenue} />
            </section>

            {/* GROUP 4: ENTERTAINMENT */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
              <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 4: Entertainment</p>
              </div>
              <Toggle label="Live Sports / AFL on Big Screen" icon="🏉" value={liveSports} onChange={setLiveSports} />
              <Toggle label="DJ Playing Now" icon="🎧" value={djPlaying} onChange={setDjPlaying} />
              <Toggle label="Trivia Night Tonight" icon="🧠" value={triviaTonight} onChange={setTriviaTonight} />
              <Toggle label="Acoustic Set Live Tonight" icon="🎸" value={acousticLiveTonight} onChange={setAcousticLiveTonight} />
            </section>
          </div>
        </div>

        {/* Live Customer View Mirror */}
        <aside className="lg:w-80 p-4 md:p-6 lg:p-8 bg-gray-50/50 border-l border-gray-100 overflow-y-auto">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm sticky top-8">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Live Customer View</p>
            
            {/* Mirror Hero Area */}
            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-gray-900 to-slate-800 flex items-center justify-center relative overflow-hidden mb-6 group">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(20,184,166,0.1),transparent)]" />
               <span className="text-7xl group-hover:scale-110 transition-transform duration-500">{heroIcon}</span>
               <div className="absolute bottom-4 left-4 right-4">
                 <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10">
                   <p className="text-white text-xs font-bold truncate">{venue?.name}</p>
                   <p className="text-white/60 text-[10px] font-medium uppercase tracking-wider">Live Status Updated</p>
                 </div>
               </div>
            </div>

            {/* Active Badges */}
            <div className="space-y-4">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-2">Active Features</p>
              {activeBadges.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No features active. Toggle switches to update live view.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 align-start">
                  {activeBadges.map((badge, i) => (
                    <span 
                      key={i} 
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-tight transition-all animate-in fade-in slide-in-from-bottom-1 duration-300 ${badge.color}`}
                    >
                      {badge.text}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Upsell context */}
            <div className="mt-8 pt-6 border-t border-gray-100">
               <div className="flex items-center gap-2 mb-2">
                 <span className="text-amber-500 text-sm italic font-black uppercase">Sunstay Pro</span>
               </div>
               <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                 Your venue is currently visible to 142 nearby users looking for <span className="text-teal-600 font-bold">"{venue?.vibe || 'Sunshine'}"</span>.
               </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

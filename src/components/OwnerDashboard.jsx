import { useState, useRef, useEffect } from 'react';
import { FEATURE_BADGES } from '../config/features';

export default function OwnerDashboard({ venue, onClose, liveVenueFeatures, setLiveVenueFeatures }) {
  // STEP 1: Detect Venue Type
  const venueType = venue?.type?.toLowerCase() || '';
  const venueTags = venue?.tags?.map(tag => tag.toLowerCase()) || [];
  const isAccommodation =
    venueType.includes('hotel') ||
    venueType.includes('stay') ||
    venueType.includes('apartment') ||
    venueType.includes('airbnb') ||
    venueType.includes('bnb') ||
    venueTags.some(tag =>
      tag.includes('hotel') ||
      tag.includes('stay') ||
      tag.includes('apartment') ||
      tag.includes('airbnb') ||
      tag.includes('bnb')
    );

  // STEP 2: State Variables (Derive from lifted state)
  const venueLiveState = liveVenueFeatures[venue.id] || {};

  const updateVenueFeature = (key, value) => {
    setLiveVenueFeatures(prev => ({
      ...prev,
      [venue.id]: {
        ...prev[venue.id],
        [key]: value,
      }
    }));
  };

  // Shared
  const fireplaceOn = !!venueLiveState.fireplaceOn;

  // Pub Only
  const blindsDown = !!venueLiveState.blindsDown;
  const roofClosed = !!venueLiveState.roofClosed;
  const heatersOn = !!venueLiveState.heatersOn;
  const walkinsWelcome = !!venueLiveState.walkinsWelcome;
  const atCapacity = !!venueLiveState.atCapacity;
  const rooftopOpen = !!venueLiveState.rooftopOpen;
  const sunnyTables = !!venueLiveState.sunnyTables;
  const dogFriendly = !!venueLiveState.dogFriendly;
  const familyFriendly = !!venueLiveState.familyFriendly;
  const accessibleVenue = !!venueLiveState.accessibleVenue;
  const liveSports = !!venueLiveState.liveSports;
  const djPlaying = !!venueLiveState.djPlaying;
  const triviaTonight = !!venueLiveState.triviaTonight;
  const acousticLiveTonight = !!venueLiveState.acousticLiveTonight;

  // Accommodation Only
  const heatedPoolOpen = !!venueLiveState.heatedPoolOpen;
  const acMaxMode = !!venueLiveState.acMaxMode;
  const poolUmbrellasOut = !!venueLiveState.poolUmbrellasOut;
  const instantBook = !!venueLiveState.instantBook;
  const lateCheckout = !!venueLiveState.lateCheckout;
  const roomUpgrade = !!venueLiveState.roomUpgrade;
  const weatherDiscount = !!venueLiveState.weatherDiscount;
  const petFriendlyRoom = !!venueLiveState.petFriendlyRoom;
  const familySuite = !!venueLiveState.familySuite;
  const accessibleRoom = !!venueLiveState.accessibleRoom;
  const bikeHire = !!venueLiveState.bikeHire;
  const breakfastIncluded = !!venueLiveState.breakfastIncluded;
  const welcomeDrinks = !!venueLiveState.welcomeDrinks;
  const rainyDayKit = !!venueLiveState.rainyDayKit;
  const spaSlots = !!venueLiveState.spaSlots;

  // Mutual Exclusivity Logic (Pub)
  const handleWalkinsChange = (val) => {
    updateVenueFeature('walkinsWelcome', val);
    if (val) updateVenueFeature('atCapacity', false);
  };
  const handleCapacityChange = (val) => {
    updateVenueFeature('atCapacity', val);
    if (val) updateVenueFeature('walkinsWelcome', false);
  };

  const w = venue?.weatherNow || {};

  // STEP 6: Hero Icon Logic
  const getHeroIcon = () => {
    if (isAccommodation) {
      if (heatedPoolOpen) return '🏊';
      if (acMaxMode) return '❄️';
      if (fireplaceOn) return '🔥';
    } else {
      if (fireplaceOn) return '🔥';
      if (roofClosed) return '🏗️';
      if (heatersOn) return '🍄';
    }
    return '☀️';
  };
  const heroIcon = getHeroIcon();

  // STEP 6: Active Badges Array (Supports Both Modes)
  const activeBadges = [];
  
  if (isAccommodation) {
    if (heatedPoolOpen) activeBadges.push({ text: FEATURE_BADGES.heatedPoolOpen, color: "bg-blue-100 text-blue-700" });
    if (acMaxMode) activeBadges.push({ text: FEATURE_BADGES.acMaxMode, color: "bg-cyan-100 text-cyan-700" });
    if (fireplaceOn) activeBadges.push({ text: FEATURE_BADGES.fireplaceOn, color: "bg-orange-100 text-orange-700" });
    if (poolUmbrellasOut) activeBadges.push({ text: "⛱️ Pool Umbrellas Out", color: "bg-amber-100 text-amber-700" });
    if (instantBook) activeBadges.push({ text: FEATURE_BADGES.instantBook, color: "bg-green-100 text-green-700" });
    if (lateCheckout) activeBadges.push({ text: FEATURE_BADGES.lateCheckout, color: "bg-purple-100 text-purple-700" });
    if (roomUpgrade) activeBadges.push({ text: FEATURE_BADGES.roomUpgrade, color: "bg-indigo-100 text-indigo-700" });
    if (weatherDiscount) activeBadges.push({ text: FEATURE_BADGES.weatherDiscount, color: "bg-rose-100 text-rose-700" });
    if (petFriendlyRoom) activeBadges.push({ text: FEATURE_BADGES.petFriendlyRoom, color: "bg-emerald-100 text-emerald-700" });
    if (familySuite) activeBadges.push({ text: FEATURE_BADGES.familySuite, color: "bg-pink-100 text-pink-700" });
    if (accessibleRoom) activeBadges.push({ text: FEATURE_BADGES.accessibleRoom, color: "bg-sky-100 text-sky-700" });
    if (bikeHire) activeBadges.push({ text: FEATURE_BADGES.bikeHire, color: "bg-orange-100 text-orange-800" });
    if (breakfastIncluded) activeBadges.push({ text: FEATURE_BADGES.breakfastIncluded, color: "bg-yellow-100 text-yellow-700" });
    if (welcomeDrinks) activeBadges.push({ text: FEATURE_BADGES.welcomeDrinks, color: "bg-rose-100 text-rose-800" });
    if (rainyDayKit) activeBadges.push({ text: FEATURE_BADGES.rainyDayKit, color: "bg-slate-100 text-slate-700" });
    if (spaSlots) activeBadges.push({ text: FEATURE_BADGES.spaSlots, color: "bg-teal-100 text-teal-700" });
  } else {
    if (fireplaceOn) activeBadges.push({ text: "🔥 Fireplace On", color: "bg-orange-100 text-orange-700" });
    if (blindsDown) activeBadges.push({ text: FEATURE_BADGES.blindsDown, color: "bg-blue-100 text-blue-700" });
    if (roofClosed) activeBadges.push({ text: FEATURE_BADGES.roofClosed, color: "bg-slate-100 text-slate-700" });
    if (heatersOn) activeBadges.push({ text: FEATURE_BADGES.heatersOn, color: "bg-orange-100 text-orange-800" });
    if (walkinsWelcome) activeBadges.push({ text: FEATURE_BADGES.walkinsWelcome, color: "bg-green-100 text-green-700" });
    if (atCapacity) activeBadges.push({ text: FEATURE_BADGES.atCapacity, color: "bg-red-100 text-red-700" });
    if (rooftopOpen) activeBadges.push({ text: FEATURE_BADGES.rooftopOpen, color: "bg-indigo-100 text-indigo-700" });
    if (sunnyTables) activeBadges.push({ text: FEATURE_BADGES.sunnyTables, color: "bg-amber-100 text-amber-700" });
    if (dogFriendly) activeBadges.push({ text: FEATURE_BADGES.dogFriendly, color: "bg-emerald-100 text-emerald-700" });
    if (familyFriendly) activeBadges.push({ text: FEATURE_BADGES.familyFriendly, color: "bg-pink-100 text-pink-700" });
    if (accessibleVenue) activeBadges.push({ text: FEATURE_BADGES.accessibleVenue, color: "bg-sky-100 text-sky-700" });
    if (liveSports) activeBadges.push({ text: FEATURE_BADGES.liveSports, color: "bg-blue-100 text-blue-800" });
    if (djPlaying) activeBadges.push({ text: FEATURE_BADGES.djPlaying, color: "bg-purple-100 text-purple-700" });
    if (triviaTonight) activeBadges.push({ text: FEATURE_BADGES.triviaTonight, color: "bg-teal-100 text-teal-700" });
    if (acousticLiveTonight) activeBadges.push({ text: FEATURE_BADGES.acousticLiveTonight, color: "bg-amber-100 text-amber-800" });
  }

  const Toggle = ({ label, icon, value, onChange, recommended }) => (
    <div className={`flex items-center justify-between py-3.5 px-3 border-b border-gray-50 last:border-0 transition-colors ${value ? 'bg-teal-50/30' : ''}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold text-gray-700 leading-tight">{label}</span>
          {recommended && (
            <span className="w-fit mt-1 text-[9px] font-black bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded uppercase tracking-wider">
              Recommended
            </span>
          )}
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
          <span className="text-sm font-black text-gray-900 uppercase tracking-tight">
            {isAccommodation ? 'Accommodation Command Center' : 'Venue Operations'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="bg-gray-900 hover:bg-black text-white font-bold text-xs px-4 py-2 rounded-full transition-all active:scale-95"
        >
          ✕ Close
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* STEP 7: Main Scroll Container */}
        <div className="flex-1 overflow-y-auto max-h-[85vh] md:max-h-none pb-32 p-4 md:p-6 lg:p-8 space-y-6">
          <header className="mb-8">
            <p className="text-[10px] font-black text-teal-500 uppercase tracking-[0.2em] mb-1">Partner Control Center</p>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{venue?.name || 'Your Venue'}</h1>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* STEP 3: Pub Dashboard */}
            {!isAccommodation && (
              <>
                {/* GROUP 1: CLIMATE & STRUCTURAL */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 1: Climate & Structural</p>
                  </div>
                  <Toggle label="Ignite Main Fireplace" icon="🔥" value={fireplaceOn} onChange={(val) => updateVenueFeature('fireplaceOn', val)} />
                  <Toggle label="Cafe Blinds / PVC Down" icon="⛺" value={blindsDown} onChange={(val) => updateVenueFeature('blindsDown', val)} />
                  <Toggle label="Retractable Roof Closed" icon="🏗️" value={roofClosed} onChange={(val) => updateVenueFeature('roofClosed', val)} />
                  <Toggle label="Outdoor Gas Heaters On" icon="🍄" value={heatersOn} onChange={(val) => updateVenueFeature('heatersOn', val)} />
                </section>

                {/* GROUP 2: CAPACITY & SPACE */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 2: Capacity & Space</p>
                  </div>
                  <Toggle label="Tables Available (Walk-ins Welcome)" icon="🟢" value={walkinsWelcome} onChange={handleWalkinsChange} />
                  <Toggle label="Currently at Capacity" icon="🔴" value={atCapacity} onChange={handleCapacityChange} />
                  <Toggle label="Beer Garden / Rooftop Open" icon="🍻" value={rooftopOpen} onChange={(val) => updateVenueFeature('rooftopOpen', val)} />
                  <Toggle label="Sunny Outdoor Tables Available" icon="🌤️" value={sunnyTables} onChange={(val) => updateVenueFeature('sunnyTables', val)} />
                </section>

                {/* GROUP 3: VENUE EXPERIENCE */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 3: Venue Experience</p>
                  </div>
                  <Toggle label="Dog-Friendly Courtyard Open" icon="🐶" value={dogFriendly} onChange={(val) => updateVenueFeature('dogFriendly', val)} />
                  <Toggle label="Family / Pram Friendly" icon="👨‍👩‍👧" value={familyFriendly} onChange={(val) => updateVenueFeature('familyFriendly', val)} />
                  <Toggle label="Accessible Entrance & Parking" icon="♿" value={accessibleVenue} onChange={(val) => updateVenueFeature('accessibleVenue', val)} />
                </section>

                {/* GROUP 4: ENTERTAINMENT */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 4: Entertainment</p>
                  </div>
                  <Toggle label="Live Sports / AFL on Big Screen" icon="🏉" value={liveSports} onChange={(val) => updateVenueFeature('liveSports', val)} />
                  <Toggle label="DJ Playing Now" icon="🎧" value={djPlaying} onChange={(val) => updateVenueFeature('djPlaying', val)} />
                  <Toggle label="Trivia Night Tonight" icon="🧠" value={triviaTonight} onChange={(val) => updateVenueFeature('triviaTonight', val)} />
                  <Toggle label="Acoustic Set Live Tonight" icon="🎸" value={acousticLiveTonight} onChange={(val) => updateVenueFeature('acousticLiveTonight', val)} />
                </section>
              </>
            )}

            {/* STEP 4: Accommodation Dashboard */}
            {isAccommodation && (
              <>
                {/* GROUP 1: CLIMATE & AMENITIES */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 1: Climate & Amenities</p>
                  </div>
                  <Toggle label="Heated Pool / Spa Open" icon="🏊" value={heatedPoolOpen} onChange={(val) => updateVenueFeature('heatedPoolOpen', val)} />
                  <Toggle label="AC 'Cool Sanctuary' Mode" icon="❄️" value={acMaxMode} onChange={(val) => updateVenueFeature('acMaxMode', val)} />
                  <Toggle label="Poolside Cabanas / Umbrellas Setup" icon="⛱️" value={poolUmbrellasOut} onChange={(val) => updateVenueFeature('poolUmbrellasOut', val)} recommended={w.temp >= 24} />
                  <Toggle label="Indoor Fireplace Active" icon="🔥" value={fireplaceOn} onChange={(val) => updateVenueFeature('fireplaceOn', val)} />
                </section>

                {/* GROUP 2: AVAILABILITY & OFFERS */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 2: Availability & Offers</p>
                  </div>
                  <Toggle label="Instant Book Ready" icon="🔑" value={instantBook} onChange={(val) => updateVenueFeature('instantBook', val)} />
                  <Toggle label="Early Check-in / Late Check-out" icon="🛎️" value={lateCheckout} onChange={(val) => updateVenueFeature('lateCheckout', val)} />
                  <Toggle label="Free Room Upgrade (Last Minute)" icon="🛏️" value={roomUpgrade} onChange={(val) => updateVenueFeature('roomUpgrade', val)} />
                  <Toggle label="Rainy Day Discount Active" icon="💰" value={weatherDiscount} onChange={(val) => updateVenueFeature('weatherDiscount', val)} />
                </section>

                {/* GROUP 3: GUEST EXPERIENCE */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 3: Guest Experience</p>
                  </div>
                  <Toggle label="Pet-Friendly Room Available" icon="🐶" value={petFriendlyRoom} onChange={(val) => updateVenueFeature('petFriendlyRoom', val)} />
                  <Toggle label="Family Suite / Portacot Available" icon="👨‍👩‍👧" value={familySuite} onChange={(val) => updateVenueFeature('familySuite', val)} />
                  <Toggle label="Accessible Room Available" icon="♿" value={accessibleRoom} onChange={(val) => updateVenueFeature('accessibleRoom', val)} />
                  <Toggle label="Free Bike / Scooter Hire" icon="🚲" value={bikeHire} onChange={(val) => updateVenueFeature('bikeHire', val)} recommended={w.uvIndex > 4} />
                </section>

                {/* GROUP 4: PERKS & EXTRAS */}
                <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden h-fit">
                  <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group 4: Perks & Extras</p>
                  </div>
                  <Toggle label="Breakfast Included Today" icon="🍳" value={breakfastIncluded} onChange={(val) => updateVenueFeature('breakfastIncluded', val)} />
                  <Toggle label="Evening Welcome Drinks Active" icon="🍷" value={welcomeDrinks} onChange={(val) => updateVenueFeature('welcomeDrinks', val)} />
                  <Toggle label="Rainy Day Board Game / Movie Kit" icon="🍿" value={rainyDayKit} onChange={(val) => updateVenueFeature('rainyDayKit', val)} recommended={w.precipProb > 50} />
                  <Toggle label="Spa / Massage Slots Available" icon="💆" value={spaSlots} onChange={(val) => updateVenueFeature('spaSlots', val)} />
                </section>
              </>
            )}
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
                 {isAccommodation 
                   ? `Your property is currently trending for users looking for "${venue?.vibe || 'Staycations'}".`
                   : `Your venue is currently visible to 142 nearby users looking for "${venue?.vibe || 'Sunshine'}".`
                 }
               </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

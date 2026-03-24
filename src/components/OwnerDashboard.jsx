import { useState, useRef, useEffect } from 'react';

export default function OwnerDashboard({ venue, onClose }) {
  // Group 1: Climate & Structural
  const [fireplaceOn, setFireplaceOn] = useState(false);
  const [heatersOn, setHeatersOn] = useState(false);
  const [blindsDown, setBlindsDown] = useState(false);
  const [roofClosed, setRoofClosed] = useState(false);
  const [mistersOn, setMistersOn] = useState(false);
  const [umbrellasOut, setUmbrellasOut] = useState(false);
  const [heatedBlankets, setHeatedBlankets] = useState(false);
  const [acMaxOn, setAcMaxOn] = useState(false);
  const [sunscreenStation, setSunscreenStation] = useState(false);

  // Group 2: Vibe & Atmosphere
  const [dogsAllowed, setDogsAllowed] = useState(false);
  const [mulledWine, setMulledWine] = useState(false);
  const [frozenMargs, setFrozenMargs] = useState(false);
  const [liveMusicOn, setLiveMusicOn] = useState(false);
  const [candlesOn, setCandlesOn] = useState(false);
  const [lateNightFood, setLateNightFood] = useState(false);
  const [socialMoment, setSocialMoment] = useState(false);

  // Group 3: Booking & Capacity
  const [walkInsOn, setWalkInsOn] = useState(false);
  const [reservationsOnly, setReservationsOnly] = useState(false);
  const [privateEvent, setPrivateEvent] = useState(false);
  const [lastRound, setLastRound] = useState(false);

  // Group 4: Sunstay Visibility Boost (Premium)
  const [pinBoost, setPinBoost] = useState(false);
  const [pushNotif, setPushNotif] = useState(false);
  const [featureList, setFeatureList] = useState(false);

  // Camera states
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const w = venue?.weatherNow || {};

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      setCameraStream(stream);
      setCameraActive(true);
      setCapturedPhoto(null);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedPhoto(dataUrl);
      setCameraActive(false);
      stopCamera();
      setShowDemoNotice(true);
      setTimeout(() => setShowDemoNotice(false), 4000);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const getHeroStatus = () => {
    if (fireplaceOn)  return { icon: '🔥', label: 'Cozy & Warm – Fireplace Active', bg: 'from-orange-100 to-red-50' };
    if (mistersOn)    return { icon: '💨', label: 'Cool Breeze – Misters Running',  bg: 'from-sky-50 to-blue-50' };
    if (roofClosed)   return { icon: '🏗️', label: 'Fully Covered – Roof Closed',    bg: 'from-gray-50 to-slate-100' };
    if (umbrellasOut) return { icon: '⛱️', label: 'Sun Shaded – Umbrellas Out',     bg: 'from-yellow-50 to-orange-50' };
    return              { icon: '☀️', label: 'Open & Sunny',                       bg: 'from-orange-50 to-amber-50' };
  };
  const hero = getHeroStatus();

  const Toggle = ({ label, icon, value, onChange, recommended, premium }) => (
    <div className={`flex items-center justify-between py-3 px-3 rounded-xl border-b border-gray-100 last:border-0 transition-colors duration-200 ${value ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-gray-700 truncate">{label}</span>
        {recommended && (
          <span className="flex-shrink-0 text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
            Rec
          </span>
        )}
        {premium && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Premium</span>
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
    <div className="flex flex-col min-h-full">
      {/* Sticky Close Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏢</span>
          <span className="text-sm font-bold text-gray-800">Partner Dashboard</span>
        </div>
        <button
          onClick={onClose}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm px-4 py-2 rounded-full flex items-center gap-1.5 transition-colors"
        >
          ✕ Close
        </button>
      </div>

      <div className="p-5 pb-24">
        {/* Header Block — Dark Gradient Hero */}
        <div className="bg-gradient-to-r from-gray-900 to-slate-800 rounded-2xl p-6 mb-5 shadow-inner">
          <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-1">Partner Control Center</p>
          <h2 className="text-2xl font-black text-white">{venue?.name || 'Your Venue'}</h2>
          
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[70px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">UV Index</p>
              <p className="text-lg font-black text-white">{w.uvIndex ?? '--'}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[70px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Wind</p>
              <p className="text-lg font-black text-white">{w.windSpeed ?? '--'}<span className="text-xs font-normal ml-0.5 text-gray-400">km/h</span></p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[70px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Rain Prob.</p>
              <p className="text-lg font-black text-white">{w.precipProb ?? '--'}<span className="text-xs font-normal ml-0.5 text-gray-400">%</span></p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Toggles */}
          <div className="flex-1 flex flex-col gap-6">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-teal-400 rounded-full"></div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Climate & Structural</p>
              </div>
              <Toggle label="Ignite Main Fireplace"       icon="🔥" value={fireplaceOn}  onChange={setFireplaceOn} />
              <Toggle label="Outdoor Gas Heaters"         icon="🍄" value={heatersOn}    onChange={setHeatersOn} />
              <Toggle label="Cafe Blinds / PVC Down"      icon="⛺" value={blindsDown}   onChange={setBlindsDown}   recommended={w.windSpeed > 25} />
              <Toggle label="Retractable Roof Closed"     icon="🏗️" value={roofClosed}   onChange={setRoofClosed}   recommended={w.precipProb > 60} />
              <Toggle label="Evaporative Misters On"      icon="💨" value={mistersOn}    onChange={setMistersOn} />
              <Toggle label="Umbrellas Deployed"          icon="⛱️" value={umbrellasOut} onChange={setUmbrellasOut} recommended={w.uvIndex >= 6} />
              <Toggle label="Heated Blankets / Throws Available" icon="🧥" value={heatedBlankets} onChange={setHeatedBlankets} />
              <Toggle label="AC Max 'Cool Sanctuary' Mode" icon="🌡️" value={acMaxOn} onChange={setAcMaxOn} />
              <Toggle label="Free Sunscreen Station Active" icon="🧴" value={sunscreenStation} onChange={setSunscreenStation} />
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-teal-400 rounded-full"></div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Vibe & Atmosphere</p>
              </div>
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
              <Toggle label="Live Music On Tonight" icon="🎵" value={liveMusicOn} onChange={setLiveMusicOn} />
              <Toggle label="Candles & Low Lighting" icon="🕯️" value={candlesOn} onChange={setCandlesOn} />
              <Toggle label="Late Night Food Available" icon="🍕" value={lateNightFood} onChange={setLateNightFood} />
              <Toggle label="Social Media Moment Active" icon="📸" value={socialMoment} onChange={setSocialMoment} />
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-teal-400 rounded-full"></div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Booking & Capacity</p>
              </div>
              <Toggle
                label="Walk-ins Welcome Right Now"
                icon="🪑"
                value={walkInsOn}
                onChange={(v) => { setWalkInsOn(v); if (v) setReservationsOnly(false); }}
              />
              <Toggle
                label="Reservations Only Tonight"
                icon="📋"
                value={reservationsOnly}
                onChange={(v) => { setReservationsOnly(v); if (v) setWalkInsOn(false); }}
              />
              <Toggle label="Private Event – Venue Partially Closed" icon="🎉" value={privateEvent} onChange={setPrivateEvent} />
              <Toggle label="Last Round Called (30 min warning)" icon="⏰" value={lastRound} onChange={setLastRound} />
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-amber-400 rounded-full"></div>
                <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">⭐ Sunstay Visibility</p>
              </div>
              <Toggle label="Boost My Pin on Map Right Now" icon="🔝" value={pinBoost} onChange={setPinBoost} premium={true} />
              <Toggle label="Push Notification to Nearby Users" icon="📣" value={pushNotif} onChange={setPushNotif} premium={true} />
              <Toggle label="Feature in 'Best Right Now' List" icon="🌟" value={featureList} onChange={setFeatureList} premium={true} />
            </div>
          </div>

          {/* Live Customer View panel — rich design */}
          <div className={`lg:w-64 bg-gradient-to-br ${hero.bg} rounded-3xl p-5 flex flex-col gap-4 border border-white/60 shadow-lg h-fit sticky top-16`}>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Live Customer View</p>
            
            {/* === LIVE PHOTO SECTION === */}
            <div className="relative bg-gray-900 rounded-2xl overflow-hidden" style={{ minHeight: '200px' }}>

              {/* State 1: No photo, camera off — show prompt */}
              {!cameraActive && !capturedPhoto && (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-3">
                  <span className="text-4xl">📷</span>
                  <p className="text-sm font-bold text-white text-center px-4">Show Punters Your Venue Live</p>
                  <p className="text-xs text-gray-400 text-center px-6">Capture your beer garden, rooftop or bar right now</p>
                  <button
                    onClick={startCamera}
                    className="mt-2 bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm px-5 py-2.5 rounded-full transition-colors"
                  >
                    📸 Open Camera
                  </button>
                </div>
              )}

              {/* State 2: Camera live — show viewfinder */}
              {cameraActive && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-2xl"
                    style={{ maxHeight: '260px', objectFit: 'cover' }}
                  />
                  {/* Weather overlay on viewfinder */}
                  <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
                    <span className="text-white text-xs font-bold">☀️ {w.uvIndex ?? '--'} UV</span>
                    <span className="text-white/60 text-xs">·</span>
                    <span className="text-white text-xs font-bold">💨 {w.windSpeed ?? '--'}km/h</span>
                  </div>
                  {/* Venue name overlay */}
                  <div className="absolute bottom-14 left-3 right-3">
                    <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2">
                      <p className="text-white text-xs font-bold">{venue?.name}</p>
                      <p className="text-gray-300 text-[10px]">Live from the venue · {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  {/* Capture button */}
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                    <button
                      onClick={stopCamera}
                      className="bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={capturePhoto}
                      className="bg-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl border-4 border-gray-200 hover:scale-105 transition-transform"
                    >
                      📸
                    </button>
                  </div>
                </div>
              )}

              {/* State 3: Photo captured — show preview with weather overlay */}
              {capturedPhoto && !cameraActive && (
                <div className="relative">
                  <img
                    src={capturedPhoto}
                    alt="Live venue"
                    className="w-full rounded-2xl"
                    style={{ maxHeight: '260px', objectFit: 'cover' }}
                  />
                  {/* Weather badge overlay */}
                  <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
                    <span className="text-white text-xs font-bold">{hero.icon} {hero.label}</span>
                  </div>
                  {/* Venue + time stamp */}
                  <div className="absolute bottom-12 left-3 right-3">
                    <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2">
                      <p className="text-white text-xs font-bold">{venue?.name} · Live Now</p>
                      <p className="text-gray-300 text-[10px]">Updated {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  {/* Retake button */}
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                    <button
                      onClick={retakePhoto}
                      className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-4 py-2 rounded-full"
                    >
                      🔄 Retake
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Demo notice toast */}
            {showDemoNotice && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <span className="text-lg">🚧</span>
                <div>
                  <p className="text-xs font-bold text-amber-800">Demo Mode – Photo Not Saved</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">In production, this photo would update your live venue card visible to all nearby Sunstay users instantly.</p>
                </div>
              </div>
            )}

            {/* Active badges */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Active Now</p>
              {!dogsAllowed && !mulledWine && !frozenMargs && !blindsDown && !heatersOn && !umbrellasOut && !liveMusicOn && !lateNightFood && !lastRound && !walkInsOn && !pinBoost && (
                <p className="text-xs text-gray-400 italic px-1">No active specials</p>
              )}
              {dogsAllowed   && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🐶 Dogs Welcome Today</span>}
              {mulledWine    && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🍷 $10 Mulled Wine On Now</span>}
              {frozenMargs   && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🧉 $12 Frozen Margs On Now</span>}
              {blindsDown    && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">⛺ Wind Protected</span>}
              {heatersOn     && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🍄 Heaters Running</span>}
              {umbrellasOut  && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">⛱️ Umbrellas Out</span>}
              {liveMusicOn   && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🎵 Live Music Tonight</span>}
              {lateNightFood && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🍕 Late Night Food On</span>}
              {lastRound     && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">⏰ Last Round – 30 Min</span>}
              {walkInsOn     && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white">🪑 Walk-ins Welcome</span>}
              {pinBoost      && <span className="bg-white/80 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm border border-white text-amber-600">🔝 Pin Boosted on Map</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

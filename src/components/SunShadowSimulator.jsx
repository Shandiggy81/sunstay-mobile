/**
 * SunShadowSimulator.jsx
 * ─────────────────────────────────────────────────
 * Visual sun position + shadow simulator for a venue.
 * Shows:
 *   - Compass rose with live solar azimuth ray
 *   - Venue silhouette (type-based)
 *   - Shadow cone sweep
 *   - Timeline scrubber (6am–8pm)
 *   - Sunshine Score™ ring
 *
 * Usage:
 *   <SunShadowSimulator venue={venue} weather={weather} />
 */

import { useState, useEffect, useRef } from 'react';
import {
  getSolarData,
  getVenueFacingBearing,
  getSunExposureAtVenue,
  getSunTimeline,
  calculateSunshineScore,
} from '../data/sunshineIntelligence';

// ── Venue Silhouette Shapes ───────────────────────────────────────
const VENUE_SHAPES = {
  rooftop: (
    <g>
      {/* Rooftop building block */}
      <rect x="30" y="50" width="80" height="50" rx="3" fill="currentColor" opacity="0.15" />
      <rect x="20" y="45" width="100" height="8" rx="2" fill="currentColor" opacity="0.25" />
      {/* Parapet details */}
      <rect x="20" y="40" width="12" height="5" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="44" y="40" width="12" height="5" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="68" y="40" width="12" height="5" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="92" y="40" width="12" height="5" rx="1" fill="currentColor" opacity="0.2" />
      {/* Table */}
      <rect x="55" y="62" width="30" height="4" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="60" y="66" width="4" height="12" rx="1" fill="currentColor" opacity="0.3" />
      <rect x="76" y="66" width="4" height="12" rx="1" fill="currentColor" opacity="0.3" />
    </g>
  ),
  beer_garden: (
    <g>
      {/* Ground */}
      <rect x="10" y="85" width="120" height="4" rx="2" fill="currentColor" opacity="0.15" />
      {/* Trees */}
      <circle cx="25" cy="65" r="15" fill="currentColor" opacity="0.12" />
      <rect x="22" y="80" width="6" height="10" rx="1" fill="currentColor" opacity="0.2" />
      <circle cx="115" cy="60" r="18" fill="currentColor" opacity="0.12" />
      <rect x="112" y="78" width="6" height="11" rx="1" fill="currentColor" opacity="0.2" />
      {/* Table and chairs */}
      <rect x="55" y="70" width="32" height="4" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="60" y="74" width="4" height="11" rx="1" fill="currentColor" opacity="0.3" />
      <rect x="78" y="74" width="4" height="11" rx="1" fill="currentColor" opacity="0.3" />
      <circle cx="52" cy="72" r="5" fill="currentColor" opacity="0.2" />
      <circle cx="90" cy="72" r="5" fill="currentColor" opacity="0.2" />
    </g>
  ),
  courtyard: (
    <g>
      {/* Walls */}
      <rect x="15" y="30" width="10" height="65" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="115" y="30" width="10" height="65" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="15" y="30" width="110" height="10" rx="2" fill="currentColor" opacity="0.2" />
      {/* Open sky hint */}
      <rect x="25" y="40" width="90" height="50" rx="1" fill="currentColor" opacity="0.05" />
      {/* Planter */}
      <rect x="40" y="75" width="20" height="10" rx="3" fill="currentColor" opacity="0.2" />
      <circle cx="50" cy="72" r="6" fill="currentColor" opacity="0.15" />
      <rect x="85" y="75" width="20" height="10" rx="3" fill="currentColor" opacity="0.2" />
      <circle cx="95" cy="72" r="6" fill="currentColor" opacity="0.15" />
    </g>
  ),
  waterfront: (
    <g>
      {/* Water ripples */}
      <ellipse cx="70" cy="90" rx="55" ry="6" fill="currentColor" opacity="0.08" />
      <ellipse cx="70" cy="87" rx="40" ry="4" fill="currentColor" opacity="0.06" />
      {/* Decking */}
      <rect x="20" y="75" width="100" height="12" rx="2" fill="currentColor" opacity="0.2" />
      <line x1="30" y1="75" x2="30" y2="87" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      <line x1="50" y1="75" x2="50" y2="87" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      <line x1="70" y1="75" x2="70" y2="87" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      <line x1="90" y1="75" x2="90" y2="87" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      <line x1="110" y1="75" x2="110" y2="87" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      {/* Umbrella */}
      <rect x="68" y="45" width="3" height="30" rx="1" fill="currentColor" opacity="0.3" />
      <path d="M 50 50 Q 70 35 90 50" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.2" />
    </g>
  ),
  default: (
    <g>
      {/* Generic outdoor area */}
      <rect x="20" y="55" width="100" height="35" rx="4" fill="currentColor" opacity="0.1" />
      <rect x="20" y="50" width="100" height="8" rx="2" fill="currentColor" opacity="0.2" />
      {/* Umbrella */}
      <rect x="68" y="50" width="3" height="30" rx="1" fill="currentColor" opacity="0.3" />
      <path d="M 50 55 Q 70 42 90 55" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.2" />
    </g>
  ),
};

function getVenueShape(venue) {
  const vibe = (venue.vibe || '').toLowerCase();
  const tags = (venue.tags || []).map(t => t.toLowerCase());
  if (tags.includes('rooftop') || vibe.includes('rooftop')) return VENUE_SHAPES.rooftop;
  if (vibe.includes('courtyard') || vibe.includes('maze')) return VENUE_SHAPES.courtyard;
  if (vibe.includes('water') || vibe.includes('floating') || vibe.includes('wharf') || tags.includes('river')) return VENUE_SHAPES.waterfront;
  if (tags.includes('beer garden') || vibe.includes('garden') || vibe.includes('beer garden')) return VENUE_SHAPES.beer_garden;
  return VENUE_SHAPES.default;
}

// ── Compass Directions ────────────────────────────────────────────
const COMPASS = [
  { label: 'N', angle: 0 },
  { label: 'E', angle: 90 },
  { label: 'S', angle: 180 },
  { label: 'W', angle: 270 },
];

// ── Score Ring ────────────────────────────────────────────────────
function ScoreRing({ score, gradeColor, gradeEmoji, grade }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        {/* Track */}
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
        {/* Fill */}
        <circle
          cx="36" cy="36" r={r}
          fill="none"
          stroke={gradeColor}
          strokeWidth="6"
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={circ / 4} // start from top
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {/* Score text */}
        <text x="36" y="32" textAnchor="middle" fontSize="14" fontWeight="700" fill={gradeColor}>
          {score}
        </text>
        <text x="36" y="44" textAnchor="middle" fontSize="8" fill="#9ca3af">
          /100
        </text>
      </svg>
      <span className="text-xs font-semibold mt-0.5" style={{ color: gradeColor }}>
        Grade {grade}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function SunShadowSimulator({ venue, weather = {} }) {
  const [scrubIndex, setScrubIndex] = useState(null); // null = live
  const [timeline, setTimeline] = useState([]);
  const [liveData, setLiveData] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const intervalRef = useRef(null);

  // Build timeline on mount
  useEffect(() => {
    const tl = getSunTimeline(venue);
    setTimeline(tl);

    // Find current slot index
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let closest = 0;
    let minDiff = Infinity;
    tl.forEach((slot, i) => {
      const slotMins = slot.hour * 60 + slot.minute;
      const diff = Math.abs(slotMins - nowMins);
      if (diff < minDiff) { minDiff = diff; closest = i; }
    });
    setScrubIndex(closest);
  }, [venue]);

  // Live update every 60s when on current time
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const solar = getSolarData(venue, now);
      const exposure = getSunExposureAtVenue(venue, now);
      const score = calculateSunshineScore(venue, weather, now);
      setLiveData({ solar, exposure });
      setScoreData(score);
    };
    update();
    intervalRef.current = setInterval(update, 60000);
    return () => clearInterval(intervalRef.current);
  }, [venue, weather]);

  const currentSlot = scrubIndex !== null ? timeline[scrubIndex] : null;
  const displayAzimuth = currentSlot?.azimuthDeg ?? liveData?.solar?.azimuthDeg ?? 180;
  const displayAltitude = currentSlot?.altitudeDeg ?? liveData?.solar?.altitudeDeg ?? 0;
  const displayQuality = currentSlot?.quality ?? liveData?.exposure?.quality ?? 'shade';
  const isSunUp = currentSlot?.isSunUp ?? liveData?.solar?.isSunUp ?? false;
  const facingBearing = getVenueFacingBearing(venue);

  // Sun ray endpoint on compass (r=52 circle)
  const compassR = 52;
  const cx = 70, cy = 70;
  const azRad = (displayAzimuth - 90) * (Math.PI / 180);
  const sunX = cx + compassR * Math.cos(azRad);
  const sunY = cy + compassR * Math.sin(azRad);

  // Facing arrow endpoint
  const facingRad = (facingBearing - 90) * (Math.PI / 180);
  const facingX = cx + 38 * Math.cos(facingRad);
  const facingY = cy + 38 * Math.sin(facingRad);

  // Shadow cone: opposite to sun direction, spread based on altitude
  const shadowAngle = (displayAzimuth + 180) % 360;
  const shadowSpread = isSunUp ? Math.max(15, 60 - displayAltitude) : 0;
  const shadowRad = (shadowAngle - 90) * (Math.PI / 180);
  const shadowLength = isSunUp ? Math.max(20, 65 - displayAltitude * 0.8) : 0;
  const shadowX = cx + shadowLength * Math.cos(shadowRad);
  const shadowY = cy + shadowLength * Math.sin(shadowRad);
  const spreadRad = (shadowSpread / 2) * (Math.PI / 180);
  const s1X = cx + shadowLength * Math.cos(shadowRad - spreadRad);
  const s1Y = cy + shadowLength * Math.sin(shadowRad - spreadRad);
  const s2X = cx + shadowLength * Math.cos(shadowRad + spreadRad);
  const s2Y = cy + shadowLength * Math.sin(shadowRad + spreadRad);

  // Quality colour
  const qualityColor = displayQuality === 'direct' ? '#f59e0b' : displayQuality === 'partial' ? '#fb923c' : '#9ca3af';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sun Shadow Simulator</p>
          <p className="text-sm font-bold text-gray-900">{venue.venueName || venue.name}</p>
        </div>
        {scoreData && (
          <ScoreRing
            score={scoreData.score}
            gradeColor={scoreData.gradeColor}
            gradeEmoji={scoreData.gradeEmoji}
            grade={scoreData.grade}
          />
        )}
      </div>

      {/* Simulator canvas */}
      <div className="relative bg-gradient-to-b from-sky-50 to-blue-50 mx-3 rounded-xl overflow-hidden" style={{ height: 200 }}>

        {/* Venue silhouette (bottom half) */}
        <svg
          width="140" height="100"
          viewBox="0 0 140 100"
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{ color: '#374151' }}
        >
          {getVenueShape(venue)}
        </svg>

        {/* Compass overlay */}
        <svg width="140" height="140" viewBox="0 0 140 140" className="absolute top-0 left-0">
          {/* Compass ring */}
          <circle cx={cx} cy={cy} r={compassR} fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />

          {/* Compass labels */}
          {COMPASS.map(({ label, angle }) => {
            const rad = (angle - 90) * (Math.PI / 180);
            const lx = cx + (compassR + 12) * Math.cos(rad);
            const ly = cy + (compassR + 12) * Math.sin(rad);
            return (
              <text key={label} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fontWeight="600" fill="#9ca3af">{label}</text>
            );
          })}

          {/* Shadow cone */}
          {isSunUp && shadowLength > 0 && (
            <path
              d={`M ${cx} ${cy} L ${s1X} ${s1Y} L ${s2X} ${s2Y} Z`}
              fill="#1e293b"
              opacity="0.12"
            />
          )}

          {/* Venue facing direction arrow */}
          <line
            x1={cx} y1={cy} x2={facingX} y2={facingY}
            stroke="#6366f1" strokeWidth="2" strokeDasharray="3 2"
            markerEnd="url(#arrowFacing)"
          />
          <defs>
            <marker id="arrowFacing" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 Z" fill="#6366f1" />
            </marker>
            <marker id="arrowSun" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 Z" fill={qualityColor} />
            </marker>
          </defs>

          {/* Sun ray */}
          {isSunUp && (
            <line
              x1={cx} y1={cy} x2={sunX} y2={sunY}
              stroke={qualityColor} strokeWidth="2.5"
              markerEnd="url(#arrowSun)"
            />
          )}

          {/* Sun dot at end of ray */}
          {isSunUp && (
            <circle cx={sunX} cy={sunY} r="6" fill={qualityColor} opacity="0.9" />
          )}
        </svg>

        {/* Sun status pill */}
        <div className="absolute top-2 right-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: displayQuality === 'direct' ? '#fef3c7' : displayQuality === 'partial' ? '#ffedd5' : '#f3f4f6',
              color: qualityColor,
            }}
          >
            {displayQuality === 'direct' ? '☀️ Direct sun' : displayQuality === 'partial' ? '🌤 Partial' : '☁️ Shade'}
          </span>
        </div>

        {/* Altitude badge */}
        {isSunUp && (
          <div className="absolute bottom-2 right-2">
            <span className="text-xs text-gray-400 bg-white/70 px-1.5 py-0.5 rounded-full">
              {Math.round(displayAltitude)}° alt
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-indigo-400" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #6366f1 0, #6366f1 3px, transparent 3px, transparent 5px)' }} />
            <span className="text-xs text-gray-400">Facing</span>
          </div>
          {isSunUp && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: qualityColor }} />
              <span className="text-xs text-gray-400">Sun</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500 font-medium">Timeline</span>
          {currentSlot && (
            <span className="text-xs font-bold" style={{ color: qualityColor }}>
              {currentSlot.label}
            </span>
          )}
        </div>

        {/* Colour bar */}
        <div className="flex gap-0.5 mb-2 rounded-full overflow-hidden h-3">
          {timeline.map((slot, i) => (
            <button
              key={i}
              className="flex-1 transition-all hover:opacity-80"
              style={{
                backgroundColor:
                  slot.quality === 'direct' ? '#fbbf24' :
                  slot.quality === 'partial' ? '#fb923c' :
                  slot.isSunUp ? '#e5e7eb' : '#1e293b',
                opacity: scrubIndex === i ? 1 : 0.7,
                outline: scrubIndex === i ? `2px solid ${qualityColor}` : 'none',
              }}
              onClick={() => setScrubIndex(i)}
              aria-label={`View sun at ${slot.label}`}
            />
          ))}
        </div>

        {/* Hour labels */}
        <div className="flex justify-between text-gray-400" style={{ fontSize: '9px' }}>
          {['6am', '9am', '12pm', '3pm', '6pm', '8pm'].map(l => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>

      {/* Solar info row */}
      {liveData?.solar && (
        <div className="flex justify-around text-center px-3 py-3 border-t border-gray-50 mt-1">
          <div>
            <p className="text-xs text-gray-400">Sunrise</p>
            <p className="text-sm font-semibold text-gray-700">{liveData.solar.sunriseLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Solar Noon</p>
            <p className="text-sm font-semibold text-gray-700">{liveData.solar.solarNoonLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Golden Hour</p>
            <p className="text-sm font-semibold text-amber-500">{liveData.solar.goldenHourStartLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Sunset</p>
            <p className="text-sm font-semibold text-gray-700">{liveData.solar.sunsetLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}

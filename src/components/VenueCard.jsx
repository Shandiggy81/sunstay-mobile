import React from 'react';

const SUN_SCORE_CONFIG = {
  90: { label: 'Blazing', emoji: '🔥', color: '#FF4500', bg: '#FFF0E8' },
  70: { label: 'Sunny', emoji: '☀️', color: '#FFB300', bg: '#FFFDE7' },
  50: { label: 'Partly Sunny', emoji: '⛅', color: '#FB8C00', bg: '#FFF3E0' },
  30: { label: 'Cloudy', emoji: '🌤️', color: '#78909C', bg: '#ECEFF1' },
   0: { label: 'Shaded', emoji: '☁️', color: '#607D8B', bg: '#ECEFF1' },
};

function getSunConfig(score) {
  const thresholds = [90, 70, 50, 30, 0];
  const key = thresholds.find(t => score >= t);
  return SUN_SCORE_CONFIG[key] || SUN_SCORE_CONFIG[0];
}

function SunScoreBadge({ score }) {
  const config = getSunConfig(score);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      background: config.bg,
      border: `1.5px solid ${config.color}`,
      borderRadius: '20px',
      padding: '4px 10px',
      fontSize: '12px',
      fontWeight: '700',
      color: config.color,
    }}>
      <span>{config.emoji}</span>
      <span>{score}/100</span>
      <span style={{ fontWeight: 400 }}>{config.label}</span>
    </div>
  );
}

function SunTimingBadges({ sunrise, sunset }) {
  const now = new Date();
  const sunriseTime = new Date(sunrise);
  const sunsetTime = new Date(sunset);
  const minutesToSunset = (sunsetTime - now) / 60000;
  const minutesSinceSunrise = (now - sunriseTime) / 60000;

  const isMorning = minutesSinceSunrise < 180;       // within 3hrs of sunrise
  const isGoldenHour = minutesToSunset < 90 && minutesToSunset > 0;

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {isMorning && (
        <span style={badgeStyle('#E3F2FD', '#1565C0')}>
          🌅 Morning Sun
        </span>
      )}
      {isGoldenHour && (
        <span style={badgeStyle('#FFF8E1', '#F57F17')}>
          🌇 Golden Hour Now
        </span>
      )}
      {!isMorning && !isGoldenHour && (
        <span style={badgeStyle('#F3E5F5', '#7B1FA2')}>
          🕐 {new Date(sunset).toLocaleTimeString('en-AU', {
            hour: '2-digit', minute: '2-digit'
          })} Sunset
        </span>
      )}
    </div>
  );
}

const badgeStyle = (bg, color) => ({
  background: bg,
  color,
  borderRadius: '12px',
  padding: '3px 9px',
  fontSize: '11px',
  fontWeight: '600',
});

export default function VenueCard({ venue, weather, onClose, onCenter }) {
  const {
    venueName: name,
    typeCategory: type,           // e.g. "Rooftop Bar"
    suburb,
    rating,
    reviewCount,
    tags = [],      // e.g. ["Pet Friendly", "Craft Beer"]
    image,
    distance,       // metres
  } = venue;

  // Map WeatherContext payload to Card props
  const sunScore = weather?.sunScore;
  const uvIndex = weather?.uvi;
  const sunrise = weather?.sys?.sunrise ? weather.sys.sunrise * 1000 : null;
  const sunset = weather?.sys?.sunset ? weather.sys.sunset * 1000 : null;
  const temperature = weather?.main?.temp;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '16px',
      right: '16px',
      zIndex: 999999,
      background: 'white',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      fontFamily: 'system-ui, sans-serif',
      maxHeight: 'calc(100vh - 100px)',
      overflowY: 'auto',
    }}>
      {/* Venue Image */}
      <div style={{ position: 'relative' }}>
        <img
          src={image || '/assets/sunny-mascot.jpg'}
          alt={name}
          style={{ width: '100%', height: '160px', objectFit: 'cover' }}
        />
        {/* Close Button injected for app functionality constraint */}
        {onClose && (
          <button 
            onClick={onClose}
            style={{
              position: 'absolute', top: '10px', left: '10px',
              background: 'rgba(0,0,0,0.6)', color: 'white',
              border: 'none', borderRadius: '50%', width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              fontSize: '16px', fontWeight: 'bold'
          }}>
            ×
          </button>
        )}
        {/* Distance pill */}
        {distance && (
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            background: 'rgba(0,0,0,0.6)', color: 'white',
            borderRadius: '12px', padding: '4px 10px', fontSize: '11px'
          }}>
            📍 {distance < 1000
              ? `${distance}m`
              : `${(distance / 1000).toFixed(1)}km`}
          </span>
        )}
        {/* Sun score overlay */}
        {sunScore !== undefined && (
          <div style={{
            position: 'absolute', bottom: '10px', left: '10px'
          }}>
            <SunScoreBadge score={sunScore} />
          </div>
        )}
      </div>

      {/* Card Body */}
      <div style={{ padding: '14px' }}>

        {/* Name + Rating */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '4px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>
              {name}
            </h3>
            <p style={{
              margin: '2px 0 0', fontSize: '13px',
              color: '#666'
            }}>
              {type || venue.vibe || 'Venue'} · {suburb}
            </p>
          </div>
          {(rating || venue.rating) && (
            <div style={{
              textAlign: 'center', background: '#FFEA00',
              borderRadius: '10px', padding: '4px 8px', minWidth: '42px'
            }}>
              <div style={{ fontSize: '15px', fontWeight: '800' }}>
                ⭐ {rating || venue.rating || '4.8'}
              </div>
              <div style={{ fontSize: '10px', color: '#555' }}>
                {reviewCount || 120} reviews
              </div>
            </div>
          )}
        </div>

        {/* Sun timing badges */}
        {sunrise && sunset && (
          <div style={{ margin: '10px 0 8px' }}>
            <SunTimingBadges sunrise={sunrise} sunset={sunset} />
          </div>
        )}

        {/* UV + Temp row */}
        {uvIndex !== undefined && (
          <div style={{
            display: 'flex', gap: '8px',
            margin: '8px 0', fontSize: '12px', color: '#555'
          }}>
            <span>🌡️ {temperature}°C</span>
            <span>·</span>
            <span style={{
              color: uvIndex >= 8 ? '#E53935'
                   : uvIndex >= 5 ? '#FB8C00' : '#43A047'
            }}>
              UV {uvIndex} {uvIndex >= 8 ? '— Wear SPF!' : uvIndex >= 5 ? '— Moderate' : '— Low'}
            </span>
          </div>
        )}

        {/* Feature tags */}
        {tags.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px'
          }}>
            {tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                background: '#F5F5F5', borderRadius: '10px',
                padding: '4px 10px', fontSize: '11px', color: '#444'
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* CTA Button */}
        <button 
          onClick={() => onCenter && onCenter(venue)}
          style={{
          width: '100%', marginTop: '14px',
          background: 'linear-gradient(135deg, #FFB300, #FF8F00)',
          color: 'white', border: 'none', borderRadius: '12px',
          padding: '12px', fontSize: '15px', fontWeight: '700',
          cursor: 'pointer', letterSpacing: '0.3px'
        }}>
          View Venue ☀️
        </button>
      </div>
    </div>
  );
}

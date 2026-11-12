import { feelsLikeIconName, forecastKindIconName } from './clayIcons.js';
import { scoreBand } from './scoreRing.js';
import { sunStatText } from './venueSun.js';
import { windChip } from './venueConditionChips.js';
import { scoreDisplayState } from './scoreDisplay.js';

// "Sun now: Rain now" reads oddly; rain and cloud are the sky, not the sun.
const SKY_NOW = { rain: 'Raining', cloud: 'Cloudy' };

/**
 * Display values from the same venue forecast and sheltered wind as the list.
 * `sunNow` (outdoorSunSummary) replaces the forecast's "Sun now" cell when the
 * card shows the venue's building-shaded sun moments.
 */
export function venueStatTiles({ venue, weather, forecast, score, scoreLoading, feelsLike, sunNow = null, isNight = false, skyKindAtScore = null, microclimate = null }) {
  const wind = windChip(venue, weather, microclimate);
  const nowKind = sunNow ? sunNow.kind : forecast?.now?.kind;
  const scoreState = scoreDisplayState({ isNight, skyKind: skyKindAtScore });
  return [
    SKY_NOW[nowKind]
      ? { label: 'Right now', icon: forecastKindIconName(nowKind), value: SKY_NOW[nowKind] }
      : sunNow
      ? { label: 'Sun now', icon: forecastKindIconName(sunNow.kind), value: sunNow.statText }
      : { label: 'Sun now', icon: forecastKindIconName(forecast?.now?.kind), value: sunStatText(forecast) },
    { label: 'Wind here', icon: 'windsock', value: wind?.text ?? 'Unavailable', note: wind ? `${wind.kmh} km/h` : null },
    { label: 'Feels like', icon: feelsLikeIconName(feelsLike), value: Number.isFinite(feelsLike) ? `${Math.round(feelsLike)}°` : '–' },
    !scoreLoading && scoreState === 'night'
      ? { label: 'Sun score', icon: 'night', value: 'After dark', note: 'back at sunrise' }
      : !scoreLoading && scoreState === 'rain'
      ? { label: 'Sun score', icon: 'rain', value: 'Raining', note: 'no direct sun' }
      : scoreLoading || !Number.isFinite(score)
      ? { label: 'Sun score', icon: 'sun', value: scoreLoading ? '…' : '–', note: 'out of 100' }
      // The ring shows the number; the words say what it means.
      : { label: 'Sun score', icon: 'sun', ring: Math.round(score), value: scoreBand(score), note: `${Math.round(score)} out of 100` },
  ];
}

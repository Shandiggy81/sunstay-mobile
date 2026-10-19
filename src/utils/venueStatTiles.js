import { feelsLikeIconName, forecastKindIconName } from './clayIcons.js';
import { sunStatText } from './venueSun.js';
import { windChip } from './venueConditionChips.js';

/**
 * Display values from the same venue forecast and sheltered wind as the list.
 * `sunNow` (outdoorSunSummary) replaces the forecast's "Sun now" cell when the
 * card shows the venue's building-shaded sun moments.
 */
export function venueStatTiles({ venue, weather, forecast, score, scoreLoading, feelsLike, sunNow = null }) {
  const wind = windChip(venue, weather);
  return [
    sunNow
      ? { label: 'Sun now', icon: forecastKindIconName(sunNow.kind), value: sunNow.statText }
      : { label: 'Sun now', icon: forecastKindIconName(forecast?.now?.kind), value: sunStatText(forecast) },
    { label: 'Wind here', icon: 'windsock', value: wind?.text ?? 'Unavailable', note: wind ? `${wind.kmh} km/h` : null },
    { label: 'Feels like', icon: feelsLikeIconName(feelsLike), value: Number.isFinite(feelsLike) ? `${Math.round(feelsLike)}°` : '–' },
    { label: 'Sun score', icon: 'sun', value: scoreLoading ? '…' : Number.isFinite(score) ? String(Math.round(score)) : '–', note: 'out of 100' },
  ];
}

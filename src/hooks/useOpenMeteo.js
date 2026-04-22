/**
 * useOpenMeteo — lightweight adapter over WeatherContext.
 * Previously made its own Open-Meteo fetch; now reads from the
 * shared WeatherContext to eliminate duplicate API calls.
 *
 * Returns the same {data, loading, error} shape as before
 * so all existing consumers continue to work unchanged.
 */
import { useWeather } from '../context/WeatherContext';
export function useOpenMeteo(lat, lng) {
  const { weather, loading } = useWeather();
  if (!weather) return { data: null, loading, error: null };
  const current = weather;
  // Re-expose data in the shape existing consumers expect
  const data = {
    current: {
      temp:              Math.round(current.main?.temp ?? 20),
      feelsLike:         Math.round(current.main?.feels_like ?? 20),
      uvIndex:           current.uvi ?? 0,
      uvIndexClearSky:   current.uvi ?? 0,
      solarRadiation:    Math.round(current.shortwaveRadiation ?? 0),
      directRadiation:   Math.round(current.shortwaveRadiation ?? 0),
      diffuseRadiation:  0,
      sunshineDuration:  0,
      cloudCover:        current.cloudCoverPct ?? current.clouds?.all ?? 0,
      windSpeed:         current.wind?.speed ?? 0,
      windGusts:         current.windGusts ?? 0,
      precipitation:     0,
      weatherCode:       current.weather?.[0]?.id ?? 0,
      isDay:             (current.isDay ?? 1) === 1,
    },
    daily: null,
    sunstayScore:  null, // consumed from liveSunScore in context
    scoreLabel:    null,
    lastUpdated:   new Date(),
  };
  return { data, loading, error: null };
}

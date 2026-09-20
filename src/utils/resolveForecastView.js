/**
 * Distinct visual states for the Sun Forecast tab / hourly strip.
 * Missing or undefined timeline data must resolve to `empty`, not a blank shell.
 */

export function forecastItemCount(items) {
  return Array.isArray(items) ? items.length : 0;
}

export function forecastDataPresent(items) {
  return forecastItemCount(items) > 0;
}

export function resolveForecastView({ loading = false, error = false, items } = {}) {
  if (loading) return 'loading';
  if (error) return 'error';
  return forecastDataPresent(items) ? 'success' : 'empty';
}

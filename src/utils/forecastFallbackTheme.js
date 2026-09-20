/**
 * Visual tokens for Sun Forecast empty/error cards.
 * Success and loading must not use this — they keep their own timeline UI.
 */
export const FORECAST_FALLBACK_IMAGE_SIZE = 96;

export function forecastFallbackTheme(view) {
  if (view === 'empty') {
    return {
      variant: 'empty',
      role: 'status',
      background: '#FFFBEB',
      border: '1px solid rgba(245,158,11,0.22)',
      titleColor: '#92400E',
      bodyColor: '#B45309',
      mascot: true,
      imageWidth: FORECAST_FALLBACK_IMAGE_SIZE,
      imageHeight: FORECAST_FALLBACK_IMAGE_SIZE,
    };
  }
  if (view === 'error') {
    return {
      variant: 'error',
      role: 'alert',
      background: '#FFF1F2',
      border: '1px solid rgba(225,29,72,0.18)',
      titleColor: '#9F1239',
      bodyColor: '#BE123C',
      mascot: true,
      imageWidth: FORECAST_FALLBACK_IMAGE_SIZE,
      imageHeight: FORECAST_FALLBACK_IMAGE_SIZE,
    };
  }
  return null;
}

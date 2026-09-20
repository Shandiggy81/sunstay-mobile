import React from 'react';
import bruceyOffline from '../../assets/mascots/brucey-offline-v2.png';
import { forecastFallbackTheme } from '../../utils/forecastFallbackTheme';

/**
 * Shared empty/error card for the Sun Forecast hourly strip.
 *
 * Brucey is decorative; the title and body already announce the state.
 * Only `empty` and `error` themes render — success/loading return null.
 */
export default function ForecastFallbackCard({ variant, title, children, ...rest }) {
  const theme = forecastFallbackTheme(variant);
  if (!theme) return null;

  return (
    <div
      role={theme.role}
      style={{
        background: theme.background,
        borderRadius: 12,
        padding: '14px 16px',
        margin: 0,
        border: theme.border,
      }}
      {...rest}
    >
      <img
        src={bruceyOffline}
        alt=""
        aria-hidden="true"
        width={theme.imageWidth}
        height={theme.imageHeight}
        decoding="async"
        draggable={false}
        className="mx-auto mb-3 h-24 w-24 object-contain"
      />
      <span style={{ fontSize: 13, color: theme.titleColor, fontWeight: 700, display: 'block' }}>
        {title}
      </span>
      <span style={{ fontSize: 12, color: theme.bodyColor, fontWeight: 500 }}>
        {children}
      </span>
    </div>
  );
}

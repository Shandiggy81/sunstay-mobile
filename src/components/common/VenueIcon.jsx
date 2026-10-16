import React from 'react';
import ClayIcon from './ClayIcon';

/**
 * A venue's icon in lists and cards, matching its map pin: the clay icon when
 * there is one, otherwise the venue's own emoji (🥡, 🍨, 🥐). `icon` comes from
 * venueIcon() in utils/clayIcons.
 */
export default function VenueIcon({ icon, size = 24, className = '' }) {
  if (icon?.emoji) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.78), lineHeight: 1 }}
      >
        {icon.emoji}
      </span>
    );
  }
  return <ClayIcon name={icon?.name ?? 'map-pin'} size={size} className={className} />;
}

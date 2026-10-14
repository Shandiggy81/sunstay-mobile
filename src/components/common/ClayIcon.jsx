import React from 'react';
import { clayIconUrls } from '../../utils/clayFilterIcons';

// Hashed URLs for every src/assets/clay/*.webp (256px), keyed by file name.
const CLAY_URLS = clayIconUrls(
  import.meta.glob('../../assets/clay/*.webp', { eager: true, import: 'default' }),
);

export function clayIconUrl(name) {
  return name && Object.prototype.hasOwnProperty.call(CLAY_URLS, name) ? CLAY_URLS[name] : null;
}

/**
 * A decorative clay icon. Without a matching file it renders a neutral dot,
 * so a missing icon never leaves a hole in a row.
 */
export default function ClayIcon({ name, size = 24, className = '', alt = '' }) {
  const src = clayIconUrl(name);
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="h-2 w-2 rounded-full bg-slate-300" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`shrink-0 select-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Pointer-tilt (rotateX/Y + preserve-3d) fights iOS overflow/sticky.
 * Only enable it for hover-capable fine pointers with no touch points.
 */
export function canUsePointerTilt(env = globalThis) {
  const nav = env?.navigator ?? env;
  const win = env?.window ?? env;
  const maxTouchPoints = Number(nav?.maxTouchPoints) || 0;
  if (maxTouchPoints > 0) return false;

  const matchMedia = typeof win?.matchMedia === 'function'
    ? win.matchMedia.bind(win)
    : (typeof env?.matchMedia === 'function' ? env.matchMedia : null);

  if (typeof matchMedia !== 'function') return false;
  return Boolean(matchMedia('(hover: hover) and (pointer: fine)')?.matches);
}

/** One visible sun/wind sentence; the existing row aria-label stays independent. */
export function listRowSunLine({ rowSunLine, sunText, windText } = {}) {
    const clean = value => typeof value === 'string' ? value.trim().replace(/^Now:\s*/i, '').trim() : '';
    return [clean(rowSunLine) || clean(sunText), clean(windText)].filter(Boolean).join(' · ') || null;
}

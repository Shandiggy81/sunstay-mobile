/**
 * One visible sun/wind sentence; the existing row aria-label stays independent.
 * `openSkyHidden`: the row's sun comes from the buildings (a café row, loading or
 * ready) or a sun-moment line, so the open-sky text is left out rather than
 * contradict the shade, as the aria-label already does.
 */
export function listRowSunLine({ rowSunLine, sunText, windText, openSkyHidden = false } = {}) {
    const clean = value => typeof value === 'string' ? value.trim().replace(/^Now:\s*/i, '').trim() : '';
    const sun = clean(rowSunLine) || (openSkyHidden ? '' : clean(sunText));
    return [sun, clean(windText)].filter(Boolean).join(' · ') || null;
}

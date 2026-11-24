/**
 * A venue list row's accessible name.
 *
 * The row's button shows the venue's name, its type and suburb, its sun line and
 * any reason lines. The name says those first, word for word and in the same
 * order, so it passes Label in Name (WCAG 2.5.3, see labelInName.js). Then come
 * the facts the button doesn't show: the stay's sun moment, how café sun hours
 * are measured, the wind speed, outdoor spaces, the sun score, feels-like and
 * access. "Venue:" leads, so the rows are easy to tell from other buttons.
 *
 * Text values are what the row renders, or null when it renders nothing.
 *
 * @param {object} row
 * @param {string} row.venueName
 * @param {string|null} [row.subtitle] Type and suburb, e.g. "Cafe · Melbourne".
 * @param {string|null} [row.sunLine] The visible sun line, e.g. "Sunny until 8pm · Light wind".
 * @param {Array<string|null>} [row.notes] Visible reason lines, in screen order.
 * @param {string|null} [row.stayBadge] A stay's sun-moment badge, shown below the button.
 * @param {boolean} [row.clearDaySun] The sun line is a café's direct-sun hours on a clear day.
 * @param {number|null} [row.windKmh]
 * @param {string[]} [row.outdoor] Outdoor-space words, e.g. "Beer garden".
 * @param {{ state: 'score'|'night'|'rain', value: number }|null} [row.score]
 * @param {number|null} [row.feelsLike]
 * @param {string[]} [row.amenities]
 * @returns {string}
 */
export function venueRowLabel({
    venueName,
    subtitle = null,
    sunLine = null,
    notes = [],
    stayBadge = null,
    clearDaySun = false,
    windKmh = null,
    outdoor = [],
    score = null,
    feelsLike = null,
    amenities = [],
} = {}) {
    const parts = [
        `Venue: ${text(venueName) || 'Unnamed venue'}`,
        text(subtitle),
        text(sunLine),
        ...notes.map(text),
        text(stayBadge),
        clearDaySun ? 'Sun hours are direct sun on a clear day' : '',
        Number.isFinite(windKmh) ? `Wind ${windKmh} km/h` : '',
        ...outdoor.map(text),
        scorePhrase(score),
        Number.isFinite(feelsLike) ? `Feels like ${feelsLike} degrees` : '',
        amenities.map(text).filter(Boolean).join(', '),
    ].map(part => part.replace(/[.\s]+$/u, '')).filter(Boolean);
    return `${parts.join('. ')}.`;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function scorePhrase(score) {
    if (!score) return '';
    if (score.state === 'night') return 'Sun score not shown after dark';
    if (score.state === 'rain') return 'Sun score not shown while it rains';
    return Number.isFinite(score.value) ? `Sun score ${score.value} out of 100` : '';
}

import { isFoodTypeFilter } from './venueFoodType.js';
import { PROPERTY_FILTERS } from './propertyTypes.js';
import { SUN_MOMENT_FILTERS } from './sunMomentFilters.js';
import { quickStayDate, SUN_MOMENTS } from './stayRanking.js';
import { formatGuestDate } from './balconySunEngine.js';
import { formatHour } from './sunForecastState.js';

// Presets write the existing filters/ranking controls; they never decide
// whether a venue has sun, shelter, a balcony or reservation availability.
export const DISCOVERY_EXPERIENCES = Object.freeze([
    { id: 'sunset', label: 'Sunset drinks', detail: 'Find evening sun', icon: 'cocktail', filters: ['moment-sunset'] },
    { id: 'cozy', label: 'Cozy spots', detail: 'Shelter & heating', icon: 'fireplace', filters: ['cozy-mode'] },
    { id: 'morning-stay', label: 'Morning stays', detail: 'Explore room sun', icon: 'coffee', filters: ['all-stays'], moment: 'coffee' },
    { id: 'sunny-stay', label: 'Sunny stays', detail: 'Compare sun potential', icon: 'hotel-views', filters: ['all-stays'], moment: 'most' },
]);

const OWNED_FILTERS = new Set(['sunny-mode', 'cozy-mode', 'all-hotels', 'all-bars',
    ...PROPERTY_FILTERS.map(f => f.id), ...SUN_MOMENT_FILTERS.map(f => f.id)]);

export function clearExperience(filters) {
    return (filters ?? []).filter(id => !OWNED_FILTERS.has(id));
}

export function selectExperience(filters, id) {
    const experience = DISCOVERY_EXPERIENCES.find(item => item.id === id);
    if (!experience) throw new RangeError('Unknown discovery experience');
    // A stay replaces food categories, but never accessibility/diet/pet needs.
    const keep = clearExperience(filters).filter(filter => !experience.moment || !isFoodTypeFilter(filter));
    return { filters: [...new Set([...keep, ...experience.filters])], moment: experience.moment ?? null };
}

export function selectedExperience(filters, moment) {
    const selected = (filters ?? []).filter(id => OWNED_FILTERS.has(id));
    return DISCOVERY_EXPERIENCES.find(item => item.filters.length === selected.length
        && item.filters.every(id => selected.includes(id)) && (!item.moment || item.moment === moment))?.id ?? null;
}

export function selectedStayDateLabel(date, now = new Date()) {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : quickStayDate(date || 'today', now);
    const instant = new Date(`${key}T12:00:00Z`);
    if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== key) return 'Choose a date';
    const prefix = !date || date === 'today' ? 'Today · ' : date === 'tomorrow' ? 'Tomorrow · ' : date === 'saturday' ? 'This Saturday · ' : '';
    return prefix + formatGuestDate(instant, 'UTC');
}

export function discoveryContext({ filters = [], moment = 'coffee', date = null, todMinutes = null, now = new Date() } = {}) {
    if (filters.includes('all-stays')) return `${selectedStayDateLabel(date, now)} · ${SUN_MOMENTS[moment]} · Melbourne time`;
    const moments = SUN_MOMENT_FILTERS.filter(item => filters.includes(item.id)).map(item => item.label);
    return moments.length ? `Today · ${moments.join(' + ')} · Melbourne time`
        : todMinutes != null ? `Today · Map preview ${formatHour(todMinutes / 60)} · Melbourne time` : 'Today · Now in Melbourne';
}

export function discoveryDataLabel({ source, loading, error, weather, weatherLoading } = {}) {
    const listings = loading ? 'Loading listings' : source !== 'supabase' ? 'Sample listings'
        : error ? 'Previously loaded listings · refresh failed' : 'Venue listings';
    const sky = weatherLoading ? 'loading weather' : !weather || weather.unavailable || weather.source === 'demo'
        ? 'forecast unavailable' : 'Open-Meteo forecast';
    return `${listings} · ${sky}. Sun exposure is modelled, not guaranteed.`;
}

/** Only repeat a moment match when the existing engine actually returned it. */
export function matchedMomentLabel(keys, filters) {
    const selected = SUN_MOMENT_FILTERS.filter(item => filters?.includes(item.id));
    if (!selected.length || !selected.every(item => keys?.includes(item.moment))) return null;
    return { icon: selected[0].icon, text: `Potential ${selected.map(item => item.label.toLowerCase()).join(' + ')} · today` };
}

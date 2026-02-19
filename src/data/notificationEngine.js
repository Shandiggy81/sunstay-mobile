/**
 * Sunstay Notification Engine
 * ──────────────────────────────────────────────────────────────
 * Generates intelligent, weather-aware notifications by evaluating
 * real-time conditions against user preferences.
 *
 * Categories:
 *   1. Perfect Conditions — saved venue matches ideal weather
 *   2. Booking Urgency   — demand signals + flash deals
 *   3. Weather Changes   — alerts for condition shifts
 *   4. Weekly Planning   — digest / planning summaries
 */

import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './windIntelligence';

// ── Default User Preferences ─────────────────────────────────────
export const DEFAULT_PREFERENCES = {
    favoriteVenueIds: [],
    weatherPrefs: {
        minTemp: 22,
        maxTemp: 26,
        maxWind: 15,       // km/h
        preferSunny: true,
    },
    frequency: 'perfect',  // 'all' | 'perfect' | 'digest'
    alertTime: '08:00',
    venueTypes: [],         // empty = all types
    radiusKm: 10,
    enabledCategories: {
        perfectConditions: true,
        bookingUrgency: true,
        weatherChanges: true,
        weeklyPlanning: true,
    },
};

// ── Persistence Helpers ──────────────────────────────────────────
const PREFS_KEY = 'sunstay_notification_prefs';
const NOTIF_KEY = 'sunstay_notifications';
const DISMISSED_KEY = 'sunstay_dismissed';

export function loadPreferences() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_PREFERENCES };
}

export function savePreferences(prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadNotifications() {
    try {
        const raw = localStorage.getItem(NOTIF_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
}

export function saveNotifications(notifs) {
    // Keep last 50
    const trimmed = notifs.slice(0, 50);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(trimmed));
}

export function loadDismissed() {
    try {
        const raw = localStorage.getItem(DISMISSED_KEY);
        if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set();
}

export function saveDismissed(set) {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
}


// ── Notification ID Generator ────────────────────────────────────
let _notifSeq = Date.now();
function nextId() { return `n-${++_notifSeq}`; }


// ── Weather Condition Helpers ────────────────────────────────────
function getCondition(weather) {
    return (weather?.weather?.[0]?.main || '').toLowerCase();
}

function isSunny(weather) {
    const c = getCondition(weather);
    return c.includes('clear') || c.includes('sun');
}

function isCloudy(weather) {
    return getCondition(weather).includes('cloud');
}

function isRainy(weather) {
    const c = getCondition(weather);
    return c.includes('rain') || c.includes('drizzle') || c.includes('thunder');
}

function getUV(weather) {
    // Try several common API UV locations
    return weather?.uvi || weather?.current?.uvi || 0;
}

function isWeekend() {
    const day = new Date().getDay();
    return day === 0 || day === 6;
}

function isSunday() {
    return new Date().getDay() === 0;
}

function getDayName() {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
}

function timeStr() {
    return new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}


// ═══════════════════════════════════════════════════════════════════
// Generate Notifications
// ═══════════════════════════════════════════════════════════════════
/**
 * Evaluate weather + venues + prefs and return an array of new
 * Notification objects. Called periodically (e.g. every 5 min).
 *
 * @param {object} weather  — current OpenWeather API data
 * @param {array}  venues   — demoVenues array
 * @param {object} prefs    — user preferences object
 * @param {Set}    dismissed — set of already-dismissed notification IDs / dedup keys
 * @returns {Notification[]}
 */
export function generateNotifications(weather, venues, prefs, dismissed = new Set()) {
    if (!weather || !venues?.length) return [];

    const notifs = [];
    const now = new Date();
    const hour = now.getHours();
    const favVenues = venues.filter(v => prefs.favoriteVenueIds.includes(v.id));
    const temp = weather.main?.temp;
    const windSpeed = weather.wind?.speed;
    const humidity = weather.main?.humidity;
    const enabled = prefs.enabledCategories || {};

    // ── 1. PERFECT CONDITIONS ──────────────────────────────────
    if (enabled.perfectConditions !== false) {
        const targetVenues = favVenues.length > 0 ? favVenues : venues.slice(0, 6);

        targetVenues.forEach(venue => {
            const profile = getWindProfile(venue);
            const feelsLike = calculateApparentTemp(temp, windSpeed, humidity, profile.shelterFactor);
            const comfort = getComfortZone(Math.round(feelsLike));
            const wind = getWindWarning(windSpeed, venue);
            const wpref = prefs.weatherPrefs;

            const tempOk = feelsLike >= wpref.minTemp && feelsLike <= wpref.maxTemp;
            const windOk = (windSpeed * 3.6) <= wpref.maxWind;  // convert m/s to km/h
            const sunOk = !wpref.preferSunny || isSunny(weather);
            const isPerfect = tempOk && windOk && sunOk;

            const dedupKey = `perfect-${venue.id}-${now.toDateString()}`;
            if (isPerfect && !dismissed.has(dedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'perfect',
                    priority: 'high',
                    icon: '☀️',
                    title: `${venue.venueName} is perfect right now`,
                    body: `${Math.round(feelsLike)}°C, ${wind.level === 'green' ? 'calm winds' : 'light breeze'} — ideal for outdoor seating`,
                    venueId: venue.id,
                    venueName: venue.venueName,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'View Venue',
                });
            }

            // "Wind dying down" alert — venue was too windy, now OK
            const windDedupKey = `windcalm-${venue.id}-${now.toDateString()}`;
            if (wind.level === 'green' && profile.exposure > 0.5 && !dismissed.has(windDedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey: windDedupKey,
                    category: 'perfect',
                    priority: 'medium',
                    icon: '🍃',
                    title: `Wind died down at ${venue.venueName}`,
                    body: `Previously exposed to gusts — now calm enough for outdoor dining`,
                    venueId: venue.id,
                    venueName: venue.venueName,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Check It Out',
                });
            }
        });

        // Morning forecast alert (8–9am)
        if (hour >= 8 && hour <= 9 && isWeekend()) {
            const bestVenue = favVenues.length > 0 ? favVenues[0] : venues[0];
            const dedupKey = `morning-forecast-${now.toDateString()}`;
            if (bestVenue && isSunny(weather) && !dismissed.has(dedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'perfect',
                    priority: 'high',
                    icon: '🌅',
                    title: `${getDayName()} looks perfect for outdoor drinks`,
                    body: `${Math.round(temp)}°C and sunny — great for ${bestVenue.venueName}`,
                    venueId: bestVenue.id,
                    venueName: bestVenue.venueName,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Plan Your Day',
                });
            }
        }
    }

    // ── 2. BOOKING URGENCY ─────────────────────────────────────
    if (enabled.bookingUrgency !== false) {
        // High-demand sunny weekend
        if (isWeekend() && isSunny(weather)) {
            const dedupKey = `high-demand-${now.toDateString()}`;
            if (!dismissed.has(dedupKey)) {
                const demandCount = 5 + Math.floor(Math.random() * 8);
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'urgency',
                    priority: 'high',
                    icon: '🔥',
                    title: `High demand alert`,
                    body: `${demandCount} users are looking at sunny venues this ${getDayName()} — book early for the best spots`,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Browse Venues',
                });
            }
        }

        // Flash weather deal (unexpected sunshine)
        if (isSunny(weather) && hour >= 10 && hour <= 15) {
            const dealVenue = venues.find(v => v.tags?.includes('Beer Garden')) || venues[0];
            const dedupKey = `flash-deal-${now.toDateString()}`;
            if (dealVenue && !dismissed.has(dedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'urgency',
                    priority: 'medium',
                    icon: '⚡',
                    title: `Flash weather deal`,
                    body: `${dealVenue.venueName} offering 20% off today due to perfect sunshine`,
                    venueId: dealVenue.id,
                    venueName: dealVenue.venueName,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Claim Deal',
                });
            }
        }

        // Last sunny weekend nudge (autumn months)
        const month = now.getMonth(); // 0-indexed
        if ((month >= 3 && month <= 5) && isWeekend() && isSunny(weather)) {
            const dedupKey = `last-sunny-${now.toDateString()}`;
            if (!dismissed.has(dedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'urgency',
                    priority: 'low',
                    icon: '🍂',
                    title: `Make the most of autumn sun`,
                    body: `Sunny weekends are getting rare — check venue availability before winter hits`,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Find Spots',
                });
            }
        }
    }

    // ── 3. WEATHER CHANGE ALERTS ───────────────────────────────
    if (enabled.weatherChanges !== false) {
        // Wind picking up
        if (windSpeed > 8) {
            const affectedVenues = venues.filter(v => {
                const p = getWindProfile(v);
                return p.exposure > 0.6;
            }).slice(0, 2);

            affectedVenues.forEach(v => {
                const dedupKey = `wind-alert-${v.id}-${now.toDateString()}`;
                if (!dismissed.has(dedupKey)) {
                    notifs.push({
                        id: nextId(),
                        dedupKey,
                        category: 'weather',
                        priority: 'medium',
                        icon: '💨',
                        title: `Wind picking up at ${v.venueName}`,
                        body: `${Math.round(windSpeed * 3.6)} km/h gusts — indoor seating still available`,
                        venueId: v.id,
                        venueName: v.venueName,
                        time: now.toISOString(),
                        read: false,
                        actionLabel: 'Check Indoor Options',
                    });
                }
            });
        }

        // UV warning
        const uv = getUV(weather);
        if (uv >= 8) {
            const dedupKey = `uv-alert-${now.toDateString()}`;
            if (!dismissed.has(dedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'weather',
                    priority: 'high',
                    icon: '🔆',
                    title: `UV index extreme today`,
                    body: `UV ${uv} — bring sunscreen and consider shaded venues`,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Find Shade',
                });
            }
        }

        // Rain cleared — sunny after rain
        const clearingTime = weather?.rain_clearing_time;
        if (clearingTime && !dismissed.has(`rain-clear-${clearingTime}-${now.toDateString()}`)) {
            const dedupKey = `rain-clear-${clearingTime}-${now.toDateString()}`;
            notifs.push({
                id: nextId(),
                dedupKey,
                category: 'weather',
                priority: 'medium',
                icon: '🌈',
                title: `Rain clearing at ${clearingTime}`,
                body: `The storm is passing — your later bookings look perfect!`,
                time: now.toISOString(),
                read: false,
                actionLabel: 'Check Forecast',
            });
        }
        else if (isSunny(weather) && humidity > 70) {
            const dedupKey = `rain-clear-sun-${now.toDateString()}`;
            if (!dismissed.has(dedupKey)) {
                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'weather',
                    priority: 'medium',
                    icon: '🌈',
                    title: `Skies have cleared up`,
                    body: `Rain forecast changed to sunny — outdoor bookings look good!`,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'See Venues',
                });
            }
        }
    }

    // ── 4. WEEKLY PLANNING DIGEST ──────────────────────────────
    if (enabled.weeklyPlanning !== false) {
        if (isSunday() && hour >= 17 && hour <= 20) {
            const dedupKey = `weekly-digest-${now.toDateString()}`;
            if (!dismissed.has(dedupKey)) {
                const sunnyCount = venues.filter(v => {
                    const profile = getWindProfile(v);
                    return profile.exposure < 0.6;
                }).length;

                notifs.push({
                    id: nextId(),
                    dedupKey,
                    category: 'digest',
                    priority: 'low',
                    icon: '📋',
                    title: `Your weekly venue planner`,
                    body: `${sunnyCount} sheltered venues have weekday openings. Next weekend's forecast: ${isSunny(weather) ? 'looking sunny!' : 'mixed conditions.'}`,
                    time: now.toISOString(),
                    read: false,
                    actionLabel: 'Plan Ahead',
                });
            }
        }
    }

    // Deduplicate against existing dismissed
    return notifs.filter(n => !dismissed.has(n.dedupKey));
}


// ── Category Metadata ────────────────────────────────────────────
export const NOTIFICATION_CATEGORIES = {
    perfect: { label: 'Perfect Conditions', icon: '☀️', color: '#f59e0b' },
    urgency: { label: 'Booking Urgency', icon: '🔥', color: '#ef4444' },
    weather: { label: 'Weather Changes', icon: '🌦️', color: '#3b82f6' },
    digest: { label: 'Weekly Planning', icon: '📋', color: '#8b5cf6' },
};

export const FREQUENCY_OPTIONS = [
    { value: 'all', label: 'All weather updates', desc: 'Get notified about every change' },
    { value: 'perfect', label: 'Only perfect conditions', desc: 'Alert me when my ideal weather hits' },
    { value: 'digest', label: 'Weekly digest only', desc: 'One summary each Sunday evening' },
];

export const RADIUS_OPTIONS = [
    { value: 2, label: 'Within 2 km' },
    { value: 5, label: 'Within 5 km' },
    { value: 10, label: 'Within 10 km' },
    { value: 25, label: 'Within 25 km' },
    { value: 0, label: 'Anywhere in Melbourne' },
];

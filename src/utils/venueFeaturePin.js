import { areaReportNote, currentAreaReports } from './venueAreaReports.js';

/**
 * Current published area reports take precedence over device-local preview
 * switches. A venue row's stored fireplaceOn /
 * heatersOn is not live (it was seed data and never changes), so it is
 * ignored: a stored "on" would contradict the owner turning it off.
 * `liveFeatures` is the venue's entry from the live venue-feature map.
 */
export function liveWarmth(liveFeatures, now = Date.now()) {
    const live = liveFeatures || {};
    if (Array.isArray(live.publishedReports)) return {
        fireplaceOn: false, heatersOn: currentAreaReports(live.publishedReports, now).some(report => report.heaters_on),
    };
    return { fireplaceOn: live.fireplaceOn === true, heatersOn: live.heatersOn === true };
}

/** 'heater' when the owner has the fire lit or heaters on now, else null. */
export function venueFeaturePinState(_venue, liveFeatures) {
    const { fireplaceOn, heatersOn } = liveWarmth(liveFeatures);
    return fireplaceOn || heatersOn ? 'heater' : null;
}

/** The one-line live note for the card and list row, or null. */
export function liveWarmthNote(liveFeatures, { fireplaceLabel = 'Fireplace lit now', now = Date.now() } = {}) {
    if (Array.isArray(liveFeatures?.publishedReports)) return areaReportNote(liveFeatures, now);
    const { fireplaceOn, heatersOn } = liveWarmth(liveFeatures, now);
    if (fireplaceOn && heatersOn) return `${fireplaceLabel} · heaters on`;
    if (fireplaceOn) return fireplaceLabel;
    if (heatersOn) return 'Heaters on now';
    return null;
}

/** Partner preview switches start from this device's live state only; off means not set. */
export function ownerSwitchDefaults(liveFeatures) {
    const live = liveFeatures || {};
    const on = key => live[key] === true;
    return {
        sunshineNow: on('sunshineNow'), heatersOn: on('heatersOn'), fireplaceOn: on('fireplaceOn'),
        hasUmbrellas: on('hasUmbrellas'), hasWindProtection: on('hasWindProtection'),
    };
}

/**
 * Device-local persistence for the partner preview. Live statuses go stale,
 * so a saved preview older than maxAgeMs is dropped.
 */
export const LIVE_PREVIEW_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export function restoreLivePreview(raw, now = Date.now(), maxAgeMs = LIVE_PREVIEW_MAX_AGE_MS) {
    try {
        const saved = typeof raw === 'string' ? JSON.parse(raw) : null;
        if (!saved || typeof saved !== 'object' || !Number.isFinite(saved.savedAt)) return {};
        if (now - saved.savedAt > maxAgeMs || saved.savedAt > now + 60000) return {};
        return saved.features && typeof saved.features === 'object' && !Array.isArray(saved.features) ? saved.features : {};
    } catch {
        return {};
    }
}
export function serialiseLivePreview(features, now = Date.now()) {
    return JSON.stringify({ savedAt: now, features: features || {} });
}

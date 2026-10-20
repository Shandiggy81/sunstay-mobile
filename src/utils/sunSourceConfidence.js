/**
 * The slim "source · confidence" line under a venue's sun numbers
 * (docs/design/venue-sun-cards-brief.md §1.6), e.g.
 * "Calculated from City of Melbourne buildings · High confidence".
 *
 * Inputs, all as stored today:
 *   horizon            microclimate_profiles.sun_horizon_deg (36 sectors). The
 *                      sun windows exist only with it, so without it there is
 *                      no line.
 *   geometryConfidence microclimate_profiles.geometry_confidence, 0–1:
 *                      min(1, buildings within 150 m / 12) × the share of those
 *                      buildings whose height is measured (City of Melbourne
 *                      2023 data, a level count or a real height) rather than
 *                      the 6 m default (20261015224222_geometry_confidence_…).
 *   dataSource         venues.data_source: 'clue' for City of Melbourne CLUE
 *                      imports; null for venues entered by hand.
 *
 * An estimate never reads High: below SUN_CONFIDENCE_THRESHOLDS.calculated
 * the line says "Estimated" and the level is always Low.
 *
 * @module utils/sunSourceConfidence
 */
import { parseSunHorizon } from './sunMoments.js';

export const SUN_CONFIDENCE_THRESHOLDS = Object.freeze({
    /**
     * At or above: "Calculated". Below it most nearby heights are the 6 m
     * default, so the sun times are an estimate. The venue card already calls
     * readings under 0.5 "Modelled from street geometry" (VenueCard.jsx).
     */
    calculated: 0.5,
    /**
     * At or above: High (CLUE venues only). It needs about 10 or more
     * buildings in range with at least 80% of their heights measured; with
     * 12 or more buildings it is exactly an 80% measured share.
     */
    high: 0.8,
});

const LEVEL_LABELS = Object.freeze({ high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' });

/**
 * @param {{ horizon?: unknown, geometryConfidence?: unknown, dataSource?: unknown }} input
 * @returns {null | {
 *   kind: 'calculated'|'estimated',
 *   basis: string,
 *   confidence: 'high'|'medium'|'low',
 *   confidenceLabel: string,
 *   line: string,
 * }} `kind` is the DataBadge kind for the sun numbers. Null without a usable horizon.
 */
export function sunSourceConfidence({ horizon = null, geometryConfidence = null, dataSource = null } = {}) {
    if (!parseSunHorizon(horizon)) return null;

    const score = typeof geometryConfidence === 'number' ? geometryConfidence : Number.NaN;
    const usable = Number.isFinite(score) && score >= 0 && score <= 1;
    const officialLocation = dataSource === 'clue';

    let result;
    if (!usable || score < SUN_CONFIDENCE_THRESHOLDS.calculated) {
        result = { kind: 'estimated', basis: 'Estimated from mapped buildings', confidence: 'low' };
    } else {
        // High also needs the venue's point from an official dataset: the
        // horizon is ray-cast from that point, and hand-entered pins are approximate.
        result = {
            kind: 'calculated',
            basis: officialLocation ? 'Calculated from City of Melbourne buildings' : 'Calculated from mapped buildings',
            confidence: officialLocation && score >= SUN_CONFIDENCE_THRESHOLDS.high ? 'high' : 'medium',
        };
    }
    const confidenceLabel = LEVEL_LABELS[result.confidence];
    return { ...result, confidenceLabel, line: `${result.basis} · ${confidenceLabel}` };
}

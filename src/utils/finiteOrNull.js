/**
 * Coerce a value to a finite number, or null when it is absent or unusable.
 *
 * Number(null), Number('') and Number(false) all evaluate to 0, so absent
 * readings must be rejected before coercion — otherwise a missing temperature
 * reads as a real 0 °C measurement. Conversely NaN must never be returned,
 * because it silently survives every arithmetic and comparison it touches and
 * only surfaces at the very end as a rendered "NaN".
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function finiteOrNull(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * First usable finite number among several candidates.
 *
 * Useful for upstream payloads that ship more than one spelling of a field.
 *
 * @param {...unknown} values
 * @returns {number|null}
 */
export function firstFinite(...values) {
    for (const value of values) {
        const n = finiteOrNull(value);
        if (n !== null) return n;
    }
    return null;
}

/**
 * Geometry for the sun report's "Sun through the year" chart: a smooth area
 * of direct-sun hours across the 12 months (the 15th of each), drawn in the
 * same amber-hill style as the app's daily sun graph. Pure, so it is tested
 * without a browser; HotelSunReport draws the SVG and the HTML labels.
 */
export const YEAR_CHART = Object.freeze({ width: 360, height: 132, top: 14, bottom: 4 });

/** A round top for the axis: 2, 4, 6, 8, 10 or 12 hours. */
export function niceMaxHours(maxHours) {
    const m = Number.isFinite(maxHours) ? maxHours : 0;
    return Math.min(24, Math.max(2, Math.ceil(m / 2) * 2));
}

/** Monotone cubic (Fritsch–Carlson) path through the points: no overshoot below 0 or above the peak. */
export function smoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M${points[0].x},${points[0].y}`;
    const n = points.length;
    const dx = [], slope = [];
    for (let i = 0; i < n - 1; i++) {
        dx[i] = points[i + 1].x - points[i].x;
        slope[i] = (points[i + 1].y - points[i].y) / dx[i];
    }
    const tangent = [slope[0]];
    for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    tangent[n - 1] = slope[n - 2];
    for (let i = 0; i < n - 1; i++) {
        if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
        const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = Math.hypot(a, b);
        if (h > 3) { tangent[i] = 3 * a / h * slope[i]; tangent[i + 1] = 3 * b / h * slope[i]; }
    }
    const r = v => Math.round(v * 10) / 10;
    let d = `M${r(points[0].x)},${r(points[0].y)}`;
    for (let i = 0; i < n - 1; i++) {
        const p = points[i], q = points[i + 1], h = dx[i] / 3;
        d += ` C${r(p.x + h)},${r(p.y + tangent[i] * h)} ${r(q.x - h)},${r(q.y - tangent[i + 1] * h)} ${r(q.x)},${r(q.y)}`;
    }
    return d;
}

/**
 * @param {Array<{ month: number, label: string, hours: number }>} monthly
 * @param {{ currentMonth?: number|null }} [options] 1–12, marked as "Now"
 */
export function yearSunChart(monthly, { currentMonth = null } = {}) {
    const { width, height, top, bottom } = YEAR_CHART;
    const months = Array.isArray(monthly) ? monthly.filter(m => Number.isFinite(m?.hours)) : [];
    if (months.length === 0) return null;
    const maxHours = niceMaxHours(Math.max(...months.map(m => m.hours)));
    const column = width / months.length;
    const yFor = hours => top + (1 - Math.max(0, hours) / maxHours) * (height - top - bottom);
    const points = months.map((m, i) => ({
        month: m.month, label: m.label, hours: m.hours,
        x: column * (i + 0.5), y: yFor(m.hours),
        xPercent: Math.round(((i + 0.5) / months.length) * 1000) / 10,
        yPercent: Math.round((yFor(m.hours) / height) * 1000) / 10,
    }));
    const line = smoothPath(points);
    const baseline = height - bottom;
    const area = `${line} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;
    const ticks = [maxHours, maxHours / 2].map(h => ({ hours: h, label: `${h}h`, y: yFor(h), yPercent: Math.round((yFor(h) / height) * 1000) / 10 }));

    const sunny = points.filter(p => p.hours > 0);
    const most = sunny.length ? sunny.reduce((a, b) => (b.hours > a.hours ? b : a)) : null;
    const least = sunny.length > 1 ? points.reduce((a, b) => (b.hours < a.hours ? b : a)) : null;
    const now = points.find(p => p.month === currentMonth) ?? null;
    // Called-out values: now, the sunniest and the least sunny month, once each.
    const callouts = [];
    if (now) callouts.push({ ...now, kind: 'now', text: `Now · ${formatHours(now.hours)}` });
    for (const [p, kind] of [[most, 'most'], [least, 'least']]) {
        if (p && p.month !== now?.month && !callouts.some(c => c.month === p.month)) callouts.push({ ...p, kind, text: formatHours(p.hours) });
    }
    return { width, height, baseline, line, area, points, ticks, callouts, maxHours };
}

/** "7.5h", "3h", "0h". */
export function formatHours(hours) {
    if (!Number.isFinite(hours)) return '–';
    const r = Math.round(hours * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}h`;
}

/**
 * Forgiving search text. Folds case, accents, apostrophes (straight or the
 * curly ones iOS types), "&" and punctuation, so "dominos", "Domino’s" and
 * "Domino's" all match, as do "mork" and "Mörk". Typo matching is for when
 * nothing matches as typed: "wonderlnad" still finds Wonderland Bar.
 */
export function foldSearchText(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/['`´‘’]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export const searchWords = folded => (folded ? folded.split(' ') : []);

/** Optimal-string-alignment distance (a swap of neighbours counts as one) is at most `max`. */
export function editDistanceWithin(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prevPrev = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
            if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prevPrev[j - 2] + 1);
            row.push(value);
            best = Math.min(best, value);
        }
        if (best > max) return false;
        prevPrev = prev;
        prev = row;
    }
    return prev[b.length] <= max;
}

/**
 * Is query word `q` a slip of the keyboard away from (the start of) word `w`?
 * Words under 4 letters must match exactly; 4–7 letters allow one slip, 8+
 * allow two, and the first letter must be right (people rarely miss it, and
 * it keeps "wond" from finding "Pond"). The venue word may run on (the guest
 * is still typing) but may not be much shorter, so "brighton" does not
 * match "bright".
 */
function wordNear(q, w) {
    if (w.startsWith(q)) return true;
    if (q.length < 4 || w.length < q.length - 1 || q[0] !== w[0]) return false;
    const max = q.length >= 8 ? 2 : 1;
    for (let len = q.length - 1; len <= q.length + 1; len++) {
        if (len <= w.length && editDistanceWithin(q, w.slice(0, len), max)) return true;
    }
    return false;
}

/** Every query word is near some word of the text (both already folded). */
export function wordsNear(queryWords, textWords) {
    return queryWords.length > 0 && queryWords.every(q => textWords.some(w => wordNear(q, w)));
}

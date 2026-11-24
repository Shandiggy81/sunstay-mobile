/**
 * WCAG 2.5.3 Label in Name, the way axe-core 4.14 checks it
 * (`label-content-name-mismatch`): the words a control shows must appear in its
 * accessible name, in the same order and unbroken, so a speech user can say
 * what they see. Words are letters and numbers only: "16°" matches "16",
 * "km/h" matches "km h", and emoji and separators such as "·" don't count.
 *
 * axe reads the visible text node by node without adding the spaces that layout
 * gives, so sibling elements inside a labelled control need whitespace between
 * them, or "Clear sky" and "Light breeze" read as "skylight breeze".
 */

/** The words in `text`, lower-cased, with accents, emoji and punctuation dropped. */
export function labelWords(text) {
    if (typeof text !== 'string') return [];
    return text.normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/\p{Extended_Pictographic}/gu, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .toLowerCase()
        .split(' ')
        .filter(Boolean);
}

/** True when every word of `visible` appears, in order and unbroken, in `name`. */
export function nameContainsLabel(name, visible) {
    const haystack = labelWords(name);
    const needle = labelWords(visible);
    if (!needle.length) return true;
    for (let start = 0; start + needle.length <= haystack.length; start += 1) {
        if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
    }
    return false;
}

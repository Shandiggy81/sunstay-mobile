/** Settle delay before search drives filter / score / GeoJSON / fitBounds. */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * Leading-edge-off debouncer: rapid calls collapse to one invocation of `fn`
 * after `wait` ms of quiet. Used so keystrokes do not refit the map.
 */
export function createDebouncer(fn, wait = SEARCH_DEBOUNCE_MS) {
    let timer = null;
    function debounced(...args) {
        if (timer != null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, wait);
    }
    debounced.cancel = () => {
        if (timer != null) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return debounced;
}

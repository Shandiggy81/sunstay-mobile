/** Display a broad food category without presenting an uncertain import as a restaurant. */
export function venueTypeLabel(value) {
    const label = String(value ?? '').trim();
    return label.toLowerCase() === 'eatery' ? 'Food & drink' : label;
}

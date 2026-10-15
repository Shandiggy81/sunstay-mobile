/**
 * Where a venue's listing came from, for the venue card. Curated venues
 * (data_source null) show nothing. Imported City of Melbourne CLUE venues
 * must credit the council (CC BY 4.0) and say they aren't verified yet.
 */
export const CLUE_DATASET_URL = 'https://data.melbourne.vic.gov.au/explore/dataset/cafes-and-restaurants-with-seating-capacity/';

/**
 * @param {object|null|undefined} venue
 * @returns {{ seats: string|null, credit: string, linkLabel: string, url: string }|null}
 */
export function venueSourceNote(venue) {
    if (venue?.data_source !== 'clue') return null;
    const n = Number(venue.outdoor_seats);
    const seats = Number.isInteger(n) && n > 0 ? `${n} outdoor ${n === 1 ? 'seat' : 'seats'} (council count)` : null;
    return {
        seats,
        credit: 'Listing from City of Melbourne open data (CC BY 4.0). Not yet verified by SunStay.',
        linkLabel: 'City of Melbourne open data',
        url: CLUE_DATASET_URL,
    };
}

// A short-stay home for the partner-preview specs, served as a row of the fake venues
// table. There's no short-stay home in the demo data, so this is test-only and not a real
// listing. It records a balcony on one modelled side and a garden that could be private or
// shared, the way a host's listing often does.
export const SHORT_STAY_FIXTURE = Object.freeze({
  id: 'fixture-short-stay',
  venueName: 'Sample home, Fitzroy',
  typeCategory: 'Short stay',
  typeLabel: 'Short stay',
  suburb: 'Fitzroy',
  lat: -37.7978,
  lng: 144.9779,
  emoji: '🏡',
  tags: ['Short stay', 'Balcony', 'Garden'],
  hasBalcony: true,
  heating: 'indoor only',
  price: '$$',
  venue_description: 'Test fixture: a one-bedroom short-stay home with a balcony. The listing also mentions a garden.',
  roomTypes: [{
    id: 'fixture-short-stay-facade-0',
    name: 'North-west-facing rooms · Level 1',
    source: 'estimated-buildings',
    orientation: 315,
    floorLevel: 1,
    floorHeight: 4.2,
    wallMetres: 8,
    obstructions: [
      { start: 255, end: 285, minAltitude: 20 },
      { start: 330, end: 350, minAltitude: 12 },
    ],
  }],
});

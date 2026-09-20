export const ACCOMMODATION_VIBES = [
  'hotel', 'airbnb', 'apartment', 'loft', 'penthouse',
  'suite', 'villa', 'resort', 'motel', 'hostel', 'bnb',
  'bed and breakfast', 'serviced', 'boutique hotel', 'accommodation',
  'stay', 'lodge', 'inn', 'townhouse', 'studio', 'warehouse loft',
];

export function checkIsAccommodation(venue) {
  if (!venue) return false;
  const typeStr = (venue.type || '').toLowerCase();
  const vibeStr = (Array.isArray(venue.vibe) ? venue.vibe.join(' ') : (venue.vibe || '')).toLowerCase();
  
  return ACCOMMODATION_VIBES.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(vibeStr) || regex.test(typeStr);
  });
}

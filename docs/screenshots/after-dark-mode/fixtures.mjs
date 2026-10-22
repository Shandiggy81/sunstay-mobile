// Browser-only Ticketmaster responses. These fictional events never ship in the app.
import { weather as baseWeather } from '../../../e2e/fixtures/weather.js';

export const NOW = new Date('2026-10-19T07:00:00Z'); // 6pm Melbourne, before sunset.
export const NIGHT = new Date('2026-10-19T09:00:00Z'); // 8pm Melbourne, after sunset.
export const fetchedAt = '2026-10-19T07:00:00Z';

const event = ({ id, title, hour, minute = 0, category, price, free = false, lat = -37.81525, lng = 144.9626 }) => ({
  id, name: title, url: `https://www.ticketmaster.com.au/event/${id}`,
  dates: { timezone: 'Australia/Melbourne', start: { dateTime: `2026-10-19T${String(hour - 11).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z` }, status: { code: 'onsale' } },
  classifications: [{ primary: true, segment: { name: category === 'live-music' ? 'Music' : 'Arts & Theatre' },
    genre: { name: category === 'comedy' ? 'Comedy' : category === 'family' ? "Children's Theatre" : 'Theatre' } }],
  ...(price == null ? {} : { priceRanges: [{ currency: 'AUD', min: price, max: free ? 0 : price + 10 }] }),
  _embedded: { venues: [{ name: 'Fixture Melbourne Hall', location: { latitude: String(lat), longitude: String(lng) } }] },
});

export const eventResponse = {
  fetchedAt,
  _embedded: { events: [
    event({ id: 'fixture-jazz', title: 'Evening jazz (18+ Event)', hour: 19, category: 'live-music', price: 45 }),
    event({ id: 'fixture-family', title: 'Family theatre night', hour: 19, minute: 30, category: 'family', price: 0, free: true, lat: -37.8144, lng: 144.9642 }),
    event({ id: 'fixture-comedy', title: 'City comedy late show', hour: 20, category: 'comedy', lat: -37.8114, lng: 144.9652 }),
    event({ id: 'fixture-theatre', title: 'An evening on stage', hour: 20, minute: 30, category: 'theatre', price: 30, lat: -37.8132, lng: 144.9694 }),
  ] },
};

export function weatherFixture(night = false) {
  const weather = structuredClone(baseWeather);
  weather.current.time = night ? '2026-10-19T20:00' : '2026-10-19T18:00';
  weather.current.is_day = night ? 0 : 1;
  weather.current.temperature_2m = 14;
  weather.current.apparent_temperature = 12;
  weather.current.wind_speed_10m = 25;
  weather.current.shortwave_radiation = night ? 0 : 250;
  weather.hourly.temperature_2m.fill(14);
  weather.hourly.apparent_temperature.fill(12);
  weather.hourly.wind_speed_10m.fill(25);
  weather.hourly.precipitation_probability.fill(10);
  return weather;
}

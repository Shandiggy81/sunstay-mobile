import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import CafeSunSection from '../components/CafeSunSection.jsx';
import { outdoorSunDay } from '../utils/sunMoments.js';
import { roundedSunDay } from '../utils/sunWindowsCard.js';
import { venueLocalDate } from '../utils/balconySunEngine.js';
import '../index.css';

// Standalone development entry; never imported by production HTML or the app.
// Fabricated venues, horizons, forecast and wind: no Supabase or weather calls.
if (import.meta.env.DEV) {
  const timeZone = 'Australia/Melbourne';
  const now = new Date();
  const date = venueLocalDate(now, timeZone);
  const lat = -37.8136;
  const lng = 144.9631;
  const minutesAgo = (m) => new Date(now.getTime() - m * 60_000).toISOString();
  // Buildings 40° high to the north-west and east, low elsewhere.
  const street = Array.from({ length: 36 }, (_, i) => ((i >= 28 && i <= 33) || (i >= 8 && i <= 10) ? 40 : 5));
  const laneway = Array.from({ length: 36 }, () => 85);
  const forecast = {
    hasHourly: true,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, kind: hour >= 15 && hour < 17 ? 'cloud' : 'sun' })),
  };
  const day = (horizon) => roundedSunDay(outdoorSunDay({ lat, lng, horizon, date, timeZone }));
  // ?wide drops the column limit, like the venue sheet on a desktop-width window.
  const column = new URLSearchParams(window.location.search).has('wide') ? 'max-w-none' : 'max-w-xl';
  const examples = [
    {
      key: 'clue-cafe',
      title: 'CLUE café, measured buildings',
      detail: 'Outdoor seats and a fresh, sheltered wind reading',
      props: {
        venue: { id: 'dev-1', typeLabel: 'Cafe', data_source: 'clue', outdoor_seats: 32, lat, lng },
        horizon: street, daily: day(street), geometryConfidence: 0.86,
        microclimateEntry: { wind_shelter_score: 0.72, weather_computed_at: minutesAgo(10) },
      },
    },
    {
      key: 'estimated',
      title: 'Mostly default building heights',
      detail: 'Estimated, Low confidence; stale wind reading, so no wind tile',
      props: {
        venue: { id: 'dev-2', typeLabel: 'Bakery cafe', data_source: 'clue', outdoor_seats: 1, lat, lng },
        horizon: street, daily: day(street), geometryConfidence: 0.31,
        microclimateEntry: { wind_shelter_score: 0.9, weather_computed_at: minutesAgo(90) },
      },
    },
    {
      key: 'no-sun',
      title: 'Deep laneway',
      detail: 'No direct sun today; no seats recorded, so no tiles',
      props: {
        venue: { id: 'dev-3', typeLabel: 'Cafe', data_source: 'clue', lat, lng },
        horizon: laneway, daily: day(laneway), geometryConfidence: 0.9, microclimateEntry: null,
      },
    },
  ];

  createRoot(document.getElementById('cafe-sun-section-preview')).render(
    <main className="min-h-screen bg-white font-sans text-ink">
      <header className={`mx-auto ${column} px-5 pb-2 pt-6`}>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Development preview</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Café sun section</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Fabricated fixtures for review. Sun windows come from the real engine for today ({date}); the
          horizons, confidence, wind and forecast are made up.
        </p>
      </header>
      <div className={`mx-auto ${column} space-y-10 px-5 pb-10 pt-4`}>
        {examples.map(({ key, title, detail, props }) => (
          <article key={key} data-example={key} className="space-y-3">
            <div>
              <h2 className="text-sm font-bold">{title}</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{detail}</p>
            </div>
            <CafeSunSection {...props} forecast={forecast} weatherFetchedAt={now.getTime() - 5 * 60_000} now={now} timeZone={timeZone} />
          </article>
        ))}
      </div>
    </main>,
  );
}

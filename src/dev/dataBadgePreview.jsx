import React from 'react';
import { createRoot } from 'react-dom/client';
import DataBadge from '../components/DataBadge.jsx';
import '../index.css';

// Standalone Vite development entry: never imported by the app or production HTML.
if (import.meta.env.DEV) {
  const now = Date.now();
  const ago = minutes => new Date(now - minutes * 60_000).toISOString();
  const examples = [
    { name: 'Fresh observation', kind: 'live', updatedAt: ago(3), source: 'Open-Meteo' },
    { name: 'Weather forecast', kind: 'forecast', source: 'Open-Meteo' },
    { name: 'Calculated exposure', kind: 'calculated', source: 'Sun-path model' },
    { name: 'Estimated geometry', kind: 'estimated', source: 'Building geometry estimate' },
    { name: 'Illustrative example', kind: 'demo', source: 'Demo fixture' },
    { name: 'Stale observation', kind: 'live', updatedAt: ago(20), source: 'Open-Meteo' },
    { name: 'Missing timestamp', kind: 'live', source: 'Example provider' },
    { name: 'Invalid timestamp', kind: 'live', updatedAt: 'not-a-date', source: 'Example provider' },
    { name: 'Future timestamp', kind: 'live', updatedAt: ago(-5), source: 'Example provider' },
  ];
  const requested = new URLSearchParams(window.location.search).get('surface');
  const surfaces = requested === 'light' || requested === 'dark' ? [requested] : ['light', 'dark'];
  createRoot(document.getElementById('data-badge-preview')).render(
    <main className="mx-auto max-w-xl space-y-4 p-4 font-sans text-ink">
      <header>
        <h1 className="text-xl font-extrabold">Data provenance badges</h1>
        <p className="mt-1 text-sm text-slate-600">Development fixtures · small and medium sizes</p>
      </header>
      {surfaces.map(surface => (
        <section key={surface} aria-label={`${surface} surface`} data-surface={surface}
          className={`space-y-3 rounded-3xl border border-slate-300 p-4 ${surface === 'dark' ? 'bg-ink text-surface' : 'bg-white text-ink'}`}>
          <h2 className="text-base font-bold">{surface === 'dark' ? 'Dark' : 'Light'} surface</h2>
          {examples.map(({ name, ...props }) => (
            <div key={name} data-example={name} className="space-y-1.5">
              <h3 className="text-xs font-medium">{name}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <DataBadge {...props} size="sm" />
                <DataBadge {...props} size="md" />
              </div>
            </div>
          ))}
        </section>
      ))}
      <p className="text-xs leading-relaxed text-slate-600">These are fabricated provenance examples. No weather or venue services are contacted. Only a fresh, valid observation timestamp permits Live.</p>
    </main>,
  );
}

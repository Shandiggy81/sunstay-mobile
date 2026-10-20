import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import SunWindowsGraph from '../components/SunWindowsGraph.jsx';
import DataBadge from '../components/DataBadge.jsx';
import '../index.css';

// Standalone development entry; never imported by production HTML or the app.
if (import.meta.env.DEV) {
  const date = '2026-10-20';
  const at = time => `${date}T${time}:00+11:00`;
  const split = [
    { start: new Date(at('06:42')), end: new Date(at('11:15')) },
    { start: at('13:05'), end: at('17:05') },
  ];
  const examples = [
    {
      key: 'two-windows',
      title: 'Morning + afternoon',
      detail: 'Two windows · JavaScript Date and offset ISO inputs',
      windows: split,
      note: true,
    },
    {
      key: 'one-long-window',
      title: 'One long window',
      detail: 'A continuous stretch · epoch millisecond inputs',
      windows: [{ start: Date.parse(at('08:00')), end: Date.parse(at('16:30')) }],
    },
    {
      key: 'three-short-windows',
      title: 'Three short windows',
      detail: 'Separate moments across the day',
      windows: [
        { start: at('08:10'), end: at('08:50') },
        { start: at('11:40'), end: at('12:20') },
        { start: at('15:10'), end: at('15:55') },
      ],
    },
    { key: 'no-sun', title: 'No direct sun', detail: 'A genuinely empty window list', windows: [] },
    {
      key: 'now-in-window',
      title: 'Now inside a window',
      detail: 'Fixed demonstration clock · 9:15am Melbourne time',
      windows: split,
      now: new Date(at('09:15')),
    },
    {
      key: 'now-in-gap',
      title: 'Now in a gap',
      detail: 'Fixed demonstration clock · 12:15pm Melbourne time',
      windows: split,
      now: at('12:15'),
    },
    {
      key: 'mini',
      title: 'Mini variant',
      detail: 'Just the hills bar for compact cards',
      windows: split,
      variant: 'mini',
    },
  ];
  const requested = new URLSearchParams(window.location.search).get('surface');
  const surfaces = requested === 'light' || requested === 'dark' ? [requested] : ['light', 'dark'];

  createRoot(document.getElementById('sun-windows-graph-preview')).render(
    <main className={`min-h-screen font-sans ${requested === 'dark' ? 'bg-ink text-surface' : 'bg-surface text-ink'}`}>
      <header className="mx-auto max-w-xl px-4 pb-2 pt-6">
        <p className={`text-xs font-bold uppercase tracking-wide ${requested === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>Development preview</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Sun windows</h1>
        <p className={`mt-2 text-sm leading-relaxed ${requested === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
          Fabricated fixtures to review the graph. No venue, weather or map services are contacted. “Now” uses a fixed example clock.
        </p>
      </header>
      {surfaces.map(surface => (
        <section key={surface} aria-label={`${surface} surface`} data-surface={surface}
          className={surface === 'dark' ? 'bg-ink text-surface' : 'bg-surface text-ink'}>
          <div className="mx-auto max-w-xl space-y-6 px-4 pb-8 pt-4">
            <h2 className="text-base font-bold">{surface === 'dark' ? 'Dark' : 'Light'} surface</h2>
            {examples.map(({ key, title, detail, note, ...props }) => (
              <article key={key} data-example={key} className="space-y-2.5">
                <div>
                  <h3 className="text-sm font-bold">{title}</h3>
                  <p className={`mt-0.5 text-xs leading-relaxed ${surface === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>{detail}</p>
                </div>
                <SunWindowsGraph
                  {...props}
                  date={date}
                  timezone="Australia/Melbourne"
                  footer={props.variant === 'mini' ? undefined : (
                    <div className="space-y-2">
                      <DataBadge kind="demo" source="Development fixture" />
                      {note ? <p>Estimated from the sun’s path, not a weather forecast.</p> : null}
                    </div>
                  )}
                />
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>,
  );
}

import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { calculateMonthlySunSummary, formatGuestWindows } from '../utils/balconySunEngine.js';
import { roomSunOptions, SUN_MOMENTS } from '../utils/stayRanking.js';
export default function StayComparison({ venues, moment, onClose }) {
  const sheet = useRef(null);
  const months = useMemo(() => venues.map(venue => {
    if (!venue.bestRoom) return 'Unavailable';
    const summary = calculateMonthlySunSummary({ ...roomSunOptions(venue, venue.bestRoom), year: Number(venue.daily.date.slice(0, 4)) });
    return summary.filter(m => m.totalMinutes > 0).sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 3)
      .map(m => new Intl.DateTimeFormat('en', {month:'short',timeZone:'UTC'}).format(new Date(`${m.date}T12:00:00Z`))).join(', ') || 'No direct sun';
  }), [venues]);
  useEffect(() => {
    const previous = document.activeElement;
    sheet.current?.focus();
    return () => previous?.focus();
  }, []);
  const rows = [
    ['Sun window', v => v.windowsText || 'No qualifying sun'],
    ['Total sun', v => v.daily ? `${v.daily.totalMinutes} min` : 'Unavailable'],
    ['Coffee', v => v.daily ? formatGuestWindows(v.daily.morningCoffee.windows, v.daily.timeZone, v.daily.timeZone) || 'No morning sun' : 'Unavailable'],
    ['Sunset', v => v.daily ? formatGuestWindows(v.daily.sunsetDrinks.windows, v.daily.timeZone, v.daily.timeZone) || 'No sunset sun' : 'Unavailable'],
    ['Best months', (_, i) => months[i]],
  ];
  return <motion.div className="ss-stay-overlay" initial={{opacity:0}} animate={{opacity:1}} onClick={onClose}>
    <motion.section ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="stay-compare-title" className="ss-stay-comparison" initial={{y:80}} animate={{y:0}} onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { e.preventDefault(); sheet.current.querySelector('button')?.focus(); }
    }}>
      <header><h2 id="stay-compare-title">Compare · {SUN_MOMENTS[moment]}</h2><button aria-label="Close comparison" onClick={onClose}>✕</button></header>
      <div className="ss-stay-table"><table><thead><tr><th scope="col">Best room</th>{venues.map(v => <th scope="col" key={v.id}>{v.venueName}<small>{v.bestRoom?.name || 'No matching room'}{v.bestRoom?.source === 'estimated' ? ' · Estimated' : ''}<br />{v.daily?.date}</small></th>)}</tr></thead>
        <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{venues.map((v, i) => <td key={v.id}>{value(v, i)}</td>)}</tr>)}</tbody></table></div>
      <p>Estimated from the sun’s path, not a weather forecast. Best months use representative days.</p>
    </motion.section>
  </motion.div>;
}

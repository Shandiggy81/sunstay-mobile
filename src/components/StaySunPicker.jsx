import React, { useState } from 'react';
import { SUN_MOMENTS, quickStayDate } from '../utils/stayRanking.js';
export default function StaySunPicker({ moment, date, onMoment, onDate, compareCount, onCompare }) {
  const [datesOpen, setDatesOpen] = useState(false);
  return <div className="ss-stay-picker" onPointerDownCapture={e => e.stopPropagation()}>
    <div className="ss-stay-chips" aria-label="Sun moment">
      {Object.entries(SUN_MOMENTS).map(([id, label]) => <button key={id} aria-pressed={moment === id} onClick={() => onMoment(id)}>{label}</button>)}
    </div>
    <div className="ss-stay-chips">
      <button aria-expanded={datesOpen} onClick={() => setDatesOpen(!datesOpen)}>📅 {date || 'Today'} ▾</button>
      {compareCount > 0 && <button onClick={onCompare}>Compare ({compareCount}/3)</button>}
    </div>
    {datesOpen && <div className="ss-stay-chips">
      {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['saturday', 'This Saturday']].map(([id, label]) => <button key={id} onClick={() => { onDate(id === 'today' ? null : id); setDatesOpen(false); }}>{label}</button>)}
      <label>Pick a date<input aria-label="Pick a date" type="date" value={/^\d{4}-/.test(date ?? '') ? date : quickStayDate('today')} onChange={e => { if (e.target.value) onDate(e.target.value); }} /></label>
    </div>}
  </div>;
}

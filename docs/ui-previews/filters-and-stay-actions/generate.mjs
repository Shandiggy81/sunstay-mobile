// Design artifacts only. Reads the app catalogue; never imports or edits app UI.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { demoVenues, FILTER_CATEGORIES } from '../../../src/data/demoVenues.js';
import { CLAY_ICON_FOR_FILTER } from '../../../src/utils/clayFilterIcons.js';
import { isStayVenue } from '../../../src/utils/propertyTypes.js';
import { stayRoomTypesDisplay } from '../../../src/utils/stayRoomTypes.js';

const output = new URL('./', import.meta.url);
const venue = demoVenues.find(v => v.id === 'dv-melb-stay-08');
const display = stayRoomTypesDisplay(venue, { now: new Date('2026-11-04T01:00:00Z') });
const stays = demoVenues.filter(isStayVenue);
const groups = [
  { id: 'places', title: 'Food & drink', icon: 'coffee', ids: FILTER_CATEGORIES.filter(f => f.id.startsWith('all-') && !['all-stays','all-homes'].includes(f.id)).map(f => f.id) },
  { id: 'stays', title: 'Stays & homes', icon: 'house', ids: ['all-stays','all-homes','Hotel','Serviced apartment','Short Stay','Balcony'] },
  { id: 'comfort', title: 'Sun & comfort', icon: 'sun', ids: ['Sunny','Cozy','Rooftop','Beer Garden','Fireplace','Views','Shaded','Indoor Warmth','Heaters','River','Afternoon Sun','Morning Sun'] },
  { id: 'needs', title: 'Good to know', icon: 'pram', ids: ['Pet Friendly','Pram Friendly','Wheelchair Accessible','Vegan','Large Groups','Smoking Area','Live Music','Craft Beer','Cocktails','Specialty Coffee','Premium'] },
];
const byId = new Map(FILTER_CATEGORIES.map(f => [f.id,f]));
const extraIcons = { 'all-bakeries':'coffee', 'all-desserts':'dining', 'all-takeaways':'dining', 'all-stays':'hotel-views', 'all-homes':'house', 'Serviced apartment':'house', 'Short Stay':'hotel-views', Balcony:'sunny-balcony', Cocktails:'cocktail', Premium:'sparkles' };
const icons = { ...CLAY_ICON_FOR_FILTER, ...extraIcons };
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const clay = (name, size = 28) => `<img class="clay" src="../../../src/assets/clay/${name}.webp" width="${size}" height="${size}" alt="">`;
const glyph = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
  close:'<path d="m6 6 12 12M18 6 6 18"/>', chevron:'<path d="m9 5 7 7-7 7"/>', check:'<path d="m5 12 4 4L19 6"/>', down:'<path d="m6 9 6 6 6-6"/>', map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4M9 14l6 4"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', external:'<path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
  pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', navigation:'<path d="m22 2-7 20-4-9L2 9Z"/>',
}[name]}</svg>`;
const button = (id, layout='quick') => {
  const f=byId.get(id), active=id==='all-stays';
  return `<button type="button" class="filter ${layout}${active?' selected':''}" aria-pressed="${active}" data-filter-id="${escape(id)}">${clay(icons[id])}<span>${escape(f.label)}</span><span class="selection-mark" aria-hidden="true">${active?glyph('check'):''}</span></button>`;
};
const head = `<div class="handle" aria-hidden="true"><span></span></div><header class="sheet-heading"><div><h1>Filters</h1><p>Find your kind of place</p></div><button type="button" class="round" aria-label="Close filters">${glyph('close')}</button></header>`;
const footer = `<footer class="filter-footer"><button type="button" class="clear">Clear all</button><button type="button" class="primary">Show ${stays.length} venues ${glyph('chevron')}</button></footer>`;
const background = `<div class="explore-context" aria-hidden="true"><img src="../../../src/assets/logo-header-hd.webp" alt=""><span>Find a sunny spot</span><div class="context-place">${clay('house',32)}<strong>${escape(venue.venueName)}</strong></div></div>`;
const document = (title, body, cls='') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · SunStay design preview</title><link rel="stylesheet" href="preview.css"></head><body class="${cls}">${body}</body></html>`;
const quickIds=['all-cafes','all-pubs','all-stays','Sunny','Cozy','Pet Friendly'];
const a = `${background}<main class="filter-sheet option-a" aria-label="Filter concept A">${head}<div class="sheet-scroll"><section class="quick-section"><div class="section-line"><h2>Quick picks</h2><span class="small">1 selected</span></div><div class="quick-grid">${quickIds.map(id=>button(id)).join('')}</div></section><section class="all-filters"><h2>All filters</h2>${groups.map(g=>`<details class="filter-group"><summary>${clay(g.icon)}<span>${g.title}</span><span class="small">${g.ids.length}</span>${glyph('down')}</summary><div class="group-options">${g.ids.map(id=>button(id,'row')).join('')}</div></details>`).join('')}</section></div>${footer}</main>`;
const b = `${background}<main class="filter-sheet option-b" aria-label="Filter concept B">${head}<div class="sheet-scroll"><div class="section-line"><h2>Stays &amp; homes</h2><span class="small">1 selected</span></div><p class="section-description">Choose a type of place to stay</p><div class="stay-options">${groups[1].ids.map((id,i)=>`${i===2?'<p class="eyebrow">More specific</p>':''}${button(id,'row')}`).join('')}</div></div><nav class="category-rail" aria-label="Filter sections">${groups.map(g=>`<a href="filters-b-${g.id}.html" ${g.id==='stays'?'aria-current="page"':''}>${clay(g.icon,24)}<span>${{places:'Food & drink',stays:'Stays',comfort:'Sun & comfort',needs:'Needs'}[g.id]}</span>${g.id==='stays'?'<span class="tab-count" aria-label="1 selected">1</span>':''}</a>`).join('')}</nav>${footer}</main>`;
const directions = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`;
const stay = `<main class="stay-preview" aria-label="Stay action concept"><div class="handle" aria-hidden="true"><span></span></div><div class="stay-toolbar"><button class="round" type="button" aria-label="Close venue details">${glyph('close')}</button><div><button class="round" type="button" aria-label="Share venue">${glyph('share')}</button><button class="round" type="button" aria-label="Save on this device">${glyph('heart')}</button></div></div><div class="stay-scroll"><header class="stay-heading"><div class="venue-icon">${clay('house',46)}</div><div><h1>${escape(venue.venueName)}</h1><p>${escape(venue.typeLabel)} · ${escape(venue.suburb)}</p></div></header><section class="sun-context"><div class="section-line"><h2>${escape(display.headline)}</h2>${clay('sun',32)}</div><p class="small">${escape(display.trustLine)}</p><div class="side-list">${display.entries.map(e=>`<div class="side">${clay('sun-facing-facade',32)}<div><strong>${escape(e.title)}</strong><span>${escape(e.level)}</span></div><span class="modelled">Modelled</span></div>`).join('')}</div><p class="trust">${escape(display.entries[0].evidenceLabel)}</p></section><section class="good-to-know"><h2>Good to know</h2><div class="address">${glyph('pin')}<p>${escape(venue.address)}</p></div><p class="small description">${escape(venue.venue_description)}</p></section></div><footer class="stay-footer"><a class="directions-secondary" href="${directions}" target="_blank" rel="noopener noreferrer">${glyph('navigation')}Get directions${glyph('external')}</a><a class="primary property-website" href="${escape(venue.official_website_url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit Quest St Kilda Bayside’s official website, opens in a new tab">${glyph('globe')}Visit property website${glyph('external')}</a><p>Opens Quest’s official website</p></footer></main>`;
await fs.writeFile(new URL('filters-a.html',output),document('Quick picks + groups',a,'filters-screen'));
await fs.writeFile(new URL('filters-b.html',output),document('Thumb-level categories',b,'filters-screen'));
for(const g of groups) {
  const body=b.replace('<h2>Stays &amp; homes</h2>',`<h2>${escape(g.title)}</h2>`).replace('Choose a type of place to stay','Choose what matters to you').replace(/<div class="stay-options">[\s\S]*?<\/div><\/div><nav/,`<div class="stay-options">${g.ids.map(id=>button(id,'row')).join('')}</div></div><nav`).replace('href="filters-b-stays.html" aria-current="page"','href="filters-b-stays.html"').replace(`href="filters-b-${g.id}.html"`,`href="filters-b-${g.id}.html" aria-current="page"`);
  await fs.writeFile(new URL(`filters-b-${g.id}.html`,output),document(`Category: ${g.title}`,body,'filters-screen'));
}
await fs.writeFile(new URL('stay-action.html',output),document('Stay primary action',stay));
await fs.writeFile(new URL('facts.json',output),JSON.stringify({baseCommit:execFileSync('git',['merge-base','HEAD','origin/main'],{encoding:'utf8'}).trim(),date:'2026-11-04',catalogue:'Repository fallback, not live production inventory',total:demoVenues.length,stays:stays.length,selectedFilters:['all-stays'],stay:{id:venue.id,name:venue.venueName,type:venue.typeLabel,suburb:venue.suburb,address:venue.address,website:venue.official_website_url,description:venue.venue_description,display},groups},null,2)+'\n');

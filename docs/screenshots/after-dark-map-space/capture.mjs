// Browser-only fixture checks. All external requests are fulfilled or blocked.
// Run from the repository root: node docs/screenshots/after-dark-map-space/capture.mjs after
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { weather as rawWeather } from '../../../e2e/fixtures/weather.js';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from '../../../e2e/fixtures/supabase.js';

const output = 'docs/screenshots/after-dark-map-space';
const phase = process.argv[2] || 'after';
const port = 5218;
const baseURL = `http://127.0.0.1:${port}`;
const NOW = new Date('2026-10-25T06:30:00Z'); // Sunday, 5:30pm Melbourne.
const weather = JSON.parse(JSON.stringify(rawWeather).replaceAll('2026-10-19', '2026-10-25').replaceAll('2026-10-20', '2026-10-26'));
Object.assign(weather.current, { time: '2026-10-25T17:30', temperature_2m: 14, apparent_temperature: 12,
  precipitation: 1.2, weather_code: 61, is_day: 1, wind_speed_10m: 18 });
for (const [key, value] of Object.entries({ temperature_2m: 14, apparent_temperature: 12,
  precipitation_probability: 70, precipitation: 1.2, weather_code: 61, wind_speed_10m: 18 })) weather.hourly[key].fill(value);

const event = ({ id, title, hour, category, price, free = false, venueName = '170 Russell', lat = -37.8145, lng = 144.9685 }) => ({
  id, name: title, url: `https://www.ticketmaster.com.au/event/${id}`,
  dates: { timezone: 'Australia/Melbourne', start: { dateTime: `2026-10-25T${String(hour - 11).padStart(2, '0')}:00:00Z` }, status: { code: 'onsale' } },
  classifications: [{ primary: true, segment: { name: category === 'live-music' ? 'Music' : 'Arts & Theatre' },
    genre: { name: category === 'comedy' ? 'Comedy' : category === 'family' ? "Children's Theatre" : 'Theatre' } }],
  ...(price == null ? {} : { priceRanges: [{ currency: 'AUD', min: price, max: free ? 0 : price + 10 }] }),
  _embedded: { venues: [{ name: venueName, location: { latitude: String(lat), longitude: String(lng) } }] },
});
const fetchedAt = NOW.toISOString();
const response = { fetchedAt, _embedded: { events: [
  event({ id: 'fixture-volt-music', title: 'NOISEMAKERS AUSTRALIAN TOUR ~ MELBOURNE EDITION (18+ Event)', hour: 18, category: 'live-music', price: 45 }),
  event({ id: 'fixture-volt-music-duplicate', title: 'NOISEMAKERS AUSTRALIAN TOUR ~ MELBOURNE EDITION (18+ Event)', hour: 18, category: 'live-music', price: 45 }),
  event({ id: 'fixture-volt-comedy', title: 'The Sunday comedy club', hour: 19, category: 'comedy', venueName: 'City Comedy Room' }),
  event({ id: 'fixture-volt-theatre', title: 'After the curtain', hour: 20, category: 'theatre', price: 30, venueName: 'Melbourne Theatre Room' }),
  event({ id: 'fixture-volt-family', title: 'Family night show', hour: 21, category: 'family', price: 0, free: true, venueName: 'City Family Stage' }),
] } };
// Fictional facts used only to prove the wet-show indoor-pairing rule.
const venues = [
  { id: 'fixture-outdoor', venueName: 'Open Air Bar', typeCategory: 'Pub', lat: -37.8145, lng: 144.9685,
    tags: ['Heaters', 'Beer Garden'], heating: 'outdoor heaters', sunshineScore: 70, opening_hours: 'Daily 4pm–11pm' },
  { id: 'fixture-indoor', venueName: 'The Lantern', typeCategory: 'Pub', lat: -37.8148, lng: 144.9685,
    tags: ['Fireplace', 'Indoor Warmth'], heating: 'fireplace', sunshineScore: 60, opening_hours: 'Daily 4pm–11pm' },
];
const observations = [];
process.env.VITE_MAPBOX_TOKEN = '';
process.env.VITE_SUPABASE_URL = FAKE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = FAKE_SUPABASE_ANON_KEY;
process.env.VITE_OPENAQ_API_KEY = '';
const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', open: false },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' });
await fs.mkdir(output, { recursive: true });

const modes = page => page.getByRole('group', { name: 'Home sheet mode', exact: true }).filter({ visible: true });
const panel = page => page.getByRole('region', { name: "Tonight's events", exact: true });

async function boot(width, height, kind = 'events', { desktop = false, mode = 'sun' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: !desktop, hasTouch: !desktop,
    timezoneId: 'Australia/Melbourne', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(NOW);
  await context.routeWebSocket('**', socket => socket.close());
  await page.addInitScript(mode => {
    sessionStorage.setItem('splashShown', 'true');
    sessionStorage.setItem('ss-sunny-advice-shown', '1');
    sessionStorage.setItem('ss-home-sheet-mode', mode);
    navigator.geolocation.getCurrentPosition = (_success, fail) => {
      window.__fixtureLocationCalls = (window.__fixtureLocationCalls ?? 0) + 1;
      fail({ code: 1, message: 'Fixture: location denied' });
    };
  }, mode);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
    if (url.origin === 'https://www.ticketmaster.com.au') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Ticket fixture</title>' });
    if (url.origin === FAKE_SUPABASE_URL) {
      if (url.pathname === '/functions/v1/weather') return route.fulfill({ json: weather });
      if (url.pathname === '/functions/v1/events-tonight') {
        requests.push({ lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')), radius: url.searchParams.get('radius') });
        return route.fulfill({ json: kind === 'empty' ? { fetchedAt, _embedded: { events: [] } } : response });
      }
      if (url.pathname === '/rest/v1/venues') return route.fulfill({ json: venues });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL);
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
  await expect(page.locator('.ss-map-first-weather')).toContainText('14°');
  return { page, context, errors, requests };
}

async function openAfterDark(page) {
  await modes(page).getByRole('button', { name: 'After Dark', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(1000);
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = node => { const r=node.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}; };
    const sheet=document.querySelector('.ss-mobile-sheet');
    const results=document.querySelector('.ss-after-dark-results');
    const controls = [...document.querySelectorAll('.ss-map-first-weather, .ss-home-locate-layer button, .ss-map-layer-controls button, .ss-map-search-area button')].map(node => {
      const box=rect(node), css=getComputedStyle(node);
      const visible=node.checkVisibility({visibilityProperty:true}) && box.bottom>0 && box.top<innerHeight;
      const hit=document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2);
      return {label:node.getAttribute('aria-label')||node.textContent.trim(),visible,box,hit:node.contains(hit)};
    });
    const first=document.querySelector('.ss-after-dark-event');
    const inResults=node=>{const box=rect(node);return box.top>=results.getBoundingClientRect().top && box.bottom<=results.getBoundingClientRect().bottom;};
    return {sheet:rect(sheet),sheetCss:getComputedStyle(sheet).height,
      mapStrip:rect(sheet).top,overflow:document.documentElement.scrollWidth>innerWidth,
      results:results?{...rect(results),scrollHeight:results.scrollHeight,clientHeight:results.clientHeight,
        overflowY:getComputedStyle(results).overflowY,paddingBottom:getComputedStyle(results).paddingBottom}:null,
      first:first?{time:rect(first.querySelector('time')),title:rect(first.querySelector('h4')),timeVisible:inResults(first.querySelector('time')),titleVisible:inResults(first.querySelector('h4'))}:null,
      fixedRows:[...document.querySelectorAll('.ss-after-dark-header,.ss-after-dark-categories,.ss-after-dark-origin-row')].map(rect),controls};
  });
}
try {
 for(const [width,height] of [[390,844],[375,667],[320,568]]){
  const {page,context,errors}=await boot(width,height);
  try{
   await openAfterDark(page);
   await expect(panel(page).getByRole('article')).toHaveCount(4);
   const measured=await measure(page);
   assert.equal(measured.overflow,false);
   if(phase==='after') {
    const baseline=JSON.parse(await fs.readFile(`${output}/before-observations.json`,'utf8')).find(item=>item.width===width && item.mode==='after-dark').measured;
    if(height>700){assert.ok(measured.sheet.height<baseline.sheet.height);assert.ok(measured.mapStrip>=height*.33 && measured.mapStrip<=height*.38);assert.equal(measured.first.timeVisible,true);assert.equal(measured.first.titleVisible,true);}
    else {assert.ok(Math.abs(measured.sheet.top-baseline.sheet.top)<1.1);assert.ok(Math.abs(measured.sheet.height-baseline.sheet.height)<.1);}
    assert.equal(measured.results.overflowY,'auto');assert.equal(measured.results.paddingBottom,'16px');
    assert.ok(measured.results.scrollHeight>measured.results.clientHeight);
   }
   if(phase==='after')await page.screenshot({path:`${output}/after-dark-${width}.png`});
   const interactions={};
   if(phase==='after') {
    await page.evaluate(()=>{
      for(const className of ['ss-map-layer-controls','mapboxgl-ctrl-top-right','ss-map-search-area']){
        const probe=document.createElement('div');probe.className=className;probe.dataset.overlayProbe='1';
        const button=document.createElement('button');button.textContent='Local CSS visibility probe';probe.append(button);document.querySelector('.ss-app-root').append(probe);
      }
    });
    const hiddenOverlayStates=await page.locator('[data-overlay-probe]').evaluateAll(nodes=>nodes.map(node=>({className:node.className,visibility:getComputedStyle(node).visibility})));
    assert.ok(hiddenOverlayStates.every(item=>item.visibility==='hidden'));interactions.overlayVisibility=hiddenOverlayStates;
    await page.locator('[data-overlay-probe]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
    const pill=page.locator('.ss-map-first-weather');
    if(width<=380 && height<=650){
      await expect(pill).toBeHidden();interactions.weatherHiddenForShortScreen=true;
    }else{
      const pillBox=await pill.boundingBox();assert.ok(pillBox.width>=44&&pillBox.height>=43.99);
      assert.equal(measured.controls.find(item=>item.label.includes('Rain showers')).hit,true);
      await pill.tap();await expect(pill).toHaveAttribute('aria-expanded','true');
      interactions.weatherDetails=await page.locator('.ss-map-first-weather-details').evaluate(node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,overflow:getComputedStyle(node).overflowY};});
      if(height>700)assert.ok(interactions.weatherDetails.bottom<measured.sheet.top);
      await pill.tap();
    }
    const scroller=page.locator('.ss-after-dark-results');
    const box=await scroller.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,220);await page.waitForTimeout(500);
    interactions.scrollTop=await scroller.evaluate(node=>node.scrollTop);assert.ok(interactions.scrollTop>0);
    await scroller.evaluate(node=>node.scrollTop=0);await page.waitForTimeout(500);
    const grab=await page.locator('.ss-mobile-sheet-head .ss-mobile-sheet-grab').boundingBox();
    await page.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2);await page.mouse.down();await page.mouse.move(grab.x+grab.width/2,grab.y+180,{steps:15});await page.mouse.up();
    await expect(page.locator('.ss-mobile-sheet')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Locate Me',exact:true})).toBeVisible();
    await expect(page.locator('.ss-map-first-weather')).toBeVisible();
    await page.getByRole('button',{name:"Show tonight's events",exact:true}).tap();await expect(page.locator('.ss-mobile-sheet')).toBeVisible();
    interactions.dragCollapseAndHandleExpand=true;
    assert.deepEqual(errors,[]);
   }
   observations.push({phase,width,height,mode:'after-dark',measured,interactions,errors});
  }finally{await context.close();}
 }
 const {page,context,errors}=await boot(390,844);
 try{
  await page.getByRole('button',{name:'Show venue list',exact:true}).click();
  await expect(page.locator('.ss-mobile-sheet')).toBeVisible();await page.waitForTimeout(500);
  const measured=await measure(page);
  if(phase==='after') {
   const baseline=JSON.parse(await fs.readFile(`${output}/before-observations.json`,'utf8')).find(item=>item.mode==='sun').measured;
   assert.equal(measured.sheet.height,baseline.sheet.height);assert.ok(Math.abs(measured.sheet.top-baseline.sheet.top)<1.1);
   assert.deepEqual(measured.sheetCss,baseline.sheetCss);
  }
  await page.screenshot({path:`${output}/${phase==='after'?'sun-expanded':'before-sun'}-390.png`});
  observations.push({phase,width:390,height:844,mode:'sun',measured,errors});
 }finally{await context.close();}
}finally{await browser.close();await server.close();}
const compact=observations.map(({measured:m,...item})=>({...item,measured:{
 sheet:{top:m.sheet.top,height:m.sheet.height},sheetCss:m.sheetCss,overflow:m.overflow,
 results:m.results?{clientHeight:m.results.clientHeight,scrollHeight:m.results.scrollHeight,overflowY:m.results.overflowY,paddingBottom:m.results.paddingBottom}:null,
 first:m.first?{timeVisible:m.first.timeVisible,titleVisible:m.first.titleVisible}:null,
 controls:m.controls.map(({box,...control})=>({...control,width:box.width,height:box.height,top:box.top,bottom:box.bottom}))}}));
await fs.writeFile(`${output}/${phase}-observations.json`,JSON.stringify(compact,null,2)+'\n');
console.log(JSON.stringify(compact));

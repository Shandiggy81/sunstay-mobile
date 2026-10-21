import { chromium } from '@playwright/test';
import { NOW, weather } from '../../../e2e/fixtures/weather.js';
import fs from 'node:fs/promises';

const phase = process.argv[2] || 'after';
if (!['before','after'].includes(phase)) throw new Error('Phase must be before or after');
const port = process.argv[3] || (phase === 'before' ? '5176' : '5173');
const baseURL = `http://127.0.0.1:${port}`;
const out = 'docs/screenshots/map-first-home';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
await fs.mkdir(out, { recursive: true });
const observations = [];

async function boot(width, reduce = false) {
  const context = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 1, timezoneId: 'Australia/Melbourne',
    reducedMotion: reduce ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(NOW);
  await context.routeWebSocket('**', socket => socket.close());
  await page.addInitScript(() => { sessionStorage.setItem('splashShown', 'true'); sessionStorage.setItem('ss-sunny-advice-shown', '1'); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL);
  await page.getByText('23°', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Filters', exact: true }).waitFor();
  await page.waitForTimeout(1700);
  return { page, context, errors };
}

async function capture(page, name) {
  await page.screenshot({ path: `${out}/${phase}-${name}.png` });
}

async function openPreview(page) {
  const selected = await page.evaluate(() => {
    const first = document.querySelector('#root').firstElementChild;
    const key = Object.keys(first).find(key => key.startsWith('__reactFiber$'));
    let root = first[key];
    while (root.return) root = root.return;
    const pending = [root];
    while (pending.length) {
      const fiber = pending.pop();
      const props = fiber.memoizedProps;
      if (props?.venues && props.weatherColorFn && typeof props.onVenueSelect === 'function') {
        const venue = props.venues.find(venue => venue.typeLabel?.toLowerCase().includes('cafe')) ?? props.venues[0];
        props.onVenueSelect(venue);
        return venue.venueName;
      }
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
    }
    return null;
  });
  if (!selected) throw new Error('VenueMap callback was not found');
  await page.getByRole('region', { name: `${selected} preview`, exact: true }).waitFor();
  await page.waitForFunction(() => { const el = document.querySelector('[role=region][aria-label$=preview]'); return el && getComputedStyle(el).opacity === '1'; });
  await page.waitForTimeout(250);
  return selected;
}

if (phase === 'after') {
for (const width of [320,390,768]) {
  const { page, context, errors } = await boot(width);
  await page.getByRole('button',{name:'Now',exact:true}).waitFor();
  const layout=await page.evaluate(()=>{
    const rect=selector=>{ const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
    const map=rect('.ss-map-container'), chips=rect('.ss-home-chip-row'),handle=rect('.ss-mobile-sheet-handle');
    const visibleMapHeight=Math.max(0,Math.min(map.bottom,handle?.top??innerHeight)-Math.max(0,map.top,chips?.bottom??0));
    return {viewport:{width:innerWidth,height:innerHeight},map,chips,sheet:handle,
      header:rect('.ss-map-first-topbar'),visibleMapHeight,viewportPercent:100*visibleMapHeight/innerHeight};
  });
  await capture(page,`default-${width}`);
  await page.getByRole('button',{name:'Lunch',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ss-map-time-chip[aria-pressed=true]')?.textContent==='Lunch');
  await page.waitForTimeout(350);
  await capture(page,`time-selected-${width}`);
  await page.getByRole('button',{name:'Fine-tune preview time',exact:true}).click();
  const fineTune=page.getByRole('dialog',{name:'Fine-tune preview time',exact:true});
  await fineTune.waitFor();
  await page.waitForTimeout(250);
  await capture(page,`fine-tune-open-${width}`);
  await fineTune.getByRole('button',{name:'Close time controls',exact:true}).click();
  await fineTune.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Now',exact:true}).click();
  await page.locator('.ss-home-chip-row').evaluate(el=>{el.scrollLeft=0;});
  await page.waitForTimeout(400);
  const venue=await openPreview(page);
  await capture(page,`pin-preview-${width}`);
  await page.getByRole('button',{name:'Close venue preview',exact:true}).click();
  await page.waitForTimeout(300);
  const handle=page.getByRole('button',{name:'Show venue list',exact:true});
  const rect=await handle.boundingBox();
  const dragStart={x:width/2,y:rect.y+9};
  await page.mouse.move(dragStart.x,dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x,dragStart.y-190,{steps:12});
  await page.mouse.up();
  await page.locator('.ss-mobile-sheet .ss-venue-list-card').first().waitFor();
  await page.waitForTimeout(850);
  await capture(page,`sheet-expanded-${width}`);
  observations.push({width,layout,preview:venue,drag:{pointer:'mouse',offsetY:-190,expanded:await page.locator('.ss-mobile-sheet').isVisible()},errors,
    overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),
    count:await page.locator('.ss-mobile-sheet-head').innerText()});
  await context.close();
}
} else {
for (const width of [320, 390, 768]) {
  const { page, context, errors } = await boot(width);
  const layout = await page.evaluate(() => {
    const rect = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, height:r.height, width:r.width }; };
    const map = rect('.ss-map-container');
    const handle = rect('.ss-mobile-sheet-handle');
    const visibleMapHeight = Math.max(0, Math.min(map.bottom, handle?.top ?? innerHeight) - Math.max(0,map.top));
    return { viewport: {width:innerWidth,height:innerHeight}, map, sheet:handle,
      header:rect('.ss-explore-topbar'), experiences:rect('.ss-experience-finder'),
      visibleMapHeight, viewportPercent:100*visibleMapHeight/innerHeight,
      hasTimeSlider:!!document.querySelector('#tod-slider') };
  });
  console.log(JSON.stringify({ width, layout }));
  await capture(page, `default-${width}`);
  const venue = await openPreview(page);
  await capture(page, `pin-preview-${width}`);
  await page.getByRole('button', { name: 'Close venue preview', exact: true }).click();
  await page.locator('.ss-mobile-sheet-handle').click();
  await page.locator('.ss-mobile-sheet .ss-venue-list-card').first().waitFor();
  await page.waitForTimeout(600);
  await capture(page, `sheet-expanded-${width}`);
  observations.push({ width, layout, preview:venue, errors,
    overflow:await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    count:await page.locator('.ss-mobile-sheet-head').innerText() });
  await context.close();
}
for (const width of [320,390,768]) {
  const { page, context, errors } = await boot(width);
  const fixture = await page.evaluate(() => {
    const el=document.querySelector('#root').firstElementChild;
    let root=el[Object.keys(el).find(key=>key.startsWith('__reactFiber$'))];
    while(root.return)root=root.return;
    const pending=[root];
    while(pending.length){
      const fiber=pending.pop();
      if(fiber.memoizedProps?.weatherColorFn && fiber.memoizedState){
        const hooks=[];
        for(let h=fiber.memoizedState;h;h=h.next)hooks.push(h);
        // Baseline 2536698: mapLoaded and mapError are hook positions 29 and 30.
        // This renders the existing control without any map or fabricated tiles.
        if(hooks[29]?.queue?.dispatch && hooks[30]?.queue?.dispatch){
          hooks[29].queue.dispatch(true);
          hooks[30].queue.dispatch(false);
          return {changed:[29,30]};
        }
      }
      if(fiber.child)pending.push(fiber.child);
      if(fiber.sibling)pending.push(fiber.sibling);
    }
    return null;
  });
  if (!fixture) throw new Error('Baseline time UI fixture could not be mounted');
  await page.locator('#tod-slider').waitFor();
  await page.locator('#tod-slider').evaluate(el=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'720');
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForTimeout(800);
  await capture(page,`time-selected-${width}`);
  await capture(page,`fine-tune-open-${width}`);
  observations.push({width,fixture:'baseline time control only',errors,value:await page.locator('#tod-slider').getAttribute('aria-valuetext')});
  await context.close();
}
}
const {page,context,errors}=await boot(390,true);
await page.getByRole('button',{name:'Now',exact:true}).waitFor();
await capture(page,'reduced-motion-390');
observations.push({reducedMotion:await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),errors});
await context.close();
await browser.close();
await fs.writeFile(`/tmp/map-first-${phase}-observations.json`,JSON.stringify(observations,null,2));
console.log(JSON.stringify(observations,null,2));

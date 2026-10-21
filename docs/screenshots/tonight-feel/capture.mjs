/** Deterministic card captures using only the app's existing weather request. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { weather as baseWeather } from '../../../e2e/fixtures/weather.js';

const baseURL = `http://127.0.0.1:${process.argv[2] || '5173'}`;
const output = 'docs/screenshots/tonight-feel';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const observations = [];
await fs.mkdir(output, { recursive: true });

function weatherFixture(kind) {
  const weather = structuredClone(baseWeather);
  const cold = kind !== 'warm';
  weather.current = { ...weather.current,
    time: kind === 'after-11pm' ? '2026-10-19T23:30' : '2026-10-19T18:00',
    temperature_2m: cold ? 13 : 23, apparent_temperature: cold ? 13 : 22,
    is_day: kind === 'after-11pm' ? 0 : 1,
    weather_code: cold ? 61 : 0, cloud_cover: cold ? 90 : 5,
    precipitation: cold ? .2 : 0, shortwave_radiation: cold ? 0 : 400,
    wind_speed_10m: cold ? 25 : 10, wind_gusts_10m: cold ? 28 : 12,
  };
  weather.hourly.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13));
    const evening = time.startsWith('2026-10-19') && hour >= 17 && hour <= 23;
    weather.hourly.temperature_2m[i] = cold ? 14 : 23;
    weather.hourly.apparent_temperature[i] = evening
      ? cold ? (hour === 21 ? 11 : 13) : ({17:23,18:23,19:22,20:21,21:20,22:21,23:21}[hour])
      : cold ? 14 : 22;
    weather.hourly.precipitation_probability[i] = cold ? 60 : 10;
    weather.hourly.wind_speed_10m[i] = cold ? 25 : 10;
    weather.hourly.wind_gusts_10m[i] = cold ? 28 : 12;
    weather.hourly.weather_code[i] = cold ? 61 : 0;
    weather.hourly.cloud_cover[i] = cold ? 90 : 5;
    weather.hourly.precipitation[i] = cold ? .2 : 0;
  });
  return weather;
}

try {
  for (const [width, height] of [[390,844],[320,568]]) {
    for (const kind of ['warm','cold-rain-fireplace','after-11pm']) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true,
        timezoneId: 'Australia/Melbourne', reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.setFixedTime(new Date(kind === 'after-11pm' ? '2026-10-19T12:30:00Z' : '2026-10-19T07:00:00Z'));
      await context.routeWebSocket('**', socket => socket.close());
      await page.addInitScript(() => {
        sessionStorage.setItem('splashShown','true');
        sessionStorage.setItem('ss-sunny-advice-shown','1');
      });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === baseURL) return route.continue();
        if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') {
          requests.push(url.searchParams.get('hourly'));
          return route.fulfill({ json: weatherFixture(kind) });
        }
        return route.abort('blockedbyclient');
      });
      await page.goto(baseURL);
      await page.getByRole('button', {name:'Filters',exact:true}).waitFor();
      await page.getByText(kind === 'warm' ? '23°' : '13°', {exact:true}).first().waitFor();
      const initialWeatherRequests = requests.length;
      // Select an existing map preview time; tonight must continue to use real now.
      if (kind === 'warm') {
        const lunch = page.getByRole('button', {name:'Lunch',exact:true});
        await lunch.waitFor();
        await lunch.click();
        await expect(lunch).toHaveAttribute('aria-pressed','true');
      }
      await page.getByRole('button', {name:'Show venue list',exact:true}).click();
      const list = page.locator('.ss-mobile-sheet');
      await list.getByRole('heading', {name:'Venues',exact:true}).waitFor();
      const venue = kind === 'warm' ? 'The Vineyard' : 'Dick Whittington Tavern';
      await page.getByRole('textbox', {name:'Search venues',exact:true}).filter({visible:true}).fill(venue);
      const row = list.getByRole('button', {name:/^Venue: /}).filter({hasText:venue}).first();
      await row.waitFor();
      await row.click();
      const card = page.getByRole('article');
      await expect(card.getByRole('heading', {name:venue,exact:true}).first()).toBeVisible();
      await page.locator('.ss-mobile-sheet-backdrop').waitFor({state:'detached'});
      await page.waitForFunction(() => {
        const article = document.querySelector('article');
        if (!article || article.getBoundingClientRect().top > 1) return false;
        let node = article;
        while (node && node !== document.body) {
          if (Number(getComputedStyle(node).opacity) < .999) return false;
          node = node.parentElement;
        }
        return true;
      });
      const section = card.locator('[data-tonight-feel]');
      if (kind === 'after-11pm') {
        await expect(section).toHaveCount(0);
        const hourly = card.getByRole('heading', {name:/Hour by hour/i}).first();
        await hourly.scrollIntoViewIfNeeded();
      } else {
        await section.waitFor();
        await expect(section.locator('svg').filter({visible:true})).toHaveCount(0);
        await expect(section.getByRole('heading',{name:'How it feels tonight',exact:true})).toBeVisible();
        await expect(section).toContainText(kind === 'warm' ? 'Warm enough to sit outside' : 'Best inside tonight');
        if (kind === 'cold-rain-fireplace') await expect(section).toContainText('Fireplace inside');
        await section.scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth > innerWidth,
        card: [...document.querySelectorAll('[data-tonight-feel]')].some(el => el.scrollWidth > el.clientWidth),
      }));
      assert.deepEqual(overflow,{document:false,card:false});
      assert.deepEqual(errors,[]);
      assert.equal(requests.length,initialWeatherRequests,'Opening the card must reuse the existing weather requests.');
      const text = await section.count() ? await section.innerText() : null;
      await page.screenshot({path:`${output}/${kind}-${width}.png`});
      observations.push({kind,width,height,venue,text,weatherRequests:requests.length,weatherRequestsBeforeCard:initialWeatherRequests,errors,overflow});
      await context.close();
    }
  }
} finally { await browser.close(); }
await fs.writeFile('/tmp/tonight-feel-observations.json',JSON.stringify(observations,null,2));
console.log(JSON.stringify(observations,null,2));

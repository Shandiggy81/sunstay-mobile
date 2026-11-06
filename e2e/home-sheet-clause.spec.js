import { test, expect } from '@playwright/test';
import { weather } from './fixtures/weather.js';

// Melbourne daylight time on the fixture's day (UTC+11).
const melbourne = hour => new Date(Date.UTC(2026, 9, 18, hour + 13));
// Rain all day, in every forecast hour and the current reading.
const rainy = structuredClone(weather);
Object.assign(rainy.current, { precipitation: 1.6, weather_code: 63, cloud_cover: 100 });
for (const [key, value] of Object.entries({ precipitation_probability: 90, precipitation: 1.6, weather_code: 63, cloud_cover: 100 })) {
  rainy.hourly[key] = rainy.hourly.time.map(() => value);
}

/** A clay icon's built URL, e.g. "/assets/rain-DkO5p8-I.webp" ("sun" doesn't match "sun-cloud-…"). */
const clayIcon = name => new RegExp(`/${name}-[\\w-]{8}\\.webp$`);
/** The clause after the venue count, as shown (the peek and the open sheet both render one). */
const clause = page => page.locator('.ss-home-sun-clause').filter({ visible: true }).first();

async function boot(page, baseURL, now, forecast = weather) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(now);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: forecast });
    // Venues stay on the demo list; nothing else leaves the browser.
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.getByText('23°', { exact: true })).toBeVisible();
  return errors;
}

test('home sheet: "rain about" sits beside the rain icon, not a sun', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL, melbourne(11), rainy);
  await expect(clause(page)).toHaveText(/^rain about/);
  await expect(clause(page).locator('img')).toHaveAttribute('src', clayIcon('rain'));
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('home sheet: "after dark" sits beside the night icon', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL, melbourne(21));
  // The sheet opens in After Dark at night; the clause belongs to Sun mode.
  await page.getByRole('group', { name: 'Home sheet mode', exact: true }).getByRole('button', { name: 'Sun', exact: true }).click();
  await expect(clause(page)).toHaveText('after dark');
  await expect(clause(page).locator('img')).toHaveAttribute('src', clayIcon('night'));
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('home sheet: a full-sun count keeps the sun icon', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL, melbourne(11));
  await expect(clause(page)).toHaveText(/^[\d,]+ in full sun$/);
  await expect(clause(page).locator('img')).toHaveAttribute('src', clayIcon('sun'));
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

const list = page => page.locator('.ss-mobile-sheet');
async function openList(page) {
  await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
  await expect(list(page).getByRole('button', { name: /^Venue: / }).first()).toBeVisible();
}

test('venue list: in rain, cosy venues lead and each row says why', async ({ page, baseURL }, testInfo) => {
  const errors = await boot(page, baseURL, melbourne(11), rainy);
  await openList(page);
  await expect(list(page).locator('.ss-explore-sort')).toHaveText('Cosy and dry first');
  // Warm indoor spaces rank first in rain. The row names the venue's own declared
  // fact, never a live status such as a lit fire.
  const first = list(page).getByRole('button', { name: /^Venue: / }).first();
  const reason = first.locator('.ss-vlc-moment');
  await expect(reason).toHaveText(/^(Fireplace|Warm indoor space|Heated indoors)$/);
  const text = await reason.innerText();
  expect(await first.getAttribute('aria-label')).toContain(`. ${text}. `);
  const screenshot = testInfo.outputPath('rain-list-390.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('Rainy list at 390×844', { path: screenshot, contentType: 'image/png' });
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('venue list: a fine day stays sunniest first, with no comfort reasons', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL, melbourne(11));
  await openList(page);
  await expect(list(page).locator('.ss-explore-sort')).toHaveText('Sunniest first');
  await expect(list(page).locator('.ss-vlc-moment')).toHaveCount(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

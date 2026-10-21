/**
 * Reproduce with the dev server running:
 *   node docs/screenshots/map-first-home/interaction-check.mjs [port=5173]
 *
 * Keyless browser regression fixture, not a live Mapbox gesture test. This
 * temporarily replaces the existing TimeOfDayLight map ref with a minimal
 * dragPan spy (and an unloaded style), then restores it. React's browser tree
 * supplies the existing ref and pin callback; application source adds no hook.
 * Only local assets and the existing weather fixture are requested.
 */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { NOW, weather } from '../../../e2e/fixtures/weather.js';

const baseURL = `http://127.0.0.1:${process.argv[2] || '5173'}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true,
  hasTouch: true, timezoneId: 'Australia/Melbourne', reducedMotion: 'reduce', serviceWorkers: 'block' });
const errors = [];
const observations = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.clock.setFixedTime(NOW);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.addInitScript(() => {
    sessionStorage.setItem('splashShown', 'true');
    sessionStorage.setItem('ss-sunny-advice-shown', '1');
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Now', exact: true }).waitFor();

  await page.evaluate(() => {
    const element = document.querySelector('#root').firstElementChild;
    let root = element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))];
    while (root.return) root = root.return;
    const pending = [root];
    let timeProps;
    let venueProps;
    while (pending.length) {
      const fiber = pending.pop();
      const props = fiber.memoizedProps;
      if (props?.mapRef && Object.hasOwn(props, 'todMinutes')) timeProps = props;
      if (props?.venues && props.weatherColorFn && typeof props.onVenueSelect === 'function') venueProps = props;
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
    }
    if (!timeProps || !venueProps) throw new Error('Existing time/map props were not found');
    const probe = { enabled: true, disables: 0, enables: 0 };
    const originalMap = timeProps.mapRef.current;
    timeProps.mapRef.current = {
      dragPan: {
        disable() { probe.enabled = false; probe.disables += 1; },
        enable() { probe.enabled = true; probe.enables += 1; },
      },
      isStyleLoaded: () => false,
      setLights() {},
    };
    window.__mapPanInteractionCheck = {
      probe,
      openPreview: () => venueProps.onVenueSelect(venueProps.venues[0]),
      restore: () => { timeProps.mapRef.current = originalMap; },
    };
  });

  for (const dismissal of ['outside', 'Escape', 'close button', 'map preview']) {
    await page.getByRole('button', { name: 'Fine-tune preview time', exact: true }).click();
    await page.locator('#tod-slider').focus();
    assert.equal(await page.evaluate(() => window.__mapPanInteractionCheck.probe.enabled), false,
      `Focusing the slider must pause dragPan before ${dismissal}`);

    if (dismissal === 'outside') await page.mouse.click(120, 400);
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    if (dismissal === 'close button') await page.getByRole('button', { name: 'Close time controls', exact: true }).click();
    if (dismissal === 'map preview') await page.evaluate(() => window.__mapPanInteractionCheck.openPreview());

    await expect.poll(() => page.evaluate(() => window.__mapPanInteractionCheck.probe.enabled),
      { message: `dragPan must resume after ${dismissal}` }).toBe(true);
    observations.push({ dismissal, ...await page.evaluate(() => ({ ...window.__mapPanInteractionCheck.probe })) });

    if (dismissal === 'map preview') {
      await expect(page.locator('#map-time-popover')).toHaveCount(0);
      await page.getByRole('button', { name: 'Close venue preview', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Fine-tune preview time', exact: true })).toHaveCount(1);
      await expect(page.locator('#map-time-popover')).toBeHidden();
    } else {
      await expect(page.locator('#map-time-popover')).toBeHidden();
    }
  }
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  console.log(JSON.stringify({ width: 390, observations, errors }, null, 2));
} finally {
  await page.evaluate(() => {
    window.__mapPanInteractionCheck?.restore();
    delete window.__mapPanInteractionCheck;
  }).catch(() => {});
  await browser.close();
}

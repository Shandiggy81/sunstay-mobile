import { test, expect } from '@playwright/test';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createPilotDatabase } from '../../scripts/venue-pilot/database.mjs';
import { FAKE_SUPABASE_URL } from '../fixtures/supabase.js';
import { weather } from '../fixtures/weather.js';

test('manager publishes through the real entry; a separate guest reads shared PostgreSQL, reloads, books a demo and expires', async ({ browser, baseURL }, testInfo) => {
  test.skip(!process.env.PGLITE_MODULE, 'Set PGLITE_MODULE to an installed isolated PostgreSQL runtime');
  const fixture = await createPilotDatabase();
  const { db, ids, rpc } = fixture;
  const contexts = [];
  const errors = [], weatherRequests = [], publications = [];
  const email = `${randomBytes(8).toString('hex')}@example.invalid`;
  const otp = String(randomInt(100000, 1000000));
  const tokenBody = Buffer.from(JSON.stringify({ sub: ids.manager, role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${tokenBody}.${randomBytes(32).toString('base64url')}`;
  const user = { id: ids.manager, email, aud: 'authenticated', role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
  let loseFirstAcknowledgement = true;
  try {
    async function open() {
      const context = await browser.newContext({ baseURL, timezoneId: 'Australia/Melbourne',
        isMobile: true, hasTouch: true, reducedMotion: 'reduce',
        viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      contexts.push(context);
      await context.routeWebSocket('**', socket => socket.close());
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === baseURL) return route.continue();
        if (/(open-meteo\.com|tomorrow\.io|openuv\.io|xweather\.com|rainviewer\.com|openweathermap\.org)$/.test(url.hostname)
          || (url.origin === FAKE_SUPABASE_URL && url.pathname === '/functions/v1/weather')) weatherRequests.push(url.pathname);
        if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') {
          return route.fulfill({ json: weather });
        }
        if (url.origin !== FAKE_SUPABASE_URL) return route.abort('blockedbyclient');
        const args = request.postDataJSON() ?? {};
        if (url.pathname === '/auth/v1/otp') return route.fulfill({ json: {} });
        if (url.pathname === '/auth/v1/verify') {
          if (args.email !== email || args.token !== otp) return route.fulfill({ status: 400, json: { msg: 'Invalid synthetic code' } });
          return route.fulfill({ json: { access_token: token, refresh_token: randomBytes(32).toString('hex'),
            token_type: 'bearer', expires_in: 3600, user } });
        }
        if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
        if (url.pathname === '/auth/v1/logout') return route.fulfill({ json: {} });
        if (!url.pathname.startsWith('/rest/v1/rpc/get_') && !url.pathname.endsWith('/rpc/publish_venue_area_heaters')) return route.abort('blockedbyclient');
        const name = url.pathname.split('/').at(-1);
        const actor = request.headers().authorization === `Bearer ${token}` ? ids.manager : null;
        try {
          const result = await rpc(name, args, actor);
          if (name === 'publish_venue_area_heaters') {
            publications.push(args);
            await new Promise(resolve => setTimeout(resolve, 300));
            // Simulate committed DB work followed by a lost HTTP acknowledgement.
            if (loseFirstAcknowledgement) {
              loseFirstAcknowledgement = false;
              return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
            }
          }
          return route.fulfill({ json: result });
        } catch (error) { return route.fulfill({ status: 403, json: { code: error.code, message: 'Request denied' } }); }
      });
      const page = await context.newPage();
      await page.clock.install();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/?venue=dv-20');
      const card = page.getByRole('article', { name: 'Mr Tulk', exact: true });
      await expect(card).toBeVisible();
      await expect(card.getByRole('region', { name: 'Venue staff reports' })).toBeVisible();
      return { page, card, context };
    }
    const manager = await open(), guest = await open();
    const guestReport = guest.card.getByRole('region', { name: 'Venue staff reports' });
    await guestReport.getByLabel('Choose an area').selectOption(ids.terrace);
    await expect(guestReport).toContainText('No current staff report');
    await manager.card.getByRole('button', { name: 'Manage this venue' }).click();
    const panel = manager.page.getByRole('dialog', { name: 'Manage Mr Tulk' });
    await panel.getByLabel('Email', { exact: true }).fill(email);
    await panel.getByRole('button', { name: 'Send sign-in code' }).click();
    await panel.getByLabel('Sign-in code', { exact: true }).fill(otp);
    await panel.getByRole('button', { name: 'Sign in', exact: true }).click();
    await panel.getByLabel('Guest area').selectOption(ids.terrace);
    await panel.getByRole('switch', { name: /Heaters on/ }).click();
    await panel.getByLabel('Report valid for').selectOption('30');
    await manager.page.waitForTimeout(500);
    const weatherBefore = weatherRequests.length;
    const publish = panel.getByRole('button', { name: 'Publish update' });
    await publish.evaluate(button => { button.click(); button.click(); });
    await manager.page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await expect(panel.getByRole('alert')).toContainText('Publication could not be confirmed');
    await expect(panel.getByText('Terrace: heaters on published.')).toHaveCount(0);
    expect(publications.length).toBe(1);
    await publish.click();
    await expect(panel.getByRole('status')).toContainText('Terrace: heaters on published.');
    expect(publications.length).toBe(2);
    expect(publications[0].p_request_id).toBe(publications[1].p_request_id);
    expect((await db.query('select count(*)::int as n from private.venue_area_heater_reports')).rows[0].n).toBe(1);
    expect(weatherRequests.length).toBe(weatherBefore);
    const started = Date.now();
    await expect(guestReport).toContainText('Terrace: heaters on', { timeout: 20_000 });
    const propagationMs = Date.now() - started;
    await expect(guestReport).toContainText('Confirmed by venue staff');
    await expect(guestReport).toContainText(/Updated .*until/);
    await expect(guest.page.getByRole('button', { name: 'Manage this venue' })).toBeVisible();
    expect(await guest.page.evaluate(() => Object.keys(localStorage).some(key => key.includes('auth-token')))).toBe(false);
    const shots = 'docs/screenshots/venue-heaters-pilot';
    await mkdir(shots, { recursive: true });
    await manager.page.screenshot({ path: `${shots}/manager-390.png` });
    await guest.page.screenshot({ path: `${shots}/guest-390.png` });
    await guest.page.reload();
    await guestReport.getByLabel('Choose an area').selectOption(ids.terrace);
    await expect(guestReport).toContainText('Terrace: heaters on');
    await guestReport.getByLabel('Choose an area').selectOption(ids.courtyard);
    await expect(guestReport).toContainText('No current staff report');
    await guestReport.getByRole('button', { name: 'Book this area · Demo' }).click();
    const booking = guest.page.getByRole('dialog', { name: 'Demo booking' });
    await expect(booking).toContainText('No reservation, payment or message will be sent.');
    await expect(booking).toContainText('Courtyard');
    await booking.getByRole('combobox', { name: 'Time', exact: true }).selectOption({ index: 2 });
    const chosenTime = await booking.getByRole('combobox', { name: 'Time', exact: true }).locator('option:checked').textContent();
    await booking.getByLabel('Party size').fill('4');
    const writesBeforeBooking = publications.length;
    await booking.getByRole('button', { name: 'Confirm demo choice' }).click();
    await expect(booking.getByRole('status')).toContainText(`Courtyard · ${chosenTime} · 4 people`);
    await expect(booking).toContainText('No real booking was made.');
    expect(publications.length).toBe(writesBeforeBooking);
    expect(await guest.page.evaluate(() => sessionStorage.getItem('ss-demo-area-booking-count'))).toBe('1');
    await booking.getByRole('button', { name: 'Close venue action' }).click();
    await expect(guestReport.getByRole('button', { name: 'Book this area · Demo' })).toBeFocused();
    await guestReport.getByLabel('Choose an area').selectOption(ids.terrace);
    const report = (await rpc('get_venue_area_heaters'))[0];
    const pinPage = await guest.context.newPage();
    await pinPage.clock.install();
    await pinPage.goto('/e2e/fixtures/venue-pin.html');
    await pinPage.waitForFunction(() => typeof window.renderPublishedPin === 'function');
    await pinPage.evaluate(value => window.renderPublishedPin(value), report);
    const pin = pinPage.locator('.ss-sun-pin');
    await expect(pin).toHaveAttribute('data-staff-report', 'current');
    await expect(pin).toHaveAttribute('aria-label', /Mr Tulk.*Terrace.*venue staff.*until/i);
    await expect(pin.locator('img')).toHaveJSProperty('complete', true);
    await pinPage.screenshot({ path: `${shots}/pin-renderer-390.png` });
    await pinPage.evaluate(value => window.renderPublishedPin(value, null), report);
    await expect(pinPage.locator('.ss-pin-score')).toBeVisible();
    await expect(pinPage.locator('.ss-pin-score')).not.toBeEmpty();
    await guest.page.route('**/rpc/get_venue_area_heaters', route => route.abort('blockedbyclient'));
    await guest.page.clock.fastForward(31 * 60_000);
    await expect(guestReport).toContainText('No current staff report');
    await pinPage.clock.fastForward(31 * 60_000);
    await pinPage.evaluate(value => window.renderPublishedPin(value), report);
    await expect(pinPage.locator('.ss-sun-pin')).toHaveAttribute('data-staff-report', 'none');
    for (const width of [320, 375, 390, 430]) {
      await manager.page.setViewportSize({ width, height: 844 });
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      for (const box of await panel.locator('button, input, select').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()))) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    await manager.page.bringToFront();
    await panel.getByRole('button', { name: 'Close venue action' }).focus();
    await manager.page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(manager.card.getByRole('button', { name: 'Manage this venue' })).toBeFocused();
    expect(errors).toEqual([]);
    await testInfo.attach('sanitised-result', { body: JSON.stringify({ propagationMs, guestRefreshRequired: false,
      databaseRows: 1, weatherRequestsDuringPublish: 0, isolatedPostgres: true,
      authGateway: 'synthetic; SMTP and hosted JWT verification not exercised', map: 'actual DOM renderer only' }), contentType: 'application/json' });
    console.log(`Isolated shared-DB visibility: ${propagationMs} ms; no guest refresh; no weather request on publish.`);
  } finally {
    for (const context of contexts) await context.close();
    await fixture.close();
  }
});

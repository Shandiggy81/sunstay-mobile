import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';
import { nameContainsLabel } from '../src/utils/labelInName.js';

// The axe-core 4.14 checks behind AGENTS.md's accessibility bar, run without axe:
// Label in Name (WCAG 2.5.3), no control inside another, a visible focus ring on
// list rows, and one name per sun report region.

async function boot(page, baseURL, path = '/') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(NOW);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
    // Venues stay on the demo list; nothing else leaves the browser.
    return route.abort('blockedbyclient');
  });
  await page.goto(path);
  return errors;
}

/** The control's visible text as axe reads it: node by node, with no spaces added between elements. */
const shownText = control => control.evaluate(element => {
  let text = '';
  const walk = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parent = child.parentElement;
        const box = parent.getBoundingClientRect();
        if (parent.checkVisibility({ visibilityProperty: true }) && box.width > 1 && box.height > 1) text += child.nodeValue;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(element);
  return text;
});

async function expectNameSaysShownText(control) {
  const name = await control.getAttribute('aria-label');
  const shown = await shownText(control);
  expect(shown.trim(), 'the control shows some text').not.toBe('');
  expect(nameContainsLabel(name, shown), `"${name}" should contain the words of "${shown}"`).toBe(true);
}

const sheet = page => page.locator('.ss-mobile-sheet');
const rows = page => sheet(page).getByRole('button', { name: /^Venue: / });

async function openList(page) {
  await expect(page.getByText('23°', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Show venue list$/ }).click();
  await expect(rows(page).first()).toBeVisible();
}

test('home: the weather and summary buttons name the words they show', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL);
  await expect(page.getByText('23°', { exact: true }).first()).toBeVisible();
  await expectNameSaysShownText(page.locator('.ss-home-weather-card'));
  const summary = page.locator('button.ss-home-summary-copy');
  await expectNameSaysShownText(summary);
  await expect(summary).toHaveAttribute('aria-label', /^\d[\d,]* venues?(, .+)?\. Show venue list$/);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('list: each row is one button named with its words, and Compare sits beside it', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL);
  await openList(page);
  const checkRows = async () => {
    const count = Math.min(await rows(page).count(), 6);
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) await expectNameSaysShownText(rows(page).nth(index));
    // No control inside another: nothing focusable inside a row's button or any role="button".
    const nested = await sheet(page).evaluate(list => list.querySelectorAll(
      ':is(button, [role="button"]) :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]))').length);
    expect(nested).toBe(0);
  };
  await checkRows();

  await sheet(page).getByRole('button', { name: 'Stays', exact: true }).tap();
  const compare = sheet(page).locator('.ss-venue-list-card').first().getByRole('button', { name: 'Compare', exact: true });
  await expect(compare).toBeVisible();
  await checkRows();
  await expectNameSaysShownText(sheet(page).locator('.ss-stay-picker').getByRole('button', { name: /choose stay date$/ }));
  // Compare still toggles without opening the venue.
  await compare.tap();
  await expect(compare).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: / details$/ })).toHaveCount(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('list: a keyboard-focused row shows its ring inside the row, and Enter opens it', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL);
  await openList(page);
  const row = rows(page).first();
  await row.focus();
  // Real key presses, so the row matches :focus-visible.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(row).toBeFocused();
  const ring = await row.evaluate(button => {
    const style = getComputedStyle(button.closest('.ss-venue-list-card'));
    return { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, button: getComputedStyle(button).outlineStyle };
  });
  // Outside the row, the list clips the ring and the next row covers it.
  expect(ring).toEqual({ style: 'solid', width: '2px', offset: '-2px', button: 'none' });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: / details$/ })).toBeVisible();
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('sun report: each open side names its own seasons region', async ({ page, baseURL }) => {
  const errors = await boot(page, baseURL, '/?report=dv-melb-stay-01');
  const report = page.getByRole('dialog', { name: 'Pullman Melbourne City Centre', exact: true });
  await expect(report.getByRole('heading', { name: 'Best side on a clear day', exact: true })).toBeVisible();
  const toggles = report.locator('.ss-sun-report__side-toggle');
  const sides = await toggles.count();
  expect(sides).toBeGreaterThan(1);
  for (let index = 0; index < sides; index += 1) {
    if ((await toggles.nth(index).getAttribute('aria-expanded')) === 'false') await toggles.nth(index).click();
  }
  const names = await report.locator('.ss-sun-report__season-section').evaluateAll(sections => sections.map(section => section
    .getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent.trim()).join(' ')));
  expect(names).toHaveLength(sides);
  expect(new Set(names).size).toBe(sides);
  for (const name of names) expect(name).toMatch(/^\S.* Summer and winter$/);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

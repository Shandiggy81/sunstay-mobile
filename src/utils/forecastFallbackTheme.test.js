import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastFallbackTheme } from './forecastFallbackTheme.js';

test('empty uses amber tokens and includes Brucey', () => {
  const theme = forecastFallbackTheme('empty');
  assert.equal(theme.role, 'status');
  assert.equal(theme.background, '#FFFBEB');
  assert.match(theme.border, /245,158,11/);
  assert.equal(theme.titleColor, '#92400E');
  assert.equal(theme.bodyColor, '#B45309');
  assert.equal(theme.mascot, true);
  assert.equal(theme.imageWidth, 96);
  assert.equal(theme.imageHeight, 96);
});

test('error uses rose tokens and includes Brucey', () => {
  const theme = forecastFallbackTheme('error');
  assert.equal(theme.role, 'alert');
  assert.equal(theme.background, '#FFF1F2');
  assert.match(theme.border, /225,29,72/);
  assert.equal(theme.titleColor, '#9F1239');
  assert.equal(theme.bodyColor, '#BE123C');
  assert.equal(theme.mascot, true);
  assert.equal(theme.imageWidth, 96);
  assert.equal(theme.imageHeight, 96);
});

test('success and loading do not get a fallback mascot card', () => {
  assert.equal(forecastFallbackTheme('success'), null);
  assert.equal(forecastFallbackTheme('loading'), null);
  assert.equal(forecastFallbackTheme(undefined), null);
});

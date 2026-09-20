import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveForecastView,
  forecastItemCount,
  forecastDataPresent,
} from './resolveForecastView.js';

test('loading wins over empty or errored hourly data', () => {
  assert.equal(resolveForecastView({ loading: true, error: true, items: [] }), 'loading');
});

test('error is distinct from an empty timeline', () => {
  assert.equal(resolveForecastView({ loading: false, error: true, items: [] }), 'error');
  assert.equal(resolveForecastView({ loading: false, error: false, items: [] }), 'empty');
  assert.equal(resolveForecastView({ loading: false, error: false, items: undefined }), 'empty');
});

test('success requires at least one timeline item', () => {
  assert.equal(resolveForecastView({ loading: false, error: false, items: [{ hour: 9 }] }), 'success');
  assert.equal(forecastItemCount([{ hour: 9 }, { hour: 10 }]), 2);
  assert.equal(forecastDataPresent([]), false);
  assert.equal(forecastDataPresent(null), false);
  assert.equal(forecastDataPresent([{ hour: 9 }]), true);
});

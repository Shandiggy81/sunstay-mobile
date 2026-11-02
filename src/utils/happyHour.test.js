import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatHappyHourRange } from './happyHour.js';

describe('formatHappyHourRange', () => {
  it('uses 12-hour times with one shared suffix and no zero minutes', () => {
    assert.equal(formatHappyHourRange('16:00', '18:00'), '4–6pm');
    assert.equal(formatHappyHourRange('08:00', '10:00'), '8–10am');
    assert.equal(formatHappyHourRange('12:00', '14:00'), '12–2pm');
  });

  it('keeps non-zero minutes and both suffixes across noon or midnight', () => {
    assert.equal(formatHappyHourRange('16:30', '18:45'), '4:30–6:45pm');
    assert.equal(formatHappyHourRange('11:30', '13:00'), '11:30am–1pm');
    assert.equal(formatHappyHourRange('23:00', '00:30'), '11pm–12:30am');
  });

  it('does not display missing or invalid wall-clock times', () => {
    for (const value of [null, undefined, '', '25:00', '16:60', '4pm', 1600]) {
      assert.equal(formatHappyHourRange(value, '18:00'), '');
      assert.equal(formatHappyHourRange('16:00', value), '');
    }
  });
});

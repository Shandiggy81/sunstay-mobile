import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerEventMaxDate, partnerHappyHourError } from './partnerToolsForm.js';

test('event date limit is 60 calendar days across DST, leap days and year end', () => {
    assert.equal(partnerEventMaxDate('2026-09-20'), '2026-11-19');
    assert.equal(partnerEventMaxDate('2028-02-01'), '2028-04-01');
    assert.equal(partnerEventMaxDate('2026-12-10'), '2027-02-08');
});

test('happy hour accepts a deal only or a complete schedule', () => {
    assert.equal(partnerHappyHourError({ days: [], start: '', end: '', deal: '$8 pints' }), null);
    assert.equal(partnerHappyHourError({ days: ['Mon'], start: '16:00', end: '18:00', deal: '' }), null);
});

test('happy hour explains partial or reversed schedules and empty deals', () => {
    for (const draft of [
        { days: [], start: '16:00', end: '18:00', deal: '$8 pints' },
        { days: ['Mon'], start: '', end: '', deal: '$8 pints' },
        { days: ['Mon'], start: '16:00', end: '', deal: '' },
    ]) assert.match(partnerHappyHourError(draft), /at least one day and both times/);
    for (const end of ['15:00', '16:00']) {
        assert.match(partnerHappyHourError({ days: ['Mon'], start: '16:00', end, deal: '' }), /later/);
    }
    assert.match(partnerHappyHourError({ days: [], start: '', end: '', deal: '  ' }), /Add a deal/);
});

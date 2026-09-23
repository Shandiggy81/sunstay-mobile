import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PTR_SUCCESS_HOLD_MS,
    keepRefreshingUntilSettled,
    nextPullPhase,
    pullRefreshStatus,
    refreshFailureVisible,
    resolveRefreshHoldMs,
    venueRefreshBusy,
} from './pullRefreshStatus.js';

describe('nextPullPhase', () => {
    it('enters pulling then ready while the finger is down', () => {
        assert.equal(nextPullPhase('idle', { type: 'move', ready: false }), 'pulling');
        assert.equal(nextPullPhase('pulling', { type: 'move', ready: true }), 'ready');
        assert.equal(nextPullPhase('ready', { type: 'move', ready: false }), 'pulling');
    });

    it('aborts to idle when released before the threshold', () => {
        assert.equal(nextPullPhase('pulling', { type: 'release', ready: false }), 'idle');
        assert.equal(nextPullPhase('ready', { type: 'release', ready: false }), 'idle');
    });

    it('refreshes only after a ready release, then settles to success or error', () => {
        assert.equal(nextPullPhase('ready', { type: 'release', ready: true }), 'refreshing');
        assert.equal(nextPullPhase('refreshing', { type: 'refresh-success' }), 'success');
        assert.equal(nextPullPhase('refreshing', { type: 'refresh-error' }), 'error');
        assert.equal(nextPullPhase('error', { type: 'retry' }), 'refreshing');
        assert.equal(nextPullPhase('success', { type: 'dismiss' }), 'idle');
    });

    it('lets the fallback button start a refresh from idle', () => {
        assert.equal(nextPullPhase('idle', { type: 'refresh-start' }), 'refreshing');
    });

    it('resets to idle on cancel, unmount, sheet close, venue change, and threshold miss', () => {
        assert.equal(nextPullPhase('pulling', { type: 'cancel' }), 'idle');
        assert.equal(nextPullPhase('refreshing', { type: 'unmount' }), 'idle');
        assert.equal(nextPullPhase('success', { type: 'sheet-close' }), 'idle');
        assert.equal(nextPullPhase('error', { type: 'venue-change' }), 'idle');
        assert.equal(nextPullPhase('ready', { type: 'threshold-miss' }), 'idle');
        assert.equal(nextPullPhase('error', { type: 'reset' }), 'idle');
    });
});

describe('pullRefreshStatus', () => {
    it('speaks a polite status for each phase without replacing the list', () => {
        assert.equal(pullRefreshStatus('idle'), '');
        assert.equal(pullRefreshStatus('pulling'), 'Pull to refresh venues');
        assert.equal(pullRefreshStatus('ready'), 'Release to refresh venues');
        assert.equal(pullRefreshStatus('refreshing'), 'Refreshing venues');
        assert.equal(pullRefreshStatus('success'), 'Venues updated');
        assert.equal(pullRefreshStatus('error'), 'Venue refresh failed. Retry available.');
        assert.equal(pullRefreshStatus('error', { timedOut: true }), 'Venue refresh timed out. Retry available.');
        assert.equal(refreshFailureVisible(pullRefreshStatus('error')), true);
        assert.equal(refreshFailureVisible(pullRefreshStatus('error', { timedOut: true })), true);
        assert.equal(refreshFailureVisible(pullRefreshStatus('success')), false);
    });
});

describe('mascot refresh lifecycle', () => {
    it('stays in refreshing until the refresh promise settles', () => {
        assert.equal(keepRefreshingUntilSettled('refreshing', { settled: false }), 'refreshing');
        assert.equal(keepRefreshingUntilSettled('refreshing', { settled: true, outcome: 'success' }), 'success');
        assert.equal(keepRefreshingUntilSettled('refreshing', { settled: true, outcome: 'failure' }), 'error');
    });

    it('holds success for about one second, then returns to idle', () => {
        assert.equal(PTR_SUCCESS_HOLD_MS, 1000);
        assert.equal(resolveRefreshHoldMs(false), 1000);
        assert.equal(resolveRefreshHoldMs(true), 200);
    });

    it('clears Updating busy state when the user refresh finishes, including failure', () => {
        assert.equal(venueRefreshBusy({ userRefresh: true, loading: true }), true);
        assert.equal(venueRefreshBusy({ userRefresh: false, loading: false }), false);
        assert.equal(venueRefreshBusy({ userRefresh: false, loading: true }), false);
    });
});

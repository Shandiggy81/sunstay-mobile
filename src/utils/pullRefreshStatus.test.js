import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextPullPhase, pullRefreshStatus } from './pullRefreshStatus.js';

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
});

describe('pullRefreshStatus', () => {
    it('speaks a polite status for each phase without replacing the list', () => {
        assert.equal(pullRefreshStatus('idle'), '');
        assert.equal(pullRefreshStatus('pulling'), 'Pull to refresh venues');
        assert.equal(pullRefreshStatus('ready'), 'Release to refresh venues');
        assert.equal(pullRefreshStatus('refreshing'), 'Refreshing venues');
        assert.equal(pullRefreshStatus('success'), 'Venues updated');
        assert.equal(pullRefreshStatus('error'), 'Venue refresh failed. Retry available.');
    });
});

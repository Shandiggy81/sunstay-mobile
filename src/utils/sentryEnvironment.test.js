import test from 'node:test';
import assert from 'node:assert/strict';
import { sentryEnvironment, sentryRelease } from './sentryEnvironment.js';

test('Netlify deploy contexts become Sentry environments', () => {
    assert.equal(sentryEnvironment('production', 'production'), 'production');
    assert.equal(sentryEnvironment('deploy-preview', 'production'), 'deploy-preview');
    assert.equal(sentryEnvironment('branch-deploy', 'production'), 'branch-deploy');
});

test('outside Netlify the Vite mode is used', () => {
    assert.equal(sentryEnvironment('', 'production'), 'production');
    assert.equal(sentryEnvironment('dev', 'development'), 'development');
    assert.equal(sentryEnvironment(undefined, 'e2e'), 'e2e');
    assert.equal(sentryEnvironment(undefined, undefined), 'development');
});

test('release is the short commit, only for a real commit ref', () => {
    assert.equal(sentryRelease('72A5B78C0FFEE1234567890ABCDEF1234567890A'), 'sunstay@72a5b78c0ffe');
    assert.equal(sentryRelease('72a5b78'), 'sunstay@72a5b78');
    for (const value of ['', undefined, 'HEAD', 'main', '$COMMIT_REF']) assert.equal(sentryRelease(value), undefined, String(value));
});

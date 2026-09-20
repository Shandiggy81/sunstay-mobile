import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppErrorView } from './appErrorFallback.js';

describe('app error fallback', () => {
    it('shows a full-screen Something went wrong card with Reload App', () => {
        const view = resolveAppErrorView({ hasError: true });
        assert.equal(view.kind, 'fallback');
        assert.equal(view.role, 'alert');
        assert.equal(view.isNull, false);
        assert.equal(view.title, 'Something went wrong');
        assert.equal(view.reloadLabel, 'Reload App');
        assert.equal(view.reloadAction, 'window.location.reload');
        assert.match(view.cardClass, /amber/);
        assert.match(view.cardClass, /slate/);
        assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(view.title + view.reloadLabel), false);
    });

    it('keeps children when there is no error', () => {
        const child = { type: 'app' };
        const view = resolveAppErrorView({ hasError: false, children: child });
        assert.equal(view.kind, 'children');
        assert.equal(view.node, child);
    });
});

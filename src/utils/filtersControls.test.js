import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFiltersControls } from './filtersControls.js';

describe('filters controls', () => {
    it('keeps a single header Filters control and drops the floating map overlay', () => {
        const view = resolveFiltersControls();
        assert.equal(view.headerVisible, true);
        assert.equal(view.headerLabel, 'Filters');
        assert.equal(view.headerAccessibleName, 'Filters');
        assert.equal(view.mapOverlayVisible, false);
        assert.equal(view.duplicateCount, 1);
    });
});

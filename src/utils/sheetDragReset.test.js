import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetSheetDragOffset, sheetDragResetDependencyList } from './sheetDragReset.js';

describe('resetSheetDragOffset', () => {
    it('snaps the motion value to 0 so an interrupted swipe cannot keep a leftover y', () => {
        const values = [];
        const dragY = {
            set(next) {
                values.push(next);
            },
        };
        resetSheetDragOffset(dragY);
        assert.deepEqual(values, [0]);
    });
});

describe('sheetDragResetDependencyList', () => {
    it('depends on sheet state and the stable dragY motion value, not a new object each render', () => {
        const dragY = { set() {} };
        const first = sheetDragResetDependencyList('list', dragY);
        const second = sheetDragResetDependencyList('list', dragY);
        assert.deepEqual(first, ['list', dragY]);
        assert.equal(first[1], second[1]);
        assert.notEqual(sheetDragResetDependencyList('full', dragY)[0], first[0]);
    });
});

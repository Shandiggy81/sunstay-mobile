import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readVenueDetailLayoutProbe } from './venueDetailLayoutProbe.js';

function fakeTabpanel({
    clientHeight = 240,
    scrollHeight = 640,
    display = 'flex',
    visibility = 'visible',
    opacity = '1',
    height = '240px',
} = {}) {
    return {
        clientHeight,
        scrollHeight,
        isConnected: true,
        ownerDocument: {
            defaultView: {
                getComputedStyle() {
                    return { display, visibility, opacity, height };
                },
            },
        },
    };
}

describe('venue detail layout probe', () => {
    it('records venue, tab, branch, mount, heights, error, and computed box', () => {
        const probe = readVenueDetailLayoutProbe({
            venueId: 'railway-hotel',
            activeTab: 'Sun Forecast',
            branch: 'sun-forecast',
            tabpanel: fakeTabpanel(),
            errorCaught: false,
        });
        assert.equal(probe.venueId, 'railway-hotel');
        assert.equal(probe.activeTab, 'Sun Forecast');
        assert.equal(probe.branch, 'sun-forecast');
        assert.equal(probe.tabpanelMounted, true);
        assert.equal(probe.clientHeight, 240);
        assert.equal(probe.scrollHeight, 640);
        assert.equal(probe.errorCaught, false);
        assert.equal(probe.display, 'flex');
        assert.equal(probe.visibility, 'visible');
        assert.equal(probe.opacity, '1');
        assert.equal(probe.height, '240px');
    });

    it('flags a missing tabpanel and a caught render error without serializing payloads', () => {
        const probe = readVenueDetailLayoutProbe({
            venueId: 'railway-hotel',
            activeTab: 'Overview',
            branch: 'overview',
            tabpanel: null,
            errorCaught: true,
            errorMessage: 'Cannot read properties of undefined',
            weather: { hourly: Array.from({ length: 48 }, (_, i) => ({ i })) },
        });
        assert.equal(probe.tabpanelMounted, false);
        assert.equal(probe.clientHeight, null);
        assert.equal(probe.errorCaught, true);
        assert.equal(probe.errorMessage, 'Cannot read properties of undefined');
        assert.equal(JSON.stringify(probe).includes('hourly'), false);
    });
});

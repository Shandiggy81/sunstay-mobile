import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoVenues } from '../data/demoVenues.js';
import { stayRoomTypesDisplay } from './stayRoomTypes.js';
import {
    clampStayDate, compareRoomTypes, defaultRoomTypes, homeOutdoorView, partnerProfile, partnerStayTasks,
    restoreStayDrafts, roomTypesFor, sharedPoolView, stayDateLabel, stayDateRange, stayFoodAndDrink,
    stayGuestVenue, staySides, sunWindowsText, updateStayDraft,
} from './partnerStay.js';

const byId = id => demoVenues.find(venue => venue.id === id);
const lancemore = byId('dv-17');    // Boutique hotel, four modelled sides at Level 5, "an art-filled lobby bar"
const quest = byId('dv-melb-stay-08'); // Serviced apartments, no bar or restaurant in the listing
const corner = byId('dv-18');       // Live music pub
const beans = byId('dv-14');        // Café
// A short-stay home like the one the partner-preview spec serves (e2e/fixtures/shortStay.js).
const home = {
    id: 'home-1', venueName: 'Sample home', typeCategory: 'Short stay', typeLabel: 'Short stay', lat: -37.7978, lng: 144.9779,
    tags: ['Short stay', 'Balcony', 'Garden'], hasBalcony: true,
    roomTypes: [{ id: 'home-1-facade-0', name: 'North-west-facing rooms · Level 1', source: 'estimated-buildings', orientation: 315,
        floorLevel: 1, floorHeight: 4.2, obstructions: [{ start: 255, end: 285, minAltitude: 20 }, { start: 330, end: 350, minAltitude: 12 }] }],
};
const DATE = '2026-11-21'; // Saturday
const sideId = (venue, title) => staySides(venue).find(side => side.title === title).id;

test('each partner type gets its own first screen from the existing classification', () => {
    assert.deepEqual(partnerProfile(lancemore), { key: 'hotel', lead: 'rooms', heading: 'Room sun', specials: true, events: true, offer: 'lobby bar' });
    assert.deepEqual(partnerProfile(quest), { key: 'serviced-apartment', lead: 'rooms', heading: 'Room sun', specials: false, events: false, offer: null });
    assert.deepEqual(partnerProfile(home), { key: 'short-stay', lead: 'home', heading: 'Your home', specials: false, events: false, offer: null });
    assert.equal(partnerProfile({ ...home, typeCategory: 'Residential' }).lead, 'home');
    assert.deepEqual(partnerProfile(corner), { key: 'pub', lead: 'service', heading: 'Today', specials: true, events: true, offer: null });
    assert.equal(partnerProfile(beans).key, 'cafe');
    // Only the listing's own words count: a bar or restaurant, not "Rooftop" on its own.
    assert.equal(stayFoodAndDrink(byId('dv-hotel-01')), 'dining');
    assert.equal(stayFoodAndDrink({ tags: ['Hotel', 'Rooftop'] }), null);
});

test('a hotel compares two named room types on one date, with what isn’t known listed', () => {
    const rooms = [
        { name: 'King room', sideId: sideId(lancemore, 'East side'), outdoor: 'balcony' },
        { name: 'Twin room', sideId: sideId(lancemore, 'West side'), outdoor: 'window_only' },
    ];
    const compared = compareRoomTypes({ venue: lancemore, rooms, date: DATE });
    assert.equal(compared.dateLabel, 'Sat 21 Nov');
    assert.equal(compared.verdict, 'King room gets 1h 41m more sun on Sat 21 Nov');
    const [king, twin] = compared.rows;
    assert.deepEqual([king.sideLabel, king.sunLabel, king.sun.durationText, king.sun.windowsText, king.sun.morning, king.sun.sunset],
        ['East side · Level 5', 'Balcony sun', '3h 43m', '9:50am–1:33pm', true, false]);
    assert.deepEqual(king.unknowns, ['Balcony roof not modelled', 'Sun modelled at Level 5 only']);
    // Touching windows read as one: the engine splits West side at 3:25pm.
    assert.deepEqual([twin.sunLabel, twin.sun.durationText, twin.sun.windowsText], ['Window sun', '2h 2m', '1:33–3:35pm']);
    assert.deepEqual(twin.unknowns, ['Sun modelled at Level 5 only']);
});

test('the starting pair is the sunniest and shadiest side, unnamed, and nothing is guessed', () => {
    const start = defaultRoomTypes(lancemore, DATE);
    assert.deepEqual(start.map(room => room.sideId), [sideId(lancemore, 'North side'), sideId(lancemore, 'South-east side')]);
    const compared = compareRoomTypes({ venue: lancemore, rooms: start, date: DATE });
    assert.equal(compared.verdict, 'Room type A gets 5h 11m more sun on Sat 21 Nov');
    assert.deepEqual(compared.rows[0].unknowns, ['Room name not set', 'Balcony or window not recorded', 'Sun modelled at Level 5 only']);
    assert.equal(compared.rows[0].sunLabel, 'Window sun');
    // A room type without a side has no sun and says so; the verdict waits for both.
    const half = compareRoomTypes({ venue: lancemore, rooms: [start[0], { name: 'Suite', sideId: null, outdoor: null }], date: DATE });
    assert.equal(half.verdict, null);
    assert.deepEqual([half.rows[1].sun, half.rows[1].unknowns], [null, ['Side of the building not set', 'Balcony or window not recorded']]);
});

test('the shared pool is shown on its own: unknown until answered, open sky only on a roof', () => {
    assert.deepEqual(sharedPoolView({ venue: lancemore, date: DATE }),
        { status: 'unknown', title: 'Shared pool', text: 'Not recorded. Guests aren’t told about a pool.', unknowns: ['Whether there’s a pool'] });
    assert.equal(sharedPoolView({ venue: { ...lancemore, hasPool: true }, date: DATE }).status, 'recorded');
    const roof = sharedPoolView({ venue: lancemore, answer: 'rooftop', date: DATE });
    assert.equal(roof.text, 'Up to 14h 10m of sun on Sat 21 Nov under open sky');
    assert.deepEqual(roof.unknowns, ['Nearby towers not modelled', 'Where the pool sits on the roof']);
    assert.equal(sharedPoolView({ venue: lancemore, answer: 'ground', date: DATE }).text, 'Sun not modelled: the pool’s position isn’t recorded.');
    assert.equal(sharedPoolView({ venue: lancemore, answer: 'indoor', date: DATE }).status, 'indoor');
    assert.equal(sharedPoolView({ venue: lancemore, answer: 'none', date: DATE }).title, 'No pool');
    assert.equal(sharedPoolView({ venue: lancemore, answer: 'spa', date: DATE }).status, 'unknown');
});

test('a short-stay home: the private balcony’s sun, and a garden that is unknown until the host says', () => {
    const asked = homeOutdoorView({ venue: home, date: DATE });
    assert.deepEqual([asked.private.title, asked.private.sideLabel, asked.private.sun.durationText, asked.private.sun.windowsText],
        ['Private balcony', 'North-west side · Level 1', '7h 40m', '11:56am–6:24pm, 6:59–8:11pm']);
    assert.deepEqual(asked.ask, { noun: 'garden', question: 'Who can use the garden?', answer: null });
    assert.deepEqual(asked.unknowns, ['Whether the garden is private or shared', 'Sun modelled at Level 1 only', 'Balcony depth and roof not recorded']);
    const shared = homeOutdoorView({ venue: home, garden: 'shared', date: DATE });
    assert.deepEqual(shared.shared, [{ title: 'Shared garden', text: 'Sun not modelled: its position isn’t recorded.' }]);
    assert.equal(shared.unknowns.at(-1), 'Where the garden is');
    assert.deepEqual(homeOutdoorView({ venue: home, garden: 'none', date: DATE }).shared, []);
    // Nothing recorded outside: nothing claimed.
    const bare = homeOutdoorView({ venue: { ...home, tags: [], hasBalcony: false }, date: DATE });
    assert.deepEqual([bare.private, bare.shared, bare.ask, bare.unknowns], [null, [], null, []]);
});

test('the guest card gets named room types and the host’s garden answer, still modelled', () => {
    const rooms = [
        { name: 'King room', sideId: sideId(lancemore, 'East side'), outdoor: 'balcony' },
        { name: 'Twin room', sideId: sideId(lancemore, 'West side'), outdoor: 'window_only' },
    ];
    const guest = stayGuestVenue(lancemore, { rooms });
    assert.deepEqual(guest.roomTypes.map(room => [room.kind, room.name, room.orientation, room.floorLevel, room.outdoorSpace, room.source]),
        [['room_type', 'King room', 69.9, 5, 'balcony', 'partner-preview'], ['room_type', 'Twin room', 250, 5, 'window_only', 'partner-preview']]);
    const display = stayRoomTypesDisplay(guest);
    assert.deepEqual([display.mode, display.headline, display.trustLine, display.showRoomPicker],
        ['room_types', 'Balcony and window sun', 'Modelled · Hotel-confirmed (next) · On-site checked (not yet)', true]);
    // Until both are named and placed, the card keeps the building's sides.
    assert.equal(stayGuestVenue(lancemore, { rooms: [rooms[0], { ...rooms[1], name: '' }] }), lancemore);
    assert.deepEqual(stayGuestVenue(home, { garden: 'shared' }).tags, ['Short stay', 'Balcony', 'Shared garden']);
    assert.deepEqual(stayGuestVenue(home, { garden: 'none' }).tags, ['Short stay', 'Balcony']);
});

test('stay answers are cleaned when read back, and stale sides fall back to the starting pair', () => {
    assert.deepEqual(restoreStayDrafts('not json'), {});
    const map = updateStayDraft({}, 'dv-17', { date: '2026-11-21', pool: 'spa', garden: 'shared',
        rooms: [{ name: `  ${'K'.repeat(50)}  `, sideId: 'dv-17-facade-0', outdoor: 'patio' }, { name: 'Twin', sideId: 'dv-17-facade-2', outdoor: 'juliet' }] });
    const draft = restoreStayDrafts(JSON.stringify(map))['dv-17'];
    assert.deepEqual(draft, { date: '2026-11-21', pool: null, garden: 'shared',
        rooms: [{ name: 'K'.repeat(40), sideId: 'dv-17-facade-0', outdoor: null }, { name: 'Twin', sideId: 'dv-17-facade-2', outdoor: 'juliet' }] });
    assert.equal(roomTypesFor(lancemore, draft, DATE), draft.rooms);
    // Mid-typing "King room": the space after "King" stays, and only shows trimmed.
    const typing = updateStayDraft({}, 'dv-17', { rooms: [{ name: 'King ', sideId: 'dv-17-facade-0', outdoor: null }, { name: ' ', sideId: 'dv-17-facade-2', outdoor: null }] })['dv-17'];
    assert.deepEqual(typing.rooms.map(room => room.name), ['King ', '']);
    assert.deepEqual(compareRoomTypes({ venue: lancemore, rooms: typing.rooms, date: DATE }).rows.map(row => row.name), ['King', 'Room type B']);
    const gone = { ...draft, rooms: [{ name: 'Old', sideId: 'removed-side', outdoor: null }, draft.rooms[1]] };
    assert.deepEqual(roomTypesFor(lancemore, gone, DATE), defaultRoomTypes(lancemore, DATE));
});

test('dates stay between today at the venue and a year ahead', () => {
    const range = stayDateRange(new Date(Date.UTC(2026, 9, 19, 1, 15)));
    assert.deepEqual(range, { today: '2026-10-19', max: '2027-10-19' });
    assert.equal(clampStayDate('2026-11-21', range), '2026-11-21');
    for (const bad of ['2026-10-18', '2027-10-20', 'Saturday', null]) assert.equal(clampStayDate(bad, range), '2026-10-19');
    assert.equal(stayDateLabel('2026-10-19'), 'Mon 19 Oct');
    assert.equal(sunWindowsText([]), '');
});

test('stay to-dos follow the first screen: rooms and the pool for hotels, the garden for a home', () => {
    const rooms = defaultRoomTypes(lancemore, DATE);
    assert.deepEqual(partnerStayTasks({ profile: partnerProfile(lancemore), venue: lancemore, date: DATE, rooms }).map(task => [task.key, task.title, task.done]),
        [['rooms', 'Name the two room types', false], ['pool', 'Tell us about a pool', false], ['guest', 'Check your guest card', false]]);
    const named = rooms.map((room, index) => ({ ...room, name: `Room ${index}` }));
    assert.deepEqual(partnerStayTasks({ profile: partnerProfile(lancemore), venue: lancemore, date: DATE, rooms: named })[0],
        { key: 'rooms', icon: 'hotel-views', target: 'rooms', done: false, title: 'Finish your room types', detail: 'Pick their side of the building and what they have' });
    const done = named.map(room => ({ ...room, outdoor: 'balcony' }));
    assert.deepEqual(partnerStayTasks({ profile: partnerProfile(lancemore), venue: lancemore, date: DATE, rooms: done, pool: 'none', guestChecked: true })
        .map(task => [task.title, task.done]), [['Room types compared', true], ['Pool answered', true], ['Guest card checked', true]]);
    assert.deepEqual(partnerStayTasks({ profile: partnerProfile(home), venue: home, date: DATE }).map(task => [task.key, task.title]),
        [['garden', 'Who can use the garden?'], ['guest', 'Check your guest card']]);
    assert.equal(partnerStayTasks({ profile: partnerProfile(home), venue: home, date: DATE, garden: 'private' })[0].title, 'Garden answered');
    // No modelled sides: no room types to place, so the list starts with the pool.
    const sideless = { ...lancemore, roomTypes: [] };
    assert.deepEqual(partnerStayTasks({ profile: partnerProfile(sideless), venue: sideless, date: DATE, rooms: defaultRoomTypes(sideless, DATE) })
        .map(task => task.key), ['pool', 'guest']);
});

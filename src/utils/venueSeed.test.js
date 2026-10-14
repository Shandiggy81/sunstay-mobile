import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlLiteral, venuePinUpdateSql, venueSeedRow, venueUpsertSql } from './venueSeed.js';

const venue = {
    id: 'dv-test-01', venueName: "Borsch, Vodka & Tears", address: "O'Connell St", suburb: 'Windsor',
    lat: -37.85, lng: 144.99, typeCategory: 'Hotel', tags: ['Hotel', "Chef's pick"],
    roomTypes: [{ id: 'r1', name: "Level 3 · it's sunny", obstructions: [] }], hasBalcony: true,
    timeZone: 'Australia/Melbourne', sunshineScore: 80,
};

test('text literals escape apostrophes and drop NUL bytes', () => {
    assert.equal(sqlLiteral("O'Connell", 'text'), "'O''Connell'");
    assert.equal(sqlLiteral("a\u0000b", 'text'), "'ab'");
    assert.equal(sqlLiteral("'; drop table venues; --", 'text'), "'''; drop table venues; --'");
});

test('jsonb literals are escaped JSON with a cast', () => {
    assert.equal(sqlLiteral(["it's"], 'jsonb'), `'["it''s"]'::jsonb`);
    assert.equal(sqlLiteral({ a: null }, 'jsonb'), `'{"a":null}'::jsonb`);
});

test('numbers, booleans and nulls', () => {
    assert.equal(sqlLiteral(-37.8136, 'float'), '-37.8136');
    assert.equal(sqlLiteral(true, 'bool'), 'true');
    assert.equal(sqlLiteral(null, 'text'), 'null');
    assert.throws(() => sqlLiteral('12', 'float'), TypeError);
    assert.throws(() => sqlLiteral(Number.NaN, 'float'), TypeError);
    assert.throws(() => sqlLiteral('yes', 'bool'), TypeError);
    assert.throws(() => sqlLiteral('x', 'uuid'), TypeError);
});

test('only known columns are written; app-only fields are skipped', () => {
    const { columns } = venueSeedRow(venue);
    assert.ok(columns.includes('roomTypes'));
    assert.ok(!columns.includes('timeZone'));
    assert.ok(!columns.includes('sunshineScore'));
});

test('rejects missing required fields and bad coordinates', () => {
    assert.throws(() => venueSeedRow({ ...venue, venueName: '' }), /venueName/);
    assert.throws(() => venueSeedRow({ ...venue, lat: undefined }), /lat/);
    assert.throws(() => venueSeedRow({ ...venue, lat: -137 }), RangeError);
});

test('pin update changes only lat/lng for one id', () => {
    assert.equal(venuePinUpdateSql({ id: "dv-o'x", lat: -37.8, lng: 144.9, venueName: 'ignored' }),
        "update public.venues set lat = -37.8, lng = 144.9, updated_at = now() where id = 'dv-o''x';");
    assert.throws(() => venuePinUpdateSql({ id: 'a', lat: 'x', lng: 144 }), RangeError);
    assert.throws(() => venuePinUpdateSql({ lat: -37, lng: 144 }), TypeError);
});

test('upsert SQL quotes camelCase columns and updates on conflict', () => {
    const sql = venueUpsertSql(venue);
    assert.match(sql, /^insert into public\.venues \("id", "venueName"/);
    assert.match(sql, /'Borsch, Vodka & Tears'/);
    assert.match(sql, /on conflict \(id\) do update set "venueName" = excluded\."venueName"/);
    assert.match(sql, /updated_at = now\(\);$/);
    assert.doesNotMatch(sql, /"id" = excluded/);
});

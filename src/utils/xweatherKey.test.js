import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseXweatherCredentials } from './xweatherKey.js';

describe('parseXweatherCredentials', () => {
    it('splits the joined ID_SECRET form at the first underscore', () => {
        assert.deepEqual(parseXweatherCredentials('abcDEF123_secretPart_with_more'), {
            id: 'abcDEF123',
            secret: 'secretPart_with_more',
        });
    });

    it('accepts ID:SECRET', () => {
        assert.deepEqual(parseXweatherCredentials(' myid:mysecret '), { id: 'myid', secret: 'mysecret' });
    });

    it('prefers separate id and secret values', () => {
        assert.deepEqual(parseXweatherCredentials('ignored_value', 'id1', 'sec1'), { id: 'id1', secret: 'sec1' });
    });

    it('returns null when there is no usable pair', () => {
        assert.equal(parseXweatherCredentials(''), null);
        assert.equal(parseXweatherCredentials('justonepart'), null);
        assert.equal(parseXweatherCredentials('_leading'), null);
        assert.equal(parseXweatherCredentials('trailing_'), null);
    });
});

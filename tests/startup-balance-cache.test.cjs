const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/startupBalanceCache.js'), 'utf8');
const cachePromise = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = 1791020000000;
function memoryStore() {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('balance hints are separated by UID and contain only display data', async () => {
    const cache = await cachePromise;
    const storage = memoryStore();
    assert.equal(cache.writeCachedBalance('PLAYER_A', 321, { storage, now }), true);
    assert.equal(cache.readCachedBalance('PLAYER_A', { storage, now }), 321);
    assert.equal(cache.readCachedBalance('PLAYER_B', { storage, now }), null);
    assert.deepEqual(Object.keys(JSON.parse(storage.getItem(cache.BALANCE_CACHE_PREFIX + 'PLAYER_A'))).sort(), ['points', 'savedAt', 'uid', 'version']);
    cache.clearCachedBalance('PLAYER_A', storage);
    assert.equal(cache.readCachedBalance('PLAYER_A', { storage, now }), null);
});

test('invalid, old, corrupt and mismatched cache values are discarded', async () => {
    const cache = await cachePromise;
    const valid = { version: 1, uid: 'PLAYER_A', points: 321, savedAt: now };
    for (const value of ['{', 'x'.repeat(513), JSON.stringify({ ...valid, uid: 'PLAYER_B' }),
        JSON.stringify({ ...valid, version: 0 }), JSON.stringify({ ...valid, savedAt: now - 86400001 }),
        JSON.stringify({ ...valid, savedAt: now + 1 }), JSON.stringify({ ...valid, points: -1 }),
        JSON.stringify({ ...valid, points: '321' }), JSON.stringify({ ...valid, points: 2147483648 })]) {
        const storage = memoryStore();
        const key = cache.BALANCE_CACHE_PREFIX + 'PLAYER_A';
        storage.setItem(key, value);
        assert.equal(cache.readCachedBalance('PLAYER_A', { storage, now }), null);
        assert.equal(storage.getItem(key), null);
    }
});

test('unavailable storage or malformed values do not interrupt startup', async () => {
    const cache = await cachePromise;
    const storage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('disabled'); } };
    assert.equal(cache.readCachedBalance('PLAYER_A', { storage, now }), null);
    assert.equal(cache.writeCachedBalance('PLAYER_A', 321, { storage, now }), false);
    assert.equal(cache.writeCachedBalance('PLAYER_A', NaN, { storage: memoryStore(), now }), false);
    assert.doesNotThrow(() => cache.clearCachedBalance('PLAYER_A', storage));
});

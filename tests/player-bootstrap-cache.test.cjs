const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/playerBootstrapCache.js'), 'utf8');
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = 1791020000000;
const profile = { Race: 'Human', Nation: 'fire', SkinColorIndex: '2', HairStyleIndex: '3', FacialHairStyleIndex: '0' };

function storageFixture() {
    const values = new Map();
    return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('only appearance hints survive; each confirmed UID has its own profile', async () => {
    const cache = await modulePromise;
    const storage = storageFixture();
    assert.equal(cache.writeCachedProfile('FAKE_A', { ...profile, PS: 999, token: 'fake-secret', isKing: true, NationChangedAt: 'yesterday' }, { storage, now }), true);
    const saved = JSON.parse(storage.getItem(cache.PROFILE_CACHE_PREFIX + 'FAKE_A'));
    assert.deepEqual(saved.playerData, { ...profile, Race: 'human' });
    assert.equal(cache.readCachedProfile('FAKE_B', { storage, now }), null);
    assert.equal(cache.readCachedProfile('FAKE_A', { storage, now }).savedAt, now);
    cache.writeCachedProfile('FAKE_B', { Race: 'elf', Nation: 'wind' }, { storage, now });
    cache.clearCachedProfile('FAKE_A', storage);
    assert.equal(cache.readCachedProfile('FAKE_A', { storage, now }), null);
    assert.equal(cache.readCachedProfile('FAKE_B', { storage, now }).playerData.Race, 'elf');
});

test('corrupt, obsolete, stale, future and wrong-user entries fall back and are removed', async () => {
    const cache = await modulePromise;
    const valid = { version: 1, uid: 'FAKE_A', savedAt: now, playerData: profile };
    const cases = [
        '{broken', 'null', JSON.stringify({ ...valid, version: 2 }),
        JSON.stringify({ ...valid, uid: 'FAKE_B' }),
        JSON.stringify({ ...valid, savedAt: now - cache.PROFILE_CACHE_MAX_AGE_MS - 1 }),
        JSON.stringify({ ...valid, savedAt: now + 1 }),
        JSON.stringify({ ...valid, savedAt: String(now) }),
        JSON.stringify({ ...valid, playerData: { ...profile, SkinColorIndex: 2 } }),
        JSON.stringify({ ...valid, playerData: { ...profile, HairStyleIndex: '<script>' } }),
        JSON.stringify({ ...valid, playerData: { ...profile, Nation: 'unknown' } }),
        JSON.stringify({ ...valid, playerData: { ...profile, Race: null } }),
        'x'.repeat(4097)
    ];
    for (const raw of cases) {
        const storage = storageFixture();
        const key = cache.PROFILE_CACHE_PREFIX + 'FAKE_A';
        storage.setItem(key, raw);
        assert.equal(cache.readCachedProfile('FAKE_A', { storage, now }), null);
        assert.equal(storage.getItem(key), null);
    }
});

test('unavailable storage and invalid profiles never block startup', async () => {
    const cache = await modulePromise;
    const storage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('disabled'); } };
    assert.equal(cache.readCachedProfile('FAKE_A', { storage, now }), null);
    assert.equal(cache.writeCachedProfile('FAKE_A', profile, { storage, now }), false);
    assert.doesNotThrow(() => cache.clearCachedProfile('FAKE_A', storage));
    assert.equal(cache.writeCachedProfile('FAKE_A', { Race: 'Human' }, { storage: storageFixture(), now }), false);
    assert.equal(cache.writeCachedProfile('', profile, { storage: storageFixture(), now }), false);
});

// This value is a display hint only; it is never a balance or authorization source.
export const BALANCE_CACHE_PREFIX = 'troy:home-display:v1:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function keyFor(uid) {
    return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid)
        ? BALANCE_CACHE_PREFIX + uid : null;
}

function storeOrNull(storage) {
    try { return storage === undefined ? globalThis.localStorage : storage; }
    catch { return null; }
}

export function clearCachedBalance(uid, storage) {
    try { const key = keyFor(uid); if (key) storeOrNull(storage)?.removeItem(key); }
    catch { /* Storage is optional. */ }
}

export function readCachedBalance(uid, { storage, now = Date.now() } = {}) {
    const key = keyFor(uid);
    if (!key) return null;
    try {
        const raw = storeOrNull(storage)?.getItem(key);
        if (!raw) return null;
        if (raw.length > 512) throw new Error('Invalid balance cache');
        const value = JSON.parse(raw);
        if (value?.version !== 1 || value.uid !== uid || !Number.isSafeInteger(value.savedAt)
            || value.savedAt <= 0 || value.savedAt > now || now - value.savedAt > MAX_AGE_MS
            || !Number.isSafeInteger(value.points) || value.points < 0 || value.points > 2147483647) {
            throw new Error('Invalid balance cache');
        }
        return value.points;
    } catch {
        clearCachedBalance(uid, storage);
        return null;
    }
}

export function writeCachedBalance(uid, points, { storage, now = Date.now() } = {}) {
    const key = keyFor(uid);
    if (!key || !Number.isSafeInteger(points) || points < 0 || points > 2147483647
        || !Number.isSafeInteger(now) || now <= 0) return false;
    try {
        const target = storeOrNull(storage);
        if (!target) return false;
        target.setItem(key, JSON.stringify({ version: 1, uid, savedAt: now, points }));
        return true;
    } catch { return false; }
}

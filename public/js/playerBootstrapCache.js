// Display hints only. Balances, permissions and authentication never belong here.
export const PROFILE_CACHE_VERSION = 1;
export const PROFILE_CACHE_PREFIX = 'troy:profile-bootstrap:v1:';
export const PROFILE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STYLE_KEYS = ['SkinColorIndex', 'FaceIndex', 'HairStyleIndex', 'HairColorIndex', 'FacialHairStyleIndex'];

function storageOrNull(storage) {
    try {
        return storage === undefined ? globalThis.localStorage : storage;
    } catch {
        return null;
    }
}

function cacheKey(uid) {
    return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid)
        ? PROFILE_CACHE_PREFIX + uid : null;
}

export function selectCachedProfile(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (typeof data.Race !== 'string' || !['human', 'elf', 'orc', 'goblin'].includes(data.Race.toLowerCase())) return null;
    if (typeof data.Nation !== 'string' || !['fire', 'water', 'earth', 'wind', 'neutral'].includes(data.Nation.toLowerCase())) return null;
    const profile = { Race: data.Race.toLowerCase(), Nation: data.Nation.toLowerCase() };
    for (const key of STYLE_KEYS) {
        if (data[key] === undefined || data[key] === null || data[key] === '') continue;
        if (typeof data[key] !== 'string' || !/^\d{1,3}$/.test(data[key])) return null;
        profile[key] = data[key];
    }
    return profile;
}

export function clearCachedProfile(uid, storage) {
    try {
        const key = cacheKey(uid);
        if (key) storageOrNull(storage)?.removeItem(key);
    } catch {
        // Storage may be disabled. Startup must still work without it.
    }
}

export function readCachedProfile(uid, { storage, now = Date.now() } = {}) {
    const key = cacheKey(uid);
    if (!key) return null;
    try {
        const raw = storageOrNull(storage)?.getItem(key);
        if (!raw) return null;
        if (raw.length > 4096) throw new Error('Invalid profile cache');
        const value = JSON.parse(raw);
        const profile = selectCachedProfile(value?.playerData);
        if (value?.version !== PROFILE_CACHE_VERSION || value.uid !== uid || !profile
            || !Number.isSafeInteger(value.savedAt) || value.savedAt <= 0
            || value.savedAt > now || now - value.savedAt > PROFILE_CACHE_MAX_AGE_MS) {
            throw new Error('Invalid profile cache');
        }
        return { playerData: profile, savedAt: value.savedAt };
    } catch {
        clearCachedProfile(uid, storage);
        return null;
    }
}

export function writeCachedProfile(uid, playerData, { storage, now = Date.now() } = {}) {
    const key = cacheKey(uid);
    const profile = selectCachedProfile(playerData);
    if (!key || !profile || !Number.isSafeInteger(now) || now <= 0) return false;
    try {
        const target = storageOrNull(storage);
        if (!target) return false;
        target.setItem(key, JSON.stringify({ version: PROFILE_CACHE_VERSION, uid, savedAt: now, playerData: profile }));
        return true;
    } catch {
        return false;
    }
}

// public/js/shipSkillClient.js
// クライアント側の船スキル状態管理
//
// Level-1 最適化:
//   - クールタイム → localStorage（Firestore R/W なし）
//   - スキルデータ → sessionStorage キャッシュ（再フェッチなし）
//   - 自己効果スキル → サーバー呼び出しなし

const LOCALSTORAGE_CT_KEY = 'shipSkillCt_v1';
const SESSION_SKILL_KEY   = 'shipSkillData_v1';

// ── スキルデータキャッシュ ────────────────────────────────
let _memCache = null;

export function getCachedSkillData() {
    if (_memCache) return _memCache;
    try {
        const raw = sessionStorage.getItem(SESSION_SKILL_KEY);
        if (raw) _memCache = JSON.parse(raw);
    } catch { /* ignore */ }
    return _memCache || null;
}

export function setCachedSkillData(data) {
    _memCache = data;
    try { sessionStorage.setItem(SESSION_SKILL_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function clearSkillCache() {
    _memCache = null;
    try { sessionStorage.removeItem(SESSION_SKILL_KEY); } catch { /* ignore */ }
}

// ── クールタイム管理（localStorage）────────────────────────
function loadCtMap() {
    try { return JSON.parse(localStorage.getItem(LOCALSTORAGE_CT_KEY) || '{}'); } catch { return {}; }
}

function saveCtMap(map) {
    try { localStorage.setItem(LOCALSTORAGE_CT_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function setSkillCooldown(ctKey, readyAtMs) {
    const map = loadCtMap();
    map[ctKey] = readyAtMs;
    saveCtMap(map);
}

export function isSkillReady(ctKey) {
    return (loadCtMap()[ctKey] || 0) <= Date.now();
}

export function getSkillRemainingSec(ctKey) {
    return Math.max(0, Math.ceil(((loadCtMap()[ctKey] || 0) - Date.now()) / 1000));
}

// スキルデータにキャッシュ済み CT を上書きしたリストを返す
export function mergeWithLocalCt(skills) {
    const map = loadCtMap();
    const now = Date.now();
    return skills.map((s) => {
        const readyAt = map[s.cardItemId] || 0;
        const remainingSec = Math.max(0, Math.ceil((readyAt - now) / 1000));
        return { ...s, remainingSec };
    });
}

// ── エフェクト分類 ────────────────────────────────────────
const SELF_ONLY_SUBTYPES = new Set([
    'invincible-escape', 'stealth', 'blink',
    'atk-up', 'def-up', 'berserker', 'focus', 'charge', 'last-stand', 'fortify',
    'overheal-shield', 'debuff-cleanse', 'regen', 'emergency-heal',
    'revive', 'cooldown-bypass', 'skill-copy', 'status-immunity',
    'atk-up-on-ready', 'resource-recovery', 'loot-bonus'
]);

export function isSelfOnlySkill(skillInfo) {
    const target = skillInfo?.effect?.target || skillInfo?.effectTarget;
    if (target === 'self' || target === 'caster') return true;
    return SELF_ONLY_SUBTYPES.has(skillInfo?.effect?.subtype || skillInfo?.effectSubtype);
}

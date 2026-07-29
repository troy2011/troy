const { randomUUID } = require('crypto');

const TAROT_KINGDOM_RAID_COLLECTION = 'tarot_kingdom_raids';
const TAROT_KINGDOM_RAID_GLOBAL_DOC_ID = 'global';
const TAROT_KINGDOM_RAID_DAILY_ATTEMPT_COLLECTION = 'tarot_kingdom_raid_daily_attempts';
const TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT = 4;
const TAROT_KINGDOM_RAID_MAX_REPORTED_DAMAGE = 1000000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const TAROT_KINGDOM_RAID_BOSSES = Object.freeze([
    Object.freeze({
        id: 'ismartal-vol2-monster-07',
        name: 'バルガン',
        preFormMonsterId: 'ismartal-vol3-monster-01',
        preFormMonsterName: 'グラヴァ',
        maxHp: 250000
    }),
    Object.freeze({
        id: 'ismartal-vol2-monster-15',
        name: 'アビソス',
        preFormMonsterId: 'ismartal-vol2-monster-20',
        preFormMonsterName: 'ネブラ',
        maxHp: 400000
    }),
    Object.freeze({
        id: 'ismartal-vol2-monster-16',
        name: 'オルビス',
        preFormMonsterId: 'ismartal-vol2-monster-17',
        preFormMonsterName: 'メカノ',
        maxHp: 600000
    })
]);

function getTarotKingdomRaidDayKey(nowMs = Date.now()) {
    const shifted = new Date(Math.max(0, Number(nowMs) || 0) + JST_OFFSET_MS);
    return [
        shifted.getUTCFullYear(),
        String(shifted.getUTCMonth() + 1).padStart(2, '0'),
        String(shifted.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function normalizeTarotKingdomRaidNation(value) {
    const nation = String(value || '').trim().toLowerCase();
    return ['fire', 'water', 'wind', 'earth'].includes(nation) ? nation : '';
}

function getTarotKingdomRaidBoss(bossId = '') {
    const normalized = String(bossId || '').trim();
    return TAROT_KINGDOM_RAID_BOSSES.find((boss) => boss.id === normalized) || null;
}

function normalizeTarotKingdomRaidState(value = null, nation = '') {
    const source = value && typeof value === 'object' ? value : {};
    const boss = getTarotKingdomRaidBoss(source.bossId);
    const maxHp = Math.max(1, Math.floor(Number(source.maxHp) || Number(boss?.maxHp) || 1));
    const currentHp = Math.max(0, Math.min(maxHp, Math.floor(Number(source.currentHp) || 0)));
    const active = source.active === true && !!boss && currentHp > 0;
    return {
        version: 1,
        raidId: String(source.raidId || ''),
        nation: normalizeTarotKingdomRaidNation(source.nation || nation),
        active,
        bossId: String(boss?.id || ''),
        bossName: String(boss?.name || ''),
        preFormMonsterId: String(boss?.preFormMonsterId || ''),
        preFormMonsterName: String(boss?.preFormMonsterName || ''),
        maxHp,
        currentHp,
        defeated: !!boss && currentHp <= 0,
        spawnedAtMs: Math.max(0, Math.floor(Number(source.spawnedAtMs) || 0)),
        defeatedAtMs: Math.max(0, Math.floor(Number(source.defeatedAtMs) || 0)),
        defeatedByPlayFabId: String(source.defeatedByPlayFabId || ''),
        defeatedByDisplayName: String(source.defeatedByDisplayName || '')
    };
}

function buildTarotKingdomRaidPublicState(value, options = {}) {
    const state = normalizeTarotKingdomRaidState(value, options.nation);
    const attemptsUsed = Math.max(
        0,
        Math.min(
            TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT,
            Math.floor(Number(options.attemptsUsed) || 0)
        )
    );
    return {
        ...state,
        attemptsUsed,
        attemptsRemaining: Math.max(0, TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT - attemptsUsed),
        dailyAttemptLimit: TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT,
        dayKey: String(options.dayKey || getTarotKingdomRaidDayKey())
    };
}

function createTarotKingdomRaidSpawnState({ nation, bossId, actorPlayFabId, nowMs = Date.now() } = {}) {
    const normalizedNation = normalizeTarotKingdomRaidNation(nation);
    const boss = getTarotKingdomRaidBoss(bossId);
    if (!normalizedNation || !boss) return null;
    const safeNow = Math.max(1, Math.floor(Number(nowMs) || Date.now()));
    return {
        version: 1,
        raidId: `raid-${normalizedNation}-${safeNow}-${randomUUID().slice(0, 8)}`,
        nation: normalizedNation,
        active: true,
        bossId: boss.id,
        bossName: boss.name,
        preFormMonsterId: boss.preFormMonsterId,
        preFormMonsterName: boss.preFormMonsterName,
        maxHp: boss.maxHp,
        currentHp: boss.maxHp,
        spawnedAtMs: safeNow,
        spawnedByPlayFabId: String(actorPlayFabId || ''),
        defeatedAtMs: 0,
        defeatedByPlayFabId: '',
        defeatedByDisplayName: ''
    };
}

function normalizeTarotKingdomRaidReportedDamage(value) {
    return Math.max(
        0,
        Math.min(TAROT_KINGDOM_RAID_MAX_REPORTED_DAMAGE, Math.floor(Number(value) || 0))
    );
}

function applyTarotKingdomRaidDamage(state, damage, finisher = {}, nowMs = Date.now()) {
    const current = normalizeTarotKingdomRaidState(state);
    const reportedDamage = normalizeTarotKingdomRaidReportedDamage(damage);
    if (!current.active || reportedDamage <= 0) {
        return {
            state: current,
            reportedDamage,
            appliedDamage: 0,
            defeatedNow: false
        };
    }
    const hpBefore = current.currentHp;
    const hpAfter = Math.max(0, hpBefore - reportedDamage);
    const appliedDamage = hpBefore - hpAfter;
    const defeatedNow = hpBefore > 0 && hpAfter <= 0;
    const next = {
        ...state,
        version: 1,
        nation: current.nation,
        active: !defeatedNow,
        bossId: current.bossId,
        bossName: current.bossName,
        preFormMonsterId: current.preFormMonsterId,
        preFormMonsterName: current.preFormMonsterName,
        maxHp: current.maxHp,
        currentHp: hpAfter,
        defeatedAtMs: defeatedNow ? Math.max(1, Math.floor(Number(nowMs) || Date.now())) : 0,
        defeatedByPlayFabId: defeatedNow ? String(finisher.playFabId || '') : '',
        defeatedByDisplayName: defeatedNow ? String(finisher.displayName || '') : ''
    };
    return {
        state: normalizeTarotKingdomRaidState(next),
        writeState: next,
        reportedDamage,
        appliedDamage,
        hpBefore,
        hpAfter,
        defeatedNow
    };
}

function createTarotKingdomRaidAttemptId() {
    return `raid-attempt-${randomUUID()}`;
}

function isTarotKingdomRaidPartyEligible(players = []) {
    return Array.isArray(players)
        && players.length === 4
        && players.every((player) => (
            player
            && typeof player === 'object'
            && (player.isNpc !== true || player.isPet === true)
        ));
}

module.exports = {
    TAROT_KINGDOM_RAID_BOSSES,
    TAROT_KINGDOM_RAID_COLLECTION,
    TAROT_KINGDOM_RAID_GLOBAL_DOC_ID,
    TAROT_KINGDOM_RAID_DAILY_ATTEMPT_COLLECTION,
    TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT,
    applyTarotKingdomRaidDamage,
    buildTarotKingdomRaidPublicState,
    createTarotKingdomRaidAttemptId,
    createTarotKingdomRaidSpawnState,
    getTarotKingdomRaidBoss,
    getTarotKingdomRaidDayKey,
    isTarotKingdomRaidPartyEligible,
    normalizeTarotKingdomRaidNation,
    normalizeTarotKingdomRaidReportedDamage,
    normalizeTarotKingdomRaidState
};

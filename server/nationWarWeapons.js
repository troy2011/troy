const NATION_MODEL_BY_NATION = Object.freeze({
    fire: 'america',
    earth: 'russia',
    water: 'china',
    wind: 'eu'
});

const NATION_MODEL_LABELS = Object.freeze({
    america: 'アメリカ',
    russia: 'ロシア',
    china: '中国',
    eu: '欧州連合'
});

const NATION_LABELS = Object.freeze({
    fire: '火の国',
    earth: '地の国',
    water: '水の国',
    wind: '風の国'
});

const CAPITAL_PART_LABELS = Object.freeze({
    airDefense: '防空',
    walls: '城壁',
    vault: '金庫',
    command: '指揮'
});

const DEFAULT_CAPITAL_STATUS = Object.freeze({
    airDefense: 100,
    walls: 100,
    vault: 100,
    command: 100
});

const CAPITAL_CAPTURE_BREACH_WALLS = 50;
const CAPITAL_CAPTURE_SLOT_LIMIT = 4;
const CAPITAL_CAPTURE_BASE_DURATION_MS = 180000;

const DEFAULT_CAPITAL_CAPTURE_STATE = Object.freeze({
    status: 'idle',
    breachedAt: 0,
    queue: [],
    slotLimit: CAPITAL_CAPTURE_SLOT_LIMIT,
    baseDurationMs: CAPITAL_CAPTURE_BASE_DURATION_MS,
    progressBaseMs: 0,
    lastProgressAt: 0,
    endsAt: 0,
    ownerCandidateId: null,
    ownerCandidateNation: null,
    raidUnlockedAtMs: 0,
    raidUnlockedByNation: null,
    raidCooldownUntilMs: 0,
    lastCapturedByNation: null,
    lastCapturedAtMs: 0,
    lastCaptureParticipantIds: [],
    intelByNation: {}
});

const WEAPON_DEFS = Object.freeze({
    decoy_missile: {
        id: 'decoy_missile',
        label: 'Decoy Missile',
        nationModel: 'shared',
        role: 'decoy',
        actionType: 'strike',
        costPs: 4000,
        prepSeconds: 120,
        cooldownSeconds: 300,
        hit: 15,
        detectDifficulty: 35,
        identifyDifficulty: 80,
        decoyValue: 90,
        payload: [],
        description: '迎撃を誘う囮。被害は小さいが、判断を狂わせる。'
    },
    patriot: {
        id: 'patriot',
        label: 'Patriot',
        nationModel: 'america',
        role: 'intercept',
        actionType: 'deploy',
        costPs: 12000,
        durationSeconds: 1800,
        cooldownSeconds: 1200,
        ammo: 2,
        detect: 80,
        identify: 85,
        intercept: 80,
        effects: {
            defense: { detect: 8, identify: 10, enemyHitPenalty: 4 }
        },
        description: '高性能迎撃。高脅威目標への切り札。'
    },
    aegis: {
        id: 'aegis',
        label: 'Aegis',
        nationModel: 'america',
        role: 'support',
        actionType: 'deploy',
        costPs: 15000,
        durationSeconds: 1200,
        cooldownSeconds: 1500,
        effects: {
            defense: { detect: 8, identify: 8, interceptSupport: 6, enemyHitPenalty: 6 }
        },
        description: '海域防衛と迎撃支援を同時に担う。'
    },
    himars: {
        id: 'himars',
        label: 'HIMARS',
        nationModel: 'america',
        role: 'attack',
        actionType: 'strike',
        costPs: 14000,
        prepSeconds: 300,
        cooldownSeconds: 1200,
        hit: 70,
        detectDifficulty: 45,
        identifyDifficulty: 45,
        decoyValue: 15,
        payload: [
            { part: 'walls', damage: 18 },
            { part: 'airDefense', damage: 8 }
        ],
        description: '短時間で打ち込む精密打撃。城壁に圧力。'
    },
    tomahawk: {
        id: 'tomahawk',
        label: 'Tomahawk',
        nationModel: 'america',
        role: 'attack',
        actionType: 'strike',
        costPs: 18000,
        prepSeconds: 480,
        cooldownSeconds: 1800,
        hit: 85,
        detectDifficulty: 55,
        identifyDifficulty: 40,
        decoyValue: 10,
        payload: [
            { part: 'command', damage: 20 },
            { part: 'walls', damage: 10 }
        ],
        description: '高精度の長距離打撃。指揮系統を狙いやすい。'
    },
    s400: {
        id: 's400',
        label: 'S-400',
        nationModel: 'russia',
        role: 'intercept',
        actionType: 'deploy',
        costPs: 13000,
        durationSeconds: 1800,
        cooldownSeconds: 1200,
        ammo: 2,
        detect: 82,
        identify: 78,
        intercept: 76,
        effects: {
            defense: { detect: 10, identify: 8, enemyHitPenalty: 5 }
        },
        description: '重防空。大物狙いの迎撃に強い。'
    },
    t90: {
        id: 't90',
        label: 'T-90',
        nationModel: 'russia',
        role: 'support',
        actionType: 'deploy',
        costPs: 11000,
        durationSeconds: 1200,
        cooldownSeconds: 1200,
        effects: {
            attack: {
                hit: 4,
                damageByPart: { walls: 4, vault: 2 }
            }
        },
        description: '重装甲で侵攻部隊を前進させる。'
    },
    iskander: {
        id: 'iskander',
        label: 'Iskander',
        nationModel: 'russia',
        role: 'attack',
        actionType: 'strike',
        costPs: 16000,
        prepSeconds: 360,
        cooldownSeconds: 1500,
        hit: 78,
        detectDifficulty: 58,
        identifyDifficulty: 52,
        decoyValue: 8,
        payload: [
            { part: 'walls', damage: 20 },
            { part: 'vault', damage: 6 }
        ],
        description: '重い一撃で防衛線を崩す。'
    },
    smerch: {
        id: 'smerch',
        label: 'BM-30 Smerch',
        nationModel: 'russia',
        role: 'attack',
        actionType: 'strike',
        costPs: 13500,
        prepSeconds: 240,
        cooldownSeconds: 1080,
        hit: 62,
        detectDifficulty: 35,
        identifyDifficulty: 35,
        decoyValue: 20,
        payload: [
            { part: 'walls', damage: 12 },
            { part: 'airDefense', damage: 12 }
        ],
        description: '面制圧で防衛線を削る飽和砲撃。'
    },
    hq9: {
        id: 'hq9',
        label: 'HQ-9',
        nationModel: 'china',
        role: 'intercept',
        actionType: 'deploy',
        costPs: 12000,
        durationSeconds: 1800,
        cooldownSeconds: 1080,
        ammo: 3,
        detect: 76,
        identify: 72,
        intercept: 70,
        effects: {
            defense: { detect: 7, identify: 7, enemyHitPenalty: 4 }
        },
        description: '安定した広域防空。弾数に余裕。'
    },
    type055: {
        id: 'type055',
        label: 'Type 055',
        nationModel: 'china',
        role: 'support',
        actionType: 'deploy',
        costPs: 17000,
        durationSeconds: 1200,
        cooldownSeconds: 1500,
        effects: {
            attack: { hit: 8 },
            defense: { detect: 4, identify: 4 }
        },
        description: '海上制圧で次の打撃を通しやすくする。'
    },
    df21d: {
        id: 'df21d',
        label: 'DF-21D',
        nationModel: 'china',
        role: 'attack',
        actionType: 'strike',
        costPs: 18000,
        prepSeconds: 420,
        cooldownSeconds: 1800,
        hit: 74,
        detectDifficulty: 63,
        identifyDifficulty: 58,
        decoyValue: 12,
        payload: [
            { part: 'airDefense', damage: 10 },
            { part: 'vault', damage: 12 }
        ],
        description: '沿岸と金庫防衛を揺さぶる対拠点打撃。'
    },
    wing_loong: {
        id: 'wing_loong',
        label: 'Wing Loong',
        nationModel: 'china',
        role: 'recon',
        actionType: 'deploy',
        costPs: 9000,
        durationSeconds: 900,
        cooldownSeconds: 1200,
        effects: {
            recon: { detect: 20, identify: 30 }
        },
        description: '敵飛来物の正体と脅威を暴く。'
    },
    nasams: {
        id: 'nasams',
        label: 'NASAMS',
        nationModel: 'eu',
        role: 'intercept',
        actionType: 'deploy',
        costPs: 10000,
        durationSeconds: 1800,
        cooldownSeconds: 900,
        ammo: 4,
        detect: 65,
        identify: 65,
        intercept: 60,
        effects: {
            defense: { detect: 5, identify: 5, enemyHitPenalty: 3 }
        },
        description: '扱いやすい汎用迎撃。無駄撃ちしにくい。'
    },
    iris_t_slm: {
        id: 'iris_t_slm',
        label: 'IRIS-T SLM',
        nationModel: 'eu',
        role: 'intercept',
        actionType: 'deploy',
        costPs: 12500,
        durationSeconds: 1800,
        cooldownSeconds: 1080,
        ammo: 3,
        detect: 74,
        identify: 77,
        intercept: 73,
        effects: {
            defense: { detect: 7, identify: 10, enemyHitPenalty: 4 }
        },
        description: '識別精度が高い精密迎撃。'
    },
    caesar: {
        id: 'caesar',
        label: 'CAESAR',
        nationModel: 'eu',
        role: 'attack',
        actionType: 'strike',
        costPs: 13000,
        prepSeconds: 240,
        cooldownSeconds: 1080,
        hit: 68,
        detectDifficulty: 42,
        identifyDifficulty: 40,
        decoyValue: 18,
        payload: [
            { part: 'walls', damage: 14 },
            { part: 'command', damage: 8 }
        ],
        description: '軽快な砲撃で城壁と指揮に継続圧力。'
    },
    leopard2: {
        id: 'leopard2',
        label: 'Leopard 2',
        nationModel: 'eu',
        role: 'support',
        actionType: 'deploy',
        costPs: 12000,
        durationSeconds: 1200,
        cooldownSeconds: 1200,
        effects: {
            attack: {
                hit: 6,
                damageByPart: { walls: 2, command: 2 }
            }
        },
        description: '精密な突撃で侵攻を安定化する。'
    }
});

function getNationLabel(nation) {
    return NATION_LABELS[String(nation || '').toLowerCase()] || String(nation || '').trim() || '無所属';
}

function getNationModelByNation(nation) {
    return NATION_MODEL_BY_NATION[String(nation || '').toLowerCase()] || null;
}

function getNationModelLabel(nationModel) {
    return NATION_MODEL_LABELS[String(nationModel || '').toLowerCase()] || String(nationModel || '').trim() || '未設定';
}

function getNationWarWeaponDefinition(weaponId) {
    return WEAPON_DEFS[String(weaponId || '').trim().toLowerCase()] || null;
}

function canNationUseWeapon(nation, weaponId) {
    const weapon = getNationWarWeaponDefinition(weaponId);
    if (!weapon) return false;
    if (weapon.nationModel === 'shared') return true;
    return getNationModelByNation(nation) === weapon.nationModel;
}

function listNationWarWeapons(nation, actionType = '') {
    return Object.values(WEAPON_DEFS)
        .filter((weapon) => canNationUseWeapon(nation, weapon.id))
        .filter((weapon) => !actionType || weapon.actionType === actionType)
        .sort((a, b) => {
            if (a.actionType !== b.actionType) return String(a.actionType).localeCompare(String(b.actionType));
            if (a.costPs !== b.costPs) return a.costPs - b.costPs;
            return String(a.label).localeCompare(String(b.label));
        });
}

function createDefaultNationWarState(nation, nowMs = Date.now()) {
    return {
        nation: String(nation || '').toLowerCase(),
        capitalStatus: { ...DEFAULT_CAPITAL_STATUS },
        capitalCaptureState: { ...DEFAULT_CAPITAL_CAPTURE_STATE, intelByNation: {} },
        activeSystems: [],
        incoming: [],
        cooldowns: {},
        updatedAtMs: Math.max(0, Math.floor(Number(nowMs) || Date.now()))
    };
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.floor(Number(value) || 0)));
}

function normalizeCapitalStatus(raw = {}) {
    return {
        airDefense: clampPercent(raw.airDefense ?? DEFAULT_CAPITAL_STATUS.airDefense),
        walls: clampPercent(raw.walls ?? DEFAULT_CAPITAL_STATUS.walls),
        vault: clampPercent(raw.vault ?? DEFAULT_CAPITAL_STATUS.vault),
        command: clampPercent(raw.command ?? DEFAULT_CAPITAL_STATUS.command)
    };
}

function normalizeActiveSystem(system = {}) {
    const weapon = getNationWarWeaponDefinition(system.weaponId);
    const defaultAmmo = Math.max(0, Number(weapon?.ammo) || 0);
    return {
        id: String(system.id || '').trim(),
        weaponId: String(system.weaponId || '').trim().toLowerCase(),
        deployedAtMs: Math.max(0, Math.floor(Number(system.deployedAtMs) || 0)),
        expiresAtMs: Math.max(0, Math.floor(Number(system.expiresAtMs) || 0)),
        ammoRemaining: Math.max(0, Math.floor(Number(system.ammoRemaining ?? defaultAmmo) || 0))
    };
}

function normalizeIncomingStrike(entry = {}) {
    return {
        id: String(entry.id || '').trim(),
        attackerNation: String(entry.attackerNation || '').trim().toLowerCase(),
        defenderNation: String(entry.defenderNation || '').trim().toLowerCase(),
        weaponId: String(entry.weaponId || '').trim().toLowerCase(),
        targetPart: String(entry.targetPart || '').trim(),
        createdAtMs: Math.max(0, Math.floor(Number(entry.createdAtMs) || 0)),
        launchAtMs: Math.max(0, Math.floor(Number(entry.launchAtMs) || 0)),
        decision: ['pending', 'intercept', 'skip'].includes(String(entry.decision || '').toLowerCase())
            ? String(entry.decision || '').toLowerCase()
            : 'pending',
        interceptSystemId: String(entry.interceptSystemId || '').trim(),
        attackBonus: {
            hit: Math.floor(Number(entry.attackBonus?.hit) || 0),
            damage: Math.floor(Number(entry.attackBonus?.damage) || 0),
            damageByPart: Object.entries(entry.attackBonus?.damageByPart || {}).reduce((acc, [part, value]) => {
                acc[String(part || '').trim()] = Math.floor(Number(value) || 0);
                return acc;
            }, {})
        },
        targetKnown: !!entry.targetKnown
    };
}

function normalizeCapitalCaptureQueueEntry(entry = {}) {
    return {
        playFabId: String(entry.playFabId || '').trim(),
        nation: String(entry.nation || '').trim().toLowerCase(),
        shipId: String(entry.shipId || '').trim(),
        joinedAt: Math.max(0, Math.floor(Number(entry.joinedAt) || 0))
    };
}

function normalizeCapitalCaptureState(raw = {}, capitalStatus = {}, nowMs = Date.now()) {
    const breached = clampPercent(capitalStatus?.walls) <= CAPITAL_CAPTURE_BREACH_WALLS;
    const queue = Array.isArray(raw.queue)
        ? raw.queue.map((row) => normalizeCapitalCaptureQueueEntry(row)).filter((row) => row.playFabId)
        : [];
    const intelByNation = Object.entries(raw.intelByNation || {}).reduce((acc, [nation, value]) => {
        const key = String(nation || '').trim().toLowerCase();
        if (key) acc[key] = Math.max(0, Math.floor(Number(value) || 0));
        return acc;
    }, {});
    const raidUnlockedAtMs = Math.max(0, Math.floor(Number(raw.raidUnlockedAtMs) || 0));
    const baseDurationMs = Math.max(30000, Math.floor(Number(raw.baseDurationMs) || CAPITAL_CAPTURE_BASE_DURATION_MS));
    const state = {
        status: String(raw.status || DEFAULT_CAPITAL_CAPTURE_STATE.status).trim().toLowerCase() || 'idle',
        breachedAt: Math.max(0, Math.floor(Number(raw.breachedAt) || (breached ? nowMs : 0))),
        queue,
        slotLimit: CAPITAL_CAPTURE_SLOT_LIMIT,
        baseDurationMs,
        progressBaseMs: Math.max(0, Math.min(baseDurationMs, Math.floor(Number(raw.progressBaseMs) || 0))),
        lastProgressAt: Math.max(0, Math.floor(Number(raw.lastProgressAt) || 0)),
        endsAt: Math.max(0, Math.floor(Number(raw.endsAt) || 0)),
        ownerCandidateId: raw.ownerCandidateId ? String(raw.ownerCandidateId).trim() : (queue[0]?.playFabId || null),
        ownerCandidateNation: raw.ownerCandidateNation
            ? String(raw.ownerCandidateNation).trim().toLowerCase()
            : (queue[0]?.nation || null),
        raidUnlockedAtMs,
        raidUnlockedByNation: raw.raidUnlockedByNation ? String(raw.raidUnlockedByNation).trim().toLowerCase() : null,
        intelByNation
    };
    if (raidUnlockedAtMs > 0) {
        state.status = 'captured';
    } else if (queue.length > 0) {
        state.status = 'capturing';
    } else if (breached) {
        state.status = 'breached';
    } else {
        state.status = 'idle';
        state.breachedAt = 0;
        state.progressBaseMs = 0;
        state.lastProgressAt = 0;
        state.endsAt = 0;
        state.ownerCandidateId = null;
        state.ownerCandidateNation = null;
    }
    state.raidCooldownUntilMs = Math.max(0, Math.floor(Number(raw.raidCooldownUntilMs) || 0));
    state.lastCapturedByNation = String(raw.lastCapturedByNation || '').trim().toLowerCase() || null;
    state.lastCapturedAtMs = Math.max(0, Math.floor(Number(raw.lastCapturedAtMs) || 0));
    state.lastCaptureParticipantIds = Array.isArray(raw.lastCaptureParticipantIds)
        ? raw.lastCaptureParticipantIds.map((row) => String(row || '').trim()).filter(Boolean).slice(0, 8)
        : [];
    return state;
}

function normalizeNationWarState(raw, nation, nowMs = Date.now()) {
    const base = createDefaultNationWarState(nation, nowMs);
    const source = raw && typeof raw === 'object' ? raw : {};
    const nextNation = String(source.nation || base.nation || nation || '').toLowerCase();
    const capitalStatus = normalizeCapitalStatus(source.capitalStatus);
    return {
        nation: nextNation,
        capitalStatus,
        capitalCaptureState: normalizeCapitalCaptureState(source.capitalCaptureState, capitalStatus, nowMs),
        activeSystems: Array.isArray(source.activeSystems) ? source.activeSystems.map((row) => normalizeActiveSystem(row)).filter((row) => row.id && row.weaponId) : [],
        incoming: Array.isArray(source.incoming) ? source.incoming.map((row) => normalizeIncomingStrike(row)).filter((row) => row.id && row.weaponId && row.attackerNation && row.defenderNation) : [],
        cooldowns: Object.entries(source.cooldowns || {}).reduce((acc, [key, value]) => {
            const weaponId = String(key || '').trim().toLowerCase();
            if (weaponId) acc[weaponId] = Math.max(0, Math.floor(Number(value) || 0));
            return acc;
        }, {}),
        updatedAtMs: Math.max(0, Math.floor(Number(source.updatedAtMs) || nowMs))
    };
}

module.exports = {
    CAPITAL_CAPTURE_BASE_DURATION_MS,
    CAPITAL_CAPTURE_BREACH_WALLS,
    CAPITAL_CAPTURE_SLOT_LIMIT,
    CAPITAL_PART_LABELS,
    DEFAULT_CAPITAL_CAPTURE_STATE,
    DEFAULT_CAPITAL_STATUS,
    WEAPON_DEFS,
    createDefaultNationWarState,
    normalizeNationWarState,
    normalizeCapitalCaptureState,
    getNationWarWeaponDefinition,
    listNationWarWeapons,
    canNationUseWeapon,
    getNationModelByNation,
    getNationModelLabel,
    getNationLabel
};

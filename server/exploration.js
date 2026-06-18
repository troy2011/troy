const resourceStorage = require('./resourceStorage');
const { drawLocalGachaItem } = require('./gacha');
const battleRoutes = require('./routes/battleRoutes');
const { resolveGuildShipContext } = require('./guildShipSharing');

const EXPLORATION_COLLECTION = 'player_explorations';
const DAILY_FREE_SUBCOLLECTION = 'daily_free';
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// 通貨未減算の早期 pending スタブをこの時間で回収する
const PENDING_STALE_MS = 5 * 60 * 1000;
// claiming 中にプロセスが落ちた場合、この時間後に再実行を許可する
const CLAIMING_STALE_MS = 2 * 60 * 1000;
const EXPLORATION_SHIP_CLASSES = ['common', 'explorer', 'merchant', 'fighter', 'defender'];
const EXPLORATION_SHIP_CLASS_LABELS = {
    common: '初期ボート',
    explorer: '探索船',
    merchant: '商船',
    fighter: '戦闘船',
    defender: '守備船'
};
const EXPLORATION_SHIP_ACCESS_CLASSES = {
    common: ['common'],
    explorer: ['common', 'explorer'],
    merchant: ['common', 'explorer', 'merchant'],
    fighter: ['common', 'explorer', 'fighter'],
    defender: ['common', 'explorer', 'defender']
};
const EXPLORATION_SHIP_ROLES = {
    common: {
        role: 'entry',
        roleLabel: '入門航路',
        riskLabel: '低リスク',
        rewardHint: '基本報酬',
        bossWeightHint: '弱BOSS中心',
        categoryWeights: { Weapon: 20, Armor: 25, Shield: 20, Consumable: 35 }
    },
    explorer: {
        role: 'scout',
        roleLabel: '偵察',
        riskLabel: '中リスク',
        rewardHint: '幅広い海域を探索',
        bossWeightHint: '標準BOSS',
        categoryWeights: { Weapon: 25, Armor: 25, Shield: 20, Consumable: 30 },
        bossWeightAdjustments: { weak: -5, medium: 5, strong: 0 }
    },
    fighter: {
        role: 'assault',
        roleLabel: '強襲',
        riskLabel: '高リスク',
        rewardHint: '勝利時お宝+1',
        bossWeightHint: '強BOSS寄り',
        categoryWeights: { Weapon: 58, Armor: 12, Shield: 15, Consumable: 15 },
        bossWeightAdjustments: { weak: -20, medium: 5, strong: 15 },
        victoryRewardBonus: 1
    },
    defender: {
        role: 'guard',
        roleLabel: '護衛',
        riskLabel: '安定',
        rewardHint: '敗北時も最低1個',
        bossWeightHint: '強敵に耐える',
        categoryWeights: { Weapon: 15, Armor: 40, Shield: 35, Consumable: 10 },
        bossWeightAdjustments: { weak: -10, medium: 5, strong: 5 },
        defeatRewardFloor: 1
    },
    merchant: {
        role: 'haul',
        roleLabel: '回収',
        riskLabel: '中リスク',
        rewardHint: 'お宝+1',
        bossWeightHint: '回収優先',
        categoryWeights: { Weapon: 18, Armor: 22, Shield: 15, Consumable: 45 },
        bossWeightAdjustments: { weak: 5, medium: 5, strong: -10 },
        rewardBonus: 1
    }
};

const DESTINATIONS = {
    near_sea: {
        id: 'near_sea',
        name: '近海の漂流箱',
        description: '初期ボートでも向かえる短距離探索。',
        cost: 100,
        durationMs: 3 * HOUR_MS,
        bosses: ['treasure_slime', 'puffer_bomb', 'mimic_chest'],
        classes: ['common', 'explorer'],
        dailyFreeEligible: true,
        riskLabel: '低リスク',
        rewardHint: '基本報酬'
    },
    coral_passage: {
        id: 'coral_passage',
        name: '珊瑚礁の抜け道',
        description: '浅瀬を抜ける明るい航路。小型の魔物が多い。',
        cost: 180,
        durationMs: 4 * HOUR_MS,
        bosses: ['skeletal_parrot', 'coral_goblin', 'crab_brute'],
        classes: ['explorer', 'merchant'],
        riskLabel: '中リスク',
        rewardHint: '素材と消耗品'
    },
    old_lighthouse: {
        id: 'old_lighthouse',
        name: '古代灯台跡',
        description: '探索船が見つけやすい古い航路。',
        cost: 250,
        durationMs: 5 * HOUR_MS,
        bosses: ['lantern_wraith', 'ghost_pirate', 'cursed_shipwheel'],
        classes: ['explorer', 'fighter'],
        riskLabel: '中リスク',
        rewardHint: '武器と防具'
    },
    sunken_trader: {
        id: 'sunken_trader',
        name: '沈没商船',
        description: '積荷の多い商船向けの探索先。',
        cost: 300,
        durationMs: 6 * HOUR_MS,
        bosses: ['zombie_raider', 'drowned_buccaneer', 'anchor_golem'],
        classes: ['merchant'],
        riskLabel: '回収向け',
        rewardHint: '商船お宝多め'
    },
    pirate_cove: {
        id: 'pirate_cove',
        name: '海賊の隠れ家',
        description: '戦闘向きの船で挑む危険な海域。',
        cost: 400,
        durationMs: 8 * HOUR_MS,
        bosses: ['skeleton_captain', 'shark_raider', 'cannon_mimic'],
        classes: ['fighter'],
        riskLabel: '高リスク',
        rewardHint: '武器報酬狙い'
    },
    deep_maelstrom: {
        id: 'deep_maelstrom',
        name: '深海の渦',
        description: '渦潮の奥へ踏み込む高難度の探索先。',
        cost: 550,
        durationMs: 10 * HOUR_MS,
        bosses: ['blue_kraken', 'merfolk_lancer', 'kraken_pirate'],
        classes: ['defender'],
        riskLabel: '高耐久向け',
        rewardHint: '防具と盾'
    }
};

function normalizeShipClassFromItemId(itemId) {
    const key = String(itemId || '').trim().toLowerCase();
    if (!key) return 'common';
    if (key === 'ship_common_boat' || key.includes('common')) return 'common';
    if (key.includes('merchant')) return 'merchant';
    if (key.includes('fighter')) return 'fighter';
    if (key.includes('defender')) return 'defender';
    if (key.includes('explorer')) return 'explorer';
    return 'common';
}

function normalizeDestinationId(value) {
    const id = String(value || '').trim().toLowerCase();
    return DESTINATIONS[id] ? id : '';
}

function getBossTierDef(tier) {
    return BOSS_TIER_DEFS[String(tier || '').trim().toLowerCase()] || BOSS_TIER_DEFS.weak;
}

function getExplorationBoss(bossId) {
    const id = String(bossId || '').trim();
    return EXPLORATION_BOSSES[id] || null;
}

function getDestinationBosses(destination) {
    const ids = Array.isArray(destination?.bosses) ? destination.bosses : [];
    const bosses = ids.map(getExplorationBoss).filter(Boolean);
    return bosses.length ? bosses : [EXPLORATION_BOSSES.treasure_slime].filter(Boolean);
}

function publicBoss(boss) {
    const tierDef = getBossTierDef(boss?.tier);
    return {
        id: String(boss?.id || ''),
        name: String(boss?.name || ''),
        spriteId: String(boss?.spriteId || boss?.id || ''),
        tier: String(boss?.tier || 'weak'),
        tierLabel: tierDef.label
    };
}

function normalizeExplorationShipClass(shipClass) {
    const key = String(shipClass || '').trim().toLowerCase();
    return EXPLORATION_SHIP_CLASSES.includes(key) ? key : 'common';
}

function getExplorationShipRole(shipClass) {
    return EXPLORATION_SHIP_ROLES[normalizeExplorationShipClass(shipClass)] || EXPLORATION_SHIP_ROLES.common;
}

function getExplorationShipAccessClasses(shipClass) {
    return EXPLORATION_SHIP_ACCESS_CLASSES[normalizeExplorationShipClass(shipClass)] || EXPLORATION_SHIP_ACCESS_CLASSES.common;
}

function canShipClassExploreDestination(shipClass, destination) {
    const accessClasses = new Set(getExplorationShipAccessClasses(shipClass));
    const destinationClasses = Array.isArray(destination?.classes) ? destination.classes : [];
    return destinationClasses.some((entry) => accessClasses.has(normalizeExplorationShipClass(entry)));
}

function getExplorationShipClassLabel(shipClass) {
    return EXPLORATION_SHIP_CLASS_LABELS[normalizeExplorationShipClass(shipClass)] || EXPLORATION_SHIP_CLASS_LABELS.common;
}

function getDestinationRequirementLabels(destination) {
    const classes = Array.isArray(destination?.classes) ? destination.classes : [];
    return classes
        .map((shipClass) => getExplorationShipClassLabel(shipClass))
        .filter(Boolean);
}

function isDailyFreeExplorationDestination(destinationOrId) {
    const destination = typeof destinationOrId === 'string'
        ? DESTINATIONS[normalizeDestinationId(destinationOrId)]
        : destinationOrId;
    return destination?.dailyFreeEligible === true;
}

function publicDestination(destination, shipClass = 'common') {
    const bosses = getDestinationBosses(destination);
    const role = getExplorationShipRole(shipClass);
    const normalizedShipClass = normalizeExplorationShipClass(shipClass);
    const requirementLabels = getDestinationRequirementLabels(destination);
    return {
        id: destination.id,
        name: destination.name,
        description: destination.description,
        cost: destination.cost,
        durationMs: destination.durationMs,
        available: canShipClassExploreDestination(normalizedShipClass, destination),
        requirementLabels,
        requirementLabel: requirementLabels.join(' / '),
        dailyFreeEligible: isDailyFreeExplorationDestination(destination),
        role: role.role,
        roleLabel: role.roleLabel,
        riskLabel: destination.riskLabel || role.riskLabel,
        rewardHint: destination.rewardHint || role.rewardHint,
        bossWeightHint: role.bossWeightHint,
        bossName: bosses.map((boss) => boss.name).join(' / '),
        bosses: bosses.map(publicBoss)
    };
}

function normalizeCatalogDisplayData(itemId, item = {}) {
    const display = item.DisplayName || item.displayName || item.Title || item.title || item.Name || item.name || itemId;
    return {
        ItemId: itemId,
        DisplayName: String(display || itemId)
    };
}

// pending + completesAtMs = 通貨減算済みだが active flip 失敗。active として扱い claim から自動復旧させる
function resolveEffectiveStatus(data) {
    const status = String(data?.status || '');
    if (status === 'pending' && data?.completesAtMs) return 'active';
    return status;
}

function explorationDocToPayload(data = {}) {
    if (!data) return null;
    const effectiveStatus = resolveEffectiveStatus(data);
    if (effectiveStatus !== 'active') return null;
    return {
        id: String(data.id || ''),
        status: 'active',
        destinationId: String(data.destinationId || ''),
        destinationName: String(data.destinationName || ''),
        shipId: String(data.shipId || ''),
        shipName: String(data.shipName || ''),
        shipClass: String(data.shipClass || ''),
        shipStage: Number(data.shipStage || data.stage || 1) || 1,
        startedAtMs: Number(data.startedAtMs || 0),
        completesAtMs: Number(data.completesAtMs || 0),
        cost: Number(data.cost || 0)
    };
}

function timestampToMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getJstDayKey(nowMs = Date.now()) {
    const jst = new Date(Number(nowMs || Date.now()) + JST_OFFSET_MS);
    const year = jst.getUTCFullYear();
    const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jst.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildDailyFreeExplorationStatus(dayKey, snap) {
    const data = snap?.exists ? (snap.data() || {}) : null;
    return {
        dayKey,
        available: !data,
        used: !!data,
        usedAtMs: timestampToMs(data?.usedAt) || Number(data?.usedAtMs || 0) || 0,
        explorationId: String(data?.explorationId || '')
    };
}

function reportDocToPayload(doc) {
    const data = doc.data ? (doc.data() || {}) : (doc || {});
    const rewardItems = Array.isArray(data.rewardItems) ? data.rewardItems.map((item) => ({
        itemId: String(item.itemId || item.ItemId || ''),
        displayName: String(item.displayName || item.DisplayName || item.itemId || item.ItemId || ''),
        rarity: String(item.rarity || 'common'),
        category: String(item.category || '')
    })) : [];
    return {
        id: doc.id || String(data.id || ''),
        destinationId: String(data.destinationId || ''),
        destinationName: String(data.destinationName || ''),
        shipName: String(data.shipName || ''),
        bossId: String(data.bossId || ''),
        bossName: String(data.bossName || ''),
        bossSpriteId: String(data.bossSpriteId || ''),
        bossTier: String(data.bossTier || ''),
        bossTierLabel: String(data.bossTierLabel || ''),
        bossAppeared: !!data.bossAppeared,
        bossResult: String(data.bossResult || ''),
        bossLog: String(data.bossLog || ''),
        rewardItemId: String(data.rewardItemId || ''),
        rewardItemName: String(data.rewardItemName || data.rewardItemId || ''),
        rewardCount: Number(data.rewardCount ?? 1),
        rewardItems,
        completedAtMs: Number(data.completedAtMs || 0),
        reportText: String(data.reportText || '')
    };
}

async function resolveActiveShip(playFabId, deps) {
    const shipContext = await resolveGuildShipContext(playFabId, deps);
    const shipOwnerPlayFabId = shipContext.shipOwnerPlayFabId || playFabId;
    const profile = await resourceStorage.getPlayerShipProfile(shipOwnerPlayFabId, deps);
    if (!profile) return null;
    const resolvedProfile = shipContext.isGuildShip
        ? await resolveGuildShipProfile(shipContext, profile, deps)
        : profile;
    const itemId = String(resolvedProfile.itemId || profile.itemId || '').trim();
    return {
        shipId: resolvedProfile.shipId || shipOwnerPlayFabId,
        shipName: String(resolvedProfile.name || itemId || '船'),
        shipClass: String(resolvedProfile.shipClass || normalizeShipClassFromItemId(itemId)),
        itemId,
        form: resolvedProfile.form,
        stage: resolvedProfile.stage,
        level: resolvedProfile.level,
        upgradeOptions: shipContext.isGuildShip ? [] : (resourceStorage.PLAYER_SHIP_UPGRADE_OPTIONS[profile.form] || []),
        shipOwnerPlayFabId,
        isSharedShip: shipContext.isSharedShip,
        isGuildShip: shipContext.isGuildShip,
        isNationGuild: shipContext.isNationGuild,
        guildId: shipContext.guildId,
        guildName: shipContext.guildName,
        guildShipId: shipContext.guildShipId,
        kingShipName: shipContext.kingShipName,
        sailColor: resolvedProfile.sailColor || shipContext.sailColor || null,
        appearance: resolvedProfile.appearance || shipContext.appearance || null
    };
}

async function resolveGuildShipProfile(shipContext, fallbackProfile = {}, deps = {}) {
    const guildShipId = String(shipContext?.guildShipId || '').trim();
    let guildShipData = null;
    if (guildShipId && deps?.firestore) {
        const snap = await deps.firestore.collection('ships').doc(guildShipId).get().catch(() => null);
        guildShipData = snap?.exists ? (snap.data() || null) : null;
    }
    const appearance = {
        ...(fallbackProfile?.appearance && typeof fallbackProfile.appearance === 'object' ? fallbackProfile.appearance : {}),
        ...(shipContext?.appearance && typeof shipContext.appearance === 'object' ? shipContext.appearance : {}),
        ...(guildShipData?.appearance && typeof guildShipData.appearance === 'object' ? guildShipData.appearance : {})
    };
    const sailColor = String(guildShipData?.sailColor || appearance.color || shipContext?.sailColor || '').trim().toLowerCase();
    if (sailColor) appearance.color = sailColor;
    const currentHp = Number(guildShipData?.currentHp);
    const maxHp = Number(guildShipData?.maxHp);
    const guildName = String(shipContext?.guildName || '').trim();
    const kingShipName = String(shipContext?.kingShipName || '').trim();
    const autoGuildName = guildName ? `${guildName}号` : '';
    const storedDisplayName = String(guildShipData?.displayName || '').trim();
    const customDisplayName = storedDisplayName && storedDisplayName !== autoGuildName ? storedDisplayName : '';
    const displayName = customDisplayName
        || kingShipName
        || autoGuildName
        || String(fallbackProfile?.name || '').trim()
        || 'ギルドシップ';
    return {
        ...fallbackProfile,
        shipId: guildShipId || fallbackProfile?.shipId || null,
        form: 'guild',
        shipClass: String(guildShipData?.shipClass || guildShipData?.class || 'defender').trim() || 'defender',
        itemId: 'guild_ship',
        name: displayName,
        stage: Number(guildShipData?.stage || guildShipData?.shipStage || 3) || 3,
        level: Number(guildShipData?.level || guildShipData?.shipLevel || fallbackProfile?.level || 1) || 1,
        upgradeOptions: [],
        upgradeCosts: {},
        isGuildShip: true,
        isNationGuild: !!shipContext?.isNationGuild,
        guildType: shipContext?.guildType || 'nation',
        guildId: shipContext?.guildId || null,
        guildName,
        kingShipName,
        guildShipId: guildShipId || null,
        sailColor: sailColor || null,
        appearance,
        currentHp: Number.isFinite(currentHp) ? currentHp : null,
        maxHp: Number.isFinite(maxHp) ? maxHp : null
    };
}

const BOSS_TIER_DEFS = {
    weak: { label: '弱', weight: 60, rewardBonus: 0 },
    medium: { label: '中', weight: 30, rewardBonus: 0 },
    strong: { label: '強', weight: 10, rewardBonus: 1 }
};

const EXPLORATION_BOSSES = {
    treasure_slime: {
        id: 'treasure_slime',
        name: '財宝スライム',
        spriteId: 'treasure_slime',
        tier: 'weak',
        level: 2,
        hp: 32,
        attack: 5,
        defense: 1,
        strength: 5,
        guard: 1,
        agility: 6,
        weapon: 'blunt',
        skills: [{ type: 'passive', weapon: 'blunt', name: 'ぷるぷる回避', level: 1 }]
    },
    mimic_chest: {
        id: 'mimic_chest',
        name: '宝箱ミミック',
        spriteId: 'mimic_chest',
        tier: 'strong',
        level: 6,
        hp: 78,
        attack: 12,
        defense: 5,
        strength: 11,
        guard: 5,
        agility: 5,
        weapon: 'blunt',
        skills: [{ type: 'weapon', weapon: 'blunt', name: '噛みつき', procChance: 0.16, powerMultiplier: 1.18 }]
    },
    crab_brute: {
        id: 'crab_brute',
        name: '甲殻の暴れ者',
        spriteId: 'crab_brute',
        tier: 'strong',
        level: 7,
        hp: 84,
        attack: 13,
        defense: 7,
        strength: 12,
        guard: 8,
        agility: 8,
        weapon: 'axe',
        skills: [{ type: 'weapon', weapon: 'axe', name: '大ばさみの一撃', procChance: 0.16, powerMultiplier: 1.2 }]
    },
    puffer_bomb: {
        id: 'puffer_bomb',
        name: '爆弾フグ',
        spriteId: 'puffer_bomb',
        tier: 'medium',
        level: 4,
        hp: 46,
        attack: 7,
        defense: 2,
        strength: 7,
        guard: 2,
        agility: 9,
        weapon: 'blunt',
        skills: [{ type: 'weapon', weapon: 'blunt', name: 'ふくらみ突進', procChance: 0.14, powerMultiplier: 1.15 }]
    },
    coral_goblin: {
        id: 'coral_goblin',
        name: '珊瑚ゴブリン',
        spriteId: 'coral_goblin',
        tier: 'medium',
        level: 7,
        hp: 78,
        attack: 12,
        defense: 5,
        strength: 11,
        guard: 5,
        agility: 12,
        weapon: 'sword',
        skills: [{ type: 'weapon', weapon: 'sword', name: '珊瑚刃の連撃', procChance: 0.16, powerMultiplier: 1.16 }]
    },
    merfolk_lancer: {
        id: 'merfolk_lancer',
        name: '人魚の槍兵',
        spriteId: 'merfolk_lancer',
        tier: 'medium',
        level: 19,
        hp: 192,
        attack: 30,
        defense: 15,
        strength: 26,
        guard: 15,
        agility: 19,
        weapon: 'polearm',
        skills: [{ type: 'weapon', weapon: 'polearm', name: '潮流の突き', procChance: 0.18, powerMultiplier: 1.2 }]
    },
    skeletal_parrot: {
        id: 'skeletal_parrot',
        name: '骸骨オウム',
        spriteId: 'skeletal_parrot',
        tier: 'weak',
        level: 6,
        hp: 56,
        attack: 9,
        defense: 3,
        strength: 8,
        guard: 3,
        agility: 14,
        weapon: 'gun',
        skills: [{ type: 'weapon', weapon: 'gun', name: '骨ばった急襲', procChance: 0.14, powerMultiplier: 1.14 }]
    },
    lantern_wraith: {
        id: 'lantern_wraith',
        name: 'ランタンの亡霊',
        spriteId: 'lantern_wraith',
        tier: 'weak',
        level: 8,
        hp: 78,
        attack: 12,
        defense: 5,
        strength: 10,
        guard: 5,
        agility: 13,
        mp: 18,
        weapon: 'staff',
        magicPower: 12,
        skills: [
            { type: 'magic', weapon: 'staff', magicKind: 'attack', name: '灯火の呪い', mpCost: 6, minRange: 1, maxRange: 2, powerMultiplier: 1.14 },
            { type: 'weapon', weapon: 'staff', name: '霊気集中', procChance: 0.16, powerMultiplier: 1.16 }
        ]
    },
    ghost_pirate: {
        id: 'ghost_pirate',
        name: '幽霊海賊',
        spriteId: 'ghost_pirate',
        tier: 'medium',
        level: 11,
        hp: 118,
        attack: 18,
        defense: 8,
        strength: 15,
        guard: 8,
        agility: 17,
        mp: 24,
        weapon: 'staff',
        magicPower: 16,
        skills: [
            { type: 'magic', weapon: 'staff', magicKind: 'attack', name: '霧海の呪い', mpCost: 7, minRange: 1, maxRange: 2, powerMultiplier: 1.18 },
            { type: 'passive', weapon: 'staff', name: '亡霊の集中', level: 2 }
        ]
    },
    zombie_raider: {
        id: 'zombie_raider',
        name: 'ゾンビ海賊',
        spriteId: 'zombie_raider',
        tier: 'weak',
        level: 8,
        hp: 72,
        attack: 11,
        defense: 5,
        strength: 11,
        guard: 5,
        agility: 7,
        weapon: 'sword',
        skills: [{ type: 'weapon', weapon: 'sword', name: 'よろめき斬り', procChance: 0.14, powerMultiplier: 1.14 }]
    },
    drowned_buccaneer: {
        id: 'drowned_buccaneer',
        name: '濡れし海賊',
        spriteId: 'drowned_buccaneer',
        tier: 'medium',
        level: 11,
        hp: 112,
        attack: 17,
        defense: 8,
        strength: 15,
        guard: 8,
        agility: 11,
        weapon: 'sword',
        skills: [{ type: 'weapon', weapon: 'sword', name: '濡れ刃の連撃', procChance: 0.16, powerMultiplier: 1.17 }]
    },
    anchor_golem: {
        id: 'anchor_golem',
        name: '錨ゴーレム',
        spriteId: 'anchor_golem',
        tier: 'strong',
        level: 14,
        hp: 168,
        attack: 23,
        defense: 13,
        strength: 20,
        guard: 15,
        agility: 8,
        weapon: 'shield',
        skills: [
            { type: 'passive', weapon: 'shield', name: '錨の守り', level: 3 },
            { type: 'weapon', weapon: 'blunt', name: '沈没錨撃ち', procChance: 0.16, powerMultiplier: 1.2 }
        ]
    },
    skeleton_captain: {
        id: 'skeleton_captain',
        name: '骸骨船長',
        spriteId: 'skeleton_captain',
        tier: 'weak',
        level: 12,
        hp: 108,
        attack: 18,
        defense: 8,
        strength: 17,
        guard: 8,
        agility: 15,
        weapon: 'sword',
        skills: [{ type: 'weapon', weapon: 'sword', name: '船長の連撃', procChance: 0.16, powerMultiplier: 1.18 }]
    },
    shark_raider: {
        id: 'shark_raider',
        name: '鮫の略奪者',
        spriteId: 'shark_raider',
        tier: 'medium',
        level: 15,
        hp: 158,
        attack: 25,
        defense: 12,
        strength: 22,
        guard: 12,
        agility: 18,
        weapon: 'axe',
        skills: [{ type: 'weapon', weapon: 'axe', name: '鮫牙の強撃', procChance: 0.18, powerMultiplier: 1.22 }]
    },
    kraken_pirate: {
        id: 'kraken_pirate',
        name: '海賊クラーケン',
        spriteId: 'kraken_pirate',
        tier: 'strong',
        level: 18,
        hp: 226,
        attack: 32,
        defense: 15,
        strength: 27,
        guard: 16,
        agility: 18,
        weapon: 'axe',
        skills: [
            { type: 'weapon', weapon: 'axe', name: '触腕強撃', procChance: 0.2, powerMultiplier: 1.25 },
            { type: 'passive', weapon: 'axe', name: '海賊頭の威圧', level: 3 }
        ]
    },
    blue_kraken: {
        id: 'blue_kraken',
        name: '深海クラーケン',
        spriteId: 'blue_kraken',
        tier: 'weak',
        level: 15,
        hp: 132,
        attack: 21,
        defense: 10,
        strength: 20,
        guard: 10,
        agility: 15,
        weapon: 'blunt',
        skills: [{ type: 'weapon', weapon: 'blunt', name: '青い触腕', procChance: 0.16, powerMultiplier: 1.18 }]
    },
    cannon_mimic: {
        id: 'cannon_mimic',
        name: '大砲ミミック',
        spriteId: 'cannon_mimic',
        tier: 'strong',
        level: 17,
        hp: 196,
        attack: 31,
        defense: 15,
        strength: 27,
        guard: 15,
        agility: 10,
        weapon: 'gun',
        skills: [{ type: 'weapon', weapon: 'gun', name: '大砲の咆哮', procChance: 0.18, powerMultiplier: 1.22 }]
    },
    cursed_shipwheel: {
        id: 'cursed_shipwheel',
        name: '呪いの舵輪',
        spriteId: 'cursed_shipwheel',
        tier: 'strong',
        level: 22,
        hp: 260,
        attack: 36,
        defense: 18,
        strength: 30,
        guard: 18,
        agility: 16,
        mp: 32,
        weapon: 'staff',
        magicPower: 22,
        skills: [
            { type: 'magic', weapon: 'staff', magicKind: 'attack', name: '渦潮の呪縛', mpCost: 8, minRange: 1, maxRange: 2, powerMultiplier: 1.22 },
            { type: 'passive', weapon: 'staff', name: '深海の呪力', level: 3 }
        ]
    }
};

const DEFAULT_EXPLORATION_GACHA_PROFILES = {
    near_sea: {
        categoryWeights: { Weapon: 20, Armor: 25, Shield: 20, Consumable: 35 },
        rarityWeights: { common: 92, rare: 6, epic: 1.5, legendary: 0.5 }
    },
    coral_passage: {
        categoryWeights: { Weapon: 24, Armor: 22, Shield: 18, Consumable: 36 },
        rarityWeights: { common: 86, rare: 10, epic: 3, legendary: 1 }
    },
    old_lighthouse: {
        categoryWeights: { Weapon: 20, Armor: 55, Shield: 20, Consumable: 5 },
        rarityWeights: { common: 77, rare: 16, epic: 5, legendary: 2 }
    },
    sunken_trader: {
        categoryWeights: { Weapon: 25, Armor: 35, Shield: 15, Consumable: 25 },
        rarityWeights: { common: 72, rare: 18, epic: 7, legendary: 3 }
    },
    pirate_cove: {
        categoryWeights: { Weapon: 55, Armor: 15, Shield: 25, Consumable: 5 },
        rarityWeights: { common: 55, rare: 25, epic: 14, legendary: 6 }
    },
    deep_maelstrom: {
        categoryWeights: { Weapon: 45, Armor: 20, Shield: 20, Consumable: 15 },
        rarityWeights: { common: 46, rare: 28, epic: 17, legendary: 9 }
    }
};

const EXPLORATION_SHIP_STAGE_GACHA_LIMITS = {
    1: {
        rarityWeights: { common: 100, rare: 0, epic: 0, legendary: 0 },
        maxStatsByCategory: {
            Weapon: { Power: 20 },
            Armor: { Defense: 12 },
            Shield: { Defense: 18 }
        }
    },
    2: {
        rarityWeights: { common: 88, rare: 10, epic: 1.8, legendary: 0.2 },
        maxStatsByCategory: {
            Weapon: { Power: 45 },
            Armor: { Defense: 35 },
            Shield: { Defense: 38 }
        }
    },
    3: {}
};

function parseExplorationGachaProfiles() {
    const raw = process.env.EXPLORATION_GACHA_PROFILES;
    if (!raw) return DEFAULT_EXPLORATION_GACHA_PROFILES;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return DEFAULT_EXPLORATION_GACHA_PROFILES;
        return Object.fromEntries(Object.entries(DEFAULT_EXPLORATION_GACHA_PROFILES).map(([destinationId, defaults]) => {
            const override = parsed[destinationId] || {};
            return [destinationId, {
                categoryWeights: {
                    ...defaults.categoryWeights,
                    ...(override.categoryWeights || {})
                },
                rarityWeights: {
                    ...defaults.rarityWeights,
                    ...(override.rarityWeights || {})
                },
                excludedItemIds: override.excludedItemIds,
                excludedItemPatterns: override.excludedItemPatterns
            }];
        }));
    } catch (error) {
        console.warn('[exploration/gacha] EXPLORATION_GACHA_PROFILES のパースに失敗しました。デフォルトを使用します。', error?.message || error);
        return DEFAULT_EXPLORATION_GACHA_PROFILES;
    }
}

const EXPLORATION_GACHA_PROFILES = parseExplorationGachaProfiles();

function normalizeShipStage(value) {
    const stage = Math.floor(Number(value || 1) || 1);
    if (stage <= 1) return 1;
    if (stage === 2) return 2;
    return 3;
}

function getExplorationGachaOptions(destinationId, ship = {}) {
    const profile = EXPLORATION_GACHA_PROFILES[destinationId] || EXPLORATION_GACHA_PROFILES.near_sea;
    const stageLimit = EXPLORATION_SHIP_STAGE_GACHA_LIMITS[normalizeShipStage(ship.stage)] || EXPLORATION_SHIP_STAGE_GACHA_LIMITS[1];
    const role = getExplorationShipRole(ship.shipClass);
    return {
        ...profile,
        rarityWeights: {
            ...profile.rarityWeights,
            ...stageLimit.rarityWeights
        },
        categoryWeights: {
            ...profile.categoryWeights,
            ...(role.categoryWeights || {})
        },
        maxStatsByCategory: stageLimit.maxStatsByCategory
    };
}

function resolveCatalogEntryByItemId(catalogCache, itemId) {
    const id = String(itemId || '').trim();
    if (!id) return null;
    if (catalogCache?.[id]) return catalogCache[id];
    return Object.values(catalogCache || {}).find((entry) => (
        String(entry?.ItemId || '').trim() === id
        || String(entry?.FriendlyId || '').trim() === id
    )) || null;
}

function getShipUpgradeCostsForForm(targetForm, catalogCache) {
    const form = String(targetForm || '').trim().toLowerCase();
    const spec = resourceStorage.PLAYER_SHIP_FORMS[form];
    if (!spec) return [];
    const entry = resolveCatalogEntryByItemId(catalogCache, spec.itemId);
    const amounts = Array.isArray(entry?.PriceAmounts) ? entry.PriceAmounts : [];
    return amounts
        .map((cost) => ({
            ItemId: String(cost?.ItemId || cost?.itemId || '').trim(),
            Amount: Math.max(0, Math.floor(Number(cost?.Amount ?? cost?.amount ?? 0) || 0))
        }))
        .filter((cost) => cost.ItemId && cost.Amount > 0);
}

function attachUpgradeCosts(ship, catalogCache) {
    const upgradeOptions = resourceStorage.PLAYER_SHIP_UPGRADE_OPTIONS[ship.form] || [];
    return {
        ...ship,
        upgradeOptions,
        upgradeCosts: Object.fromEntries(upgradeOptions.map((targetForm) => [
            targetForm,
            getShipUpgradeCostsForForm(targetForm, catalogCache)
        ]))
    };
}

function pickWeighted(entries, random = Math.random) {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight || 0)), 0);
    if (total <= 0) return entries[0] || null;
    let roll = random() * total;
    for (const entry of entries) {
        roll -= Math.max(0, Number(entry.weight || 0));
        if (roll < 0) return entry;
    }
    return entries[entries.length - 1] || null;
}

function getExplorationBossWeight(boss, shipClass = '') {
    const base = getBossTierDef(boss?.tier).weight;
    const role = getExplorationShipRole(shipClass);
    const delta = Number(role.bossWeightAdjustments?.[String(boss?.tier || '').trim().toLowerCase()] || 0);
    return Math.max(1, base + delta);
}

function selectExplorationBoss(destination, random = Math.random, shipClass = '') {
    const candidates = getDestinationBosses(destination).map((boss) => ({
        ...boss,
        weight: getExplorationBossWeight(boss, shipClass)
    }));
    return pickWeighted(candidates, random) || EXPLORATION_BOSSES.treasure_slime;
}

// BOSS勝利:2個 / 強BOSS勝利:+1個 / 逃走・決着なし:1個 / BOSS敗北:0個。船種ごとに追加補正する。
function resolveRewardCount(bossResult, shipClass) {
    const role = getExplorationShipRole(shipClass);
    let base;
    if (!bossResult || !bossResult.bossAppeared) {
        base = 1;
    } else if (bossResult.playerWon) {
        base = 2;
        base += getBossTierDef(bossResult.bossTier).rewardBonus;
    } else if (bossResult.escaped || bossResult.draw) {
        base = 1;
    } else {
        base = 0;
    }
    if (bossResult?.playerWon) base += Number(role.victoryRewardBonus || 0);
    base += Number(role.rewardBonus || 0);
    if (role.defeatRewardFloor && bossResult?.bossAppeared && !bossResult.playerWon && !bossResult.escaped && !bossResult.draw) {
        base = Math.max(base, Number(role.defeatRewardFloor || 0));
    }
    return Math.max(0, base);
}

async function refreshGoldBalanceAndRanking(playFabId, deps) {
    if (!playFabId || typeof deps.getCurrencyBalance !== 'function') return null;
    const balance = await deps.getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
    if (Number.isFinite(balance) && deps.promisifyPlayFab && deps.PlayFabServer) {
        await deps.promisifyPlayFab(deps.PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: balance }]
        });
    }
    return Number.isFinite(balance) ? balance : null;
}

function createBossEquipmentRef(weaponType, category = 'Weapon') {
    const normalized = String(weaponType || 'blunt').trim().toLowerCase();
    return {
        customData: {
            Category: category,
            ManifestWeaponType: normalized,
            Power: 0,
            Defense: 0
        }
    };
}

function buildExplorationBossProfile(destination, bossBase) {
    const weapon = String(bossBase.weapon || 'blunt').trim().toLowerCase();
    const equipment = {};
    if (weapon === 'shield') {
        equipment.RightHand = createBossEquipmentRef('blunt');
        equipment.LeftHand = createBossEquipmentRef('shield', 'Shield');
    } else {
        equipment.RightHand = createBossEquipmentRef(weapon);
    }
    return {
        id: `boss-${destination.id}-${bossBase.id || 'monster'}`,
        stats: {
            DisplayName: bossBase.name || 'BOSS',
            Level: Math.max(1, Number(bossBase.level || 1)),
            HP: bossBase.hp,
            MaxHP: bossBase.hp,
            CurrentHP: bossBase.hp,
            MP: Number(bossBase.mp || 0) || 0,
            MaxMP: Number(bossBase.mp || 0) || 0,
            CurrentMP: Number(bossBase.mp || 0) || 0,
            ちから: Number(bossBase.strength || 1) || 1,
            みのまもり: Number(bossBase.guard || 0) || 0,
            すばやさ: Number(bossBase.agility || 1) || 1,
            かしこさ: Number(bossBase.intelligence || 0) || 0
        },
        equipmentStats: {
            Power: bossBase.attack,
            Defense: bossBase.defense,
            Agi: 0,
            Int: 0,
            MagicPower: Number(bossBase.magicPower || 0) || 0,
            HealPower: 0,
            MpEfficiency: 0,
            CastRate: 0,
            StatusRate: 0
        },
        equipment,
        skills: Array.isArray(bossBase.skills) ? bossBase.skills : []
    };
}

async function getExplorationBattlePlayerProfile(playFabId, { promisifyPlayFab, PlayFabServer }) {
    if (typeof battleRoutes.getPlayerFullProfile === 'function') {
        try {
            return await battleRoutes.getPlayerFullProfile(playFabId);
        } catch (error) {
            console.warn('[exploration/boss] 白兵戦プロフィール取得失敗。統計のみで代替します:', error?.message || error);
        }
    }

    const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
    const st = {};
    (result?.Statistics || []).forEach((s) => { st[s.StatisticName] = s.Value; });
    const hp = Math.max(10, Number(st.HP || 30));
    const maxHp = Math.max(hp, Number(st.MaxHP || hp));
    return {
        id: playFabId,
        stats: {
            ...st,
            Level: Math.max(1, Number(st.Level || 1)),
            CurrentHP: hp,
            HP: hp,
            MaxHP: maxHp
        },
        equipmentStats: {
            Power: 0,
            Defense: 0,
            Agi: 0,
            Int: 0,
            MagicPower: 0,
            HealPower: 0,
            MpEfficiency: 0,
            CastRate: 0,
            StatusRate: 0
        },
        equipment: {}
    };
}

// BOSS戦では一時的にHPを使うが、探索後に全回復する
async function resolveBossBattle(playFabId, destination, bossBase, { promisifyPlayFab, PlayFabServer }) {
    const tierDef = getBossTierDef(bossBase?.tier);
    let player;
    try {
        player = await getExplorationBattlePlayerProfile(playFabId, { promisifyPlayFab, PlayFabServer });
    } catch (error) {
        console.warn('[exploration/boss] プレイヤープロフィール取得に失敗。最低値で代替します:', error?.message || error);
        player = {
            id: playFabId,
            stats: { Level: 1, HP: 30, MaxHP: 30, CurrentHP: 30, ちから: 1, みのまもり: 0 },
            equipmentStats: { Power: 0, Defense: 0 },
            equipment: {}
        };
    }

    const boss = buildExplorationBossProfile(destination, bossBase);
    player.stats = player.stats || {};
    player.equipmentStats = player.equipmentStats || {};
    player.stats.CurrentHP = Math.max(1, Number(player.stats.CurrentHP || player.stats.HP || 30));
    boss.stats.CurrentHP = boss.stats.MaxHP;

    const battleResult = await battleRoutes.runBattle(player, boss);
    const playerWon = battleResult?.winner?.id === player.id;
    const escaped = !!battleResult?.escaped;
    const draw = !escaped && !battleResult?.winner;
    return {
        bossAppeared: true,
        bossId: String(bossBase.id || ''),
        bossName: String(bossBase.name || 'BOSS'),
        bossSpriteId: String(bossBase.spriteId || bossBase.id || ''),
        bossTier: String(bossBase.tier || 'weak'),
        bossTierLabel: tierDef.label,
        playerWon,
        escaped,
        draw,
        hpCost: 0,
        battleLog: [
            `${tierDef.label}BOSS「${bossBase.name || 'BOSS'}」と戦闘！`,
            ...(Array.isArray(battleResult?.logs) ? battleResult.logs : []),
            escaped
                ? '戦闘は決着せず終了した。探索後にHPは全回復した。'
                : draw
                    ? '決着はつかなかった。探索後にHPは全回復した。'
                : (playerWon ? '撃破！探索後にHPは全回復した。' : '敗北したが、探索後にHPは全回復した。')
        ].join('\n')
    };
}

async function restoreHpToFull(playFabId, { promisifyPlayFab, PlayFabServer }) {
    try {
        const statResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
        const currentSt = {};
        (statResult?.Statistics || []).forEach((s) => { currentSt[s.StatisticName] = s.Value; });
        const maxHp = Math.max(1, Number(currentSt.MaxHP || currentSt.HP || 30));
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: 'HP', Value: maxHp }]
        });
        return true;
    } catch (err) {
        console.warn('[exploration/boss] HP全回復失敗:', err?.message || err);
        return false;
    }
}

async function restoreHpToFullOnce(activeRef, playFabId, deps) {
    let shouldApply = false;
    await activeRef.firestore.runTransaction(async (tx) => {
        const snap = await tx.get(activeRef);
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (data.hpRestored || data.hpRestoreReserved) return;
        shouldApply = true;
        tx.update(activeRef, {
            hpRestoreReserved: true,
            hpRestoreReservedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        });
    });

    if (!shouldApply) return;

    const applied = await restoreHpToFull(playFabId, deps);
    const update = applied
        ? {
            hpRestored: true,
            hpRestoredAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        }
        : {
            hpRestoreFailed: true,
            hpRestoreFailedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        };
    await activeRef.update(update).catch((err) => {
        console.warn('[exploration/boss] HP全回復フラグ更新失敗:', err?.message || err);
    });
}

function buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount }) {
    const lines = [
        `${ship.shipName}は${destination.name}の探索から帰還しました。`
    ];
    const bossName = bossResult?.bossName || 'BOSS';
    const bossLabel = bossResult?.bossTierLabel ? `${bossResult.bossTierLabel}BOSS` : 'BOSS';
    if (!bossResult || !bossResult.bossAppeared) {
        lines.push('大きな戦闘を避けながら、海域を丁寧に調査しました。');
    } else if (bossResult.playerWon) {
        lines.push(`${bossLabel}「${bossName}」と激闘の末、勝利しました！探索後にHPは全回復しました。`);
    } else if (bossResult.escaped || bossResult.draw) {
        lines.push(`${bossLabel}「${bossName}」との戦闘は決着せず、持ち帰れるお宝だけを回収しました。探索後にHPは全回復しました。`);
    } else {
        lines.push(`${bossLabel}「${bossName}」に敗北しましたが、探索後にHPは全回復しました。`);
    }
    const role = getExplorationShipRole(ship.shipClass);
    if (role.rewardHint) lines.push(`船種効果: ${role.rewardHint}`);
    if (rewardCount > 0) lines.push(`発見したお宝 (${rewardCount}個): ${rewardDisplayName}`);
    else lines.push('お宝は得られませんでした。');
    return lines.join('\n');
}

function getAvailableDestinationsForShipClass(shipClass) {
    const normalized = normalizeExplorationShipClass(shipClass);
    return Object.values(DESTINATIONS)
        .filter((destination) => canShipClassExploreDestination(normalized, destination))
        .map((destination) => publicDestination(destination, normalized));
}

function getAllDestinationsForShipClass(shipClass) {
    const normalized = normalizeExplorationShipClass(shipClass);
    return Object.values(DESTINATIONS).map((destination) => publicDestination(destination, normalized));
}

function initializeExplorationRoutes(app, deps) {
    const { firestore, admin, promisifyPlayFab, PlayFabServer, subtractEconomyItem, addEconomyItem, getCurrencyBalance, requireAuthenticatedPlayFabId, catalogCache } = deps;
    if (!firestore || !admin) {
        console.warn('[exploration] Firestore deps missing. Routes disabled.');
        return;
    }

    async function requireAuthed(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') return playFabId;
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    async function buildExplorationStatus(playFabId) {
        const ship = await resolveActiveShip(playFabId, deps);
        const availableDestinations = ship
            ? getAvailableDestinationsForShipClass(ship.shipClass)
            : [];
        const activeSnap = await firestore.collection(EXPLORATION_COLLECTION).doc(playFabId).get();
        const dayKey = getJstDayKey();
        const dailyFreeSnap = await firestore
            .collection(EXPLORATION_COLLECTION)
            .doc(playFabId)
            .collection(DAILY_FREE_SUBCOLLECTION)
            .doc(dayKey)
            .get();
        const reportsSnap = await firestore
            .collection(EXPLORATION_COLLECTION)
            .doc(playFabId)
            .collection('reports')
            .orderBy('completedAtMs', 'desc')
            .limit(5)
            .get();
        return {
            success: true,
            ship,
            destinations: availableDestinations,
            allDestinations: ship ? getAllDestinationsForShipClass(ship.shipClass) : [],
            dailyFree: buildDailyFreeExplorationStatus(dayKey, dailyFreeSnap),
            active: activeSnap.exists ? explorationDocToPayload(activeSnap.data()) : null,
            reports: reportsSnap.docs.map(reportDocToPayload)
        };
    }

    app.post('/api/exploration/status', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            res.json(await buildExplorationStatus(playFabId));
        } catch (error) {
            console.error('[exploration/status] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '探索情報の取得に失敗しました。' });
        }
    });

    app.post('/api/player-ship/status', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const shipContext = await resolveGuildShipContext(playFabId, deps);
            const shipOwnerPlayFabId = shipContext.shipOwnerPlayFabId || playFabId;
            const baseShip = await resourceStorage.getPlayerShipProfile(shipOwnerPlayFabId, { promisifyPlayFab, PlayFabServer });
            const ship = shipContext.isGuildShip
                ? await resolveGuildShipProfile(shipContext, baseShip, deps)
                : attachUpgradeCosts(baseShip, catalogCache);
            res.json({
                success: true,
                ship: {
                    ...ship,
                    shipOwnerPlayFabId,
                    isSharedShip: shipContext.isSharedShip,
                    isGuildShip: shipContext.isGuildShip,
                    isNationGuild: shipContext.isNationGuild,
                    guildId: shipContext.guildId,
                    guildName: shipContext.guildName,
                    captainName: shipContext.captainName,
                    guildShipId: shipContext.guildShipId,
                    kingShipName: shipContext.kingShipName
                }
            });
        } catch (error) {
            console.error('[player-ship/status] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '船情報の取得に失敗しました。' });
        }
    });

    app.post('/api/player-ship/upgrade', async (req, res) => {
        let { playFabId, targetForm, requestId } = req.body || {};
        if (!playFabId || !targetForm) return res.status(400).json({ error: 'playFabId and targetForm are required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const shipContext = await resolveGuildShipContext(playFabId, deps);
            if (shipContext.isSharedShip || shipContext.isGuildShip) {
                return res.status(403).json({ error: shipContext.isGuildShip ? 'ギルドシップは進化できません。' : '他プレイヤーの船は進化できません。' });
            }
            const shipOwnerPlayFabId = shipContext.shipOwnerPlayFabId || playFabId;
            const current = await resourceStorage.getPlayerShipProfile(shipOwnerPlayFabId, { promisifyPlayFab, PlayFabServer });
            const allowed = resourceStorage.PLAYER_SHIP_UPGRADE_OPTIONS[current.form] || [];
            const normalizedTarget = String(targetForm || '').trim().toLowerCase();
            if (!allowed.includes(normalizedTarget)) {
                return res.status(400).json({
                    error: 'この船にはその進化先を選べません。',
                    currentForm: current.form,
                    allowed
                });
            }
            const costs = getShipUpgradeCostsForForm(normalizedTarget, catalogCache);
            if (!costs.length) {
                return res.status(400).json({ error: '進化先の船価格が設定されていません。', targetForm: normalizedTarget });
            }
            for (const cost of costs) {
                if (typeof getCurrencyBalance === 'function') {
                    const balance = await getCurrencyBalance(playFabId, cost.ItemId).catch(() => null);
                    if (Number.isFinite(balance) && balance < cost.Amount) {
                        return res.status(402).json({
                            error: '進化に必要な資源が足りません。',
                            cost,
                            balance
                        });
                    }
                }
            }
            const idempotencyBase = `player-ship-upgrade-${playFabId}-${shipOwnerPlayFabId}-${current.form}-${normalizedTarget}-${requestId || Date.now()}`;
            for (const cost of costs) {
                await subtractEconomyItem(playFabId, cost.ItemId, cost.Amount, {
                    idempotencyId: `${idempotencyBase}-${cost.ItemId}`
                });
            }
            let ship;
            try {
                ship = await resourceStorage.upgradePlayerShipProfile(shipOwnerPlayFabId, targetForm, { promisifyPlayFab, PlayFabServer });
            } catch (upgradeError) {
                await Promise.all(costs.map((cost) => addEconomyItem(playFabId, cost.ItemId, cost.Amount, {
                    idempotencyId: `${idempotencyBase}-refund-${cost.ItemId}`
                }).catch((refundError) => {
                    console.error('[player-ship/upgrade] refund failed:', playFabId, cost, refundError?.errorMessage || refundError?.message || refundError);
                })));
                throw upgradeError;
            }
            res.json({
                success: true,
                ship: {
                    ...attachUpgradeCosts(ship, catalogCache),
                    shipOwnerPlayFabId,
                    isSharedShip: shipContext.isSharedShip,
                    isGuildShip: shipContext.isGuildShip,
                    isNationGuild: shipContext.isNationGuild,
                    guildId: shipContext.guildId,
                    guildName: shipContext.guildName,
                    captainName: shipContext.captainName,
                    guildShipId: shipContext.guildShipId,
                    kingShipName: shipContext.kingShipName
                },
                costs
            });
        } catch (error) {
            if (error?.message === 'InvalidShipUpgradePath') {
                return res.status(400).json({
                    error: 'この船にはその進化先を選べません。',
                    currentForm: error.currentForm,
                    allowed: error.allowed || []
                });
            }
            console.error('[player-ship/upgrade] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '船の進化に失敗しました。' });
        }
    });

    app.post('/api/player-ship/name', async (req, res) => {
        let { playFabId, name } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const shipContext = await resolveGuildShipContext(playFabId, deps);
            if (shipContext.isSharedShip || shipContext.isGuildShip) {
                return res.status(403).json({ error: shipContext.isGuildShip ? 'ギルドシップは名前を変更できません。' : '他プレイヤーの船は名前を変更できません。' });
            }
            const shipOwnerPlayFabId = shipContext.shipOwnerPlayFabId || playFabId;
            const ship = await resourceStorage.renamePlayerShipProfile(shipOwnerPlayFabId, name, { promisifyPlayFab, PlayFabServer });
            res.json({
                success: true,
                ship: {
                    ...attachUpgradeCosts(ship, catalogCache),
                    shipOwnerPlayFabId,
                    isSharedShip: shipContext.isSharedShip,
                    isGuildShip: shipContext.isGuildShip,
                    isNationGuild: shipContext.isNationGuild,
                    guildId: shipContext.guildId,
                    guildName: shipContext.guildName,
                    captainName: shipContext.captainName,
                    guildShipId: shipContext.guildShipId,
                    kingShipName: shipContext.kingShipName
                }
            });
        } catch (error) {
            if (error?.message === 'InvalidShipName') {
                return res.status(400).json({ error: '船の名前は1〜16文字で入力してください。' });
            }
            console.error('[player-ship/name] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '船の名前を変更できませんでした。' });
        }
    });

    app.post('/api/exploration/start', async (req, res) => {
        let { playFabId } = req.body || {};
        const destinationId = normalizeDestinationId(req.body?.destinationId);
        if (!playFabId || !destinationId) return res.status(400).json({ error: 'playFabId and destinationId are required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const ship = await resolveActiveShip(playFabId, deps);
            if (!ship) return res.status(400).json({ error: '探索には使用中の船が必要です。' });
            const destination = DESTINATIONS[destinationId];
            if (!canShipClassExploreDestination(ship.shipClass, destination)) {
                return res.status(403).json({ error: 'この船では選択した行き先に向かえません。' });
            }
            const dailyFreeEligible = isDailyFreeExplorationDestination(destination);
            const now = Date.now();
            const dayKey = getJstDayKey(now);
            const explorationId = `exp-${now}-${Math.random().toString(36).slice(2, 8)}`;
            const activeRef = firestore.collection(EXPLORATION_COLLECTION).doc(playFabId);
            const dailyFreeRef = activeRef.collection(DAILY_FREE_SUBCOLLECTION).doc(dayKey);
            let dailyFreeUsed = false;
            let chargedCost = destination.cost;

            // フルペイロードを持つ pending を先に Firestore に確保する。
            // これにより: 通貨減算前に保存するためユーザー資産は安全。
            // active flip (step3) が失敗しても pending にデータが残り claim から自動復旧可能。
            const fullPayload = {
                id: explorationId,
                status: 'pending',
                playFabId,
                destinationId,
                destinationName: destination.name,
                shipId: ship.shipId,
                shipName: ship.shipName,
                shipClass: ship.shipClass,
                shipStage: normalizeShipStage(ship.stage),
                cost: destination.cost,
                chargedCost: destination.cost,
                dailyFreeDayKey: '',
                dailyFreeUsed: false,
                startedAtMs: now,
                completesAtMs: now,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            let conflicted = false;
            await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(activeRef);
                if (snap.exists) {
                    const data = snap.data() || {};
                    const status = String(data.status || '');
                    if (status === 'active' || status === 'claiming') {
                        conflicted = true;
                        return;
                    }
                    if (status === 'pending') {
                        if (data.completesAtMs) {
                            // フルペイロード pending: 通貨が減算済みの可能性がある → active として保護
                            conflicted = true;
                            return;
                        }
                        // 早期スタブ pending: PENDING_STALE_MS 未満なら保護、超えたら上書き可
                        const createdAtMs = timestampToMs(data.createdAt);
                        if (now - createdAtMs < PENDING_STALE_MS) {
                            conflicted = true;
                            return;
                        }
                    }
                }
                const dailyFreeSnap = dailyFreeEligible ? await tx.get(dailyFreeRef) : null;
                dailyFreeUsed = dailyFreeEligible && !dailyFreeSnap.exists;
                chargedCost = dailyFreeUsed ? 0 : destination.cost;
                tx.set(activeRef, {
                    ...fullPayload,
                    chargedCost,
                    dailyFreeDayKey: dailyFreeUsed ? dayKey : '',
                    dailyFreeUsed
                });
                if (dailyFreeUsed) {
                    tx.set(dailyFreeRef, {
                        dayKey,
                        explorationId,
                        destinationId,
                        destinationName: destination.name,
                        playFabId,
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        usedAtMs: now
                    });
                }
            });
            if (conflicted) {
                return res.status(409).json({ error: '探索中です。帰還後に次の探索へ出発できます。' });
            }

            if (chargedCost > 0) {
                const balance = typeof getCurrencyBalance === 'function' ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE) : null;
                if (Number.isFinite(balance) && balance < chargedCost) {
                    await activeRef.delete().catch(() => {});
                    return res.status(402).json({ error: `探索には${chargedCost}G必要です。`, cost: chargedCost, balance });
                }

                // 通貨減算。失敗時は pending を削除してスロットを解放（ユーザー安全）
                try {
                    await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, chargedCost, {
                        idempotencyId: req.body?.requestId ? `exploration-start-${req.body.requestId}` : undefined
                    });
                } catch (currencyError) {
                    await activeRef.delete().catch(() => {});
                    throw currencyError;
                }
            }
            const goldBalance = dailyFreeUsed && typeof getCurrencyBalance === 'function'
                ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE).catch(() => null)
                : await refreshGoldBalanceAndRanking(playFabId, {
                    getCurrencyBalance,
                    promisifyPlayFab,
                    PlayFabServer
                });

            // active に昇格。失敗しても pending にフルデータが残るため claim から自動復旧可能
            try {
                await activeRef.update({ status: 'active', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            } catch (firestoreError) {
                console.error('[exploration/start] active昇格失敗 (通貨は減算済み、pending から claim で自動復旧可能):', playFabId, explorationId, firestoreError?.message || firestoreError);
                throw firestoreError;
            }

            res.json({ ...(await buildExplorationStatus(playFabId)), started: true, balance: goldBalance, dailyFreeUsed, chargedCost });
        } catch (error) {
            console.error('[exploration/start] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '探索の開始に失敗しました。', details: error?.errorMessage || error?.message || String(error) });
        }
    });

    app.post('/api/exploration/claim', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        const activeRef = firestore.collection(EXPLORATION_COLLECTION).doc(playFabId);
        try {
            const now = Date.now();
            let activeData = null;
            let isRetry = false;
            let claimError = null;

            // Firestoreトランザクションで active/pending → claiming へ排他遷移（並行claim防止）
            await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(activeRef);
                if (!snap.exists) {
                    claimError = { code: 400, message: '帰還確認できる探索がありません。' };
                    return;
                }
                const data = snap.data() || {};
                const effectiveStatus = resolveEffectiveStatus(data);

                if (effectiveStatus === 'claiming' && Array.isArray(data.rolledRewardIds)) {
                    // リトライ: claiming + rolledRewardIds 保存済み → 続きから処理
                    activeData = data;
                    isRetry = true;
                    return;
                }
                if (effectiveStatus === 'claiming') {
                    const updatedAtMs = timestampToMs(data.updatedAt);
                    if (updatedAtMs && now - updatedAtMs < CLAIMING_STALE_MS) {
                        claimError = { code: 409, message: '探索結果を確認中です。少し待ってから再試行してください。' };
                        return;
                    }
                    // 抽選結果保存前に中断した古い claiming は、同じ探索データで再実行する
                    activeData = data;
                    isRetry = false;
                    tx.update(activeRef, {
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        recoveryReason: 'stale-claiming-before-roll'
                    });
                    return;
                }
                if (effectiveStatus !== 'active') {
                    claimError = { code: 400, message: '帰還確認できる探索がありません。' };
                    return;
                }
                activeData = data;
                isRetry = false;
                // Atomically flip: 並行リクエストはここで排除される
                tx.update(activeRef, { status: 'claiming', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            });

            if (claimError) return res.status(claimError.code).json(claimError);

            const destination = DESTINATIONS[String(activeData.destinationId || '')] || DESTINATIONS.near_sea;
            const ship = {
                shipId: String(activeData.shipId || ''),
                shipName: String(activeData.shipName || '船'),
                shipClass: String(activeData.shipClass || 'common'),
                stage: normalizeShipStage(activeData.shipStage || activeData.stage || 1)
            };

            let bossResult = null;
            let rolledItemIds = [];
            let rolledRewards = [];

            if (isRetry) {
                // Firestore 保存済みデータを再利用（再抽選なし）
                bossResult = activeData.bossResultData || null;
                rolledRewards = Array.isArray(activeData.rolledRewards) ? activeData.rolledRewards : [];
                rolledItemIds = rolledRewards.length
                    ? rolledRewards.map((entry) => String(entry.itemId || '')).filter(Boolean)
                    : (activeData.rolledRewardIds || []);
                await restoreHpToFullOnce(activeRef, playFabId, { admin, promisifyPlayFab, PlayFabServer });
            } else {
                // 初回: BOSS抽選 → BOSS戦闘 → 報酬抽選 → Firestore保存 → HP全回復
                const selectedBoss = selectExplorationBoss(destination, Math.random, ship.shipClass);
                bossResult = await resolveBossBattle(playFabId, destination, selectedBoss, { promisifyPlayFab, PlayFabServer });

                const rewardCount = resolveRewardCount(bossResult, ship.shipClass);
                const gachaOptions = getExplorationGachaOptions(destination.id, ship);
                for (let i = 0; i < rewardCount; i++) {
                    const result = drawLocalGachaItem(catalogCache, gachaOptions);
                    if (result.itemId) {
                        rolledItemIds.push(result.itemId);
                        rolledRewards.push({
                            itemId: result.itemId,
                            displayName: result.displayName || result.itemId,
                            rarity: result.rarity || 'common',
                            category: result.category || ''
                        });
                    }
                }

                // 抽選結果と BOSS 結果を先に保存する。以降の失敗はリトライで同一結果を保証
                await activeRef.update({
                    rolledRewardIds: rolledItemIds,
                    rolledRewards,
                    bossResultData: bossResult,
                    hpRestored: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // HP全回復は Firestore で予約を取れた1リクエストだけが反映する
                await restoreHpToFullOnce(activeRef, playFabId, { admin, promisifyPlayFab, PlayFabServer });
            }

            // インデックスベースの idempotency キーで付与（itemId 非依存のためリトライ安全）
            const rewards = [];
            for (let i = 0; i < rolledItemIds.length; i++) {
                const itemId = rolledItemIds[i];
                await addEconomyItem(playFabId, itemId, 1, {
                    idempotencyId: `exploration-reward-${activeData.id}-${i}`
                });
                const rolled = rolledRewards[i] || {};
                const display = normalizeCatalogDisplayData(itemId, catalogCache?.[itemId] || {});
                rewards.push({
                    ...display,
                    Rarity: String(rolled.rarity || 'common'),
                    Category: String(rolled.category || '')
                });
            }

            const rewardItemId = rewards[0]?.ItemId || '';
            const reward = rewards[0] || null;
            const rewardDisplayName = rewards.length > 0
                ? rewards.map((r) => r.DisplayName).join('、')
                : '（なし）';
            const report = {
                id: String(activeData.id || `exp-${now}`),
                playFabId,
                destinationId: destination.id,
                destinationName: destination.name,
                shipId: ship.shipId,
                shipName: ship.shipName,
                shipClass: ship.shipClass,
                bossId: bossResult?.bossId || '',
                bossName: bossResult?.bossName || '',
                bossSpriteId: bossResult?.bossSpriteId || '',
                bossTier: bossResult?.bossTier || '',
                bossTierLabel: bossResult?.bossTierLabel || '',
                bossAppeared: bossResult?.bossAppeared || false,
                bossResult: bossResult
                    ? (bossResult.playerWon ? 'victory' : (bossResult.escaped || bossResult.draw ? 'escaped' : 'defeat'))
                    : 'none',
                bossLog: bossResult?.battleLog || '',
                rewardItemId: rewardItemId || '',
                rewardItemName: rewardDisplayName,
                rewardCount: rewards.length,
                rewardItems: rewards.map((item) => ({
                    itemId: item.ItemId,
                    displayName: item.DisplayName,
                    rarity: item.Rarity,
                    category: item.Category
                })),
                reportText: buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount: rewards.length }),
                completedAtMs: now,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await activeRef.collection('reports').doc(report.id).set(report);
            await activeRef.delete();
            res.json({ ...(await buildExplorationStatus(playFabId)), claimed: true, report: reportDocToPayload(report), reward });
        } catch (error) {
            console.error('[exploration/claim] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '探索結果の確認に失敗しました。', details: error?.errorMessage || error?.message || String(error) });
        }
    });
}

module.exports = {
    initializeExplorationRoutes,
    __test: {
        DESTINATIONS,
        EXPLORATION_BOSSES,
        EXPLORATION_SHIP_ROLES,
        BOSS_TIER_DEFS,
        buildDailyFreeExplorationStatus,
        canShipClassExploreDestination,
        getAllDestinationsForShipClass,
        getAvailableDestinationsForShipClass,
        getDestinationBosses,
        getExplorationBossWeight,
        getExplorationShipAccessClasses,
        getExplorationShipClassLabel,
        getJstDayKey,
        isDailyFreeExplorationDestination,
        selectExplorationBoss,
        resolveRewardCount,
        publicDestination
    }
};

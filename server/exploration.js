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
const TROY_MENU_CONSUMABLE_ID_PREFIX = 'troy_menu_';
const EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY = Object.freeze({
    low: 1,
    medium: 2,
    high: 3
});
const EXPLORATION_MAX_EXTRA_SUPPLY_UNITS = 3;
const EXPLORATION_ALCOHOL_MENU_CATEGORIES = new Set([
    'beer',
    'gin',
    'liqueur',
    'rum',
    'tequila',
    'vodka',
    'whisky'
]);
const EXPLORATION_PAYMENT_METHODS = new Set(['free', 'consumable', 'gold']);
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
        rewardHint: '勝利時お宝1個',
        bossWeightHint: '強BOSS寄り',
        categoryWeights: { Weapon: 58, Armor: 12, Shield: 15, Consumable: 15 },
        bossWeightAdjustments: { weak: -20, medium: 5, strong: 15 }
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
        rewardHint: 'お宝1個',
        bossWeightHint: '回収優先',
        categoryWeights: { Weapon: 18, Armor: 22, Shield: 15, Consumable: 45 },
        bossWeightAdjustments: { weak: 5, medium: 5, strong: -10 }
    }
};

const EXPLORATION_DAILY_RARITY_ORDER = ['low', 'medium', 'high'];
const EXPLORATION_DESTINATION_RARITIES = {
    low: {
        rarity: 'low',
        rarityLabel: '低レア',
        slot: 1,
        slotLabel: '本日の近海',
        classes: ['common'],
        dailyFreeEligible: true,
        gachaProfileId: 'low'
    },
    medium: {
        rarity: 'medium',
        rarityLabel: '中レア',
        slot: 2,
        slotLabel: '本日の航路',
        classes: ['explorer'],
        dailyFreeEligible: false,
        gachaProfileId: 'medium'
    },
    high: {
        rarity: 'high',
        rarityLabel: '高レア',
        slot: 3,
        slotLabel: '本日の危険海域',
        classes: ['merchant', 'fighter', 'defender'],
        dailyFreeEligible: false,
        gachaProfileId: 'high'
    }
};

function defineDestination(rarity, config) {
    const rarityDef = EXPLORATION_DESTINATION_RARITIES[rarity] || EXPLORATION_DESTINATION_RARITIES.low;
    return {
        ...config,
        rarity: rarityDef.rarity,
        rarityLabel: rarityDef.rarityLabel,
        slot: rarityDef.slot,
        slotLabel: rarityDef.slotLabel,
        classes: Array.isArray(config.classes) ? config.classes : rarityDef.classes,
        dailyFreeEligible: config.dailyFreeEligible ?? rarityDef.dailyFreeEligible,
        gachaProfileId: config.gachaProfileId || rarityDef.gachaProfileId
    };
}

const DESTINATIONS = {
    near_sea: defineDestination('low', {
        id: 'near_sea',
        name: '近海の漂流箱',
        description: '初期ボートでも向かえる短距離探索。',
        imagePath: './Sprites/exploration_destinations/near_sea_drift_crate.png',
        cost: 100,
        durationMs: 3 * HOUR_MS,
        bosses: ['treasure_slime', 'puffer_bomb', 'mimic_chest'],
        recommendedLevel: 6,
        riskLabel: '低リスク',
        rewardHint: '基本報酬'
    }),
    palm_islet: defineDestination('low', {
        id: 'palm_islet',
        name: '椰子の小島',
        description: '小さな無人島を巡る短距離探索。弱い装備を拾いやすい。',
        imagePath: './Sprites/exploration_destinations/palm_islet.png',
        cost: 120,
        durationMs: 3 * HOUR_MS,
        bosses: ['treasure_slime', 'skeletal_parrot', 'crab_brute'],
        recommendedLevel: 7,
        riskLabel: '低リスク',
        rewardHint: '序盤装備'
    }),
    coral_lagoon: defineDestination('low', {
        id: 'coral_lagoon',
        name: '珊瑚の潟',
        description: '穏やかな潟を進む低レア探索。装備枠を埋めやすい。',
        imagePath: './Sprites/exploration_destinations/coral_lagoon.png',
        cost: 140,
        durationMs: 4 * HOUR_MS,
        bosses: ['puffer_bomb', 'coral_goblin', 'crab_brute'],
        recommendedLevel: 7,
        riskLabel: '低リスク',
        rewardHint: '序盤装備'
    }),
    coral_passage: defineDestination('medium', {
        id: 'coral_passage',
        name: '珊瑚礁の抜け道',
        description: '浅瀬を抜ける明るい航路。小型の魔物が多い。',
        imagePath: './Sprites/exploration_destinations/coral_passage_reef.png',
        cost: 180,
        durationMs: 4 * HOUR_MS,
        bosses: ['skeletal_parrot', 'coral_goblin'],
        recommendedLevel: 7,
        riskLabel: '中リスク',
        rewardHint: '素材と消耗品'
    }),
    old_lighthouse: defineDestination('medium', {
        id: 'old_lighthouse',
        name: '古代灯台跡',
        description: '探索船が見つけやすい古い航路。',
        imagePath: './Sprites/exploration_destinations/old_lighthouse_ruins.png',
        cost: 250,
        durationMs: 5 * HOUR_MS,
        bosses: ['lantern_wraith', 'ghost_pirate'],
        recommendedLevel: 11,
        riskLabel: '中リスク',
        rewardHint: '武器と防具'
    }),
    sunken_trader: defineDestination('medium', {
        id: 'sunken_trader',
        name: '沈没商船',
        description: '積荷の多い沈没船を調べる中距離探索。',
        imagePath: './Sprites/exploration_destinations/sunken_trader_wreck.png',
        cost: 300,
        durationMs: 6 * HOUR_MS,
        bosses: ['zombie_raider', 'drowned_buccaneer'],
        recommendedLevel: 11,
        riskLabel: '回収向け',
        rewardHint: '積荷回収'
    }),
    ship_graveyard: defineDestination('medium', {
        id: 'ship_graveyard',
        name: '船の墓場',
        description: '古い船骸が集まる海域。盾と防具の材料が多い。',
        imagePath: './Sprites/exploration_destinations/ship_graveyard.png',
        cost: 320,
        durationMs: 6 * HOUR_MS,
        bosses: ['anchor_golem', 'cursed_shipwheel'],
        recommendedLevel: 22,
        riskLabel: '中リスク',
        rewardHint: '防具と盾'
    }),
    pirate_cove: defineDestination('medium', {
        id: 'pirate_cove',
        name: '海賊の隠れ家',
        description: '戦闘向きの船で挑む危険な海域。',
        imagePath: './Sprites/exploration_destinations/pirate_cove_hideout.png',
        cost: 400,
        durationMs: 8 * HOUR_MS,
        bosses: ['skeleton_captain', 'shark_raider'],
        recommendedLevel: 15,
        riskLabel: '高リスク',
        rewardHint: '武器報酬狙い'
    }),
    deep_maelstrom: defineDestination('medium', {
        id: 'deep_maelstrom',
        name: '深海の渦',
        description: '渦潮の奥へ踏み込む高難度の探索先。',
        imagePath: './Sprites/exploration_destinations/deep_maelstrom_whirlpool.png',
        cost: 550,
        durationMs: 10 * HOUR_MS,
        bosses: ['blue_kraken', 'merfolk_lancer'],
        recommendedLevel: 19,
        riskLabel: '高耐久向け',
        rewardHint: '防具と盾'
    }),
    megalodon_reef: defineDestination('high', {
        id: 'megalodon_reef',
        name: '鎖鮫の暗礁',
        description: '鎖をまとった巨大鮫が回遊する危険海域。',
        imagePath: './Sprites/exploration_destinations/shark_fin.png',
        cost: 650,
        durationMs: 10 * HOUR_MS,
        bosses: ['chained_megalodon'],
        recommendedLevel: 24,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    specter_whale_sea: defineDestination('high', {
        id: 'specter_whale_sea',
        name: '亡霊鯨の海域',
        description: '霧の奥で亡霊鯨が潮を巻き上げる。',
        imagePath: './Sprites/exploration_destinations/whale_tail.png',
        cost: 680,
        durationMs: 10 * HOUR_MS,
        bosses: ['specter_whale'],
        recommendedLevel: 25,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    armored_kraken_nest: defineDestination('high', {
        id: 'armored_kraken_nest',
        name: '甲冑クラーケンの巣',
        description: '岩礁の下で甲冑のクラーケンが待つ。',
        imagePath: './Sprites/exploration_destinations/kraken_tentacles.png',
        cost: 720,
        durationMs: 11 * HOUR_MS,
        bosses: ['armored_kraken'],
        recommendedLevel: 28,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    phantom_admiral_marsh: defineDestination('high', {
        id: 'phantom_admiral_marsh',
        name: '亡霊提督の沼海',
        description: '沼のように重い海域で亡霊艦隊がさまよう。',
        imagePath: './Sprites/exploration_destinations/haunted_marsh.png',
        cost: 700,
        durationMs: 11 * HOUR_MS,
        bosses: ['phantom_admiral'],
        recommendedLevel: 26,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    abyss_angler_vents: defineDestination('high', {
        id: 'abyss_angler_vents',
        name: '深淵アンコウの海底孔',
        description: '泡立つ海底孔から深淵の灯りが漏れる。',
        imagePath: './Sprites/exploration_destinations/bubble_vents.png',
        cost: 740,
        durationMs: 11 * HOUR_MS,
        bosses: ['abyss_angler'],
        recommendedLevel: 27,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    cannon_hermit_fort: defineDestination('high', {
        id: 'cannon_hermit_fort',
        name: '砲台ヤドカリの海上砦',
        description: '海上砦の影から砲台ヤドカリが狙う。',
        imagePath: './Sprites/exploration_destinations/sea_fortress.png',
        cost: 760,
        durationMs: 12 * HOUR_MS,
        bosses: ['cannon_hermit'],
        recommendedLevel: 26,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    storm_serpent_current: defineDestination('high', {
        id: 'storm_serpent_current',
        name: '嵐海蛇の交差海流',
        description: '交差する潮の上を嵐の海蛇が走る。',
        imagePath: './Sprites/exploration_destinations/cross_current.png',
        cost: 800,
        durationMs: 12 * HOUR_MS,
        bosses: ['storm_serpent'],
        recommendedLevel: 29,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    manta_wraith_grotto: defineDestination('high', {
        id: 'manta_wraith_grotto',
        name: '亡霊マンタの青光洞',
        description: '青く光る洞窟に亡霊マンタが潜む。',
        imagePath: './Sprites/exploration_destinations/glowing_grotto.png',
        cost: 820,
        durationMs: 12 * HOUR_MS,
        bosses: ['manta_wraith'],
        recommendedLevel: 27,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    }),
    treasure_hermit_cave: defineDestination('high', {
        id: 'treasure_hermit_cave',
        name: '財宝ヤドカリの宝洞窟',
        description: '財宝の洞窟を背負うヤドカリが守る海域。',
        imagePath: './Sprites/exploration_destinations/treasure_cave.png',
        cost: 850,
        durationMs: 12 * HOUR_MS,
        bosses: ['treasure_hermit'],
        recommendedLevel: 30,
        riskLabel: '高リスク',
        rewardHint: '高レア報酬'
    })
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

function hashStringToUint32(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}

function getDestinationsByRarity(rarity) {
    return Object.values(DESTINATIONS)
        .filter((destination) => destination.rarity === rarity)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function getDailyExplorationDestinationEntries(playFabId, nowMs = Date.now()) {
    const dayKey = getJstDayKey(nowMs);
    const playerKey = String(playFabId || 'guest').trim() || 'guest';
    return EXPLORATION_DAILY_RARITY_ORDER
        .map((rarity) => {
            const candidates = getDestinationsByRarity(rarity);
            if (!candidates.length) return null;
            const hash = hashStringToUint32(`${dayKey}:${playerKey}:${rarity}`);
            return candidates[hash % candidates.length];
        })
        .filter(Boolean);
}

function getDailyExplorationDestinations(playFabId, shipClass = 'common', nowMs = Date.now()) {
    const normalized = normalizeExplorationShipClass(shipClass);
    return getDailyExplorationDestinationEntries(playFabId, nowMs)
        .map((destination) => publicDestination(destination, normalized));
}

function isDailyExplorationDestinationForPlayer(playFabId, destinationId, nowMs = Date.now()) {
    const normalizedDestinationId = normalizeDestinationId(destinationId);
    if (!normalizedDestinationId) return false;
    return getDailyExplorationDestinationEntries(playFabId, nowMs)
        .some((destination) => destination.id === normalizedDestinationId);
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

function parseBooleanFlag(value) {
    if (value === true || value === 1) return true;
    const key = String(value || '').trim().toLowerCase();
    return key === 'true' || key === '1' || key === 'yes';
}

function getExplorationRequiredSupplyUnits(destinationOrRarity) {
    const rarity = typeof destinationOrRarity === 'string'
        ? String(destinationOrRarity || '').trim().toLowerCase()
        : String(destinationOrRarity?.rarity || 'low').trim().toLowerCase();
    return EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY[rarity] || EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY.low;
}

function getExplorationRequiredConsumableCount(destinationOrRarity) {
    return getExplorationRequiredSupplyUnits(destinationOrRarity);
}

function getExplorationMaxSupplyUnits(requiredUnits) {
    return Math.max(0, Math.floor(Number(requiredUnits || 0) || 0)) + EXPLORATION_MAX_EXTRA_SUPPLY_UNITS;
}

function normalizeExplorationPaymentMethod(value) {
    if (value == null || value === '') return 'gold';
    const method = String(value || '').trim().toLowerCase();
    return EXPLORATION_PAYMENT_METHODS.has(method) ? method : '';
}

function getInventoryItemAmount(item) {
    return Math.max(0, Math.floor(Number(item?.Amount ?? item?.amount ?? item?.quantity ?? 0) || 0));
}

function getCatalogFriendlyId(itemData = {}, fallback = '') {
    const direct = String(itemData?.FriendlyId || itemData?.friendlyId || '').trim();
    if (direct) return direct;
    if (Array.isArray(itemData?.AlternateIds)) {
        const entry = itemData.AlternateIds.find((alt) => String(alt?.Type || '').trim().toLowerCase() === 'friendlyid');
        if (entry?.Value) return String(entry.Value).trim();
    }
    return String(fallback || '').trim();
}

function isTroyMenuConsumableCatalogItem(itemId, itemData = {}) {
    const friendlyId = getCatalogFriendlyId(itemData, itemId);
    return String(friendlyId || '').trim().toLowerCase().startsWith(TROY_MENU_CONSUMABLE_ID_PREFIX)
        || parseBooleanFlag(itemData?.TroyMenuConsumable)
        || parseBooleanFlag(itemData?.IsTroyMenuConsumable);
}

function normalizeMenuCategory(value) {
    return String(value || '').trim().toLowerCase();
}

function getTroyMenuConsumableEffectiveUnits(menuPrice) {
    const price = Math.max(0, Math.floor(Number(menuPrice || 0) || 0));
    if (price >= 2000) return 3;
    if (price >= 1000) return 2;
    return 1;
}

function normalizeTroyMenuConsumableEffectiveUnits(effectiveUnits, menuPrice) {
    const units = Math.floor(Number(effectiveUnits || 0) || 0);
    if (units >= 1) return Math.max(1, Math.min(3, units));
    return getTroyMenuConsumableEffectiveUnits(menuPrice);
}

function buildTroyMenuConsumablePaymentOptions(inventoryItems = [], catalogCache = {}) {
    const byFriendlyId = new Map();
    for (const item of Array.isArray(inventoryItems) ? inventoryItems : []) {
        const catalogItemId = String(item?.Id || item?.ItemId || item?.itemId || '').trim();
        if (!catalogItemId) continue;
        const itemData = catalogCache?.[catalogItemId] || {};
        const friendlyId = getCatalogFriendlyId(itemData, catalogItemId);
        if (!isTroyMenuConsumableCatalogItem(friendlyId, itemData)) continue;
        if (!String(friendlyId || '').trim().toLowerCase().startsWith(TROY_MENU_CONSUMABLE_ID_PREFIX)) continue;
        const amount = getInventoryItemAmount(item);
        if (amount <= 0) continue;
        const menuPrice = Math.max(0, Math.floor(Number(itemData?.MenuPrice || 0) || 0));
        const current = byFriendlyId.get(friendlyId) || {
            itemId: friendlyId,
            catalogItemId: String(itemData?.ItemId || catalogItemId),
            displayName: String(itemData?.DisplayName || itemData?.Title || item?.DisplayName || item?.Name || friendlyId),
            amount: 0,
            imagePath: String(itemData?.image_path || itemData?.sprite_path || itemData?.ImagePath || ''),
            menuCategory: normalizeMenuCategory(itemData?.MenuCategory || ''),
            menuPrice,
            effectiveUnits: getTroyMenuConsumableEffectiveUnits(menuPrice)
        };
        current.amount += amount;
        byFriendlyId.set(friendlyId, current);
    }
    return Array.from(byFriendlyId.values())
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'ja'));
}

function normalizePaymentConsumables(entries = []) {
    const byItemId = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        const itemId = String(entry?.itemId || entry?.ItemId || entry?.friendlyId || '').trim();
        const quantity = Math.max(0, Math.floor(Number(entry?.quantity ?? entry?.amount ?? entry?.Amount ?? 0) || 0));
        if (!itemId || quantity <= 0) continue;
        byItemId.set(itemId, (byItemId.get(itemId) || 0) + quantity);
    }
    return Array.from(byItemId.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

function buildExplorationSupplyProfile(consumedConsumables = [], requiredUnits = 0) {
    const required = Math.max(0, Math.floor(Number(requiredUnits || 0) || 0));
    const normalized = (Array.isArray(consumedConsumables) ? consumedConsumables : [])
        .map((item) => {
            const quantity = Math.max(0, Math.floor(Number(item?.quantity || 0) || 0));
            const effectiveUnits = normalizeTroyMenuConsumableEffectiveUnits(item?.effectiveUnits, item?.menuPrice);
            const supplyUnits = Math.max(0, Math.floor(Number(item?.supplyUnits ?? (quantity * effectiveUnits)) || 0));
            const menuPrice = Math.max(0, Math.floor(Number(item?.menuPrice || 0) || 0));
            return {
                itemId: String(item?.itemId || '').trim(),
                displayName: String(item?.displayName || item?.itemId || '').trim(),
                quantity,
                menuCategory: normalizeMenuCategory(item?.menuCategory || ''),
                menuPrice,
                effectiveUnits,
                supplyUnits
            };
        })
        .filter((item) => item.itemId && item.quantity > 0);
    const categoryCounts = {};
    const alcoholCategories = new Set();
    let totalUnits = 0;
    let totalMenuPrice = 0;
    let hasFood = false;
    let hasDrink = false;
    let hasCalmRoute = false;
    let hasPremium = false;
    for (const item of normalized) {
        const category = item.menuCategory || 'unknown';
        categoryCounts[category] = (categoryCounts[category] || 0) + item.quantity;
        totalUnits += item.supplyUnits;
        totalMenuPrice += item.menuPrice * item.quantity;
        if (category === 'food') hasFood = true;
        if (category && category !== 'food') hasDrink = true;
        if (EXPLORATION_ALCOHOL_MENU_CATEGORIES.has(category)) alcoholCategories.add(category);
        if (category === 'soft' || category === 'mixer') hasCalmRoute = true;
        if (item.effectiveUnits >= 3) hasPremium = true;
    }
    const surplusUnits = Math.max(0, totalUnits - required);
    const comboTags = [];
    const effectLabels = [];
    const addEffect = (tag, label) => {
        comboTags.push(tag);
        effectLabels.push(label);
    };
    if (hasFood && hasDrink) addEffect('food_drink', '食事と飲み物で撤退時の回収を支援');
    if (alcoholCategories.size >= 2) addEffect('diverse_spirits', '酒種の多様性で攻勢を強化');
    if (hasCalmRoute) addEffect('calm_route', '割り材/ソフトで守りを安定');
    if (hasPremium) addEffect('premium_supply', '高級品で宝箱の質を底上げ');
    if (surplusUnits > 0) addEffect('extra_supply', '余剰補給で探索精度を向上');
    return {
        requiredUnits: required,
        maxUnits: getExplorationMaxSupplyUnits(required),
        totalUnits,
        surplusUnits,
        totalMenuPrice,
        categoryCounts,
        comboTags,
        effectLabels
    };
}

function normalizeExplorationSupplyProfile(profile = null) {
    if (!profile || typeof profile !== 'object') {
        return buildExplorationSupplyProfile([], 0);
    }
    const requiredUnits = Math.max(0, Math.floor(Number(profile.requiredUnits || 0) || 0));
    const totalUnits = Math.max(0, Math.floor(Number(profile.totalUnits || 0) || 0));
    const surplusUnits = Math.max(0, Math.floor(Number(profile.surplusUnits ?? (totalUnits - requiredUnits)) || 0));
    return {
        requiredUnits,
        maxUnits: Math.max(getExplorationMaxSupplyUnits(requiredUnits), Math.floor(Number(profile.maxUnits || 0) || 0)),
        totalUnits,
        surplusUnits,
        totalMenuPrice: Math.max(0, Math.floor(Number(profile.totalMenuPrice || 0) || 0)),
        categoryCounts: profile.categoryCounts && typeof profile.categoryCounts === 'object' ? { ...profile.categoryCounts } : {},
        comboTags: Array.isArray(profile.comboTags) ? profile.comboTags.map((tag) => String(tag || '')).filter(Boolean) : [],
        effectLabels: Array.isArray(profile.effectLabels) ? profile.effectLabels.map((label) => String(label || '')).filter(Boolean) : []
    };
}

function validateExplorationConsumablePayment(paymentConsumables, ownedConsumables, requiredUnits) {
    const required = Math.max(0, Math.floor(Number(requiredUnits || 0) || 0));
    const selected = normalizePaymentConsumables(paymentConsumables);
    const maxUnits = getExplorationMaxSupplyUnits(required);
    if (required <= 0) return { ok: true, consumedConsumables: [], supplyProfile: buildExplorationSupplyProfile([], 0) };
    const ownedById = new Map((ownedConsumables || []).map((item) => [String(item.itemId || ''), item]));
    const consumedConsumables = [];
    let totalUnits = 0;
    for (const entry of selected) {
        const owned = ownedById.get(entry.itemId);
        if (!owned || Number(owned.amount || 0) < entry.quantity) {
            return {
                ok: false,
                error: '選択した消耗品の所持数が不足しています。'
            };
        }
        const effectiveUnits = normalizeTroyMenuConsumableEffectiveUnits(owned.effectiveUnits, owned.menuPrice);
        const supplyUnits = effectiveUnits * entry.quantity;
        totalUnits += supplyUnits;
        consumedConsumables.push({
            itemId: entry.itemId,
            displayName: String(owned.displayName || entry.itemId),
            quantity: entry.quantity,
            menuCategory: normalizeMenuCategory(owned.menuCategory || ''),
            menuPrice: Math.max(0, Math.floor(Number(owned.menuPrice || 0) || 0)),
            effectiveUnits,
            supplyUnits
        });
    }
    if (totalUnits < required) {
        return {
            ok: false,
            error: `探索に使う供給力が不足しています。供給力${required}以上を選択してください。`
        };
    }
    if (totalUnits > maxUnits) {
        return {
            ok: false,
            error: `探索に投入できる供給力の上限を超えています。供給力${maxUnits}以下にしてください。`
        };
    }
    return {
        ok: true,
        consumedConsumables,
        supplyProfile: buildExplorationSupplyProfile(consumedConsumables, required)
    };
}

async function buildExplorationPaymentState(playFabId, deps = {}) {
    const state = {
        requiredByRarity: { ...EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY },
        maxExtraSupplyUnits: EXPLORATION_MAX_EXTRA_SUPPLY_UNITS,
        consumables: []
    };
    const { getEntityKeyForPlayFabId, getAllInventoryItems, catalogCache } = deps;
    if (typeof getEntityKeyForPlayFabId !== 'function' || typeof getAllInventoryItems !== 'function') {
        return state;
    }
    try {
        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const inventoryItems = await getAllInventoryItems(entityKey);
        state.consumables = buildTroyMenuConsumablePaymentOptions(inventoryItems, catalogCache);
    } catch (error) {
        console.warn('[exploration/payment] inventory load failed:', playFabId, error?.errorMessage || error?.message || error);
    }
    return state;
}

function publicDestination(destination, shipClass = 'common') {
    const bosses = getDestinationBosses(destination);
    const role = getExplorationShipRole(shipClass);
    const normalizedShipClass = normalizeExplorationShipClass(shipClass);
    const requirementLabels = getDestinationRequirementLabels(destination);
    const requiredSupplyUnits = getExplorationRequiredSupplyUnits(destination);
    return {
        id: destination.id,
        name: destination.name,
        description: destination.description,
        imagePath: destination.imagePath || '',
        rarity: destination.rarity || 'low',
        rarityLabel: destination.rarityLabel || '',
        slot: Number(destination.slot || 0),
        slotLabel: destination.slotLabel || '',
        recommendedLevel: Math.max(1, Math.floor(Number(destination.recommendedLevel || 1) || 1)),
        cost: destination.cost,
        requiredSupplyUnits,
        requiredConsumableCount: requiredSupplyUnits,
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
    const destination = DESTINATIONS[String(data.destinationId || '')] || null;
    const requiredSupplyUnits = Math.max(0, Math.floor(Number(data.requiredSupplyUnits ?? data.requiredConsumableCount ?? 0) || 0));
    const consumedConsumables = Array.isArray(data.consumedConsumables)
        ? data.consumedConsumables.map((item) => {
            const quantity = Math.max(0, Math.floor(Number(item.quantity || 0) || 0));
            const menuPrice = Math.max(0, Math.floor(Number(item.menuPrice || 0) || 0));
            const effectiveUnits = normalizeTroyMenuConsumableEffectiveUnits(item.effectiveUnits, menuPrice);
            return {
                itemId: String(item.itemId || ''),
                displayName: String(item.displayName || item.itemId || ''),
                quantity,
                menuCategory: normalizeMenuCategory(item.menuCategory || ''),
                menuPrice,
                effectiveUnits,
                supplyUnits: Math.max(0, Math.floor(Number(item.supplyUnits ?? (quantity * effectiveUnits)) || 0))
            };
        }).filter((item) => item.itemId && item.quantity > 0)
        : [];
    const supplyProfile = data.supplyProfile
        ? normalizeExplorationSupplyProfile(data.supplyProfile)
        : buildExplorationSupplyProfile(consumedConsumables, requiredSupplyUnits);
    return {
        id: String(data.id || ''),
        status: 'active',
        destinationId: String(data.destinationId || ''),
        destinationName: String(data.destinationName || ''),
        imagePath: String(data.imagePath || destination?.imagePath || ''),
        shipId: String(data.shipId || ''),
        shipName: String(data.shipName || ''),
        shipClass: String(data.shipClass || ''),
        shipStage: Number(data.shipStage || data.stage || 1) || 1,
        startedAtMs: Number(data.startedAtMs || 0),
        completesAtMs: Number(data.completesAtMs || 0),
        cost: Number(data.cost || 0),
        chargedCost: Number(data.chargedCost || 0),
        paymentMethod: String(data.paymentMethod || ''),
        requiredSupplyUnits,
        requiredConsumableCount: requiredSupplyUnits,
        consumedConsumables,
        supplyProfile
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
    const destination = DESTINATIONS[String(data.destinationId || '')] || null;
    const rewardItems = Array.isArray(data.rewardItems) ? data.rewardItems.map((item) => ({
        itemId: String(item.itemId || item.ItemId || ''),
        displayName: String(item.displayName || item.DisplayName || item.itemId || item.ItemId || ''),
        rarity: String(item.rarity || 'common'),
        category: String(item.category || '')
    })) : [];
    const supplyProfile = data.supplyProfile ? normalizeExplorationSupplyProfile(data.supplyProfile) : null;
    return {
        id: doc.id || String(data.id || ''),
        destinationId: String(data.destinationId || ''),
        destinationName: String(data.destinationName || ''),
        imagePath: String(data.imagePath || destination?.imagePath || ''),
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
        supplyProfile,
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
    },
    chained_megalodon: {
        id: 'chained_megalodon',
        name: '鎖縛のメガロドン',
        spriteId: 'chained_megalodon',
        tier: 'strong',
        level: 24,
        hp: 300,
        attack: 40,
        defense: 18,
        strength: 36,
        guard: 18,
        agility: 22,
        weapon: 'axe',
        skills: [
            { type: 'weapon', weapon: 'axe', name: '鎖牙の突進', procChance: 0.2, powerMultiplier: 1.25 },
            { type: 'passive', weapon: 'axe', name: '血潮の追跡', level: 3 }
        ]
    },
    specter_whale: {
        id: 'specter_whale',
        name: '亡霊鯨',
        spriteId: 'specter_whale',
        tier: 'strong',
        level: 25,
        hp: 340,
        attack: 38,
        defense: 22,
        strength: 32,
        guard: 24,
        agility: 12,
        mp: 28,
        weapon: 'blunt',
        magicPower: 18,
        skills: [
            { type: 'magic', weapon: 'blunt', magicKind: 'attack', name: '亡霊潮吹き', mpCost: 8, minRange: 1, maxRange: 2, powerMultiplier: 1.2 },
            { type: 'passive', weapon: 'blunt', name: '霊鯨の耐性', level: 3 }
        ]
    },
    armored_kraken: {
        id: 'armored_kraken',
        name: '甲冑クラーケン',
        spriteId: 'armored_kraken',
        tier: 'strong',
        level: 28,
        hp: 360,
        attack: 44,
        defense: 24,
        strength: 38,
        guard: 25,
        agility: 16,
        weapon: 'axe',
        skills: [
            { type: 'weapon', weapon: 'axe', name: '装甲触腕', procChance: 0.2, powerMultiplier: 1.28 },
            { type: 'passive', weapon: 'axe', name: '深海装甲', level: 3 }
        ]
    },
    phantom_admiral: {
        id: 'phantom_admiral',
        name: '亡霊提督',
        spriteId: 'phantom_admiral',
        tier: 'strong',
        level: 26,
        hp: 280,
        attack: 38,
        defense: 20,
        strength: 30,
        guard: 20,
        agility: 20,
        mp: 40,
        weapon: 'staff',
        magicPower: 28,
        skills: [
            { type: 'magic', weapon: 'staff', magicKind: 'attack', name: '提督の号令', mpCost: 9, minRange: 1, maxRange: 2, powerMultiplier: 1.24 },
            { type: 'passive', weapon: 'staff', name: '亡霊艦隊', level: 3 }
        ]
    },
    abyss_angler: {
        id: 'abyss_angler',
        name: '深淵アンコウ',
        spriteId: 'abyss_angler',
        tier: 'strong',
        level: 27,
        hp: 320,
        attack: 42,
        defense: 21,
        strength: 36,
        guard: 22,
        agility: 14,
        mp: 24,
        weapon: 'blunt',
        magicPower: 20,
        skills: [
            { type: 'magic', weapon: 'blunt', magicKind: 'attack', name: '深淵の誘光', mpCost: 8, minRange: 1, maxRange: 2, powerMultiplier: 1.22 },
            { type: 'weapon', weapon: 'blunt', name: '顎門の強襲', procChance: 0.2, powerMultiplier: 1.25 }
        ]
    },
    cannon_hermit: {
        id: 'cannon_hermit',
        name: '砲台ヤドカリ',
        spriteId: 'cannon_hermit',
        tier: 'strong',
        level: 26,
        hp: 330,
        attack: 45,
        defense: 26,
        strength: 36,
        guard: 28,
        agility: 10,
        weapon: 'gun',
        skills: [
            { type: 'weapon', weapon: 'gun', name: '甲羅砲撃', procChance: 0.2, powerMultiplier: 1.28 },
            { type: 'passive', weapon: 'gun', name: '重装甲', level: 3 }
        ]
    },
    storm_serpent: {
        id: 'storm_serpent',
        name: '嵐海蛇',
        spriteId: 'storm_serpent',
        tier: 'strong',
        level: 29,
        hp: 310,
        attack: 46,
        defense: 19,
        strength: 40,
        guard: 19,
        agility: 28,
        weapon: 'polearm',
        skills: [
            { type: 'weapon', weapon: 'polearm', name: '嵐牙の穿ち', procChance: 0.22, powerMultiplier: 1.28 },
            { type: 'passive', weapon: 'polearm', name: '暴風遊泳', level: 3 }
        ]
    },
    manta_wraith: {
        id: 'manta_wraith',
        name: '亡霊マンタ',
        spriteId: 'manta_wraith',
        tier: 'strong',
        level: 27,
        hp: 290,
        attack: 39,
        defense: 20,
        strength: 30,
        guard: 22,
        agility: 24,
        mp: 42,
        weapon: 'staff',
        magicPower: 30,
        skills: [
            { type: 'magic', weapon: 'staff', magicKind: 'attack', name: '亡霊翼の波動', mpCost: 9, minRange: 1, maxRange: 2, powerMultiplier: 1.26 },
            { type: 'passive', weapon: 'staff', name: '霊翼の集中', level: 3 }
        ]
    },
    treasure_hermit: {
        id: 'treasure_hermit',
        name: '財宝ヤドカリ',
        spriteId: 'treasure_hermit',
        tier: 'strong',
        level: 30,
        hp: 390,
        attack: 43,
        defense: 28,
        strength: 36,
        guard: 30,
        agility: 9,
        weapon: 'shield',
        skills: [
            { type: 'passive', weapon: 'shield', name: '宝殻の守り', level: 4 },
            { type: 'weapon', weapon: 'shield', name: '財宝殻撃ち', procChance: 0.2, powerMultiplier: 1.25 }
        ]
    }
};

const DEFAULT_EXPLORATION_GACHA_PROFILES = {
    low: {
        categoryWeights: { Weapon: 30, Armor: 25, Shield: 25, Accessory: 15, Consumable: 5 },
        rarityWeights: { common: 94, rare: 5, epic: 0.8, legendary: 0.2 }
    },
    medium: {
        categoryWeights: { Weapon: 28, Armor: 24, Shield: 20, Accessory: 12, Consumable: 16 },
        rarityWeights: { common: 78, rare: 16, epic: 5, legendary: 1 }
    },
    high: {
        categoryWeights: { Weapon: 45, Armor: 20, Shield: 20, Accessory: 10, Consumable: 5 },
        rarityWeights: { common: 46, rare: 28, epic: 17, legendary: 9 }
    }
};

const EXPLORATION_SHIP_STAGE_GACHA_LIMITS = {
    1: {
        rarityWeights: { common: 100, rare: 0, epic: 0, legendary: 0 },
        maxStatsByCategory: {
            Weapon: { Power: 20 },
            Armor: { Defense: 12 },
            Shield: { Defense: 18 },
            Accessory: { Score: 12 }
        }
    },
    2: {
        rarityWeights: { common: 88, rare: 10, epic: 1.8, legendary: 0.2 },
        maxStatsByCategory: {
            Weapon: { Power: 45 },
            Armor: { Defense: 35 },
            Shield: { Defense: 38 },
            Accessory: { Score: 35 }
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

function applyExplorationSupplyToGachaOptions(options = {}, supplyProfile = null) {
    const profile = normalizeExplorationSupplyProfile(supplyProfile);
    if (!profile.comboTags.length && profile.surplusUnits <= 0) {
        return {
            ...options,
            rarityWeights: { ...(options.rarityWeights || {}) },
            categoryWeights: { ...(options.categoryWeights || {}) },
            allowedCategories: Array.isArray(options.allowedCategories) ? [...options.allowedCategories] : [],
            supplyProfile: profile
        };
    }
    const tags = new Set(profile.comboTags);
    const rarityWeights = { ...(options.rarityWeights || {}) };
    const qualityLevel = Math.min(5,
        Math.max(0, Math.floor(Number(profile.surplusUnits || 0) || 0))
        + (tags.has('premium_supply') ? 1 : 0)
        + (tags.has('diverse_spirits') ? 1 : 0)
    );
    if (qualityLevel > 0) {
        if (rarityWeights.rare > 0) rarityWeights.rare = Math.round(rarityWeights.rare * (100 + qualityLevel * 15)) / 100;
        if (rarityWeights.epic > 0) rarityWeights.epic = Math.round(rarityWeights.epic * (100 + qualityLevel * 10)) / 100;
        if (rarityWeights.legendary > 0) rarityWeights.legendary = Math.round(rarityWeights.legendary * (100 + qualityLevel * 5)) / 100;
    }
    const categoryWeights = { ...(options.categoryWeights || {}) };
    const addCategoryWeight = (category, amount) => {
        if (!categoryWeights[category] || Number(categoryWeights[category] || 0) <= 0) return;
        categoryWeights[category] = Math.max(1, Number(categoryWeights[category] || 0) + amount);
    };
    if (tags.has('food_drink')) {
        addCategoryWeight('Armor', 5);
        addCategoryWeight('Shield', 5);
        addCategoryWeight('Accessory', 5);
    }
    if (tags.has('diverse_spirits')) {
        addCategoryWeight('Weapon', 8);
        addCategoryWeight('Accessory', 4);
    }
    if (tags.has('calm_route')) {
        addCategoryWeight('Armor', 6);
        addCategoryWeight('Shield', 8);
    }
    if (tags.has('premium_supply')) {
        addCategoryWeight('Accessory', 6);
        addCategoryWeight('Weapon', 4);
    }
    return {
        ...options,
        rarityWeights,
        categoryWeights,
        allowedCategories: Object.entries(categoryWeights)
            .filter(([, weight]) => Number(weight || 0) > 0)
            .map(([category]) => category),
        supplyProfile: profile
    };
}

function getExplorationGachaOptions(destinationId, ship = {}, supplyProfile = null) {
    const destination = DESTINATIONS[normalizeDestinationId(destinationId)] || null;
    const profileId = destination?.gachaProfileId || destination?.rarity || destinationId || 'low';
    const profile = EXPLORATION_GACHA_PROFILES[profileId] || EXPLORATION_GACHA_PROFILES.low;
    const stageLimit = EXPLORATION_SHIP_STAGE_GACHA_LIMITS[normalizeShipStage(ship.stage)] || EXPLORATION_SHIP_STAGE_GACHA_LIMITS[1];
    const role = getExplorationShipRole(ship.shipClass);
    const categoryWeights = {
        ...profile.categoryWeights,
        ...(profileId === 'low' ? {} : (role.categoryWeights || {}))
    };
    return applyExplorationSupplyToGachaOptions({
        ...profile,
        rarityWeights: {
            ...profile.rarityWeights,
            ...stageLimit.rarityWeights
        },
        categoryWeights,
        allowedCategories: Object.entries(categoryWeights)
            .filter(([, weight]) => Number(weight || 0) > 0)
            .map(([category]) => category),
        maxStatsByCategory: stageLimit.maxStatsByCategory
    }, supplyProfile);
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

function hasExplorationSupplyTag(supplyProfile, tag) {
    return normalizeExplorationSupplyProfile(supplyProfile).comboTags.includes(tag);
}

function boostBattleValue(container, key, multiplier) {
    if (!container || !key || !Number.isFinite(multiplier) || multiplier <= 1) return;
    const current = Number(container[key] || 0);
    if (!Number.isFinite(current) || current <= 0) return;
    container[key] = Math.max(1, Math.round(current * multiplier));
}

function applyExplorationSupplyToBattleProfile(player, supplyProfile = null) {
    const profile = normalizeExplorationSupplyProfile(supplyProfile);
    if (!profile.comboTags.length && profile.surplusUnits <= 0) return [];
    const tags = new Set(profile.comboTags);
    player.stats = player.stats || {};
    player.equipmentStats = player.equipmentStats || {};
    const surplusMultiplier = 1 + Math.min(3, Math.max(0, profile.surplusUnits)) * 0.02;
    let allMultiplier = surplusMultiplier;
    if (tags.has('premium_supply')) allMultiplier += 0.05;
    if (allMultiplier > 1) {
        ['MaxHP', 'HP', 'CurrentHP', 'ちから', 'みのまもり'].forEach((key) => boostBattleValue(player.stats, key, allMultiplier));
        ['Power', 'Defense'].forEach((key) => boostBattleValue(player.equipmentStats, key, allMultiplier));
    }
    if (tags.has('diverse_spirits')) {
        boostBattleValue(player.stats, 'ちから', 1.05);
        boostBattleValue(player.equipmentStats, 'Power', 1.05);
    }
    if (tags.has('calm_route')) {
        boostBattleValue(player.stats, 'MaxHP', 1.07);
        boostBattleValue(player.stats, 'HP', 1.07);
        boostBattleValue(player.stats, 'CurrentHP', 1.07);
        boostBattleValue(player.stats, 'みのまもり', 1.07);
        boostBattleValue(player.equipmentStats, 'Defense', 1.07);
    }
    player.stats.CurrentHP = Math.max(1, Number(player.stats.CurrentHP || player.stats.HP || player.stats.MaxHP || 30));
    return profile.effectLabels.length
        ? [`補給効果: ${profile.effectLabels.join(' / ')}`]
        : [];
}

// 宝箱の中身は基本1個。通常敗北のみ0個、守備船や補給効果は敗北時も最低1個。
function resolveRewardCount(bossResult, shipClass, supplyProfile = null) {
    const role = getExplorationShipRole(shipClass);
    let base;
    if (!bossResult || !bossResult.bossAppeared) {
        base = 1;
    } else if (bossResult.playerWon) {
        base = 1;
    } else if (bossResult.escaped || bossResult.draw) {
        base = 1;
    } else {
        base = 0;
    }
    if (role.defeatRewardFloor && bossResult?.bossAppeared && !bossResult.playerWon && !bossResult.escaped && !bossResult.draw) {
        base = Math.max(base, Number(role.defeatRewardFloor || 0));
    }
    if (hasExplorationSupplyTag(supplyProfile, 'food_drink') && bossResult?.bossAppeared && !bossResult.playerWon && !bossResult.escaped && !bossResult.draw) {
        base = Math.max(base, 1);
    }
    return Math.max(0, Math.min(1, base));
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
async function resolveBossBattle(playFabId, destination, bossBase, { promisifyPlayFab, PlayFabServer }, supplyProfile = null) {
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
    const supplyBattleLogLines = applyExplorationSupplyToBattleProfile(player, supplyProfile);
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
            ...supplyBattleLogLines,
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

function buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount, supplyProfile = null }) {
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
    const normalizedSupplyProfile = normalizeExplorationSupplyProfile(supplyProfile);
    if (normalizedSupplyProfile.effectLabels.length) {
        lines.push(`補給効果: ${normalizedSupplyProfile.effectLabels.join(' / ')}`);
    }
    if (rewardCount > 0) lines.push(`発見したお宝 (${rewardCount}個): ${rewardDisplayName}`);
    else lines.push('お宝は得られませんでした。');
    return lines.join('\n');
}

function getAvailableDestinationsForShipClass(shipClass, playFabId = 'daily-preview', nowMs = Date.now()) {
    const normalized = normalizeExplorationShipClass(shipClass);
    return getDailyExplorationDestinations(playFabId, normalized, nowMs);
}

function getAllDestinationsForShipClass(shipClass, playFabId = 'daily-preview', nowMs = Date.now()) {
    const normalized = normalizeExplorationShipClass(shipClass);
    return getDailyExplorationDestinations(playFabId, normalized, nowMs);
}

function initializeExplorationRoutes(app, deps) {
    const { firestore, admin, promisifyPlayFab, PlayFabServer, subtractEconomyItem, addEconomyItem, getCurrencyBalance, requireAuthenticatedPlayFabId, catalogCache, getEntityKeyForPlayFabId, getAllInventoryItems } = deps;
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
        const now = Date.now();
        const dailyDestinations = ship
            ? getDailyExplorationDestinations(playFabId, ship.shipClass, now)
            : [];
        const activeSnap = await firestore.collection(EXPLORATION_COLLECTION).doc(playFabId).get();
        const dayKey = getJstDayKey(now);
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
        const explorationPayment = await buildExplorationPaymentState(playFabId, {
            getEntityKeyForPlayFabId,
            getAllInventoryItems,
            catalogCache
        });
        return {
            success: true,
            ship,
            destinations: dailyDestinations,
            allDestinations: dailyDestinations,
            explorationPayment,
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
        const requestedPaymentMethod = normalizeExplorationPaymentMethod(req.body?.paymentMethod);
        if (!requestedPaymentMethod) {
            return res.status(400).json({ error: '支払い方法が不正です。' });
        }
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const ship = await resolveActiveShip(playFabId, deps);
            if (!ship) return res.status(400).json({ error: '探索には使用中の船が必要です。' });
            const destination = DESTINATIONS[destinationId];
            const now = Date.now();
            if (!isDailyExplorationDestinationForPlayer(playFabId, destinationId, now)) {
                return res.status(403).json({ error: 'この行き先は本日の探索先ではありません。' });
            }
            if (!canShipClassExploreDestination(ship.shipClass, destination)) {
                return res.status(403).json({ error: 'この船では選択した行き先に向かえません。' });
            }
            const dailyFreeEligible = isDailyFreeExplorationDestination(destination);
            const dayKey = getJstDayKey(now);
            const explorationId = `exp-${now}-${Math.random().toString(36).slice(2, 8)}`;
            const activeRef = firestore.collection(EXPLORATION_COLLECTION).doc(playFabId);
            const dailyFreeRef = activeRef.collection(DAILY_FREE_SUBCOLLECTION).doc(dayKey);
            let dailyFreeUsed = false;
            let paymentMethod = requestedPaymentMethod;
            let chargedCost = requestedPaymentMethod === 'gold' ? destination.cost : 0;
            const requiredSupplyUnits = getExplorationRequiredSupplyUnits(destination);
            const requiredConsumableCount = requiredSupplyUnits;
            let consumedConsumables = [];
            let supplyProfile = null;

            // フルペイロードを持つ pending を先に Firestore に確保する。
            // これにより: 通貨減算前に保存するためユーザー資産は安全。
            // active flip (step3) が失敗しても pending にデータが残り claim から自動復旧可能。
            const fullPayload = {
                id: explorationId,
                status: 'pending',
                playFabId,
                destinationId,
                destinationName: destination.name,
                imagePath: destination.imagePath || '',
                shipId: ship.shipId,
                shipName: ship.shipName,
                shipClass: ship.shipClass,
                shipStage: normalizeShipStage(ship.stage),
                cost: destination.cost,
                chargedCost,
                paymentMethod,
                requiredSupplyUnits,
                requiredConsumableCount,
                consumedConsumables: [],
                supplyProfile: null,
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
                paymentMethod = dailyFreeUsed ? 'free' : requestedPaymentMethod;
                chargedCost = paymentMethod === 'gold' ? destination.cost : 0;
                tx.set(activeRef, {
                    ...fullPayload,
                    paymentMethod,
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
                        imagePath: destination.imagePath || '',
                        playFabId,
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        usedAtMs: now
                    });
                }
            });
            if (conflicted) {
                return res.status(409).json({ error: '探索中です。帰還後に次の探索へ出発できます。' });
            }

            if (!dailyFreeUsed && requestedPaymentMethod === 'free') {
                await activeRef.delete().catch(() => {});
                return res.status(402).json({ error: '本日の無料探索枠は使用済みです。' });
            }

            if (paymentMethod === 'consumable') {
                const explorationPayment = await buildExplorationPaymentState(playFabId, {
                    getEntityKeyForPlayFabId,
                    getAllInventoryItems,
                    catalogCache
                });
                const validation = validateExplorationConsumablePayment(
                    req.body?.paymentConsumables,
                    explorationPayment.consumables,
                    requiredSupplyUnits
                );
                if (!validation.ok) {
                    await activeRef.delete().catch(() => {});
                    return res.status(402).json({
                        error: validation.error || '探索に使う消耗品が不足しています。',
                        requiredSupplyUnits,
                        requiredConsumableCount,
                        explorationPayment
                    });
                }
                consumedConsumables = validation.consumedConsumables;
                supplyProfile = validation.supplyProfile;
                const subtractedConsumables = [];
                try {
                    const requestKey = req.body?.requestId ? String(req.body.requestId) : `${playFabId}-${explorationId}`;
                    for (const item of consumedConsumables) {
                        await subtractEconomyItem(playFabId, item.itemId, item.quantity, {
                            alternateIdType: 'FriendlyId',
                            idempotencyId: `exploration-start-${requestKey}-consumable-${item.itemId}`
                        });
                        subtractedConsumables.push(item);
                    }
                } catch (consumableError) {
                    const requestKey = req.body?.requestId ? String(req.body.requestId) : `${playFabId}-${explorationId}`;
                    await Promise.all(subtractedConsumables.map((item) => addEconomyItem(playFabId, item.itemId, item.quantity, {
                        alternateIdType: 'FriendlyId',
                        idempotencyId: `exploration-start-${requestKey}-consumable-refund-${item.itemId}`
                    }).catch((refundError) => {
                        console.error('[exploration/start] consumable refund failed:', playFabId, item, refundError?.errorMessage || refundError?.message || refundError);
                    })));
                    await activeRef.delete().catch(() => {});
                    throw consumableError;
                }
            } else if (chargedCost > 0) {
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
            const goldBalance = paymentMethod !== 'gold' && typeof getCurrencyBalance === 'function'
                ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE).catch(() => null)
                : await refreshGoldBalanceAndRanking(playFabId, {
                    getCurrencyBalance,
                    promisifyPlayFab,
                    PlayFabServer
                });

            // active に昇格。失敗しても pending にフルデータが残るため claim から自動復旧可能
            try {
                await activeRef.update({
                    status: 'active',
                    paymentMethod,
                    chargedCost,
                    requiredSupplyUnits,
                    requiredConsumableCount,
                    consumedConsumables,
                    supplyProfile,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (firestoreError) {
                console.error('[exploration/start] active昇格失敗 (通貨は減算済み、pending から claim で自動復旧可能):', playFabId, explorationId, firestoreError?.message || firestoreError);
                throw firestoreError;
            }

            res.json({
                ...(await buildExplorationStatus(playFabId)),
                started: true,
                balance: goldBalance,
                dailyFreeUsed,
                paymentMethod,
                chargedCost,
                requiredSupplyUnits,
                requiredConsumableCount,
                consumedConsumables,
                supplyProfile
            });
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
            const supplyProfile = activeData.supplyProfile
                ? normalizeExplorationSupplyProfile(activeData.supplyProfile)
                : buildExplorationSupplyProfile(activeData.consumedConsumables || [], activeData.requiredSupplyUnits ?? activeData.requiredConsumableCount ?? 0);

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
                bossResult = await resolveBossBattle(playFabId, destination, selectedBoss, { promisifyPlayFab, PlayFabServer }, supplyProfile);

                const rewardCount = resolveRewardCount(bossResult, ship.shipClass, supplyProfile);
                const gachaOptions = getExplorationGachaOptions(destination.id, ship, supplyProfile);
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
                    supplyProfile,
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
                imagePath: destination.imagePath || '',
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
                supplyProfile,
                reportText: buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount: rewards.length, supplyProfile }),
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
        EXPLORATION_DAILY_RARITY_ORDER,
        EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY,
        EXPLORATION_MAX_EXTRA_SUPPLY_UNITS,
        EXPLORATION_DESTINATION_RARITIES,
        EXPLORATION_SHIP_ROLES,
        BOSS_TIER_DEFS,
        applyExplorationSupplyToBattleProfile,
        applyExplorationSupplyToGachaOptions,
        buildExplorationSupplyProfile,
        buildTroyMenuConsumablePaymentOptions,
        buildDailyFreeExplorationStatus,
        canShipClassExploreDestination,
        getAllDestinationsForShipClass,
        getAvailableDestinationsForShipClass,
        getDailyExplorationDestinationEntries,
        getDailyExplorationDestinations,
        getDestinationBosses,
        getDestinationsByRarity,
        getExplorationRequiredConsumableCount,
        getExplorationRequiredSupplyUnits,
        getExplorationMaxSupplyUnits,
        getExplorationBossWeight,
        getExplorationGachaOptions,
        getExplorationShipAccessClasses,
        getExplorationShipClassLabel,
        getJstDayKey,
        getTroyMenuConsumableEffectiveUnits,
        isTroyMenuConsumableCatalogItem,
        isDailyExplorationDestinationForPlayer,
        isDailyFreeExplorationDestination,
        normalizeExplorationSupplyProfile,
        normalizeTroyMenuConsumableEffectiveUnits,
        normalizePaymentConsumables,
        selectExplorationBoss,
        validateExplorationConsumablePayment,
        resolveRewardCount,
        publicDestination
    }
};

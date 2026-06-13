// server/nation.js
// 国家関連のAPI

const { addGlobalChatMessage } = require('./chat');
const { PlayFabData, withTitleEntityToken } = require('./playfab');
const { addPlayerNationContribution, calculateLevelFromContribution, buildStatsMapFromStatistics, PLAYER_CONTRIBUTION_STAT, PLAYER_LEVEL_STAT } = require('./playerLevel');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    getTroyMenuConsumableItemId,
    normalizeTroyMenuImagePath
} = require('./troyMenuConsumables');
const {
    CAPITAL_CAPTURE_BASE_DURATION_MS,
    CAPITAL_CAPTURE_BREACH_WALLS,
    CAPITAL_CAPTURE_SLOT_LIMIT,
    CAPITAL_PART_LABELS,
    createDefaultNationWarState,
    normalizeNationWarState,
    normalizeCapitalCaptureState,
    getNationWarWeaponDefinition,
    listNationWarWeapons,
    canNationUseWeapon,
    getNationModelByNation,
    getNationModelLabel,
    getNationLabel
} = require('./nationWarWeapons');
const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};

const NATION_GROUP_BY_NATION = {
    fire: { island: 'fire', groupName: 'nation_fire_island' },
    earth: { island: 'earth', groupName: 'nation_earth_island' },
    wind: { island: 'wind', groupName: 'nation_wind_island' },
    water: { island: 'water', groupName: 'nation_water_island' }
};

const NATION_EMOJI_BY_NATION = {
    fire: '🔥',
    water: '💧',
    wind: '🌪️',
    earth: '🌱',
    neutral: '🏴'
};

const AVATAR_COLOR_BY_NATION = {
    fire: 'red',
    earth: 'green',
    wind: 'yellow',
    water: 'blue',
    neutral: 'black'
};

const KING_STARTER_CROWN_BY_NATION = {
    fire: 'metal_black_01',
    wind: 'metal_black_08',
    earth: 'metal_black_11',
    water: 'metal_black_12'
};


const MAX_TREASURY_RECENT_ENTRIES = 20;
const TREASURY_SOURCE_LABELS = {
    troy_order: 'TROY会計',
    king_grant_receipt: '王の受領',
    shop_tax: '売上税',
    hot_spring_tax: '温泉税',
    nation_donation: '国庫寄付',
    war_deploy: '兵器配備',
    war_strike: '攻撃準備',
    war_raid: '国庫襲撃',
    manual_adjustment: '国庫調整'
};
const TREASURY_CASHBACK_RATE_BPS_BY_RANK = [1300, 1100, 900, 700];
const NATION_WAR_EVENT_LIMIT = 40;
const NATION_WAR_STATE_COLLECTION = 'nation_wars';
const NATION_WAR_EVENT_COLLECTION = 'nation_war_events';
const TROY_STAFF_CHECKOUT_ENABLED = true;
const TROY_ENTRY_DEFAULT_NATION = String(process.env.TROY_ENTRY_DEFAULT_NATION || 'fire').trim().toLowerCase();
const TROY_ENTRY_CHARGE_ITEM_NAME = '入店チャージ';
const TROY_ENTRY_CHARGE_AMOUNT = Math.max(0, Math.floor(Number(process.env.TROY_ENTRY_CHARGE_AMOUNT || 500) || 0));
const TROY_ENTRY_STAFF_CHIP_AMOUNT = Math.max(0, Math.floor(Number(process.env.TROY_ENTRY_STAFF_CHIP_AMOUNT || 500) || 0));
const TROY_CUSTOM_ORDER_ITEM_NAME = '裏メニュー';
const TROY_USUAL_ORDER_ITEMS_LIMIT = 8;
const TROY_ORDER_HISTORY_ITEMS_LIMIT = 32;
const TROY_SALES_SUMMARY_LIMIT = 80;
const TROY_SALES_SETTLEMENT_LIMIT = 120;
const TROY_CLOSE_SUMMARY_SAFE_TEXT_LIMIT = 4900;
const TROY_CUSTOMER_ORDER_REQUEST_LIMIT = 50;
const TROY_GLOBAL_ROOM_ID = 'global';
const TROY_CLOSE_SUMMARY_LINE_ENV_KEYS = ['TROY_GAME_MASTER_LINE_USER_IDS', 'QUEST_APPROVER_ADMIN_LINE_IDS', 'GAME_MASTER_LINE_USER_IDS', 'GAME_MASTER_LINE_USER_ID'];
const TROY_BUSINESS_DAY_ROLLOVER_HOUR_DEFAULT = 5;
const NATION_WAR_MIN_TREASURY_RESERVE = 5000;
const NATION_WAR_MAX_RAID_AMOUNT = 100000;
const NATION_WAR_RECON_COST_PS = 200;
const NATION_WAR_REPAIR_COST_PS = 400;
const NATION_WAR_SABOTAGE_COST_PS = 350;
const NATION_WAR_RECON_DURATION_MS = 10 * 60 * 1000;
const NATION_WAR_CAPTURE_REPAIR_AMOUNT = 5;
const NATION_WAR_SABOTAGE_COMMAND_DAMAGE = 5;
const NATION_WAR_SHIP_ATTACK_WALL_DAMAGE = 8;
const NATION_WAR_SIEGE_WALL_DAMAGE = 3;
const NATION_WAR_POST_RAID_WALLS = 65;
const NATION_WAR_POST_RAID_COOLDOWN_MS = 30 * 60 * 1000;
const NATION_WAR_CARD_REWARD_MAJOR_CHANCE = 0.2;
const NATION_WAR_CARD_REWARD_HIGH_RAID_THRESHOLD = 50000;
const TROY_COIN_CONVERSION_MAX_AMOUNT = 1000000;
const TROY_COIN_RETURN_QR_VALUE = 'troy:coin-return';
const TROY_BOUNTY_RANKING_MEMBER_LIMIT = 50;
const TROY_CONTRIBUTION_DEBT_COLLECTION = 'troy_contribution_debts';
const TROY_CONTRIBUTION_DEBT_MESSAGE = '古傷が疼き、経験値は波間に消えた。';
const TROY_CHIP_RETURN_DEBT_REPAY_BPS = 9000;
const TROY_SETTLEMENT_DEBT_REPAY_BPS = 5000;
const NATION_ANNOUNCEMENT_CACHE_TTL_MS = 30 * 1000;

let nationAnnouncementCache = {
    expiresAt: 0,
    payload: null
};

function callTitleScopedApi(promisifyPlayFab, apiFunction, request) {
    return withTitleEntityToken(() => promisifyPlayFab(apiFunction, request));
}

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function normalizeTroyCoinConversionAmount(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return 0;
    const amount = Math.floor(raw);
    if (amount !== raw) return 0;
    if (amount <= 0 || amount > TROY_COIN_CONVERSION_MAX_AMOUNT) return 0;
    if (amount % 100 !== 0) return 0;
    return amount;
}

function normalizeTroyCoinReturnAmount(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return 0;
    const amount = Math.floor(raw);
    if (amount !== raw) return 0;
    if (amount <= 0 || amount > TROY_COIN_CONVERSION_MAX_AMOUNT) return 0;
    return amount;
}

function normalizeRequiredRequestId(value) {
    return String(value || '').trim().slice(0, 120);
}

function isValidTroyCoinReturnQrToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower === TROY_COIN_RETURN_QR_VALUE) return true;
    try {
        const url = new URL(raw, 'https://troy.local');
        const action = String(url.searchParams.get('action') || url.searchParams.get('troy') || '').trim().toLowerCase();
        return url.pathname.endsWith('/troy-coin-return.html') || action === 'coin-return' || action === 'troy-coin-return';
    } catch (_) {
        return false;
    }
}

function getPlayerRankNameByLevel(level, options = {}) {
    if (options.isKing) return '王';
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return '海賊王';
    if (value >= 31) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function getPlayerRankServiceBenefitsByLevel(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return ['ドリンクサイズアップ回数制限なし', '店内ゲーム遊び放題'];
    if (value >= 31) return ['ドリンクサイズアップ回数制限なし'];
    if (value >= 21) return ['ドリンクサイズアップ1回', '専用ジョッキ（店内専用）'];
    if (value >= 11) return ['ドリンクサイズアップ1回', '入店時に階級表示'];
    return ['通常サービス', '入店表示のみ'];
}

function pickRandomNationWarTarotCardId() {
    if (Math.random() < NATION_WAR_CARD_REWARD_MAJOR_CHANCE) {
        return `arcana-${Math.floor(Math.random() * 22)}`;
    }
    const suits = ['wand', 'sword', 'cup', 'pentacle'];
    const suit = suits[Math.floor(Math.random() * suits.length)] || 'wand';
    const rank = 1 + Math.floor(Math.random() * 14);
    return `minor-${suit}-${rank}`;
}

async function getLineUserId(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['lineUserId']
    });
    const lineUserId = result?.Data?.lineUserId?.Value;
    return lineUserId ? String(lineUserId) : '';
}

function getAvatarColorForNation(nation) {
    const key = String(nation || '').toLowerCase();
    return AVATAR_COLOR_BY_NATION[key] || null;
}

function getNationMappingByNation(nation) {
    const key = String(nation || '').toLowerCase();
    return NATION_GROUP_BY_NATION[key] || null;
}

function stripNationEmoji(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.replace(/^(🔥|💧|🌪️|🌱|🏴)\s*/, '').trim();
}

function buildNationDisplayName(baseName, nation) {
    const base = stripNationEmoji(baseName);
    return base;
}

async function ensureNationDisplayName(playFabId, nation, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin } = deps;
    if (!playFabId || !nation) return;
    let currentDisplayName = '';
    let baseName = '';
    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['BaseDisplayName']
        });
        baseName = ro?.Data?.BaseDisplayName?.Value || '';
    } catch (e) {
        console.warn('[displayName] BaseDisplayName fetch failed:', e?.errorMessage || e?.message || e);
    }
    if (!baseName) {
        try {
            const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true }
            });
            currentDisplayName = profile?.PlayerProfile?.DisplayName || '';
            baseName = stripNationEmoji(currentDisplayName) || playFabId;
        } catch (e) {
            console.warn('[displayName] GetPlayerProfile failed:', e?.errorMessage || e?.message || e);
            baseName = playFabId;
        }
    }
    const nextDisplayName = buildNationDisplayName(baseName, nation);
    if (nextDisplayName && nextDisplayName !== currentDisplayName) {
        try {
            await promisifyPlayFab(PlayFabAdmin.UpdateUserTitleDisplayName, {
                PlayFabId: playFabId,
                DisplayName: nextDisplayName
            });
        } catch (e) {
            console.warn('[displayName] UpdateUserTitleDisplayName failed:', e?.errorMessage || e?.message || e);
        }
    }
    try {
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: { BaseDisplayName: baseName }
        });
    } catch (e) {
        console.warn('[displayName] UpdateUserReadOnlyData(BaseDisplayName) failed:', e?.errorMessage || e?.message || e);
    }
}

async function getNationForPlayer(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['Nation']
    });
    const nation = ro?.Data?.Nation?.Value || null;
    return nation ? String(nation).toLowerCase() : null;
}

async function resolveTroyNationForRequest(req, playFabId, deps) {
    const requestedNation = String(
        req.body?.troyNation
        || req.body?.entryNation
        || ''
    ).trim().toLowerCase();
    if (requestedNation && getNationMappingByNation(requestedNation)) {
        return requestedNation;
    }
    return getNationForPlayer(playFabId, deps);
}

function getNationGroupDoc(firestore, groupName) {
    return firestore.collection('nation_groups').doc(groupName);
}

function getTroyRoomDoc(firestore, _groupName = null) {
    return firestore.collection('troy_rooms').doc(TROY_GLOBAL_ROOM_ID);
}

async function findOpenTroyNation(firestore) {
    const snap = await getTroyRoomDoc(firestore).get();
    if (!snap.exists || !snap.data()?.isOpen) return null;
    const nation = String(snap.data()?.nation || TROY_ENTRY_DEFAULT_NATION || 'fire').trim().toLowerCase();
    return getNationMappingByNation(nation) ? nation : 'fire';
}

async function deleteCollectionDocs(collectionRef, batchSize = 400) {
    let snapshot = await collectionRef.limit(batchSize).get();
    while (!snapshot.empty) {
        const batch = collectionRef.firestore.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        snapshot = await collectionRef.limit(batchSize).get();
    }
}

const MAP_OCCUPATION_KEY = 'MapOccupationByMapId';
const WORLD_MAP_LAYOUT_KEY = 'WorldMapLayoutV1';
const WORLD_MAP_PLACEMENT_OPEN_KEY = 'WorldMapPlacementOpen';
const EMPTY_MAP_ID = 'empty';
const WORLD_MAP_PLACEMENT_WEEKDAYS_JST = new Set([0]); // Sunday only

const NATION_LEVEL_MAX = 14;

const WORLD_MAP_DEFAULT_LAYOUT = [
    'pentacles', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'swords',
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, 'major_00', EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    'cups', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'wands'
];

async function getWorldMapPlacementOpen(deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    const result = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [WORLD_MAP_PLACEMENT_OPEN_KEY] });
    const raw = result?.Data?.[WORLD_MAP_PLACEMENT_OPEN_KEY];
    if (!raw) return isPlacementAllowedByWeekday();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'boolean') return parsed;
        if (typeof parsed?.open === 'boolean') return parsed.open;
        const now = Date.now();
        const start = parsed?.start ? Date.parse(parsed.start) : null;
        const end = parsed?.end ? Date.parse(parsed.end) : null;
        if (Number.isFinite(start) && now < start) return false;
        if (Number.isFinite(end) && now > end) return false;
        if (Number.isFinite(start) || Number.isFinite(end)) return true;
    } catch {
        // ignore
    }
    return isPlacementAllowedByWeekday();
}

function getJapanWeekdayNumber(date = new Date()) {
    try {
        const jstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        return jstDate.getDay();
    } catch {
        return date.getUTCDay();
    }
}

function getJapanDayKey(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    } catch {
        const year = date.getUTCFullYear();
        const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
        const day = `${date.getUTCDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

function normalizeTroyBusinessDayKey(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function getTroyBusinessDayRolloverHour() {
    const raw = Number(process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST);
    if (!Number.isFinite(raw)) return TROY_BUSINESS_DAY_ROLLOVER_HOUR_DEFAULT;
    return Math.min(23, Math.max(0, Math.floor(raw)));
}

function formatJstDateKeyFromLocalParts(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTroyBusinessDayKey(date = new Date()) {
    try {
        const jstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        if (jstDate.getHours() < getTroyBusinessDayRolloverHour()) {
            jstDate.setDate(jstDate.getDate() - 1);
        }
        return formatJstDateKeyFromLocalParts(jstDate);
    } catch {
        return getJapanDayKey(date);
    }
}

function normalizeLineUserIdList(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
    }
    const raw = String(value || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return normalizeLineUserIdList(parsed);
    } catch (_) {
    }
    return [...new Set(raw.split(/[\s,;]+/).map((entry) => entry.trim()).filter(Boolean))];
}

function getConfiguredTroyCloseSummaryLineUserIds(extraValue) {
    const fromExtra = normalizeLineUserIdList(extraValue);
    const fromEnv = TROY_CLOSE_SUMMARY_LINE_ENV_KEYS.flatMap((key) => normalizeLineUserIdList(process.env[key]));
    return [...new Set([...fromExtra, ...fromEnv])];
}

function formatTroyMoney(value) {
    return `¥${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('ja-JP')}`;
}

function normalizeTroySalesCategoryId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function normalizeTroySalesCategoryLabel(value, item = {}) {
    const label = String(value || '').trim().slice(0, 40);
    if (label) return label;
    const name = String(item?.name || item?.itemName || '').trim();
    if (name === TROY_ENTRY_CHARGE_ITEM_NAME) return 'チャージ';
    if (name === TROY_CUSTOM_ORDER_ITEM_NAME) return TROY_CUSTOM_ORDER_ITEM_NAME;
    const categoryId = normalizeTroySalesCategoryId(item?.menuCategory || item?.categoryId || item?.category);
    if (categoryId === 'entry') return 'チャージ';
    if (categoryId === 'custom') return TROY_CUSTOM_ORDER_ITEM_NAME;
    if (categoryId === 'usual') return 'いつもの';
    return '未分類';
}

let troyPublicMenuCache = null;

function loadPublicTroyModule(relativePath, exportNames = []) {
    const filePath = path.resolve(__dirname, '..', relativePath);
    const source = fs.readFileSync(filePath, 'utf8')
        .replace(/export\s+const\s+/g, 'const ')
        .replace(/export\s+function\s+/g, 'function ');
    const safeExportNames = exportNames
        .map((name) => String(name || '').trim())
        .filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
    const script = new vm.Script(`${source}\nmodule.exports = { ${safeExportNames.join(', ')} };`, {
        filename: filePath
    });
    const sandbox = { module: { exports: {} }, exports: {} };
    script.runInNewContext(sandbox);
    return sandbox.module.exports || {};
}

function getPublicTroyMenuModules() {
    if (troyPublicMenuCache) return troyPublicMenuCache;
    const menuData = loadPublicTroyModule('public/js/troyMenuData.js', [
        'TROY_PRODUCT_MENUS',
        'TROY_BOTTLE_ITEMS',
        'getTroyStaffMenu'
    ]);
    const menuAssets = loadPublicTroyModule('public/js/troyMenuAssets.js', [
        'getTroyMenuImage',
        'getTroyMenuCategoryImage'
    ]);
    troyPublicMenuCache = { ...menuData, ...menuAssets };
    return troyPublicMenuCache;
}

function normalizeTroyCustomerOrderRequestId(value) {
    return String(value || '')
        .trim()
        .replace(/[^A-Za-z0-9:_-]/g, '')
        .slice(0, 120);
}

function getOfficialTroyMenuData(menuId, modules) {
    const id = normalizeTroySalesCategoryId(menuId);
    if (!id || id === 'favorite' || id === 'specials') return null;
    if (id === 'bottle') {
        return { id, title: 'BOTTLE MENU', items: Array.isArray(modules?.TROY_BOTTLE_ITEMS) ? modules.TROY_BOTTLE_ITEMS : [] };
    }
    const product = modules?.TROY_PRODUCT_MENUS?.[id];
    if (!product) return null;
    return { id, title: String(product.title || id).trim(), items: Array.isArray(product.items) ? product.items : [] };
}

function findOfficialTroyMenuItem(menuData, payload = {}) {
    const concept = String(payload.concept || payload.name || '').trim();
    const content = String(payload.content || '').trim();
    if (!concept) return null;
    const items = Array.isArray(menuData?.items) ? menuData.items : [];
    const matches = items.filter((item) => String(item?.concept || item?.name || '').trim() === concept);
    if (!matches.length) return null;
    if (content) {
        const exact = matches.find((item) => String(item?.content || '').trim() === content);
        if (exact) return exact;
    }
    return matches.length === 1 ? matches[0] : null;
}

function normalizeTroyCustomerOrderOption(item = {}, value = '') {
    const choices = Array.isArray(item?.mixers) ? item.mixers.map((row) => String(row || '').trim()).filter(Boolean) : [];
    if (!choices.length) return '';
    const raw = String(value || '').trim();
    return choices.includes(raw) ? raw : choices[0];
}

function normalizeTroyCustomerOrderSize(item = {}, value = '') {
    const choices = Array.isArray(item?.sizeOptions) ? item.sizeOptions : [];
    if (!choices.length) return { label: '', price: Math.max(0, Math.floor(Number(item?.price) || 0)) };
    const raw = String(value || '').trim();
    const selected = choices.find((choice) => String(choice?.label || '').trim() === raw) || choices[0];
    return {
        label: String(selected?.label || '').trim(),
        price: Math.max(0, Math.floor(Number(selected?.price) || 0))
    };
}

function getTroyCustomerOrderBaseName(item = {}, optionLabel = '') {
    const concept = String(item?.concept || item?.name || '').trim();
    const staffName = String(item?.staffName || '').trim();
    const variants = Array.isArray(item?.staffVariants) ? item.staffVariants : [];
    if (optionLabel && variants.length) {
        const matched = variants.find((variant) => String(variant?.name || '').includes(optionLabel));
        if (matched?.name) return String(matched.name).trim();
    }
    if (staffName) return staffName;
    if (optionLabel) return `${concept}（${optionLabel}）`;
    const content = String(item?.content || '').trim();
    if (!content || /選択|スタッフ/u.test(content)) return concept;
    return `${concept}（+${content.replace(/\s*\+\s*/g, '+')}）`;
}

function resolveTroyCustomerOrderItem(payload = {}) {
    const modules = getPublicTroyMenuModules();
    const menuId = normalizeTroySalesCategoryId(payload.menuId || payload.categoryId || payload.menuCategory);
    const menuData = getOfficialTroyMenuData(menuId, modules);
    if (!menuData) {
        const error = new Error('InvalidMenuCategory');
        error.statusCode = 400;
        throw error;
    }
    const item = findOfficialTroyMenuItem(menuData, payload);
    if (!item || item.disabled) {
        const error = new Error('InvalidMenuItem');
        error.statusCode = 400;
        throw error;
    }
    const optionLabel = normalizeTroyCustomerOrderOption(item, payload.optionLabel);
    const size = normalizeTroyCustomerOrderSize(item, payload.sizeLabel);
    const price = size.price;
    if (price <= 0) {
        const error = new Error('MenuItemUnavailable');
        error.statusCode = 400;
        throw error;
    }
    const baseName = getTroyCustomerOrderBaseName(item, optionLabel);
    const name = `${baseName}${size.label ? ` ${size.label}` : ''}`.trim().slice(0, 60);
    const quantity = Math.max(1, Math.min(9, Math.floor(Number(payload.quantity) || 1)));
    const image = normalizeTroyMenuImagePath(
        typeof modules.getTroyMenuImage === 'function'
            ? modules.getTroyMenuImage(menuId, { ...item, optionLabel, sizeLabel: size.label })
            : ''
    );
    const menuCategoryLabel = normalizeTroySalesCategoryLabel(menuData.title, {
        menuCategory: menuId,
        name
    });
    return {
        menuId,
        concept: String(item?.concept || item?.name || '').trim(),
        content: String(item?.content || '').trim(),
        optionLabel,
        sizeLabel: size.label,
        name,
        price,
        quantity,
        lineTotal: price * quantity,
        menuImage: image,
        menuCategory: menuId,
        menuCategoryLabel
    };
}

function buildTroyCustomerOrderRequestPayload(requestDocs = []) {
    return (Array.isArray(requestDocs) ? requestDocs : [])
        .map((doc) => {
            const data = typeof doc?.data === 'function' ? (doc.data() || {}) : (doc || {});
            const requestId = String(doc?.id || data.requestId || '').trim();
            const status = String(data.status || 'pending').trim().toLowerCase();
            const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : Math.max(0, Math.floor(Number(data.createdAtMs || data.createdAt) || 0));
            const updatedAtMs = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Math.max(0, Math.floor(Number(data.updatedAtMs || data.updatedAt) || 0));
            const price = Math.max(0, Math.floor(Number(data.price) || 0));
            const quantity = Math.max(1, Math.min(99, Math.floor(Number(data.quantity) || 1)));
            const name = String(data.name || '').trim();
            const playFabId = normalizePlayFabId(data.playFabId || data.receiverPlayFabId || '');
            if (!requestId || !playFabId || !name || price <= 0) return null;
            return {
                requestId,
                playFabId,
                displayName: String(data.displayName || playFabId).trim(),
                status,
                name,
                price,
                quantity,
                lineTotal: Math.max(0, Math.floor(Number(data.lineTotal) || (price * quantity))),
                menuImage: normalizeTroyMenuImagePath(data.menuImage || data.image || data.iconImage),
                menuCategory: normalizeTroySalesCategoryId(data.menuCategory || data.categoryId || data.menuId),
                menuCategoryLabel: normalizeTroySalesCategoryLabel(data.menuCategoryLabel || data.categoryLabel, data),
                optionLabel: String(data.optionLabel || '').trim(),
                sizeLabel: String(data.sizeLabel || '').trim(),
                createdAtMs,
                updatedAtMs
            };
        })
        .filter((entry) => entry && ['pending', 'processing'].includes(entry.status))
        .sort((a, b) => (a.createdAtMs - b.createdAtMs) || String(a.requestId).localeCompare(String(b.requestId)));
}

function normalizeTroySalesItemRow(row = {}) {
    const name = String(row?.name || row?.itemName || '').trim().slice(0, 80);
    const quantity = Math.max(0, Math.floor(Number(row?.quantity) || 0));
    const total = Math.max(0, Math.floor(Number(row?.total ?? row?.lineTotal) || 0));
    if (!name || quantity <= 0 || total <= 0) return null;
    return { name, quantity, total };
}

function normalizeTroySalesCategoryRow(row = {}) {
    const categoryId = normalizeTroySalesCategoryId(row?.categoryId || row?.id || row?.menuCategory);
    const name = normalizeTroySalesCategoryLabel(row?.name || row?.label || row?.menuCategoryLabel, row);
    const quantity = Math.max(0, Math.floor(Number(row?.quantity) || 0));
    const total = Math.max(0, Math.floor(Number(row?.total ?? row?.lineTotal) || 0));
    if (!name || quantity <= 0 || total <= 0) return null;
    return { categoryId, name, quantity, total };
}

function normalizeTroySalesSettlementRow(row = {}) {
    const playFabId = normalizePlayFabId(row?.playFabId || row?.receiverPlayFabId || row?.contributorPlayFabId || row?.actorId || '');
    const displayName = String(row?.displayName || row?.customerName || row?.contributorName || row?.actorName || playFabId || 'お客様')
        .trim()
        .slice(0, 40);
    const total = Math.max(0, Math.floor(Number(row?.total ?? row?.amount ?? row?.receivedAmount) || 0));
    const totalItems = Math.max(0, Math.floor(Number(row?.totalItems ?? row?.quantity) || 0));
    const settledAtMs = Math.max(0, Math.floor(Number(row?.settledAtMs ?? row?.timestampMs ?? row?.createdAtMs) || 0));
    const rawSettlementId = String(row?.settlementId || row?.entryId || row?.id || '').trim();
    const settlementId = (rawSettlementId || `${playFabId || displayName}:${settledAtMs || 0}:${total}`)
        .slice(0, 120);
    if (!displayName || total <= 0) return null;
    return {
        settlementId,
        playFabId,
        displayName,
        total,
        totalItems,
        settledAtMs
    };
}

function sortTroySalesRows(rows = []) {
    return rows.sort((a, b) => (b.total - a.total)
        || (b.quantity - a.quantity)
        || String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
}

function sortTroySettlementRows(rows = []) {
    return rows.sort((a, b) => (a.settledAtMs - b.settledAtMs)
        || String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ja')
        || String(a.settlementId || '').localeCompare(String(b.settlementId || '')));
}

function mergeTroySalesRows(existingRows = [], addedRows = [], normalizer, keyFor, limit = TROY_SALES_SUMMARY_LIMIT) {
    const byKey = new Map();
    (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
        const normalized = normalizer(row);
        if (!normalized) return;
        byKey.set(keyFor(normalized), { ...normalized });
    });
    (Array.isArray(addedRows) ? addedRows : []).forEach((row) => {
        const normalized = normalizer(row);
        if (!normalized) return;
        const key = keyFor(normalized);
        const current = byKey.get(key) || { ...normalized, quantity: 0, total: 0 };
        current.name = current.name || normalized.name;
        if (normalized.categoryId) current.categoryId = normalized.categoryId;
        current.quantity += normalized.quantity;
        current.total += normalized.total;
        byKey.set(key, current);
    });
    return sortTroySalesRows([...byKey.values()]).slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}

function mergeTroySettlementRows(existingRows = [], addedRows = [], limit = TROY_SALES_SETTLEMENT_LIMIT) {
    const byKey = new Map();
    (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
        const normalized = normalizeTroySalesSettlementRow(row);
        if (!normalized) return;
        byKey.set(normalized.settlementId, normalized);
    });
    (Array.isArray(addedRows) ? addedRows : []).forEach((row) => {
        const normalized = normalizeTroySalesSettlementRow(row);
        if (!normalized) return;
        byKey.set(normalized.settlementId, normalized);
    });
    return sortTroySettlementRows([...byKey.values()]).slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}

function buildTroySalesBreakdownsFromItems(items = []) {
    const itemRows = new Map();
    const categoryRows = new Map();
    normalizeTroyCheckoutItems(items).forEach((item) => {
        if (!item.name || item.quantity <= 0 || item.lineTotal <= 0) return;
        const itemKey = item.name;
        const itemRow = itemRows.get(itemKey) || { name: item.name, quantity: 0, total: 0 };
        itemRow.quantity += item.quantity;
        itemRow.total += item.lineTotal;
        itemRows.set(itemKey, itemRow);

        const categoryId = normalizeTroySalesCategoryId(item.menuCategory);
        const categoryName = normalizeTroySalesCategoryLabel(item.menuCategoryLabel, item);
        const categoryKey = categoryId || categoryName;
        const categoryRow = categoryRows.get(categoryKey) || { categoryId, name: categoryName, quantity: 0, total: 0 };
        categoryRow.quantity += item.quantity;
        categoryRow.total += item.lineTotal;
        categoryRows.set(categoryKey, categoryRow);
    });
    return {
        items: sortTroySalesRows([...itemRows.values()]).slice(0, TROY_SALES_SUMMARY_LIMIT),
        categories: sortTroySalesRows([...categoryRows.values()]).slice(0, TROY_SALES_SUMMARY_LIMIT)
    };
}

function getTroyChargeSalesTotal(sales = {}) {
    const categoryRows = Array.isArray(sales.categories) ? sales.categories : [];
    const itemRows = Array.isArray(sales.items) ? sales.items : [];
    const categoryChargeTotal = categoryRows
        .map(normalizeTroySalesCategoryRow)
        .filter(Boolean)
        .filter((row) => row.categoryId === 'entry' || row.name === 'チャージ')
        .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.total) || 0)), 0);
    if (categoryChargeTotal > 0) return categoryChargeTotal;
    return itemRows
        .map(normalizeTroySalesItemRow)
        .filter(Boolean)
        .filter((row) => row.name === TROY_ENTRY_CHARGE_ITEM_NAME)
        .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.total) || 0)), 0);
}

function buildTroySalesPayouts(sales = {}) {
    const total = Math.max(0, Math.floor(Number(sales.total) || 0));
    const dealerShare = Math.min(total, getTroyChargeSalesTotal(sales));
    const nonChargeTotal = Math.max(0, total - dealerShare);
    return {
        total,
        chargeTotal: dealerShare,
        nonChargeTotal,
        masterShare: Math.floor(nonChargeTotal / 2),
        dealerShare
    };
}

function createTroyCloseSummaryLineBuilder(maxCodeUnits = TROY_CLOSE_SUMMARY_SAFE_TEXT_LIMIT) {
    const max = Math.max(500, Math.floor(Number(maxCodeUnits) || TROY_CLOSE_SUMMARY_SAFE_TEXT_LIMIT));
    const lines = [];
    let used = 0;
    let omitted = 0;
    const lineCost = (line) => String(line || '').length + (lines.length ? 1 : 0);
    const push = (line, options = {}) => {
        const text = String(line || '');
        const cost = lineCost(text);
        if (!options.force && used + cost > max) {
            omitted += 1;
            return false;
        }
        let nextText = text;
        let nextCost = cost;
        if (used + nextCost > max) {
            const available = Math.max(0, max - used - (lines.length ? 1 : 0));
            nextText = text.slice(0, available);
            nextCost = lineCost(nextText);
        }
        lines.push(nextText);
        used += nextCost;
        return true;
    };
    const finish = () => {
        if (omitted > 0) {
            const notice = `※文字数上限のため ${omitted}行を省略`;
            while (lines.length && used + lineCost(notice) > max) {
                const removed = lines.pop();
                used -= String(removed || '').length + (lines.length ? 1 : 0);
            }
            push(notice, { force: true });
        }
        return lines.join('\n');
    };
    return { push, finish };
}

function formatTroyCloseSummaryMessage(summary = {}) {
    const sales = summary.sales || {};
    const pending = summary.pending || {};
    const topItems = Array.isArray(pending.topItems) ? pending.topItems : [];
    const settledItems = Array.isArray(sales.items) ? sales.items : [];
    const settledCategories = Array.isArray(sales.categories) ? sales.categories : [];
    const settledCustomers = sortTroySettlementRows((Array.isArray(sales.settlements) ? sales.settlements : [])
        .map(normalizeTroySalesSettlementRow)
        .filter(Boolean));
    const settledTotal = Math.max(0, Math.floor(Number(sales.total) || 0));
    const settledCount = Math.max(0, Math.floor(Number(sales.count) || 0));
    const pendingTotal = Math.max(0, Math.floor(Number(pending.total) || 0));
    const pendingCount = Math.max(0, Math.floor(Number(pending.count) || 0));
    const recordedTotal = settledTotal + pendingTotal;
    const payouts = sales.payouts || buildTroySalesPayouts(sales);
    const settledCustomerLines = settledCustomers
        .map((item, index) => `- ${index + 1}. ${item.displayName}: ${formatTroyMoney(item.total)}${item.totalItems > 0 ? ` / ${item.totalItems}点` : ''}`);
    const settledCategoryLines = settledCategories
        .slice(0, 6)
        .map((item) => `- ${item.name} x${item.quantity} / ${formatTroyMoney(item.total)}`);
    const settledItemLines = settledItems
        .slice(0, 8)
        .map((item) => `- ${item.name} x${item.quantity} / ${formatTroyMoney(item.total)}`);
    const itemLines = topItems
        .slice(0, 6)
        .map((item) => `- ${item.name} x${item.quantity} / ${formatTroyMoney(item.total)}`);
    const builder = createTroyCloseSummaryLineBuilder();
    builder.push('【TROY CLOSE 売上まとめ】', { force: true });
    builder.push(`営業日: ${summary.dayKey || getTroyBusinessDayKey()}`, { force: true });
    builder.push(`国: ${getNationLabel(summary.nation) || summary.nation || '-'}`, { force: true });
    builder.push(`総売上: ${formatTroyMoney(settledTotal)} / ${settledCount}伝票`, { force: true });
    builder.push(`チャージ代: ${formatTroyMoney(payouts.chargeTotal)}`, { force: true });
    builder.push(`チャージ除外売上: ${formatTroyMoney(payouts.nonChargeTotal)}`, { force: true });
    builder.push(`マスター取り分: ${formatTroyMoney(payouts.masterShare)}（チャージ代を抜いた売上金額の半分）`, { force: true });
    builder.push(`ディーラー取り分: ${formatTroyMoney(payouts.dealerShare)}（チャージ代）`, { force: true });
    builder.push(`未会計伝票: ${pendingCount}件 / ${formatTroyMoney(pendingTotal)}`, { force: true });
    builder.push(`記録合計: ${formatTroyMoney(recordedTotal)}`, { force: true });
    builder.push(`入店中: ${Math.max(0, Math.floor(Number(summary.memberCount) || 0))}名`, { force: true });
    if (settledCustomerLines.length) {
        builder.push('会計済み客別:');
        settledCustomerLines.forEach((line) => builder.push(line));
    }
    if (settledCategoryLines.length) {
        builder.push('カテゴリ別売上:');
        settledCategoryLines.forEach((line) => builder.push(line));
    }
    if (settledItemLines.length) {
        builder.push('商品別売上:');
        settledItemLines.forEach((line) => builder.push(line));
    }
    if (itemLines.length) {
        builder.push('未会計内訳:');
        itemLines.forEach((line) => builder.push(line));
    }
    if (pendingCount > 0) {
        builder.push('※未会計伝票はCLOSE処理でクリアされます。');
    }
    return builder.finish();
}

const TROY_LAST_ORDER_UNDO_WINDOW_MS = 45 * 1000;

function isPlacementAllowedByWeekday(date = new Date()) {
    const weekday = getJapanWeekdayNumber(date);
    return WORLD_MAP_PLACEMENT_WEEKDAYS_JST.has(weekday);
}

function getArcanaPointValue(mapId) {
    const key = String(mapId || '').trim();
    if (!key.startsWith('major_')) return 0;
    const raw = key.replace('major_', '');
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
}

function calcNationLevel(points) {
    const safePoints = Math.max(0, Math.floor(Number(points) || 0));
    if (safePoints <= 10) return Math.max(1, safePoints);
    if (safePoints <= 20) return 11;
    if (safePoints <= 30) return 12;
    if (safePoints <= 40) return 13;
    return NATION_LEVEL_MAX;
}

async function updateNationArcanaPoints(nation, delta, deps) {
    const { firestore, admin } = deps || {};
    const mapping = getNationMappingByNation(nation);
    if (!mapping || !firestore) return;
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const current = Math.max(0, Math.floor(Number(snap.data()?.arcanaPoints || 0)));
        const next = Math.max(0, current + Math.floor(Number(delta) || 0));
        const level = calcNationLevel(next);
        const patch = {
            arcanaPoints: next,
            nationLevel: level
        };
        if (admin) {
            patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        tx.set(docRef, patch, { merge: true });
    });
}

async function getMapOccupationMap(deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    const result = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [MAP_OCCUPATION_KEY] });
    const raw = result?.Data?.[MAP_OCCUPATION_KEY] || '';
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function getMapOccupationNation(mapId, deps) {
    const key = String(mapId || '').trim();
    if (!key) return null;
    const map = await getMapOccupationMap(deps);
    const value = map?.[key];
    return value ? String(value).toLowerCase() : null;
}

async function getWorldMapLayout(deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    const result = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [WORLD_MAP_LAYOUT_KEY] });
    const raw = result?.Data?.[WORLD_MAP_LAYOUT_KEY] || '';
    if (!raw) return WORLD_MAP_DEFAULT_LAYOUT.slice();
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === WORLD_MAP_DEFAULT_LAYOUT.length) {
            return parsed;
        }
    } catch {
        // ignore
    }
    return WORLD_MAP_DEFAULT_LAYOUT.slice();
}

async function setWorldMapLayout(layout, deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    if (!Array.isArray(layout) || layout.length !== WORLD_MAP_DEFAULT_LAYOUT.length) {
        throw new Error('InvalidLayout');
    }
    await promisifyPlayFab(PlayFabAdmin.SetTitleData, {
        Key: WORLD_MAP_LAYOUT_KEY,
        Value: JSON.stringify(layout)
    });
    return layout;
}

async function setMapOccupationNation(mapId, nation, deps) {
    const key = String(mapId || '').trim();
    if (!key) return null;
    const map = await getMapOccupationMap(deps);
    const prevNation = map[key] ? String(map[key]).toLowerCase() : null;
    const nextNation = nation ? String(nation).toLowerCase() : null;
    if (nextNation) {
        map[key] = nextNation;
    } else {
        delete map[key];
    }
    await deps.promisifyPlayFab(deps.PlayFabAdmin.SetTitleData, {
        Key: MAP_OCCUPATION_KEY,
        Value: JSON.stringify(map)
    });
    const arcanaValue = getArcanaPointValue(key);
    if (arcanaValue > 0 && prevNation !== nextNation) {
        if (prevNation) {
            await updateNationArcanaPoints(prevNation, -arcanaValue, deps);
        }
        if (nextNation) {
            await updateNationArcanaPoints(nextNation, arcanaValue, deps);
        }
    }
    return map[key] || null;
}

async function getPlayerDisplayName(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true }
        });
        const name = profile?.PlayerProfile?.DisplayName;
        return name ? String(name) : '';
    } catch (error) {
        console.warn('[getPlayerDisplayName] Failed:', error?.errorMessage || error?.message || error);
        return '';
    }
}

async function ensureNationGroupExists(firestore, mapping, deps) {
    const { promisifyPlayFab, PlayFabAdmin, PlayFabGroups, admin } = deps;

    const docRef = await getNationGroupDoc(firestore, mapping.groupName);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data()?.groupId) {
        const existingGroupId = docSnap.data().groupId;
        try {
            await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.GetGroup, {
                Group: { Id: existingGroupId, Type: 'group' }
            });
            return {
                groupId: existingGroupId,
                groupName: mapping.groupName,
                created: false
            };
        } catch (e) {
            console.warn('[ensureNationGroupExists] Stored groupId invalid, recreating:', existingGroupId);
        }
    }

    const titleDataKey = 'NationGroupIds';
    const titleData = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [titleDataKey] });
    let titleGroupId = null;
    if (titleData?.Data?.[titleDataKey]) {
        try {
            const parsed = JSON.parse(titleData.Data[titleDataKey]);
            titleGroupId = parsed?.[mapping.groupName] || null;
        } catch (e) {
            console.warn('[ensureNationGroupExists] Failed to parse TitleData:', e?.message || e);
        }
    }
    if (titleGroupId) {
        try {
            await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.GetGroup, {
                Group: { Id: titleGroupId, Type: 'group' }
            });
            await docRef.set({
                groupId: titleGroupId,
                groupName: mapping.groupName,
                nation: mapping.island,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { groupId: titleGroupId, groupName: mapping.groupName, created: false };
        } catch (e) {
            console.warn('[ensureNationGroupExists] TitleData groupId invalid, recreating:', titleGroupId);
            titleGroupId = null;
        }
    }

    const createResult = await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.CreateGroup, {
        GroupName: mapping.groupName
    });
    const groupId = createResult?.Group?.Id || null;
    if (!groupId) {
        throw new Error('CreateGroup did not return group id');
    }

    await docRef.set({
        groupId,
        groupName: mapping.groupName,
        nation: mapping.island,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const newTitleMap = { [mapping.groupName]: groupId };
    try {
        const existing = titleData?.Data?.[titleDataKey] ? JSON.parse(titleData.Data[titleDataKey]) : {};
        const merged = { ...existing, ...newTitleMap };
        await promisifyPlayFab(PlayFabAdmin.SetTitleData, {
            Key: titleDataKey,
            Value: JSON.stringify(merged)
        });
    } catch (e) {
        console.warn('[ensureNationGroupExists] Failed to update TitleData:', e?.message || e);
    }

    return { groupId, groupName: mapping.groupName, created: true };
}

async function getNationGroupIdByNation(nation, firestore, deps) {
    const key = String(nation || '').toLowerCase();
    if (!key) return null;
    const mapping = getNationMappingByNation(key);
    if (!mapping) return null;
    const info = await ensureNationGroupExists(firestore, mapping, deps);
    return info?.groupId || null;
}

async function getNationGroupEntityKey(nation, firestore, deps) {
    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) return null;
    return { Id: groupId, Type: 'group' };
}

async function getExistingNationGroupIdByNation(nation, firestore) {
    const mapping = getNationMappingByNation(nation);
    if (!mapping) return null;
    const snap = await getNationGroupDoc(firestore, mapping.groupName).get();
    return snap.exists ? String(snap.data()?.groupId || '').trim() || null : null;
}

function getPlayFabObjectData(objectsResult, objectName) {
    const objects = objectsResult?.Data?.Objects || objectsResult?.Objects || {};
    const entry = objects?.[objectName];
    if (!entry) return null;
    return entry?.DataObject ?? entry?.Object ?? entry;
}

function normalizeNationAnnouncementObject(value) {
    let data = value;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            data = { message: data };
        }
    }
    const message = String(data?.message || '').trim().slice(0, 200);
    const updatedAtRaw = Number(data?.updatedAt || 0);
    const updatedAt = Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : null;
    return { message, updatedAt };
}

async function getAllNationAnnouncements(firestore, deps) {
    const now = Date.now();
    if (nationAnnouncementCache.payload && nationAnnouncementCache.expiresAt > now) {
        return nationAnnouncementCache.payload;
    }

    const announcements = [];
    for (const nation of Object.keys(NATION_GROUP_BY_NATION)) {
        try {
            const groupId = await getExistingNationGroupIdByNation(nation, firestore);
            if (!groupId) continue;
            const objectsResult = await callTitleScopedApi(deps.promisifyPlayFab, PlayFabData.GetObjects, {
                Entity: { Id: groupId, Type: 'group' },
                EscapeObject: false
            });
            const announcement = normalizeNationAnnouncementObject(getPlayFabObjectData(objectsResult, 'NationAnnouncement'));
            if (!announcement.message) continue;
            announcements.push({
                nation,
                nationLabel: getNationLabel(nation),
                message: announcement.message,
                updatedAt: announcement.updatedAt
            });
        } catch (error) {
            console.warn('[get-nation-announcements] Failed to load nation announcement:', nation, error?.message || error);
        }
    }

    announcements.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    const payload = { announcements: announcements.slice(0, 1) };
    nationAnnouncementCache = {
        expiresAt: now + NATION_ANNOUNCEMENT_CACHE_TTL_MS,
        payload
    };
    return payload;
}

async function getGroupTreasuryBalance(groupId, deps) {
    if (!groupId) return 0;
    if (!deps?.getAllInventoryItems || !deps?.getVirtualCurrencyMap) return 0;
    const entityKey = { Id: groupId, Type: 'group' };
    const items = await deps.getAllInventoryItems(entityKey);
    const totals = deps.getVirtualCurrencyMap(items);
    return Math.max(0, Math.floor(Number(totals?.PS) || 0));
}

async function getNationTaxRateBps(_nation, _firestore, _deps) {
    return 0;
}

function buildTreasuryRecentEntry(entry = {}) {
    const rawAmount = Number(entry?.signedAmount ?? entry?.amount ?? 0);
    const amount = Math.max(0, Math.floor(Math.abs(rawAmount) || 0));
    const direction = String(entry?.direction || (rawAmount < 0 ? 'out' : 'in')).toLowerCase() === 'out' ? 'out' : 'in';
    const currency = String(entry?.currency || 'PS').trim().toUpperCase() || 'PS';
    const source = String(entry?.source || 'manual_adjustment').trim().toLowerCase() || 'manual_adjustment';
    const label = String(entry?.label || TREASURY_SOURCE_LABELS[source] || '国庫更新').trim().slice(0, 40) || '国庫更新';
    const timestampMs = Math.max(0, Math.floor(Number(entry?.timestampMs || Date.now()) || Date.now()));
    const actorId = normalizePlayFabId(entry?.actorId || '');
    const actorName = String(entry?.actorName || '').trim().slice(0, 40);
    const note = String(entry?.note || '').trim().slice(0, 80);
    const entryId = String(entry?.entryId || entry?.id || `${source}:${currency}:${direction}:${amount}:${timestampMs}:${actorId || 'anon'}`)
        .trim()
        .slice(0, 120);
    return {
        entryId,
        direction,
        currency,
        amount,
        source,
        label,
        timestampMs,
        actorId,
        actorName,
        note
    };
}

async function appendNationTreasuryRecentEntry(nation, firestore, admin, entry = {}) {
    const mapping = getNationMappingByNation(nation);
    if (!mapping || !firestore || !admin) return;
    const nextEntry = buildTreasuryRecentEntry(entry);
    if (!nextEntry.amount) return;
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const currentRaw = Array.isArray(snap.data()?.treasuryRecentEntries) ? snap.data().treasuryRecentEntries : [];
        const current = currentRaw
            .map((row) => buildTreasuryRecentEntry(row))
            .filter((row) => row.amount > 0 && row.entryId !== nextEntry.entryId);
        const recentEntries = [nextEntry, ...current]
            .sort((a, b) => b.timestampMs - a.timestampMs)
            .slice(0, MAX_TREASURY_RECENT_ENTRIES);
        tx.set(docRef, {
            treasuryRecentEntries: recentEntries,
            treasuryRecentUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

async function addTroyDailySales(nation, amount, firestore, admin, options = {}) {
    const mapping = getNationMappingByNation(nation);
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!mapping || !firestore || !admin || value <= 0) return null;
    const dayKey = normalizeTroyBusinessDayKey(options.dayKey || options.businessDayKey)
        || getTroyBusinessDayKey(options.date || new Date());
    const addedBreakdowns = buildTroySalesBreakdownsFromItems(options.items || options.checkoutItems || []);
    const settlementSource = options.settlement || options.checkout || null;
    const addedSettlement = (settlementSource || options.displayName || options.playFabId)
        ? normalizeTroySalesSettlementRow({
            ...(settlementSource || {}),
            settlementId: options.settlementId || settlementSource?.settlementId,
            playFabId: options.playFabId || settlementSource?.playFabId,
            displayName: options.displayName || settlementSource?.displayName,
            total: value,
            totalItems: options.totalItems ?? settlementSource?.totalItems,
            settledAtMs: options.settledAtMs || settlementSource?.settledAtMs || Date.now()
        })
        : null;
    const addedSettlements = addedSettlement ? [addedSettlement] : [];
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    let nextTotal = value;
    let nextCount = 1;
    let nextItems = [];
    let nextCategories = [];
    let nextSettlements = addedSettlements;
    let nextPayouts = buildTroySalesPayouts({ total: value, items: addedBreakdowns.items, categories: addedBreakdowns.categories });
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.data() || {};
        const currentDayKey = String(data.troyTodaySalesDayKey || '').trim();
        const currentTotal = currentDayKey === dayKey ? Math.max(0, Math.floor(Number(data.troyTodaySalesTotal) || 0)) : 0;
        const currentCount = currentDayKey === dayKey ? Math.max(0, Math.floor(Number(data.troyTodaySalesCount) || 0)) : 0;
        const currentItems = currentDayKey === dayKey && Array.isArray(data.troyTodaySalesItems) ? data.troyTodaySalesItems : [];
        const currentCategories = currentDayKey === dayKey && Array.isArray(data.troyTodaySalesCategories) ? data.troyTodaySalesCategories : [];
        const currentSettlements = currentDayKey === dayKey && Array.isArray(data.troyTodaySalesSettlements) ? data.troyTodaySalesSettlements : [];
        nextTotal = currentTotal + value;
        nextCount = currentCount + 1;
        nextItems = mergeTroySalesRows(
            currentItems,
            addedBreakdowns.items,
            normalizeTroySalesItemRow,
            (row) => row.name
        );
        nextCategories = mergeTroySalesRows(
            currentCategories,
            addedBreakdowns.categories,
            normalizeTroySalesCategoryRow,
            (row) => row.categoryId || row.name
        );
        nextSettlements = mergeTroySettlementRows(currentSettlements, addedSettlements);
        tx.set(docRef, {
            troyTodaySalesDayKey: dayKey,
            troyTodaySalesTotal: nextTotal,
            troyTodaySalesCount: nextCount,
            troyTodaySalesItems: nextItems,
            troyTodaySalesCategories: nextCategories,
            troyTodaySalesSettlements: nextSettlements,
            troyTodaySalesUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        nextPayouts = buildTroySalesPayouts({ total: nextTotal, items: nextItems, categories: nextCategories });
    });
    return { dayKey, total: nextTotal, count: nextCount, items: nextItems, categories: nextCategories, settlements: nextSettlements, payouts: nextPayouts };
}

async function incrementTroyDailyOrderCount(nation, playFabId, firestore, admin) {
    const mapping = getNationMappingByNation(nation);
    const memberId = normalizePlayFabId(playFabId);
    if (!mapping || !memberId || !firestore || !admin) return 1;
    const dayKey = getTroyBusinessDayKey();
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    let nextCount = 1;
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.data() || {};
        const currentDayKey = String(data.troyTodayOrderCountsDayKey || '').trim();
        const currentCounts = currentDayKey === dayKey && data.troyTodayOrderCounts && typeof data.troyTodayOrderCounts === 'object'
            ? data.troyTodayOrderCounts
            : {};
        const nextCounts = { ...currentCounts };
        nextCount = Math.max(0, Math.floor(Number(nextCounts[memberId]) || 0)) + 1;
        nextCounts[memberId] = nextCount;
        tx.set(docRef, {
            troyTodayOrderCountsDayKey: dayKey,
            troyTodayOrderCounts: nextCounts,
            troyTodayOrderCountsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    return nextCount;
}

async function decrementTroyDailyOrderCount(nation, playFabId, firestore, admin) {
    const mapping = getNationMappingByNation(nation);
    const memberId = normalizePlayFabId(playFabId);
    if (!mapping || !memberId || !firestore || !admin) return null;
    const dayKey = getTroyBusinessDayKey();
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    let nextCount = 0;
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.data() || {};
        const currentDayKey = String(data.troyTodayOrderCountsDayKey || '').trim();
        if (currentDayKey !== dayKey) return;
        const currentCounts = data.troyTodayOrderCounts && typeof data.troyTodayOrderCounts === 'object'
            ? data.troyTodayOrderCounts
            : {};
        const nextCounts = { ...currentCounts };
        nextCount = Math.max(0, Math.floor(Number(nextCounts[memberId]) || 0) - 1);
        if (nextCount > 0) nextCounts[memberId] = nextCount;
        else delete nextCounts[memberId];
        tx.set(docRef, {
            troyTodayOrderCounts: nextCounts,
            troyTodayOrderCountsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    return nextCount;
}

function buildTroySettlementRowsFromTreasuryEntries(entries = [], dayKey = '') {
    const targetDayKey = normalizeTroyBusinessDayKey(dayKey) || getTroyBusinessDayKey();
    return mergeTroySettlementRows([], (Array.isArray(entries) ? entries : [])
        .map((entry) => buildTreasuryRecentEntry(entry))
        .filter((entry) => entry.direction === 'in' && ['troy_settlement', 'troy_order'].includes(entry.source))
        .filter((entry) => getTroyBusinessDayKey(new Date(entry.timestampMs || 0)) === targetDayKey)
        .map((entry) => ({
            settlementId: entry.entryId,
            playFabId: entry.actorId,
            displayName: entry.actorName || entry.actorId || 'お客様',
            total: entry.amount,
            settledAtMs: entry.timestampMs
        })));
}

function buildTroyTodaySalesSnapshot(groupData = {}, options = {}) {
    const todayDayKey = normalizeTroyBusinessDayKey(options.dayKey || options.businessDayKey)
        || getTroyBusinessDayKey(options.date || new Date());
    const storedDayKey = String(groupData?.troyTodaySalesDayKey || '').trim();
    const fallbackEntries = Array.isArray(groupData?.treasuryRecentEntries) ? groupData.treasuryRecentEntries : [];
    if (storedDayKey === todayDayKey) {
        const snapshotItems = sortTroySalesRows((Array.isArray(groupData?.troyTodaySalesItems) ? groupData.troyTodaySalesItems : [])
            .map(normalizeTroySalesItemRow)
            .filter(Boolean));
        const snapshotCategories = sortTroySalesRows((Array.isArray(groupData?.troyTodaySalesCategories) ? groupData.troyTodaySalesCategories : [])
            .map(normalizeTroySalesCategoryRow)
            .filter(Boolean));
        const storedSettlements = mergeTroySettlementRows([], Array.isArray(groupData?.troyTodaySalesSettlements) ? groupData.troyTodaySalesSettlements : []);
        const fallbackSettlements = storedSettlements.length
            ? []
            : buildTroySettlementRowsFromTreasuryEntries(fallbackEntries, todayDayKey);
        const snapshot = {
            dayKey: todayDayKey,
            total: Math.max(0, Math.floor(Number(groupData?.troyTodaySalesTotal) || 0)),
            count: Math.max(0, Math.floor(Number(groupData?.troyTodaySalesCount) || 0)),
            items: snapshotItems,
            categories: snapshotCategories,
            settlements: storedSettlements.length ? storedSettlements : fallbackSettlements
        };
        snapshot.payouts = buildTroySalesPayouts(snapshot);
        return snapshot;
    }
    const troyEntries = fallbackEntries
        .map((entry) => buildTreasuryRecentEntry(entry))
        .filter((entry) => entry.direction === 'in' && ['troy_settlement', 'troy_order'].includes(entry.source))
        .filter((entry) => getTroyBusinessDayKey(new Date(entry.timestampMs || 0)) === todayDayKey);
    const fallbackSnapshot = {
        dayKey: todayDayKey,
        total: troyEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
        count: troyEntries.length,
        items: [],
        categories: [],
        settlements: buildTroySettlementRowsFromTreasuryEntries(troyEntries, todayDayKey)
    };
    fallbackSnapshot.payouts = buildTroySalesPayouts(fallbackSnapshot);
    return fallbackSnapshot;
}

function buildTreasuryOverview(entries = []) {
    const recentEntries = (Array.isArray(entries) ? entries : [])
        .map((entry) => buildTreasuryRecentEntry(entry))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.timestampMs - a.timestampMs)
        .slice(0, MAX_TREASURY_RECENT_ENTRIES);
    const summaryMap = new Map();
    recentEntries.forEach((entry) => {
        const key = `${entry.direction}|${entry.currency}|${entry.source}`;
        const existing = summaryMap.get(key) || {
            direction: entry.direction,
            currency: entry.currency,
            source: entry.source,
            label: entry.label,
            totalAmount: 0,
            count: 0
        };
        existing.totalAmount += entry.amount;
        existing.count += 1;
        summaryMap.set(key, existing);
    });
    const summary = Array.from(summaryMap.values()).sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === 'in' ? -1 : 1;
        return b.totalAmount - a.totalAmount;
    });
    return { recentEntries, summary };
}

async function addNationTreasury(nation, amount, firestore, deps, options = {}) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    const entityKey = await getNationGroupEntityKey(nation, firestore, deps);
    if (!entityKey) {
        if (options.requireContribution) {
            throw new Error('Nation group not found for required contribution');
        }
        return null;
    }
    if (!deps?.addEconomyItem) {
        throw new Error('Missing addEconomyItem dependency');
    }
    if (value > 0) {
        await deps.addEconomyItem(entityKey.Id, 'PS', value, { entityKeyOverride: entityKey, idempotencyId: options.idempotencyId });
    }
    let contribution = null;
    if (value > 0 && options.contributorPlayFabId && !options.skipContributionUpdate) {
        try {
            contribution = await addPlayerNationContribution(options.contributorPlayFabId, value, deps);
        } catch (error) {
            console.warn('[addNationTreasury] Failed to update player contribution:', error?.errorMessage || error?.message || error);
            if (options.requireContribution) {
                throw error;
            }
        }
    }
    if (value > 0) {
        try {
            await appendNationTreasuryRecentEntry(nation, firestore, deps?.admin, {
                entryId: options.idempotencyId || '',
                amount: value,
                currency: options.currency || 'PS',
                source: options.source || 'manual_adjustment',
                label: options.label,
                actorId: options.contributorPlayFabId || '',
                actorName: options.contributorName || '',
                note: options.note || ''
            });
        } catch (error) {
            console.warn('[addNationTreasury] Failed to append treasury entry:', error?.message || error);
        }
    }
    const treasuryPs = await getGroupTreasuryBalance(entityKey.Id, deps);
    return { groupId: entityKey.Id, treasuryPs, contribution };
}

async function getNationTreasuryRanking(firestore, deps) {
    const rows = [];
    for (const mapping of Object.values(NATION_GROUP_BY_NATION)) {
        try {
            const info = await ensureNationGroupExists(firestore, mapping, deps);
            const groupId = info?.groupId;
            if (!groupId) {
                rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs: 0 });
                continue;
            }
            const treasuryPs = await getGroupTreasuryBalance(groupId, deps);
            rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs });
        } catch (error) {
            console.warn('[getNationTreasuryRanking] Failed for', mapping?.groupName, error?.message || error);
            rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs: 0 });
        }
    }

    rows.sort((a, b) => (b.treasuryPs - a.treasuryPs) || String(a.nation || '').localeCompare(String(b.nation || '')));
    return rows;
}

function getTreasuryCashbackRateBpsByRank(rank) {
    const normalizedRank = Math.max(1, Math.floor(Number(rank) || 1));
    return TREASURY_CASHBACK_RATE_BPS_BY_RANK[Math.min(normalizedRank, TREASURY_CASHBACK_RATE_BPS_BY_RANK.length) - 1]
        || TREASURY_CASHBACK_RATE_BPS_BY_RANK[TREASURY_CASHBACK_RATE_BPS_BY_RANK.length - 1];
}

async function getNationTreasuryCashbackInfo(nation, firestore, deps) {
    const ranking = await getNationTreasuryRanking(firestore, deps);
    const nationKey = String(nation || '').toLowerCase();
    const rankIndex = ranking.findIndex((row) => String(row?.nation || '').toLowerCase() === nationKey);
    const rank = rankIndex >= 0 ? rankIndex + 1 : ranking.length + 1;
    const rateBps = getTreasuryCashbackRateBpsByRank(rank);
    return {
        rank,
        rateBps,
        rateRatio: rateBps / 10000,
        ratePercent: rateBps / 100,
        ranking
    };
}

function getNationWarDoc(firestore, nation) {
    return firestore.collection(NATION_WAR_STATE_COLLECTION).doc(String(nation || '').toLowerCase());
}

function getNationWarEventsCollection(firestore) {
    return firestore.collection(NATION_WAR_EVENT_COLLECTION);
}

function clampWarPercent(value) {
    return Math.max(0, Math.min(100, Math.floor(Number(value) || 0)));
}

function getWarPercentBand(value) {
    const safe = clampWarPercent(value);
    if (safe >= 70) return { key: 'high', label: '高' };
    if (safe >= 40) return { key: 'medium', label: '中' };
    return { key: 'low', label: '低' };
}

function getWarCertaintyBand(value) {
    const safe = clampWarPercent(value);
    if (safe >= 70) return { key: 'high', label: '確実' };
    if (safe >= 40) return { key: 'medium', label: '推定' };
    return { key: 'low', label: '不明' };
}

function getCapitalCaptureSpeedMultiplier(memberCount) {
    const count = Math.max(1, Math.floor(Number(memberCount) || 1));
    return Math.min(4, 1 + ((count - 1) * 0.5));
}

function buildCapitalCaptureQueueEntry(playFabId, nation, nowMs, shipId = '') {
    return {
        playFabId: String(playFabId || '').trim(),
        nation: String(nation || '').trim().toLowerCase(),
        shipId: String(shipId || '').trim(),
        joinedAt: Math.max(0, Math.floor(Number(nowMs) || Date.now()))
    };
}

function advanceNationWarCaptureState(state, nowMs = Date.now()) {
    if (!state || state.status !== 'capturing' || !Array.isArray(state.queue) || state.queue.length === 0) {
        return state;
    }
    const safeNow = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const lastAt = Number(state.lastProgressAt) || 0;
    if (lastAt > 0 && safeNow > lastAt) {
        const elapsedMs = safeNow - lastAt;
        state.progressBaseMs = Math.min(
            state.baseDurationMs,
            state.progressBaseMs + (elapsedMs * getCapitalCaptureSpeedMultiplier(state.queue.length))
        );
    }
    state.lastProgressAt = safeNow;
    const remainingBaseMs = Math.max(0, state.baseDurationMs - state.progressBaseMs);
    state.endsAt = remainingBaseMs <= 0
        ? safeNow
        : safeNow + Math.ceil(remainingBaseMs / getCapitalCaptureSpeedMultiplier(state.queue.length));
    return state;
}

function refreshNationWarCaptureState(rawState, warState, nowMs = Date.now()) {
    const safeNow = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const state = normalizeCapitalCaptureState(rawState, warState?.capitalStatus, safeNow);
    const breached = clampWarPercent(warState?.capitalStatus?.walls) <= CAPITAL_CAPTURE_BREACH_WALLS;
    state.slotLimit = CAPITAL_CAPTURE_SLOT_LIMIT;
    state.baseDurationMs = CAPITAL_CAPTURE_BASE_DURATION_MS;
    state.intelByNation = Object.entries(state.intelByNation || {}).reduce((acc, [nation, expiresAtMs]) => {
        const key = String(nation || '').trim().toLowerCase();
        const safeExpiresAtMs = Math.max(0, Math.floor(Number(expiresAtMs) || 0));
        if (key && safeExpiresAtMs > safeNow) acc[key] = safeExpiresAtMs;
        return acc;
    }, {});
    state.progressBaseMs = Math.max(0, Math.min(state.baseDurationMs, Math.floor(Number(state.progressBaseMs) || 0)));
    if (state.raidUnlockedAtMs > 0) {
        state.status = 'captured';
        state.queue = [];
        state.progressBaseMs = state.baseDurationMs;
        state.lastProgressAt = 0;
        state.endsAt = 0;
        return state;
    }
    if (!breached) {
        state.status = 'idle';
        state.breachedAt = 0;
        state.queue = [];
        state.progressBaseMs = 0;
        state.lastProgressAt = 0;
        state.endsAt = 0;
        state.ownerCandidateId = null;
        state.ownerCandidateNation = null;
        return state;
    }
    if (!state.breachedAt) {
        state.breachedAt = safeNow;
    }
    if (Array.isArray(state.queue) && state.queue.length > 0) {
        state.status = 'capturing';
        state.ownerCandidateId = state.queue[0].playFabId;
        state.ownerCandidateNation = state.queue[0].nation || null;
        return advanceNationWarCaptureState(state, safeNow);
    }
    state.status = 'breached';
    state.lastProgressAt = 0;
    state.endsAt = 0;
    state.ownerCandidateId = null;
    state.ownerCandidateNation = null;
    return state;
}

async function resolveNationWarCaptureState(nation, state, firestore, admin) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const safeNow = Date.now();
    const nextState = normalizeNationWarState(state, nationKey, safeNow);
    const prevCaptureState = nextState.capitalCaptureState || null;
    const refreshedCaptureState = refreshNationWarCaptureState(prevCaptureState, nextState, safeNow);
    let changed = JSON.stringify(prevCaptureState || {}) !== JSON.stringify(refreshedCaptureState || {});
    nextState.capitalCaptureState = refreshedCaptureState;
    if (
        refreshedCaptureState.status === 'capturing'
        && refreshedCaptureState.progressBaseMs >= refreshedCaptureState.baseDurationMs
        && refreshedCaptureState.queue.length > 0
        && !refreshedCaptureState.raidUnlockedAtMs
    ) {
        const leader = refreshedCaptureState.queue[0] || null;
        const participantIds = refreshedCaptureState.queue.map((entry) => String(entry.playFabId || '').trim()).filter(Boolean);
        refreshedCaptureState.status = 'captured';
        refreshedCaptureState.raidUnlockedAtMs = safeNow;
        refreshedCaptureState.raidUnlockedByNation = leader?.nation || null;
        refreshedCaptureState.lastCapturedByNation = leader?.nation || null;
        refreshedCaptureState.lastCapturedAtMs = safeNow;
        refreshedCaptureState.lastCaptureParticipantIds = Array.from(new Set(participantIds)).slice(0, 8);
        refreshedCaptureState.progressBaseMs = refreshedCaptureState.baseDurationMs;
        refreshedCaptureState.queue = [];
        refreshedCaptureState.lastProgressAt = 0;
        refreshedCaptureState.endsAt = 0;
        changed = true;
        await appendNationWarEvent(firestore, admin, {
            type: 'capital_capture_complete',
            publicLevel: 'global',
            summary: `${getNationLabel(nationKey)}の首都防衛が崩れ、国庫襲撃が可能になった`,
            details: leader?.nation ? `${getNationLabel(leader.nation)}の攻城隊が制圧を完了` : '制圧が完了した。',
            participants: [nationKey, leader?.nation].filter(Boolean),
            attackerNation: leader?.nation || '',
            defenderNation: nationKey
        });
    }
    if (changed) {
        nextState.capitalCaptureState = refreshedCaptureState;
        await saveNationWarState(nationKey, nextState, firestore, admin);
    }
    return nextState;
}

function canViewCapitalIntel(viewerNation, defenderNation, captureState) {
    const viewerKey = String(viewerNation || '').trim().toLowerCase();
    const defenderKey = String(defenderNation || '').trim().toLowerCase();
    if (!viewerKey) return false;
    if (viewerKey === defenderKey) return true;
    const expiresAtMs = Math.max(0, Math.floor(Number(captureState?.intelByNation?.[viewerKey]) || 0));
    return expiresAtMs > Date.now();
}

function buildCapitalCapturePayload(captureState, viewerNation = '', defenderNation = '') {
    const safeNow = Date.now();
    const state = captureState && typeof captureState === 'object'
        ? captureState
        : normalizeCapitalCaptureState(null, { walls: 100 }, safeNow);
    const queue = Array.isArray(state.queue) ? state.queue : [];
    const intelGranted = canViewCapitalIntel(viewerNation, defenderNation, state);
    const raidCooldownUntilMs = Math.max(0, Math.floor(Number(state.raidCooldownUntilMs) || 0));
    const raidCooldownActive = raidCooldownUntilMs > safeNow;
    const raidUnlocked = state.raidUnlockedAtMs > 0 && !raidCooldownActive;
    return {
        status: state.status,
        slotLimit: state.slotLimit,
        queueCount: queue.length,
        queue: queue.map((entry) => ({
            playFabId: entry.playFabId,
            nation: entry.nation,
            joinedAt: entry.joinedAt
        })),
        remainingMs: queue.length > 0 && state.endsAt > 0 ? Math.max(0, state.endsAt - safeNow) : 0,
        progressRatio: state.baseDurationMs > 0 ? Math.max(0, Math.min(1, state.progressBaseMs / state.baseDurationMs)) : 0,
        breached: state.status === 'breached' || state.status === 'capturing' || state.status === 'captured',
        breachThreshold: CAPITAL_CAPTURE_BREACH_WALLS,
        raidUnlocked,
        raidUnlockedAtMs: state.raidUnlockedAtMs,
        raidUnlockedByNation: state.raidUnlockedByNation || null,
        raidCooldownUntilMs,
        raidCooldownRemainingMs: raidCooldownActive ? Math.max(0, raidCooldownUntilMs - safeNow) : 0,
        raidCooldownActive,
        intelGranted,
        intelRemainingMs: intelGranted && viewerNation && viewerNation !== defenderNation
            ? Math.max(0, Math.floor(Number(state.intelByNation?.[String(viewerNation).trim().toLowerCase()] || 0) - safeNow))
            : 0
    };
}

function buildNationWarSystemEntry(weapon, nowMs) {
    const deployedAtMs = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const durationMs = Math.max(0, Math.floor(Number(weapon?.durationSeconds || 0) * 1000));
    return {
        id: `${String(weapon?.id || 'system')}:${deployedAtMs}:${Math.random().toString(36).slice(2, 8)}`,
        weaponId: String(weapon?.id || '').trim().toLowerCase(),
        deployedAtMs,
        expiresAtMs: durationMs > 0 ? (deployedAtMs + durationMs) : 0,
        ammoRemaining: Math.max(0, Math.floor(Number(weapon?.ammo) || 0))
    };
}

function buildNationWarStrikeEntry({ attackerNation, defenderNation, weapon, targetPart, attackBonus }, nowMs) {
    const createdAtMs = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const prepMs = Math.max(0, Math.floor(Number(weapon?.prepSeconds || 0) * 1000));
    return {
        id: `${String(weapon?.id || 'strike')}:${createdAtMs}:${Math.random().toString(36).slice(2, 8)}`,
        attackerNation: String(attackerNation || '').trim().toLowerCase(),
        defenderNation: String(defenderNation || '').trim().toLowerCase(),
        weaponId: String(weapon?.id || '').trim().toLowerCase(),
        targetPart: String(targetPart || '').trim() || 'walls',
        createdAtMs,
        launchAtMs: createdAtMs + prepMs,
        decision: 'pending',
        interceptSystemId: '',
        attackBonus: {
            hit: Math.floor(Number(attackBonus?.hit) || 0),
            damage: Math.floor(Number(attackBonus?.damage) || 0),
            damageByPart: Object.entries(attackBonus?.damageByPart || {}).reduce((acc, [part, value]) => {
                acc[String(part || '').trim()] = Math.floor(Number(value) || 0);
                return acc;
            }, {})
        },
        targetKnown: false
    };
}

async function appendNationWarEvent(firestore, admin, event = {}) {
    if (!firestore || !admin) return null;
    const createdAtMs = Math.max(0, Math.floor(Number(event.createdAtMs) || Date.now()));
    const payload = {
        type: String(event.type || 'info').trim().toLowerCase() || 'info',
        publicLevel: String(event.publicLevel || 'nation').trim().toLowerCase() || 'nation',
        summary: String(event.summary || '').trim().slice(0, 180),
        details: String(event.details || '').trim().slice(0, 260),
        participants: Array.from(new Set((Array.isArray(event.participants) ? event.participants : [])
            .map((row) => String(row || '').trim().toLowerCase())
            .filter(Boolean))).slice(0, 4),
        attackerNation: String(event.attackerNation || '').trim().toLowerCase(),
        defenderNation: String(event.defenderNation || '').trim().toLowerCase(),
        weaponId: String(event.weaponId || '').trim().toLowerCase(),
        createdAtMs,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (!payload.summary) return null;
    await getNationWarEventsCollection(firestore).add(payload);
    if (payload.publicLevel === 'global') {
        addGlobalChatMessage(payload.summary, 'War');
    }
    return payload;
}

async function getRecentNationWarLogs(firestore, nation) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const snap = await getNationWarEventsCollection(firestore)
        .orderBy('createdAtMs', 'desc')
        .limit(NATION_WAR_EVENT_LIMIT)
        .get();
    const rows = snap.docs.map((doc) => {
        const data = doc.data() || {};
        return {
            id: doc.id,
            type: String(data.type || 'info').trim().toLowerCase() || 'info',
            publicLevel: String(data.publicLevel || 'nation').trim().toLowerCase() || 'nation',
            summary: String(data.summary || '').trim(),
            details: String(data.details || '').trim(),
            participants: Array.isArray(data.participants) ? data.participants.map((row) => String(row || '').trim().toLowerCase()).filter(Boolean) : [],
            attackerNation: String(data.attackerNation || '').trim().toLowerCase(),
            defenderNation: String(data.defenderNation || '').trim().toLowerCase(),
            weaponId: String(data.weaponId || '').trim().toLowerCase(),
            createdAtMs: Math.max(0, Math.floor(Number(data.createdAtMs) || 0))
        };
    });
    return {
        global: rows.filter((row) => row.publicLevel === 'global').slice(0, 12),
        nation: rows.filter((row) => row.participants.includes(nationKey) || row.publicLevel === 'global').slice(0, 16),
        detailed: rows.filter((row) => row.participants.includes(nationKey)).slice(0, 20)
    };
}

async function subtractNationTreasury(nation, amount, firestore, deps, options = {}) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    const entityKey = await getNationGroupEntityKey(nation, firestore, deps);
    if (!entityKey) return null;
    if (!deps?.subtractEconomyItem) {
        throw new Error('Missing subtractEconomyItem dependency');
    }
    if (value > 0) {
        await deps.subtractEconomyItem(entityKey.Id, 'PS', value, { entityKeyOverride: entityKey, idempotencyId: options.idempotencyId });
    }
    if (value > 0) {
        try {
            await appendNationTreasuryRecentEntry(nation, firestore, deps?.admin, {
                entryId: options.idempotencyId || '',
                amount: value,
                direction: 'out',
                currency: options.currency || 'PS',
                source: options.source || 'manual_adjustment',
                label: options.label,
                actorId: options.actorId || '',
                actorName: options.actorName || '',
                note: options.note || ''
            });
        } catch (error) {
            console.warn('[subtractNationTreasury] Failed to append treasury entry:', error?.message || error);
        }
    }
    const treasuryPs = await getGroupTreasuryBalance(entityKey.Id, deps);
    return { groupId: entityKey.Id, treasuryPs };
}

function getActiveNationWarSystems(state, nowMs) {
    return (Array.isArray(state?.activeSystems) ? state.activeSystems : [])
        .filter((system) => !system.expiresAtMs || system.expiresAtMs > nowMs);
}

function collectNationWarBonuses(state, nowMs) {
    const totals = {
        defense: { detect: 0, identify: 0, interceptSupport: 0, enemyHitPenalty: 0 },
        recon: { detect: 0, identify: 0 },
        attack: { hit: 0, damage: 0, damageByPart: {} }
    };
    getActiveNationWarSystems(state, nowMs).forEach((system) => {
        const weapon = getNationWarWeaponDefinition(system.weaponId);
        const defenseEffects = weapon?.effects?.defense || {};
        const reconEffects = weapon?.effects?.recon || {};
        const attackEffects = weapon?.effects?.attack || {};
        totals.defense.detect += Math.floor(Number(defenseEffects.detect) || 0);
        totals.defense.identify += Math.floor(Number(defenseEffects.identify) || 0);
        totals.defense.interceptSupport += Math.floor(Number(defenseEffects.interceptSupport) || 0);
        totals.defense.enemyHitPenalty += Math.floor(Number(defenseEffects.enemyHitPenalty) || 0);
        totals.recon.detect += Math.floor(Number(reconEffects.detect) || 0);
        totals.recon.identify += Math.floor(Number(reconEffects.identify) || 0);
        totals.attack.hit += Math.floor(Number(attackEffects.hit) || 0);
        totals.attack.damage += Math.floor(Number(attackEffects.damage) || 0);
        Object.entries(attackEffects.damageByPart || {}).forEach(([part, value]) => {
            const key = String(part || '').trim();
            if (!key) return;
            totals.attack.damageByPart[key] = (totals.attack.damageByPart[key] || 0) + Math.floor(Number(value) || 0);
        });
    });
    return totals;
}

function buildNationWarAttackSnapshot(state, nowMs) {
    const totals = collectNationWarBonuses(state, nowMs);
    return {
        hit: totals.attack.hit,
        damage: totals.attack.damage,
        damageByPart: totals.attack.damageByPart
    };
}

function buildNationWarIncomingIntel(incoming, defenderState, nowMs) {
    const weapon = getNationWarWeaponDefinition(incoming.weaponId);
    const capitalStatus = defenderState?.capitalStatus || createDefaultNationWarState(defenderState?.nation || '').capitalStatus;
    const totals = collectNationWarBonuses(defenderState, nowMs);
    const identifyScore = clampWarPercent(45 + totals.defense.identify + totals.recon.identify - Math.floor(Number(weapon?.identifyDifficulty) || 0));
    const hitScore = clampWarPercent(
        Math.floor(Number(weapon?.hit) || 0)
        + Math.floor(Number(incoming?.attackBonus?.hit) || 0)
        - totals.defense.enemyHitPenalty
        - Math.floor(Number(capitalStatus.airDefense || 0) * 0.12)
    );
    const decoyRiskScore = clampWarPercent(Math.floor(Number(weapon?.decoyValue) || 0) - Math.floor((totals.defense.identify + totals.recon.identify) * 0.6) + 35);
    const identifyBand = getWarCertaintyBand(identifyScore);
    const hitBand = getWarPercentBand(hitScore);
    const decoyBand = getWarPercentBand(decoyRiskScore);
    const targetBand = identifyScore >= 65 ? CAPITAL_PART_LABELS[incoming.targetPart] || '不明' : '不明';
    const weaponName = identifyScore >= 70
        ? weapon?.label || '飛来物'
        : identifyScore >= 40
            ? `推定 ${weapon?.label || '飛来物'}`
            : '正体不明の飛来物';
    return {
        identifyScore,
        hitScore,
        decoyRiskScore,
        identifyBand,
        hitBand,
        decoyBand,
        weaponName,
        targetLabel: targetBand
    };
}

function applyNationWarDamage(capitalStatus, incoming, weapon) {
    const next = { ...capitalStatus };
    const attackBonus = incoming.attackBonus || {};
    (Array.isArray(weapon?.payload) ? weapon.payload : []).forEach((entry) => {
        const part = String(entry?.part || '').trim();
        if (!part || !Object.prototype.hasOwnProperty.call(next, part)) return;
        const baseDamage = Math.floor(Number(entry?.damage) || 0);
        const extraDamage = Math.floor(Number(attackBonus.damage) || 0) + Math.floor(Number(attackBonus.damageByPart?.[part]) || 0);
        next[part] = clampWarPercent(next[part] - baseDamage - extraDamage);
    });
    return next;
}

function calculateNationWarRaidPlan(capitalStatus, treasuryPs, captureState = null) {
    const safeTreasury = Math.max(0, Math.floor(Number(treasuryPs) || 0));
    const safeStatus = {
        walls: clampWarPercent(capitalStatus?.walls),
        vault: clampWarPercent(capitalStatus?.vault),
        command: clampWarPercent(capitalStatus?.command)
    };
    const safeNow = Date.now();
    const raidCooldownUntilMs = Math.max(0, Math.floor(Number(captureState?.raidCooldownUntilMs) || 0));
    const raidCooldownActive = raidCooldownUntilMs > safeNow;
    const breachOpen = Math.max(0, Math.floor(Number(captureState?.raidUnlockedAtMs) || 0)) > 0 && !raidCooldownActive;
    const raidRate = 0.10
        + (((100 - safeStatus.vault) / 100) * 0.08)
        + (((100 - safeStatus.command) / 100) * 0.04);
    const maxSpendable = Math.max(0, safeTreasury - NATION_WAR_MIN_TREASURY_RESERVE);
    const expectedAmount = breachOpen
        ? Math.max(0, Math.min(NATION_WAR_MAX_RAID_AMOUNT, Math.floor(maxSpendable * raidRate)))
        : 0;
    return {
        breachOpen,
        reservePs: NATION_WAR_MIN_TREASURY_RESERVE,
        raidRate,
        expectedAmount,
        remainingAfterRaid: Math.max(0, safeTreasury - expectedAmount),
        raidCooldownUntilMs,
        raidCooldownActive,
        raidCooldownRemainingMs: raidCooldownActive ? Math.max(0, raidCooldownUntilMs - safeNow) : 0
    };
}

async function loadNationWarState(nation, firestore, admin, deps) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const docRef = getNationWarDoc(firestore, nationKey);
    const snap = await docRef.get();
    const nowMs = Date.now();
    const state = normalizeNationWarState(snap.exists ? snap.data() : null, nationKey, nowMs);
    if (!snap.exists) {
        await docRef.set({
            ...state,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    return state;
}

async function saveNationWarState(nation, state, firestore, admin) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const docRef = getNationWarDoc(firestore, nationKey);
    await docRef.set({
        ...state,
        nation: nationKey,
        updatedAtMs: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function resolveNationWarIncoming(nation, state, firestore, admin) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const nowMs = Date.now();
    const nextState = normalizeNationWarState(state, nationKey, nowMs);
    const previousSystemCount = Array.isArray(nextState.activeSystems) ? nextState.activeSystems.length : 0;
    nextState.activeSystems = getActiveNationWarSystems(nextState, nowMs);
    nextState.capitalCaptureState = refreshNationWarCaptureState(nextState.capitalCaptureState, nextState, nowMs);
    const remainingIncoming = [];
    let changed = nextState.activeSystems.length !== previousSystemCount;
    for (const incoming of nextState.incoming) {
        if (incoming.launchAtMs > nowMs) {
            remainingIncoming.push(incoming);
            continue;
        }
        const weapon = getNationWarWeaponDefinition(incoming.weaponId);
        if (!weapon) {
            changed = true;
            continue;
        }
        const totals = collectNationWarBonuses(nextState, nowMs);
        const autoSkip = incoming.decision === 'pending';
        const interceptSystem = incoming.decision === 'intercept'
            ? nextState.activeSystems.find((system) => system.id === incoming.interceptSystemId)
            : null;
        let intercepted = false;
        let interceptSummary = '';
        if (interceptSystem) {
            const interceptWeapon = getNationWarWeaponDefinition(interceptSystem.weaponId);
            if (interceptWeapon && interceptSystem.ammoRemaining > 0) {
                interceptSystem.ammoRemaining -= 1;
                const interceptChance = clampWarPercent(
                    Math.floor(Number(interceptWeapon.intercept) || 0)
                    + totals.defense.interceptSupport
                    + Math.floor(Number(interceptWeapon.detect || 0) / 8)
                    + Math.floor(Number(interceptWeapon.identify || 0) / 8)
                    - Math.floor(Number(weapon.detectDifficulty || 0) * 0.15)
                    - Math.floor(Number(weapon.identifyDifficulty || 0) * 0.1)
                    - Math.floor(Number(weapon.decoyValue || 0) * 0.08)
                );
                intercepted = Math.random() * 100 < interceptChance;
                interceptSummary = `${interceptWeapon.label}で迎撃${intercepted ? '成功' : '失敗'}`;
                await appendNationWarEvent(firestore, admin, {
                    type: intercepted ? 'intercept_success' : 'intercept_fail',
                    publicLevel: 'global',
                    summary: `${getNationLabel(nationKey)}が${weapon.label}への迎撃を${intercepted ? '成功' : '失敗'}`,
                    details: `${interceptWeapon.label} / 判定: ${interceptChance}%相当`,
                    participants: [nationKey, incoming.attackerNation],
                    attackerNation: incoming.attackerNation,
                    defenderNation: nationKey,
                    weaponId: incoming.weaponId
                });
            }
        }
        if (!intercepted) {
            const hitChance = clampWarPercent(
                Math.floor(Number(weapon.hit) || 0)
                + Math.floor(Number(incoming.attackBonus?.hit) || 0)
                - totals.defense.enemyHitPenalty
                - Math.floor(Number(nextState.capitalStatus.airDefense || 0) * 0.12)
            );
            const didHit = Math.random() * 100 < hitChance;
            if (didHit && Array.isArray(weapon.payload) && weapon.payload.length) {
                const previousWalls = clampWarPercent(nextState.capitalStatus.walls);
                nextState.capitalStatus = applyNationWarDamage(nextState.capitalStatus, incoming, weapon);
                nextState.capitalCaptureState = refreshNationWarCaptureState(nextState.capitalCaptureState, nextState, nowMs);
                const targetLabel = CAPITAL_PART_LABELS[incoming.targetPart] || '首都';
                await appendNationWarEvent(firestore, admin, {
                    type: 'strike_hit',
                    publicLevel: 'global',
                    summary: `${weapon.label}が${getNationLabel(nationKey)}の${targetLabel}に命中`,
                    details: `被害を確認。${autoSkip ? '迎撃判断が間に合わなかった。' : (interceptSummary || '迎撃なし')}`,
                    participants: [nationKey, incoming.attackerNation],
                    attackerNation: incoming.attackerNation,
                    defenderNation: nationKey,
                    weaponId: incoming.weaponId
                });
                if (previousWalls > CAPITAL_CAPTURE_BREACH_WALLS && nextState.capitalStatus.walls <= CAPITAL_CAPTURE_BREACH_WALLS) {
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_breach',
                        publicLevel: 'global',
                        summary: `${getNationLabel(nationKey)}の城壁が破られ、首都へ上陸可能になった`,
                        details: '前線プレイヤーは首都へ乗り込み、制圧を進められる。',
                        participants: [nationKey, incoming.attackerNation],
                        attackerNation: incoming.attackerNation,
                        defenderNation: nationKey,
                        weaponId: incoming.weaponId
                    });
                }
            } else {
                await appendNationWarEvent(firestore, admin, {
                    type: 'strike_miss',
                    publicLevel: 'global',
                    summary: `${weapon.label}は${getNationLabel(nationKey)}への有効打を与えられず`,
                    details: weapon.role === 'decoy'
                        ? '飛来物はデコイと判明した。'
                        : (interceptSummary || '海上で失速した。'),
                    participants: [nationKey, incoming.attackerNation],
                    attackerNation: incoming.attackerNation,
                    defenderNation: nationKey,
                    weaponId: incoming.weaponId
                });
            }
        }
        changed = true;
    }
    nextState.incoming = remainingIncoming;
    nextState.activeSystems = nextState.activeSystems.filter((system) => {
        const weapon = getNationWarWeaponDefinition(system.weaponId);
        if (weapon?.role !== 'intercept') return true;
        return system.ammoRemaining > 0 && (!system.expiresAtMs || system.expiresAtMs > nowMs);
    });
    nextState.capitalCaptureState = refreshNationWarCaptureState(nextState.capitalCaptureState, nextState, nowMs);
    if (
        nextState.capitalCaptureState.status === 'capturing'
        && nextState.capitalCaptureState.progressBaseMs >= nextState.capitalCaptureState.baseDurationMs
        && nextState.capitalCaptureState.queue.length > 0
        && !nextState.capitalCaptureState.raidUnlockedAtMs
    ) {
        const leader = nextState.capitalCaptureState.queue[0] || null;
        nextState.capitalCaptureState.status = 'captured';
        nextState.capitalCaptureState.raidUnlockedAtMs = nowMs;
        nextState.capitalCaptureState.raidUnlockedByNation = leader?.nation || null;
        nextState.capitalCaptureState.progressBaseMs = nextState.capitalCaptureState.baseDurationMs;
        nextState.capitalCaptureState.queue = [];
        nextState.capitalCaptureState.lastProgressAt = 0;
        nextState.capitalCaptureState.endsAt = 0;
        changed = true;
        await appendNationWarEvent(firestore, admin, {
            type: 'capital_capture_complete',
            publicLevel: 'global',
            summary: `${getNationLabel(nationKey)}の首都防衛が崩れ、国庫襲撃が可能になった`,
            details: leader?.nation ? `${getNationLabel(leader.nation)}の攻城隊が制圧を完了` : '首都制圧が完了した。',
            participants: [nationKey, leader?.nation].filter(Boolean),
            attackerNation: leader?.nation || '',
            defenderNation: nationKey
        });
    }
    if (changed) {
        await saveNationWarState(nationKey, nextState, firestore, admin);
    }
    return nextState;
}

async function buildNationWarPagePayload(nation, state, firestore, admin, deps) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const nowMs = Date.now();
    const activeSystems = getActiveNationWarSystems(state, nowMs);
    const logs = await getRecentNationWarLogs(firestore, nationKey);
    const strikeWeapons = listNationWarWeapons(nationKey, 'strike');
    const deployWeapons = listNationWarWeapons(nationKey, 'deploy');
    const enemyNations = await Promise.all(Object.keys(NATION_GROUP_BY_NATION)
        .filter((key) => key !== nationKey)
        .map(async (key) => {
            let enemyState = await resolveNationWarIncoming(key, await loadNationWarState(key, firestore, admin, deps), firestore, admin);
            enemyState = await resolveNationWarCaptureState(key, enemyState, firestore, admin);
            const enemyGroupId = await getNationGroupIdByNation(key, firestore, deps);
            const treasuryPs = enemyGroupId ? await getGroupTreasuryBalance(enemyGroupId, deps) : 0;
            const raidPlan = calculateNationWarRaidPlan(enemyState.capitalStatus, treasuryPs, enemyState.capitalCaptureState);
            return {
                nation: key,
                label: getNationLabel(key),
                treasuryPs,
                raidEligible: raidPlan.breachOpen && raidPlan.expectedAmount > 0,
                raidExpectedPs: raidPlan.expectedAmount,
                raidRatePercent: Number((raidPlan.raidRate * 100).toFixed(1)),
                capitalCapture: buildCapitalCapturePayload(enemyState.capitalCaptureState, nationKey, key),
                capitalStatus: Object.entries(enemyState.capitalStatus || {}).map(([part, value]) => ({
                    part,
                    label: CAPITAL_PART_LABELS[part] || part,
                    value: clampWarPercent(value),
                    band: getWarPercentBand(value)
                }))
            };
        }));
    return {
        nation: nationKey,
        nationLabel: getNationLabel(nationKey),
        nationModel: getNationModelByNation(nationKey),
        nationModelLabel: getNationModelLabel(getNationModelByNation(nationKey)),
        capitalCapture: buildCapitalCapturePayload(state.capitalCaptureState, nationKey, nationKey),
        capitalStatus: Object.entries(state.capitalStatus || {}).map(([part, value]) => ({
            part,
            label: CAPITAL_PART_LABELS[part] || part,
            value: clampWarPercent(value),
            band: getWarPercentBand(value)
        })),
        activeSystems: activeSystems.map((system) => {
            const weapon = getNationWarWeaponDefinition(system.weaponId);
            return {
                id: system.id,
                weaponId: system.weaponId,
                label: weapon?.label || system.weaponId,
                role: String(weapon?.role || '').trim(),
                description: weapon?.description || '',
                ammoRemaining: Math.max(0, Math.floor(Number(system.ammoRemaining) || 0)),
                expiresAtMs: system.expiresAtMs,
                remainingMs: Math.max(0, Math.floor(Number(system.expiresAtMs || 0) - nowMs)),
                band: getWarPercentBand(system.ammoRemaining > 0 ? 100 : 0)
            };
        }),
        incoming: (Array.isArray(state.incoming) ? state.incoming : []).map((incoming) => {
            const intel = buildNationWarIncomingIntel(incoming, state, nowMs);
            return {
                id: incoming.id,
                weaponId: incoming.weaponId,
                weaponName: intel.weaponName,
                identifyLabel: intel.identifyBand.label,
                identifyBand: intel.identifyBand,
                hitOutlookLabel: intel.hitBand.label,
                hitOutlookBand: intel.hitBand,
                decoyRiskLabel: intel.decoyBand.label,
                decoyRiskBand: intel.decoyBand,
                targetLabel: intel.targetLabel,
                launchAtMs: incoming.launchAtMs,
                remainingMs: Math.max(0, Math.floor(Number(incoming.launchAtMs || 0) - nowMs)),
                decision: incoming.decision,
                interceptSystemId: incoming.interceptSystemId || ''
            };
        }).sort((a, b) => a.launchAtMs - b.launchAtMs),
        strikeWeapons: strikeWeapons.map((weapon) => ({
            id: weapon.id,
            label: weapon.label,
            costPs: weapon.costPs,
            prepSeconds: Math.max(0, Math.floor(Number(weapon.prepSeconds) || 0)),
            cooldownSeconds: Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)),
            description: weapon.description || '',
            cooldownRemainingMs: Math.max(0, Math.floor(Number(state.cooldowns?.[weapon.id] || 0) - nowMs))
        })),
        deployWeapons: deployWeapons.map((weapon) => ({
            id: weapon.id,
            label: weapon.label,
            role: weapon.role,
            costPs: weapon.costPs,
            durationSeconds: Math.max(0, Math.floor(Number(weapon.durationSeconds) || 0)),
            cooldownSeconds: Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)),
            ammo: Math.max(0, Math.floor(Number(weapon.ammo) || 0)),
            description: weapon.description || '',
            cooldownRemainingMs: Math.max(0, Math.floor(Number(state.cooldowns?.[weapon.id] || 0) - nowMs))
        })),
        interceptorOptions: activeSystems
            .map((system) => {
                const weapon = getNationWarWeaponDefinition(system.weaponId);
                if (weapon?.role !== 'intercept' || system.ammoRemaining <= 0) return null;
                return {
                    id: system.id,
                    weaponId: system.weaponId,
                    label: `${weapon.label} / 残弾${system.ammoRemaining}`,
                    ammoRemaining: system.ammoRemaining
                };
            })
            .filter(Boolean),
        targetOptions: Object.keys(NATION_GROUP_BY_NATION)
            .filter((key) => key !== nationKey)
            .map((key) => ({
                value: key,
                label: getNationLabel(key)
            })),
        enemyNations,
        logs
    };
}

function buildCapitalStatusForViewer(capitalStatus, viewerNation, targetNation, captureState) {
    const exact = canViewCapitalIntel(viewerNation, targetNation, captureState);
    return Object.entries(capitalStatus || {}).map(([part, value]) => ({
        part,
        label: CAPITAL_PART_LABELS[part] || part,
        value: exact ? clampWarPercent(value) : null,
        band: getWarPercentBand(value),
        exact
    }));
}

function buildCapitalWarStatePayload(targetNation, viewerNation, state, treasuryPs = 0) {
    const targetNationKey = String(targetNation || '').trim().toLowerCase();
    const viewerNationKey = String(viewerNation || '').trim().toLowerCase();
    const capture = buildCapitalCapturePayload(state.capitalCaptureState, viewerNationKey, targetNationKey);
    const isOwnNation = !!viewerNationKey && viewerNationKey === targetNationKey;
    return {
        nation: targetNationKey,
        nationLabel: getNationLabel(targetNationKey),
        isOwnNation,
        treasuryPs: Math.max(0, Math.floor(Number(treasuryPs) || 0)),
        capitalStatus: buildCapitalStatusForViewer(state.capitalStatus, viewerNationKey, targetNationKey, state.capitalCaptureState),
        capitalCapture: capture,
        actions: {
            canRecon: !isOwnNation,
            canRepair: isOwnNation,
            canSabotage: !isOwnNation && !capture.raidUnlocked,
            canShipAttack: !isOwnNation,
            canCapture: !isOwnNation && capture.breached,
            canRaid: !isOwnNation && capture.raidUnlocked
        }
    };
}

function pickCapitalRepairPart(capitalStatus = {}) {
    return Object.entries(capitalStatus)
        .filter(([part]) => Object.prototype.hasOwnProperty.call(CAPITAL_PART_LABELS, part))
        .sort((a, b) => (clampWarPercent(a[1]) - clampWarPercent(b[1])) || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'walls';
}

async function getPlayerEntity(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    if (!playFabId) return null;
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true, ShowEntity: true }
        });
        const entityId = profile?.PlayerProfile?.Entity?.Id || profile?.PlayerProfile?.EntityId || null;
        const entityType = profile?.PlayerProfile?.Entity?.Type || profile?.PlayerProfile?.EntityType || null;
        if (entityId && entityType) return { Id: entityId, Type: entityType };
    } catch (error) {
        console.warn('[getPlayerEntity] GetPlayerProfile failed:', error?.errorMessage || error?.message || error);
    }
    return null;
}

async function updateGuildOwnerAndShipOwner(guildId, newOwnerPlayFabId, deps) {
    const { promisifyPlayFab, firestore, admin } = deps;
    if (!guildId || !newOwnerPlayFabId) return { guildUpdated: false, shipUpdated: false };
    let guildUpdated = false;
    let shipUpdated = false;
    try {
        const result = await callTitleScopedApi(promisifyPlayFab, PlayFabData.GetObjects, {
            Entity: { Id: guildId, Type: 'group' },
            EscapeObject: false
        });
        const rawObject = result?.Objects?.GuildData?.DataObject;
        let guildData = rawObject;
        if (typeof guildData === 'string') {
            try {
                guildData = JSON.parse(guildData);
            } catch (e) {
                console.warn('[king-transfer] Failed to parse GuildData JSON:', e?.message || e);
                guildData = null;
            }
        }
        if (guildData && typeof guildData === 'object') {
            guildData.ownerPlayFabId = newOwnerPlayFabId;
            await callTitleScopedApi(promisifyPlayFab, PlayFabData.SetObjects, {
                Entity: { Id: guildId, Type: 'group' },
                Objects: [{ ObjectName: 'GuildData', DataObject: guildData }]
            });
            guildUpdated = true;
        }
    } catch (error) {
        console.warn('[king-transfer] Failed to update guild data:', error?.errorMessage || error?.message || error);
    }

    try {
        const shipDocId = `guild_ship_${guildId}`;
        const shipRef = firestore.collection('ships').doc(shipDocId);
        const shipSnap = await shipRef.get();
        if (shipSnap.exists) {
            await shipRef.set({
                ownerPlayFabId: newOwnerPlayFabId,
                ownerId: newOwnerPlayFabId,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            shipUpdated = true;
        }
    } catch (error) {
        console.warn('[king-transfer] Failed to update guild ship owner:', error?.message || error);
    }

    return { guildUpdated, shipUpdated };
}

async function requireKingContext(playFabId, firestore, deps) {
    const { promisifyPlayFab, PlayFabServer, admin } = deps;
    const kingId = normalizePlayFabId(playFabId);
    if (!kingId) throw new Error('InvalidPlayFabId');

    const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: kingId,
        Keys: ['IsKing', 'Nation']
    });
    const isKing = String(kingRo?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
    if (!isKing) throw new Error('NotKing');

    const nation = String(kingRo?.Data?.Nation?.Value || '').trim().toLowerCase() || null;
    if (!nation) throw new Error('KingNationNotSet');
    const mapping = getNationMappingByNation(nation);
    if (!mapping) throw new Error('InvalidKingNation');

    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) throw new Error('NationGroupNotFound');

    const groupDocRef = getNationGroupDoc(firestore, mapping.groupName);
    const groupSnap = await groupDocRef.get();
    const storedKingId = groupSnap.exists ? normalizePlayFabId(groupSnap.data()?.kingPlayFabId || '') : '';

    if (storedKingId !== kingId) {
        await groupDocRef.set({
            kingPlayFabId: kingId,
            kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    return { kingId, nation, mapping, groupId };
}

function getKingStarterCrownIdByNation(nation) {
    const key = String(nation || '').toLowerCase();
    return KING_STARTER_CROWN_BY_NATION[key] || null;
}

function getKingStarterCrownGrantDataKey(nation) {
    const key = String(nation || '').toLowerCase();
    if (!key) return 'KingStarterCrownGranted';
    return `KingStarterCrownGranted_${key}`;
}

function normalizeTroyCheckoutItems(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const name = String(item?.name || item?.itemName || '').trim();
            const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
            const price = Math.max(0, Math.floor(Number(item?.price) || 0));
            if (!name || !price) return null;
            const orderedAtMs = Math.max(0, Math.floor(Number(item?.orderedAtMs) || 0));
            const undoUntilMs = Math.max(0, Math.floor(Number(item?.undoUntilMs) || 0));
            const servedAtMs = Math.max(0, Math.floor(Number(item?.servedAtMs) || 0));
            const orderCountToday = Math.max(0, Math.floor(Number(item?.orderCountToday) || 0));
            const itemStatus = servedAtMs > 0 || String(item?.status || '').trim().toLowerCase() === 'served'
                ? 'served'
                : 'pending';
            const menuImage = normalizeTroyMenuImagePath(item?.menuImage || item?.image || item?.iconImage);
            const menuCategory = normalizeTroySalesCategoryId(item?.menuCategory || item?.categoryId || item?.category);
            const menuCategoryLabel = normalizeTroySalesCategoryLabel(item?.menuCategoryLabel || item?.categoryLabel, {
                ...item,
                menuCategory,
                name
            });
            const normalized = {
                name,
                quantity,
                price,
                grantedPs: Math.max(0, Math.floor(Number(item?.grantedPs) || 0)),
                cashbackRateBps: Math.max(0, Math.floor(Number(item?.cashbackRateBps) || 0)),
                orderId: String(item?.orderId || '').trim(),
                orderedAtMs,
                undoUntilMs,
                servedAtMs,
                orderCountToday,
                status: itemStatus,
                menuCategory,
                menuCategoryLabel,
                lineTotal: price * quantity
            };
            if (menuImage) {
                normalized.menuImage = menuImage;
                normalized.image = menuImage;
                normalized.iconImage = menuImage;
                normalized.menuConsumableItemId = getTroyMenuConsumableItemId(name, menuImage);
            }
            return normalized;
        })
        .filter(Boolean);
}

function isTroyUndoProtectedItem(item = {}) {
    const name = String(item?.name || '').trim();
    return name === '入店チャージ';
}

function isDeprecatedTroyCoinPurchaseItem(item = {}) {
    const name = String(item?.name || item?.itemName || '').trim();
    const content = String(item?.content || '').trim();
    return content.includes('ゴールド購入')
        || name.includes('ゴールド購入')
        || /^[1-9]\d{2,5}G$/i.test(name);
}

function buildStoredTroyCheckoutItem(item = {}) {
    const normalized = normalizeTroyCheckoutItems([item])[0];
    if (!normalized) return null;
    const stored = {
        name: normalized.name,
        quantity: normalized.quantity,
        price: normalized.price,
        grantedPs: normalized.grantedPs,
        cashbackRateBps: normalized.cashbackRateBps
    };
    if (normalized.orderId) stored.orderId = normalized.orderId;
    if (normalized.orderedAtMs > 0) stored.orderedAtMs = normalized.orderedAtMs;
    if (normalized.undoUntilMs > 0) stored.undoUntilMs = normalized.undoUntilMs;
    if (normalized.servedAtMs > 0) stored.servedAtMs = normalized.servedAtMs;
    if (normalized.orderCountToday > 0) stored.orderCountToday = normalized.orderCountToday;
    if (normalized.status === 'served') stored.status = 'served';
    if (normalized.menuCategory) stored.menuCategory = normalized.menuCategory;
    if (normalized.menuCategoryLabel) stored.menuCategoryLabel = normalized.menuCategoryLabel;
    if (normalized.menuImage) {
        stored.menuImage = normalized.menuImage;
        stored.image = normalized.menuImage;
        stored.iconImage = normalized.menuImage;
        stored.menuConsumableItemId = normalized.menuConsumableItemId;
    }
    return stored;
}

function getTroyUsualOrderItemKey(name, price) {
    return `${String(name || '').trim()}::${Math.max(0, Math.floor(Number(price) || 0))}`;
}

function isTroyUsualOrderCandidate(item = {}) {
    const name = String(item?.name || '').trim();
    const price = Math.max(0, Math.floor(Number(item?.price) || 0));
    if (!name || price <= 0) return false;
    if (name === TROY_ENTRY_CHARGE_ITEM_NAME || name === TROY_CUSTOM_ORDER_ITEM_NAME) return false;
    return !isDeprecatedTroyCoinPurchaseItem(item);
}

function normalizeTroyUsualOrderItems(items = [], limit = TROY_USUAL_ORDER_ITEMS_LIMIT) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const name = String(item?.name || '').trim().slice(0, 60);
            const price = Math.max(0, Math.floor(Number(item?.price) || 0));
            const count = Math.max(0, Math.floor(Number(item?.count ?? item?.orderCount ?? item?.quantity) || 0));
            if (!name || price <= 0 || count <= 0) return null;
            return {
                name,
                price,
                count,
                orderCount: count,
                quantity: Math.max(count, Math.floor(Number(item?.quantity) || 0)),
                total: Math.max(0, Math.floor(Number(item?.total) || price * count)),
                lastOrderedAtMs: Math.max(0, Math.floor(Number(item?.lastOrderedAtMs) || 0)),
                lastSettledAtMs: Math.max(0, Math.floor(Number(item?.lastSettledAtMs) || 0))
            };
        })
        .filter(Boolean)
        .sort((a, b) => (b.count - a.count)
            || (b.lastOrderedAtMs - a.lastOrderedAtMs)
            || String(a.name).localeCompare(String(b.name), 'ja'))
        .slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}

function buildTroyUsualItemsPayload(dataOrItems = {}) {
    const source = Array.isArray(dataOrItems)
        ? dataOrItems
        : (Array.isArray(dataOrItems?.items) ? dataOrItems.items : dataOrItems?.usualItems);
    return normalizeTroyUsualOrderItems(source, TROY_USUAL_ORDER_ITEMS_LIMIT)
        .map((item) => ({
            name: item.name,
            price: item.price,
            count: item.count,
            lastOrderedAtMs: item.lastOrderedAtMs,
            lastSettledAtMs: item.lastSettledAtMs
        }));
}

function mergeTroyOrderHistoryItems(existingItems = [], checkoutItems = [], settledAtMs = Date.now()) {
    const byKey = new Map();
    normalizeTroyUsualOrderItems(existingItems, TROY_ORDER_HISTORY_ITEMS_LIMIT).forEach((item) => {
        byKey.set(getTroyUsualOrderItemKey(item.name, item.price), { ...item });
    });

    normalizeTroyCheckoutItems(checkoutItems)
        .filter(isTroyUsualOrderCandidate)
        .forEach((item) => {
            const key = getTroyUsualOrderItemKey(item.name, item.price);
            const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
            const current = byKey.get(key) || {
                name: item.name,
                price: item.price,
                count: 0,
                orderCount: 0,
                quantity: 0,
                total: 0,
                lastOrderedAtMs: 0,
                lastSettledAtMs: 0
            };
            current.count += quantity;
            current.orderCount = current.count;
            current.quantity += quantity;
            current.total += Math.max(0, Math.floor(Number(item.lineTotal) || item.price * quantity));
            current.lastOrderedAtMs = Math.max(current.lastOrderedAtMs, Math.max(0, Math.floor(Number(item.orderedAtMs) || 0)));
            current.lastSettledAtMs = Math.max(current.lastSettledAtMs, Math.max(0, Math.floor(Number(settledAtMs) || 0)));
            byKey.set(key, current);
        });

    return normalizeTroyUsualOrderItems([...byKey.values()], TROY_ORDER_HISTORY_ITEMS_LIMIT);
}

function buildTroyCheckoutPayload(docOrData = null) {
    const hasDataFn = typeof docOrData?.data === 'function';
    const data = hasDataFn ? (docOrData.data() || {}) : (docOrData || {});
    const fallbackId = hasDataFn ? String(docOrData?.id || '').trim() : String(data?.playFabId || '').trim();
    const status = String(data.status || 'open').trim().toLowerCase();
    const items = normalizeTroyCheckoutItems(data.items);
    const total = Math.max(0, Math.floor(Number(data.total) || items.reduce((sum, item) => sum + item.lineTotal, 0)));
    const totalItems = Math.max(0, Math.floor(Number(data.totalItems) || items.reduce((sum, item) => sum + item.quantity, 0)));
    const createdAtRaw = data.createdAt?.toMillis ? data.createdAt.toMillis() : Number(data.createdAt) || 0;
    const updatedAtRaw = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Number(data.updatedAt) || 0;
    const lastOrderedAtRaw = data.lastOrderedAt?.toMillis ? data.lastOrderedAt.toMillis() : Number(data.lastOrderedAt) || 0;
    const settledAtRaw = data.settledAt?.toMillis ? data.settledAt.toMillis() : Number(data.settledAt) || 0;
    const grantTotal = Math.max(0, Math.floor(Number(data.grantTotal) || 0));
    const summary = items.slice(0, 3).map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`).join(' / ');
    return {
        playFabId: normalizePlayFabId(data.playFabId || fallbackId),
        displayName: String(data.displayName || fallbackId || 'Player').trim(),
        status,
        total,
        totalItems,
        grantTotal,
        summary,
        items,
        createdAtMs: createdAtRaw,
        updatedAtMs: updatedAtRaw,
        lastOrderedAtMs: lastOrderedAtRaw,
        settledAtMs: settledAtRaw
    };
}

function buildTroyPendingCheckoutPayload(checkoutDocs = []) {
    if (!TROY_STAFF_CHECKOUT_ENABLED) return [];
    return (Array.isArray(checkoutDocs) ? checkoutDocs : [])
        .map((doc) => buildTroyCheckoutPayload(doc))
        .filter((entry) => entry && (entry.status === 'open' || entry.status === 'pending'))
        .filter(Boolean)
        .sort((a, b) => (a.createdAtMs - b.createdAtMs) || String(a.playFabId || '').localeCompare(String(b.playFabId || '')));
}

function buildTroyMemberPayload(memberDocs = []) {
    return (Array.isArray(memberDocs) ? memberDocs : [])
        .map((doc) => {
            const data = typeof doc?.data === 'function' ? (doc.data() || {}) : {};
            const joinedAtMs = data.joinedAt?.toMillis ? data.joinedAt.toMillis() : Number(data.joinedAt) || 0;
            return {
                playFabId: normalizePlayFabId(doc?.id || data.playFabId || ''),
                displayName: String(data.displayName || doc?.id || 'Player').trim(),
                joinedAtMs,
                level: Math.max(1, Math.floor(Number(data.level) || 1)),
                rankName: String(data.rankName || getPlayerRankNameByLevel(data.level)).trim(),
                usualItems: buildTroyUsualItemsPayload(data.usualItems),
                rankBenefits: Array.isArray(data.rankBenefits)
                    ? data.rankBenefits.map((entry) => String(entry || '').trim()).filter(Boolean)
                    : getPlayerRankServiceBenefitsByLevel(data.level)
            };
        })
        .filter((entry) => entry.playFabId)
        .sort((a, b) => (a.joinedAtMs - b.joinedAtMs) || String(a.playFabId || '').localeCompare(String(b.playFabId || '')));
}

function normalizeTroyBountyNumber(value, fallback = 0) {
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num)) return Math.max(0, Math.floor(Number(fallback) || 0));
    return Math.max(0, num);
}

async function getTroyContributionDebtAmount(playFabId, firestore) {
    const id = normalizePlayFabId(playFabId);
    if (!id || !firestore) return 0;
    try {
        const snap = await firestore.collection(TROY_CONTRIBUTION_DEBT_COLLECTION).doc(id).get();
        return normalizeTroyBountyNumber(snap.data()?.debt || 0);
    } catch (error) {
        console.warn('[troy-contribution-debt] Debt fetch failed:', id, error?.message || error);
        return 0;
    }
}

function getTroyMemberAvatarUrl(data = {}) {
    return String(
        data.avatarUrl
        || data.pictureUrl
        || data.linePictureUrl
        || data.profileImageUrl
        || ''
    ).trim();
}

async function buildTroyBountyRankingRow(memberDoc, deps) {
    const data = typeof memberDoc?.data === 'function' ? (memberDoc.data() || {}) : {};
    const playFabId = normalizePlayFabId(memberDoc?.id || data.playFabId || '');
    if (!playFabId) return null;

    let contribution = normalizeTroyBountyNumber(
        data.contributionTotal ?? data.contribution ?? data.coinGoldContributionTotal ?? 0
    );
    let level = Math.max(1, normalizeTroyBountyNumber(data.level, 1));
    let displayName = String(data.displayName || playFabId || 'Player').trim();
    let rankName = String(data.rankName || getPlayerRankNameByLevel(level)).trim();
    let avatarUrl = getTroyMemberAvatarUrl(data);
    const joinedAtMs = data.joinedAt?.toMillis ? data.joinedAt.toMillis() : Number(data.joinedAt) || 0;

    const { promisifyPlayFab, PlayFabServer, firestore } = deps || {};
    if (typeof promisifyPlayFab === 'function' && PlayFabServer) {
        const [statsResult, profileResult] = await Promise.allSettled([
            promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId }),
            promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
            })
        ]);

        if (statsResult.status === 'fulfilled') {
            const statsMap = buildStatsMapFromStatistics(statsResult.value?.Statistics || []);
            if (Object.prototype.hasOwnProperty.call(statsMap, PLAYER_CONTRIBUTION_STAT)) {
                const statContribution = normalizeTroyBountyNumber(statsMap[PLAYER_CONTRIBUTION_STAT]);
                contribution = Math.max(contribution, statContribution);
            }
            const derived = calculateLevelFromContribution(contribution);
            const statLevel = normalizeTroyBountyNumber(statsMap[PLAYER_LEVEL_STAT], 0);
            level = Math.max(1, level, statLevel || 0, derived.level || 0);
            rankName = getPlayerRankNameByLevel(level);
        } else {
            console.warn('[troy-bounty-ranking] Statistics fetch failed:', playFabId, statsResult.reason?.errorMessage || statsResult.reason?.message || statsResult.reason);
        }

        if (profileResult.status === 'fulfilled') {
            const profile = profileResult.value?.PlayerProfile || {};
            displayName = String(profile.DisplayName || displayName || playFabId).trim();
            avatarUrl = String(profile.AvatarUrl || avatarUrl || '').trim();
        } else {
            console.warn('[troy-bounty-ranking] Profile fetch failed:', playFabId, profileResult.reason?.errorMessage || profileResult.reason?.message || profileResult.reason);
        }
    }

    const contributionDebt = await getTroyContributionDebtAmount(playFabId, firestore);
    const bountyRaw = contribution * level;
    const bounty = Number.isFinite(bountyRaw)
        ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(bountyRaw) - contributionDebt))
        : 0;

    return {
        playFabId,
        displayName,
        avatarUrl,
        level,
        rankName,
        bounty,
        score: bounty,
        contributionDebt,
        joinedAtMs
    };
}

async function ensureKingStarterCrown(playFabId, nation, deps) {
    const { promisifyPlayFab, PlayFabServer, addEconomyItem } = deps;
    const kingId = normalizePlayFabId(playFabId);
    const crownItemId = getKingStarterCrownIdByNation(nation);
    if (!kingId || !crownItemId) {
        return { granted: false, reason: 'NoTarget' };
    }

    const dataKey = getKingStarterCrownGrantDataKey(nation);
    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: kingId,
            Keys: [dataKey]
        });
        const alreadyGranted = String(ro?.Data?.[dataKey]?.Value || '').toLowerCase() === 'true';
        if (alreadyGranted) {
            return { granted: false, reason: 'AlreadyGranted', itemId: crownItemId };
        }

        await addEconomyItem(kingId, crownItemId, 1, {
            idempotencyId: `king-starter-crown-${kingId}-${crownItemId}`
        });

        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: kingId,
            Data: {
                [dataKey]: 'true',
                [`${dataKey}At`]: String(Date.now()),
                [`${dataKey}Item`]: crownItemId
            }
        });

        return { granted: true, itemId: crownItemId };
    } catch (error) {
        const msg = error?.errorMessage || error?.message || error;
        console.warn('[ensureKingStarterCrown] Failed:', msg);
        return { granted: false, reason: 'Error', itemId: crownItemId, error: String(msg) };
    }
}

// APIルートを初期化
function initializeNationRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabGroups, firestore, admin, lineClient, getGroupDataValue, setGroupDataValues, subtractEconomyItem, addEconomyItem, getCurrencyBalance, applyTax, transferOwnedIslands, createStarterIsland, relocateActiveShip, emitDisplayEvent, requireAuthenticatedPlayFabId, catalogCache } = deps;

    const nationDeps = {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabAdmin,
        PlayFabGroups,
        firestore,
        admin,
        getGroupDataValue,
        setGroupDataValues,
        addEconomyItem,
        subtractEconomyItem,
        getAllInventoryItems: deps.getAllInventoryItems,
        getVirtualCurrencyMap: deps.getVirtualCurrencyMap
    };

    const pushDisplayEvent = (payload) => {
        if (typeof emitDisplayEvent !== 'function') return;
        try {
            emitDisplayEvent(payload);
        } catch (error) {
            console.warn('[display-event] Failed to emit:', error?.message || error);
        }
    };

    function buildTroyCustomerOrderDisplayEvent(context = {}, request = {}, options = {}) {
        const requestId = String(request?.requestId || options.requestId || '').trim().slice(0, 96);
        const topic = String(options.topic || 'troy-customer-order').trim().toLowerCase();
        const action = String(options.action || '').trim().toLowerCase();
        return {
            topic,
            type: 'refresh',
            label: topic === 'troy-customer-order-reviewed'
                ? 'TROYメニュー注文 処理済み'
                : 'TROYメニュー注文あり',
            requestId,
            createdAtMs: Math.max(0, Math.floor(Number(request?.createdAtMs || request?.createdAt) || Date.now())),
            nation: String(context?.nation || request?.nation || '').trim().toLowerCase(),
            action
        };
    }

    async function buildTroyCloseSummary(context = {}) {
        const roomRef = getTroyRoomDoc(firestore);
        const roomSnap = await roomRef.get();
        const roomData = context.roomData || (roomSnap.exists ? (roomSnap.data() || {}) : {});
        const roomNation = String(roomData?.nation || '').trim().toLowerCase();
        const nation = getNationMappingByNation(roomNation)
            ? roomNation
            : (getNationMappingByNation(context.nation) ? context.nation : '');
        const mapping = getNationMappingByNation(nation) || context.mapping || null;
        const businessDayKey = normalizeTroyBusinessDayKey(context.businessDayKey || roomData?.troyBusinessDayKey)
            || getTroyBusinessDayKey();
        const groupRef = mapping?.groupName
            ? getNationGroupDoc(firestore, mapping.groupName)
            : null;
        const reads = [
            roomRef.collection('members').limit(100).get(),
            roomRef.collection('checkouts').limit(100).get(),
            groupRef ? groupRef.get() : Promise.resolve(null)
        ];
        const [membersSnap, checkoutSnap, groupSnap] = await Promise.all(reads);
        const checkouts = buildTroyPendingCheckoutPayload(checkoutSnap.docs);
        const itemMap = new Map();
        checkouts.forEach((checkout) => {
            (Array.isArray(checkout.items) ? checkout.items : []).forEach((item) => {
                const name = String(item?.name || '商品').trim() || '商品';
                const current = itemMap.get(name) || { name, quantity: 0, total: 0 };
                current.quantity += Math.max(1, Math.floor(Number(item?.quantity) || 1));
                current.total += Math.max(0, Math.floor(Number(item?.lineTotal) || 0));
                itemMap.set(name, current);
            });
        });
        const topItems = [...itemMap.values()].sort((a, b) => b.total - a.total || b.quantity - a.quantity);
        const sales = buildTroyTodaySalesSnapshot(groupSnap?.data?.() || {}, { dayKey: businessDayKey });
        return {
            dayKey: sales.dayKey || businessDayKey,
            nation,
            sales,
            memberCount: Math.max(0, Number(membersSnap?.size) || 0),
            pending: {
                count: checkouts.length,
                total: checkouts.reduce((sum, checkout) => sum + Math.max(0, Number(checkout.total) || 0), 0),
                topItems
            }
        };
    }

    async function notifyTroyCloseSummary(context = {}) {
        if (!lineClient || typeof lineClient.pushMessage !== 'function') return null;
        const lineUserIds = getConfiguredTroyCloseSummaryLineUserIds(deps.troyGameMasterLineUserIds);
        if (!lineUserIds.length) {
            console.warn('[troy-close-summary] TROY_GAME_MASTER_LINE_USER_IDS or QUEST_APPROVER_ADMIN_LINE_IDS is not configured.');
            return null;
        }
        const summary = await buildTroyCloseSummary(context);
        const message = formatTroyCloseSummaryMessage(summary);
        await Promise.all(lineUserIds.map((lineUserId) => lineClient.pushMessage(lineUserId, { type: 'text', text: message })));
        return { sent: true, lineUserCount: lineUserIds.length, summary };
    }

    async function setGlobalTroyOpenState(context, nextOpen) {
        const roomRef = getTroyRoomDoc(firestore);
        const currentSnap = await roomRef.get();
        const currentData = currentSnap.exists ? (currentSnap.data() || {}) : {};
        const currentNation = String(currentData?.nation || '').trim().toLowerCase();
        const activeNation = nextOpen
            ? context.nation
            : (getNationMappingByNation(currentNation) ? currentNation : context.nation);
        const activeMapping = getNationMappingByNation(activeNation) || context.mapping || null;
        const businessDayKey = nextOpen
            ? getTroyBusinessDayKey()
            : (normalizeTroyBusinessDayKey(currentData?.troyBusinessDayKey) || getTroyBusinessDayKey());
        const update = {
            isOpen: !!nextOpen,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: context?.kingId || null
        };
        if (nextOpen) {
            update.nation = activeNation;
            update.troyBusinessDayKey = businessDayKey;
            update.openedAt = admin.firestore.FieldValue.serverTimestamp();
            update.openedBy = context?.kingId || null;
            update.openedByLineUserId = context?.openedByLineUserId || null;
        } else {
            update.closedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        await roomRef.set(update, { merge: true });
        if (!nextOpen) {
            try {
                await notifyTroyCloseSummary({
                    ...context,
                    nation: activeNation,
                    mapping: activeMapping,
                    businessDayKey,
                    roomData: currentData
                });
            } catch (summaryError) {
                console.warn('[troy-close-summary] Failed to notify:', summaryError?.message || summaryError);
            }
            await deleteCollectionDocs(roomRef.collection('members'));
            await deleteCollectionDocs(roomRef.collection('checkouts'));
        }
        pushDisplayEvent(nextOpen
            ? { type: 'flare', topic: 'troy-status', isOpen: true, label: 'TROY OPEN' }
            : { type: 'splash', topic: 'troy-status', isOpen: false, label: 'TROY CLOSE' }
        );
        return { success: true, isOpen: !!nextOpen, nation: activeNation, troyBusinessDayKey: businessDayKey };
    }

    async function resolveTroyOpenStateContext(req, nextOpen) {
        const currentSnap = await getTroyRoomDoc(firestore).get();
        const currentNation = String(currentSnap.data()?.nation || '').trim().toLowerCase();
        const requestedNation = String(req.body?.troyNation || req.body?.entryNation || '').trim().toLowerCase();
        let nation = !nextOpen && getNationMappingByNation(currentNation) ? currentNation : null;
        if (!nation) nation = requestedNation && getNationMappingByNation(requestedNation) ? requestedNation : null;
        if (!nation && !nextOpen) nation = await findOpenTroyNation(firestore);
        if (!nation) nation = currentNation || TROY_ENTRY_DEFAULT_NATION || 'fire';
        const mapping = getNationMappingByNation(nation);
        if (!mapping) return null;
        return { nation, mapping };
    }

    async function requireAuthedPlayFabId(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return playFabId;
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    // 国家グループ取得
    app.post('/api/get-nation-group', async (req, res) => {
        const { raceName } = req.body || {};
        if (!raceName) return res.status(400).json({ error: 'raceName is required' });

        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

        try {
            const docRef = await getNationGroupDoc(firestore, mapping.groupName);
            const docSnap = await docRef.get();
            const data = docSnap.exists ? docSnap.data() : null;
            return res.json({
                groupName: mapping.groupName,
                groupId: data && data.groupId ? data.groupId : null
            });
        } catch (error) {
            console.error('[get-nation-group] Error:', error.errorMessage || error.message);
            return res.status(500).json({ error: 'Failed to get nation group', details: error.errorMessage || error.message });
        }
    });

    // 国家グループ確保
    app.post('/api/ensure-nation-group', async (req, res) => {
        const { raceName } = req.body || {};
        if (!raceName) return res.status(400).json({ error: 'raceName is required' });

        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

        try {
            let result;
            try {
                result = await ensureNationGroupExists(firestore, mapping, nationDeps);
            } catch (e) {
                const msg = e?.errorMessage || e?.message || String(e);
                if (String(msg).includes('group name is already in use')) {
                    const retry = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: ['NationGroupIds'] });
                    let retryGroupId = null;
                    try {
                        const parsed = retry?.Data?.NationGroupIds ? JSON.parse(retry.Data.NationGroupIds) : {};
                        retryGroupId = parsed?.[mapping.groupName] || null;
                    } catch (parseErr) {
                        console.warn('[ensure-nation-group] Retry parse failed:', parseErr?.message || parseErr);
                    }
                    if (retryGroupId) {
                        await getNationGroupDoc(firestore, mapping.groupName).set({
                            groupId: retryGroupId,
                            groupName: mapping.groupName,
                            nation: mapping.island,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        result = { groupId: retryGroupId, groupName: mapping.groupName, created: false };
                    } else {
                        throw e;
                    }
                } else {
                    throw e;
                }
            }
            return res.json({
                groupName: mapping.groupName,
                groupId: result.groupId,
                created: result.created
            });
        } catch (error) {
            console.error('[ensure-nation-group] Error:', error.errorMessage || error.message || error);
            return res.status(500).json({ error: 'Failed to ensure nation group', details: error.errorMessage || error.message || String(error) });
        }
    });

    app.post('/api/get-nation-announcements', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const payload = await getAllNationAnnouncements(firestore, nationDeps);
            return res.json(payload);
        } catch (error) {
            console.error('[get-nation-announcements]', error?.message || error);
            return res.status(500).json({ error: 'Failed to get nation announcements' });
        }
    });

    app.post('/api/set-nation-announcement', async (req, res) => {
        const { playFabId } = req.body || {};
        const message = String(req.body?.message || '').slice(0, 200);
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: requesterPlayFabId,
                FunctionName: 'SetNationAnnouncement',
                FunctionParameter: { message },
                GeneratePlayStreamEvent: false
            });
            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing')) {
                    return res.status(403).json({ error: 'Only the king can update announcements' });
                }
                return res.status(500).json({ error: 'Failed to set announcement', details: msg });
            }
            nationAnnouncementCache = { expiresAt: 0, payload: null };
            return res.json({ success: true });
        } catch (error) {
            console.error('[set-nation-announcement]', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'Failed to set announcement' });
        }
    });

    // 国王ページデータ取得
    app.post('/api/get-nation-king-page', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: requesterPlayFabId,
                Keys: ['IsKing', 'Nation']
            });
            const isKingFlag = String(ro?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
            if (!isKingFlag) {
                return res.json({ notInNation: true });
            }

            const selfId = normalizePlayFabId(requesterPlayFabId);
            const nation = String(ro?.Data?.Nation?.Value || '').trim().toLowerCase() || null;
            try {
                const mapping = getNationMappingByNation(nation);
                if (mapping) {
                    const docRef = getNationGroupDoc(firestore, mapping.groupName);
                    const docSnap = await docRef.get();
                    const storedKingId = normalizePlayFabId(docSnap.data()?.kingPlayFabId || '');
                    if (storedKingId !== selfId) {
                        await docRef.set({
                            kingPlayFabId: selfId,
                            kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    }
                }
                await ensureKingStarterCrown(requesterPlayFabId, nation, { promisifyPlayFab, PlayFabServer, addEconomyItem });
            } catch (syncError) {
                console.warn('[get-nation-king-page] Failed to sync kingPlayFabId:', syncError?.message || syncError);
            }

            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: requesterPlayFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });

            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NationGroupNotSet')) {
                    return res.json({ notInNation: true });
                }
                if (String(msg).includes('JavascriptException')) {
                    return res.json({ notInNation: true });
                }
                if (String(msg).includes('NotKing')) {
                    return res.status(403).json({ error: 'Only the king can view this page' });
                }
                if (String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'Nation king is not set' });
                }
                return res.status(500).json({ error: 'Failed to get king page data', details: msg });
            }

            const payload = csResult ? (csResult.FunctionResult || {}) : {};
            try {
                const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
                payload.nation = nation;
                const groupId = await getNationGroupIdByNation(nation, firestore, nationDeps);
                const mapping = getNationMappingByNation(nation);
                let groupData = {};
                if (groupId && mapping) {
                    const treasuryPs = await getGroupTreasuryBalance(groupId, nationDeps);
                    const groupSnap = await getNationGroupDoc(firestore, mapping.groupName).get();
                    groupData = groupSnap.data() || {};
                    const treasuryOverview = buildTreasuryOverview(groupSnap.data()?.treasuryRecentEntries || []);
                    const cashbackInfo = await getNationTreasuryCashbackInfo(nation, firestore, nationDeps);
                    payload.treasuryPs = treasuryPs;
                    payload.treasuryRank = cashbackInfo.rank;
                    payload.troyCashbackRateBps = cashbackInfo.rateBps;
                    payload.troyCashbackRatePercent = cashbackInfo.ratePercent;
                    payload.treasuryRecentEntries = treasuryOverview.recentEntries;
                    payload.treasurySummary = treasuryOverview.summary;
                }
                if (mapping) {
                    const roomSnap = await getTroyRoomDoc(firestore, mapping.groupName).get();
                    const roomData = roomSnap.data() || {};
                    payload.troyTodaySales = buildTroyTodaySalesSnapshot(groupData || {}, {
                        dayKey: normalizeTroyBusinessDayKey(roomData.troyBusinessDayKey)
                    });
                    payload.troyOpen = !!roomData.isOpen;
                    payload.menuDisabled = Array.isArray(roomData.menuDisabled) ? roomData.menuDisabled : [];
                    payload.menuSpecials = Array.isArray(roomData.menuSpecials) ? roomData.menuSpecials : [];
                    payload.menuCustomItems = Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : [];
                    const membersSnap = await getTroyRoomDoc(firestore, mapping.groupName)
                        .collection('members')
                        .orderBy('joinedAt', 'asc')
                        .limit(50)
                        .get();
                    const checkoutSnap = await getTroyRoomDoc(firestore, mapping.groupName)
                        .collection('checkouts')
                        .limit(30)
                        .get();
                    payload.troyMembers = buildTroyMemberPayload(membersSnap.docs);
                    payload.troyPendingCheckouts = buildTroyPendingCheckoutPayload(checkoutSnap.docs);
                }
                let warState = await resolveNationWarIncoming(nation, await loadNationWarState(nation, firestore, admin, nationDeps), firestore, admin);
                warState = await resolveNationWarCaptureState(nation, warState, firestore, admin);
                payload.war = await buildNationWarPagePayload(nation, warState, firestore, admin, nationDeps);
            } catch (e) {
                console.warn('[get-nation-king-page] Failed to load group tax data:', e?.message || e);
            }

            res.json(payload);
        } catch (error) {
            const msg = error.errorMessage || error.message;
            if (String(msg).includes('NationGroupNotSet')) {
                return res.json({ notInNation: true });
            }
            if (String(msg).includes('JavascriptException')) {
                return res.json({ notInNation: true });
            }
            console.error('[get-nation-king-page]', msg);
            res.status(500).json({ error: 'Failed to get king page data', details: msg });
        }
    });

    // 店内メンバー限定の懸賞金ランキング（ディスプレイ用）
    app.get('/api/troy-bounty-ranking', async (req, res) => {
        const limitRaw = Number.parseInt(String(req.query?.limit || '10'), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 10;
        try {
            const roomRef = getTroyRoomDoc(firestore);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
            const membersSnap = await roomRef
                .collection('members')
                .orderBy('joinedAt', 'asc')
                .limit(TROY_BOUNTY_RANKING_MEMBER_LIMIT)
                .get();
            const rows = await Promise.all(membersSnap.docs.map((doc) => buildTroyBountyRankingRow(doc, nationDeps)));
            const ranking = rows
                .filter(Boolean)
                .sort((a, b) => (
                    (b.bounty - a.bounty)
                    || (b.level - a.level)
                    || (a.joinedAtMs - b.joinedAtMs)
                    || String(a.playFabId || '').localeCompare(String(b.playFabId || ''))
                ))
                .slice(0, limit)
                .map((entry, index) => ({
                    position: index + 1,
                    playFabId: entry.playFabId,
                    displayName: entry.displayName,
                    avatarUrl: entry.avatarUrl,
                    level: entry.level,
                    rankName: entry.rankName,
                    bounty: entry.bounty,
                    score: entry.score
                }));
            res.json({
                scope: 'troy-members',
                isOpen: !!roomData.isOpen,
                memberCount: membersSnap.size,
                updatedAt: Date.now(),
                ranking
            });
        } catch (error) {
            console.error('[troy-bounty-ranking] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'Failed to load troy bounty ranking' });
        }
    });

    // 還元率の王設定は廃止
    app.post('/api/king-set-grant-multiplier', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const cashbackInfo = await getNationTreasuryCashbackInfo(context.nation, firestore, nationDeps);
            res.status(410).json({
                error: 'GrantMultiplierDeprecated',
                message: '還元率の王設定は廃止されました。国庫順位で自動決定されます。',
                treasuryRank: cashbackInfo.rank,
                troyCashbackRateBps: cashbackInfo.rateBps
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-set-grant-multiplier] Error:', msg);
            res.status(500).json({ error: 'Failed to resolve cashback rate' });
        }
    });

    app.post('/api/get-capital-war-state', async (req, res) => {
        const { playFabId, targetNation } = req.body || {};
        if (!playFabId || !targetNation) {
            return res.status(400).json({ error: 'playFabId and targetNation are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const viewerNation = await getNationForPlayer(requesterPlayFabId, nationDeps);
            const targetNationKey = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[targetNationKey]) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            let warState = await resolveNationWarIncoming(targetNationKey, await loadNationWarState(targetNationKey, firestore, admin, nationDeps), firestore, admin);
            warState = await resolveNationWarCaptureState(targetNationKey, warState, firestore, admin);
            const groupId = await getNationGroupIdByNation(targetNationKey, firestore, nationDeps);
            const treasuryPs = groupId ? await getGroupTreasuryBalance(groupId, nationDeps) : 0;
            res.json({
                success: true,
                capitalWar: buildCapitalWarStatePayload(targetNationKey, viewerNation, warState, treasuryPs)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            console.error('[get-capital-war-state] Error:', msg);
            res.status(500).json({ error: 'Failed to load capital war state', details: String(msg) });
        }
    });

    app.post('/api/nation-war-capital-action', async (req, res) => {
        const { playFabId, targetNation, action } = req.body || {};
        if (!playFabId || !targetNation || !action) {
            return res.status(400).json({ error: 'playFabId, targetNation and action are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const playerNation = await getNationForPlayer(requesterPlayFabId, nationDeps);
            if (!playerNation || !NATION_GROUP_BY_NATION[playerNation]) {
                return res.status(400).json({ error: 'NationRequired' });
            }
            const targetNationKey = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[targetNationKey]) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            const normalizedAction = String(action || '').trim().toLowerCase();
            let warState = await resolveNationWarIncoming(targetNationKey, await loadNationWarState(targetNationKey, firestore, admin, nationDeps), firestore, admin);
            warState = await resolveNationWarCaptureState(targetNationKey, warState, firestore, admin);
            const nowMs = Date.now();
            const isOwnNation = playerNation === targetNationKey;
            const spendPlayerPs = async (amount, tag) => {
                const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
                if (safeAmount <= 0) return;
                await subtractEconomyItem(requesterPlayFabId, 'PS', safeAmount, { idempotencyId: `nation-war-capital:${tag}:${requesterPlayFabId}:${targetNationKey}:${nowMs}` });
            };

            if (normalizedAction === 'recon') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalReconNotAllowed' });
                await spendPlayerPs(NATION_WAR_RECON_COST_PS, 'recon');
                warState.capitalCaptureState.intelByNation[playerNation] = nowMs + NATION_WAR_RECON_DURATION_MS;
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: 'capital_recon',
                    publicLevel: 'nation',
                    summary: `${getNationLabel(playerNation)}の偵察隊が${getNationLabel(targetNationKey)}首都の情報を掴んだ`,
                    details: `${Math.ceil(NATION_WAR_RECON_DURATION_MS / 60000)}分間、首都情報を詳細表示できる。`,
                    participants: [playerNation, targetNationKey],
                    attackerNation: playerNation,
                    defenderNation: targetNationKey
                });
            } else if (normalizedAction === 'repair') {
                if (!isOwnNation) return res.status(403).json({ error: 'EnemyCapitalRepairNotAllowed' });
                await spendPlayerPs(NATION_WAR_REPAIR_COST_PS, 'repair');
                const part = pickCapitalRepairPart(warState.capitalStatus);
                warState.capitalStatus[part] = clampWarPercent(warState.capitalStatus[part] + NATION_WAR_CAPTURE_REPAIR_AMOUNT);
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: 'capital_repair',
                    publicLevel: 'nation',
                    summary: `${getNationLabel(targetNationKey)}の工兵隊が${CAPITAL_PART_LABELS[part] || '首都設備'}を修復`,
                    details: `回復量 ${NATION_WAR_CAPTURE_REPAIR_AMOUNT}`,
                    participants: [targetNationKey],
                    defenderNation: targetNationKey
                });
            } else if (normalizedAction === 'sabotage') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalSabotageNotAllowed' });
                await spendPlayerPs(NATION_WAR_SABOTAGE_COST_PS, 'sabotage');
                warState.capitalStatus.command = clampWarPercent(warState.capitalStatus.command - NATION_WAR_SABOTAGE_COMMAND_DAMAGE);
                if (warState.capitalCaptureState.status === 'capturing' && warState.capitalCaptureState.ownerCandidateNation === playerNation) {
                    warState.capitalCaptureState.progressBaseMs = Math.min(
                        warState.capitalCaptureState.baseDurationMs,
                        warState.capitalCaptureState.progressBaseMs + 12000
                    );
                }
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: 'capital_sabotage',
                    publicLevel: 'nation',
                    summary: `${getNationLabel(playerNation)}の工作隊が${getNationLabel(targetNationKey)}首都へ浸透`,
                    details: `指揮に ${NATION_WAR_SABOTAGE_COMMAND_DAMAGE} ダメージ`,
                    participants: [playerNation, targetNationKey],
                    attackerNation: playerNation,
                    defenderNation: targetNationKey
                });
            } else if (normalizedAction === 'ship_attack' || normalizedAction === 'siege') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalAttackNotAllowed' });
                const previousWalls = clampWarPercent(warState.capitalStatus.walls);
                const damage = previousWalls <= CAPITAL_CAPTURE_BREACH_WALLS
                    ? NATION_WAR_SIEGE_WALL_DAMAGE
                    : NATION_WAR_SHIP_ATTACK_WALL_DAMAGE;
                warState.capitalStatus.walls = clampWarPercent(previousWalls - damage);
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: normalizedAction === 'siege' ? 'capital_siege' : 'capital_ship_attack',
                    publicLevel: 'global',
                    summary: `${getNationLabel(playerNation)}が${getNationLabel(targetNationKey)}首都へ${normalizedAction === 'siege' ? '攻城' : '艦砲射撃'}を敢行`,
                    details: `城壁に ${damage} ダメージ`,
                    participants: [playerNation, targetNationKey],
                    attackerNation: playerNation,
                    defenderNation: targetNationKey
                });
                if (previousWalls > CAPITAL_CAPTURE_BREACH_WALLS && warState.capitalStatus.walls <= CAPITAL_CAPTURE_BREACH_WALLS) {
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_breach',
                        publicLevel: 'global',
                        summary: `${getNationLabel(targetNationKey)}の城壁が破られ、首都へ上陸可能になった`,
                        details: '前線プレイヤーは首都へ乗り込み、制圧を進められる。',
                        participants: [playerNation, targetNationKey],
                        attackerNation: playerNation,
                        defenderNation: targetNationKey
                    });
                }
            } else if (normalizedAction === 'capture_start' || normalizedAction === 'capture_join' || normalizedAction === 'capture_leave' || normalizedAction === 'capture_complete') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalCaptureNotAllowed' });
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                if (Math.max(0, Math.floor(Number(warState.capitalCaptureState.raidCooldownUntilMs) || 0)) > nowMs && normalizedAction !== 'capture_leave') {
                    return res.status(409).json({ error: 'CapitalRaidCooldownActive' });
                }
                if (warState.capitalCaptureState.raidUnlockedAtMs > 0 && normalizedAction !== 'capture_leave') {
                    return res.status(409).json({ error: 'CapitalAlreadyCaptured' });
                }
                if (clampWarPercent(warState.capitalStatus.walls) > CAPITAL_CAPTURE_BREACH_WALLS) {
                    return res.status(409).json({ error: 'CapitalNotBreached' });
                }
                const queue = Array.isArray(warState.capitalCaptureState.queue) ? warState.capitalCaptureState.queue : [];
                const currentIndex = queue.findIndex((entry) => entry.playFabId === requesterPlayFabId);
                if (normalizedAction === 'capture_leave') {
                    if (currentIndex >= 0) queue.splice(currentIndex, 1);
                } else if (normalizedAction === 'capture_complete') {
                    if (queue.length <= 0) return res.status(409).json({ error: 'CaptureNotStarted' });
                    const leader = queue[0];
                    if (!leader || leader.playFabId !== requesterPlayFabId) return res.status(403).json({ error: 'CaptureLeaderOnly' });
                    warState.capitalCaptureState = advanceNationWarCaptureState(warState.capitalCaptureState, nowMs);
                    if (warState.capitalCaptureState.progressBaseMs < warState.capitalCaptureState.baseDurationMs) {
                        return res.status(409).json({ error: 'CaptureNotReady' });
                    }
                    const participantIds = queue.map((entry) => String(entry.playFabId || '').trim()).filter(Boolean);
                    warState.capitalCaptureState.status = 'captured';
                    warState.capitalCaptureState.raidUnlockedAtMs = nowMs;
                    warState.capitalCaptureState.raidUnlockedByNation = playerNation;
                    warState.capitalCaptureState.lastCapturedByNation = playerNation;
                    warState.capitalCaptureState.lastCapturedAtMs = nowMs;
                    warState.capitalCaptureState.lastCaptureParticipantIds = Array.from(new Set(participantIds)).slice(0, 8);
                    warState.capitalCaptureState.progressBaseMs = warState.capitalCaptureState.baseDurationMs;
                    warState.capitalCaptureState.queue = [];
                    warState.capitalCaptureState.lastProgressAt = 0;
                    warState.capitalCaptureState.endsAt = 0;
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_capture_complete',
                        publicLevel: 'global',
                        summary: `${getNationLabel(targetNationKey)}の首都防衛が崩れ、国庫襲撃が可能になった`,
                        details: `${getNationLabel(playerNation)}の攻城隊が制圧を完了`,
                        participants: [playerNation, targetNationKey],
                        attackerNation: playerNation,
                        defenderNation: targetNationKey
                    });
                } else {
                    if (currentIndex < 0) {
                        if (queue.length >= warState.capitalCaptureState.slotLimit) {
                            return res.status(409).json({ error: 'CaptureFull' });
                        }
                        const leadNation = String(queue[0]?.nation || '').toLowerCase();
                        if (leadNation && leadNation !== playerNation) {
                            return res.status(409).json({ error: 'CaptureOccupiedByEnemy' });
                        }
                        queue.push(buildCapitalCaptureQueueEntry(requesterPlayFabId, playerNation, nowMs));
                    }
                }
                warState.capitalCaptureState.queue = queue;
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                if (normalizedAction === 'capture_start' || normalizedAction === 'capture_join') {
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_capture_start',
                        publicLevel: 'nation',
                        summary: `${getNationLabel(playerNation)}が${getNationLabel(targetNationKey)}首都へ上陸`,
                        details: `参加 ${warState.capitalCaptureState.queue.length}/${warState.capitalCaptureState.slotLimit}`,
                        participants: [playerNation, targetNationKey],
                        attackerNation: playerNation,
                        defenderNation: targetNationKey
                    });
                }
            } else {
                return res.status(400).json({ error: 'InvalidAction' });
            }

            warState = await resolveNationWarCaptureState(targetNationKey, warState, firestore, admin);
            const groupId = await getNationGroupIdByNation(targetNationKey, firestore, nationDeps);
            const treasuryPs = groupId ? await getGroupTreasuryBalance(groupId, nationDeps) : 0;
            res.json({
                success: true,
                capitalWar: buildCapitalWarStatePayload(targetNationKey, playerNation, warState, treasuryPs)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            console.error('[nation-war-capital-action] Error:', msg);
            res.status(500).json({ error: 'Failed to process capital action', details: String(msg) });
        }
    });

    app.post('/api/nation-war-deploy', async (req, res) => {
        const { playFabId, weaponId } = req.body || {};
        if (!playFabId || !weaponId) {
            return res.status(400).json({ error: 'playFabId and weaponId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const weapon = getNationWarWeaponDefinition(weaponId);
            if (!weapon || weapon.actionType !== 'deploy' || !canNationUseWeapon(context.nation, weaponId)) {
                return res.status(400).json({ error: 'InvalidWeapon' });
            }
            const nowMs = Date.now();
            let warState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            const cooldownUntil = Math.max(0, Math.floor(Number(warState.cooldowns?.[weapon.id] || 0)));
            if (cooldownUntil > nowMs) {
                return res.status(409).json({ error: 'WeaponCooldown', remainingMs: cooldownUntil - nowMs });
            }
            const alreadyActive = getActiveNationWarSystems(warState, nowMs).some((system) => system.weaponId === weapon.id);
            if (alreadyActive) {
                return res.status(409).json({ error: 'AlreadyActive' });
            }
            const groupTreasury = await getGroupTreasuryBalance(context.groupId, nationDeps);
            if (groupTreasury < weapon.costPs) {
                return res.status(400).json({ error: 'InsufficientTreasury', treasuryPs: groupTreasury, costPs: weapon.costPs });
            }
            const spendResult = await subtractNationTreasury(context.nation, weapon.costPs, firestore, nationDeps, {
                idempotencyId: `nation-war-deploy:${context.nation}:${weapon.id}:${nowMs}`,
                source: 'war_deploy',
                label: `兵器配備: ${weapon.label}`,
                actorId: context.kingId
            });
            warState.activeSystems.push(buildNationWarSystemEntry(weapon, nowMs));
            warState.cooldowns[weapon.id] = nowMs + (Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)) * 1000);
            await saveNationWarState(context.nation, warState, firestore, admin);
            await appendNationWarEvent(firestore, admin, {
                type: 'system_deploy',
                publicLevel: 'nation',
                summary: `${getNationLabel(context.nation)}が${weapon.label}を配備`,
                details: weapon.description || '国家システムを配備した。',
                participants: [context.nation],
                attackerNation: context.nation,
                weaponId: weapon.id
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                treasuryPs: spendResult?.treasuryPs ?? null,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-deploy] Error:', msg);
            res.status(500).json({ error: 'Failed to deploy weapon', details: String(msg) });
        }
    });

    app.post('/api/nation-war-prepare-strike', async (req, res) => {
        const { playFabId, weaponId, targetNation, targetPart } = req.body || {};
        if (!playFabId || !weaponId || !targetNation) {
            return res.status(400).json({ error: 'playFabId, weaponId and targetNation are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const defenderNation = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[defenderNation] || defenderNation === context.nation) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            const safeTargetPart = CAPITAL_PART_LABELS[String(targetPart || '').trim()] ? String(targetPart || '').trim() : 'walls';
            const weapon = getNationWarWeaponDefinition(weaponId);
            if (!weapon || weapon.actionType !== 'strike' || !canNationUseWeapon(context.nation, weaponId)) {
                return res.status(400).json({ error: 'InvalidWeapon' });
            }
            const nowMs = Date.now();
            let attackerState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            let defenderState = await resolveNationWarIncoming(defenderNation, await loadNationWarState(defenderNation, firestore, admin, nationDeps), firestore, admin);
            const cooldownUntil = Math.max(0, Math.floor(Number(attackerState.cooldowns?.[weapon.id] || 0)));
            if (cooldownUntil > nowMs) {
                return res.status(409).json({ error: 'WeaponCooldown', remainingMs: cooldownUntil - nowMs });
            }
            const groupTreasury = await getGroupTreasuryBalance(context.groupId, nationDeps);
            if (groupTreasury < weapon.costPs) {
                return res.status(400).json({ error: 'InsufficientTreasury', treasuryPs: groupTreasury, costPs: weapon.costPs });
            }
            const spendResult = await subtractNationTreasury(context.nation, weapon.costPs, firestore, nationDeps, {
                idempotencyId: `nation-war-strike:${context.nation}:${weapon.id}:${nowMs}`,
                source: 'war_strike',
                label: `攻撃準備: ${weapon.label}`,
                actorId: context.kingId
            });
            const attackBonus = buildNationWarAttackSnapshot(attackerState, nowMs);
            defenderState.incoming.push(buildNationWarStrikeEntry({
                attackerNation: context.nation,
                defenderNation,
                weapon,
                targetPart: safeTargetPart,
                attackBonus
            }, nowMs));
            attackerState.cooldowns[weapon.id] = nowMs + (Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)) * 1000);
            await saveNationWarState(context.nation, attackerState, firestore, admin);
            await saveNationWarState(defenderNation, defenderState, firestore, admin);
            await appendNationWarEvent(firestore, admin, {
                type: 'strike_prepare',
                publicLevel: 'global',
                summary: `${getNationLabel(context.nation)}が${weapon.label}の発射準備を開始`,
                details: `${getNationLabel(defenderNation)}の${CAPITAL_PART_LABELS[safeTargetPart] || '首都'}を狙っている。`,
                participants: [context.nation, defenderNation],
                attackerNation: context.nation,
                defenderNation,
                weaponId: weapon.id
            });
            await appendNationWarEvent(firestore, admin, {
                type: 'incoming_alert',
                publicLevel: 'nation',
                summary: `${getNationLabel(defenderNation)}が飛来警報を受信`,
                details: `${Math.max(1, Math.ceil(Number(weapon.prepSeconds || 0) / 60))}分後に到達見込み。`,
                participants: [context.nation, defenderNation],
                attackerNation: context.nation,
                defenderNation,
                weaponId: weapon.id
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                treasuryPs: spendResult?.treasuryPs ?? null,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-prepare-strike] Error:', msg);
            res.status(500).json({ error: 'Failed to prepare strike', details: String(msg) });
        }
    });

    app.post('/api/nation-war-intercept', async (req, res) => {
        const { playFabId, incomingId, action, interceptSystemId } = req.body || {};
        if (!playFabId || !incomingId || !action) {
            return res.status(400).json({ error: 'playFabId, incomingId and action are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const nowMs = Date.now();
            let warState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            const incoming = warState.incoming.find((row) => row.id === String(incomingId));
            if (!incoming) {
                return res.status(404).json({ error: 'IncomingNotFound' });
            }
            if (incoming.launchAtMs <= nowMs) {
                return res.status(409).json({ error: 'IncomingAlreadyResolving' });
            }
            const normalizedAction = String(action || '').trim().toLowerCase();
            if (normalizedAction !== 'intercept' && normalizedAction !== 'skip') {
                return res.status(400).json({ error: 'InvalidAction' });
            }
            incoming.decision = normalizedAction;
            incoming.interceptSystemId = '';
            if (normalizedAction === 'intercept') {
                const system = getActiveNationWarSystems(warState, nowMs)
                    .find((row) => row.id === String(interceptSystemId || '').trim());
                if (!system) {
                    return res.status(400).json({ error: 'InterceptorNotFound' });
                }
                const weapon = getNationWarWeaponDefinition(system.weaponId);
                if (!weapon || weapon.role !== 'intercept' || system.ammoRemaining <= 0) {
                    return res.status(400).json({ error: 'InterceptorUnavailable' });
                }
                incoming.interceptSystemId = system.id;
            }
            await saveNationWarState(context.nation, warState, firestore, admin);
            const incomingWeapon = getNationWarWeaponDefinition(incoming.weaponId);
            await appendNationWarEvent(firestore, admin, {
                type: normalizedAction === 'intercept' ? 'intercept_order' : 'intercept_skip',
                publicLevel: 'nation',
                summary: normalizedAction === 'intercept'
                    ? `${getNationLabel(context.nation)}が${incomingWeapon?.label || '飛来物'}への迎撃を指示`
                    : `${getNationLabel(context.nation)}が${incomingWeapon?.label || '飛来物'}への迎撃を見送った`,
                details: normalizedAction === 'intercept'
                    ? `迎撃兵器: ${getNationWarWeaponDefinition(incoming.interceptSystemId ? (warState.activeSystems.find((row) => row.id === incoming.interceptSystemId)?.weaponId || '') : '')?.label || '未設定'}`
                    : '脅威判定を見送り、消耗を抑える。',
                participants: [context.nation, incoming.attackerNation],
                attackerNation: incoming.attackerNation,
                defenderNation: context.nation,
                weaponId: incoming.weaponId
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-intercept] Error:', msg);
            res.status(500).json({ error: 'Failed to update intercept order', details: String(msg) });
        }
    });

    app.post('/api/nation-war-raid-treasury', async (req, res) => {
        const { playFabId, targetNation } = req.body || {};
        if (!playFabId || !targetNation) {
            return res.status(400).json({ error: 'playFabId and targetNation are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const defenderNation = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[defenderNation] || defenderNation === context.nation) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            const attackerState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            const defenderState = await resolveNationWarIncoming(defenderNation, await loadNationWarState(defenderNation, firestore, admin, nationDeps), firestore, admin);
            const defenderGroupId = await getNationGroupIdByNation(defenderNation, firestore, nationDeps);
            const defenderTreasuryPs = defenderGroupId ? await getGroupTreasuryBalance(defenderGroupId, nationDeps) : 0;
            const raidPlan = calculateNationWarRaidPlan(defenderState.capitalStatus, defenderTreasuryPs, defenderState.capitalCaptureState);
            if (!raidPlan.breachOpen) {
                return res.status(409).json({ error: 'CapitalNotBreached' });
            }
            if (raidPlan.expectedAmount <= 0) {
                return res.status(409).json({ error: 'NothingToRaid', treasuryPs: defenderTreasuryPs });
            }
            const raidAmount = raidPlan.expectedAmount;
            const raidId = `nation-war-raid:${context.nation}:${defenderNation}:${Date.now()}`;
            const raidParticipantIds = (
                defenderState.capitalCaptureState?.lastCapturedByNation === context.nation
                    ? defenderState.capitalCaptureState?.lastCaptureParticipantIds
                    : []
            );
            const participantIds = Array.isArray(raidParticipantIds)
                ? Array.from(new Set(raidParticipantIds.map((row) => String(row || '').trim()).filter(Boolean))).slice(0, 8)
                : [];
            const participantRewardPulls = raidAmount >= NATION_WAR_CARD_REWARD_HIGH_RAID_THRESHOLD ? 2 : 1;
            const participantRewards = [];
            const spendResult = await subtractNationTreasury(defenderNation, raidAmount, firestore, nationDeps, {
                idempotencyId: `${raidId}:out`,
                source: 'war_raid',
                label: `国庫襲撃: ${getNationLabel(context.nation)}`,
                actorId: context.kingId,
                note: `${getNationLabel(context.nation)}による襲撃`
            });
            await addNationTreasury(context.nation, raidAmount, firestore, nationDeps, {
                idempotencyId: `${raidId}:in`,
                source: 'war_raid',
                label: `国庫襲撃戦果: ${getNationLabel(defenderNation)}`,
                note: `${getNationLabel(defenderNation)}からの戦果`
            });
            for (const participantId of participantIds) {
                const grantedItemIds = [];
                for (let pullIndex = 0; pullIndex < participantRewardPulls; pullIndex += 1) {
                    const rewardItemId = pickRandomNationWarTarotCardId();
                    await addEconomyItem(participantId, rewardItemId, 1, {
                        idempotencyId: `${raidId}:card:${participantId}:${pullIndex + 1}:${rewardItemId}`
                    });
                    grantedItemIds.push(rewardItemId);
                }
                participantRewards.push({
                    playFabId: participantId,
                    itemIds: grantedItemIds
                });
            }
            const participantRewardCount = participantRewards.reduce(
                (sum, entry) => sum + (Array.isArray(entry?.itemIds) ? entry.itemIds.length : 0),
                0
            );
            defenderState.capitalStatus.walls = Math.max(
                clampWarPercent(defenderState.capitalStatus.walls),
                NATION_WAR_POST_RAID_WALLS
            );
            defenderState.capitalStatus.vault = clampWarPercent(defenderState.capitalStatus.vault - 12);
            defenderState.capitalStatus.command = clampWarPercent(defenderState.capitalStatus.command - 6);
            defenderState.capitalCaptureState.raidUnlockedAtMs = 0;
            defenderState.capitalCaptureState.raidUnlockedByNation = null;
            defenderState.capitalCaptureState.raidCooldownUntilMs = Date.now() + NATION_WAR_POST_RAID_COOLDOWN_MS;
            defenderState.capitalCaptureState.queue = [];
            defenderState.capitalCaptureState.progressBaseMs = 0;
            defenderState.capitalCaptureState.lastProgressAt = 0;
            defenderState.capitalCaptureState.endsAt = 0;
            defenderState.capitalCaptureState.ownerCandidateId = null;
            defenderState.capitalCaptureState.ownerCandidateNation = null;
            defenderState.capitalCaptureState.breachedAt = 0;
            defenderState.capitalCaptureState.lastCapturedByNation = null;
            defenderState.capitalCaptureState.lastCapturedAtMs = 0;
            defenderState.capitalCaptureState.lastCaptureParticipantIds = [];
            defenderState.capitalCaptureState = refreshNationWarCaptureState(defenderState.capitalCaptureState, defenderState, Date.now());
            await saveNationWarState(defenderNation, defenderState, firestore, admin);
            const rewardDetails = participantRewardCount > 0
                ? ` 制圧参加者 ${participantRewards.length} 名にタロットカード ${participantRewardCount} 枚を配布。`
                : '';
            await appendNationWarEvent(firestore, admin, {
                type: 'treasury_raid',
                publicLevel: 'global',
                summary: `${getNationLabel(context.nation)}が${getNationLabel(defenderNation)}の国庫を襲撃`,
                details: `${raidAmount.toLocaleString()}Gを奪取。${rewardDetails}城壁は ${NATION_WAR_POST_RAID_WALLS}% まで復旧し、再襲撃は ${Math.floor(NATION_WAR_POST_RAID_COOLDOWN_MS / 60000)} 分後まで不可。`,
                participants: [context.nation, defenderNation],
                attackerNation: context.nation,
                defenderNation
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                raidAmount,
                defenderTreasuryPs: spendResult?.treasuryPs ?? null,
                participantRewardPulls,
                participantRewardCount,
                participantRewards,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-raid-treasury] Error:', msg);
            res.status(500).json({ error: 'Failed to raid treasury', details: String(msg) });
        }
    });

    // 王の譲渡
    app.post('/api/king-transfer', async (req, res) => {
        const { playFabId, newKingPlayFabId } = req.body || {};
        if (!playFabId || !newKingPlayFabId) {
            return res.status(400).json({ error: 'playFabId and newKingPlayFabId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        const targetKingId = normalizePlayFabId(newKingPlayFabId);
        if (!targetKingId) {
            return res.status(400).json({ error: 'newKingPlayFabId is invalid' });
        }

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            if (context.kingId === targetKingId) {
                return res.json({ success: true, newKingPlayFabId: targetKingId, alreadyKing: true });
            }

            const targetNation = await getNationForPlayer(targetKingId, { promisifyPlayFab, PlayFabServer });
            if (!targetNation || String(targetNation).toLowerCase() !== String(context.nation).toLowerCase()) {
                return res.status(403).json({ error: 'TargetNotInSameNation' });
            }

            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: context.kingId,
                FunctionName: 'TransferNationKing',
                FunctionParameter: { newKingPlayFabId: targetKingId },
                GeneratePlayStreamEvent: false
            });
            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
                if (String(msg).includes('TargetNotInSameNation')) {
                    return res.status(403).json({ error: 'TargetNotInSameNation' });
                }
                return res.status(500).json({ error: 'Failed to transfer king', details: msg });
            }

            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: context.kingId,
                Data: { IsKing: 'false', NationKingId: targetKingId }
            });
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: targetKingId,
                Data: { IsKing: 'true', NationKingId: targetKingId }
            });

            const starterCrownResult = await ensureKingStarterCrown(targetKingId, context.nation, {
                promisifyPlayFab,
                PlayFabServer,
                addEconomyItem
            });

            await getNationGroupDoc(firestore, context.mapping.groupName).set({
                kingPlayFabId: targetKingId,
                kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            let guildId = null;
            try {
                const entity = await getPlayerEntity(context.kingId, { promisifyPlayFab, PlayFabServer });
                if (entity) {
                    const membership = await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.ListMembership, { Entity: entity });
                    const groups = membership?.Groups || [];
                    const guildGroup = groups.find((groupEntry) => {
                        const id = groupEntry?.Group?.Id || '';
                        return id && id !== context.groupId;
                    });
                    guildId = guildGroup?.Group?.Id || null;
                }
            } catch (error) {
                console.warn('[king-transfer] Failed to resolve guild membership:', error?.message || error);
            }

            let guildUpdate = { guildUpdated: false, shipUpdated: false };
            if (guildId) {
                guildUpdate = await updateGuildOwnerAndShipOwner(guildId, targetKingId, { promisifyPlayFab, firestore, admin });
            }

            return res.json({
                success: true,
                newKingPlayFabId: targetKingId,
                guildId: guildId,
                guildUpdated: guildUpdate.guildUpdated,
                guildShipUpdated: guildUpdate.shipUpdated,
                starterCrown: starterCrownResult
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
            console.error('[king-transfer] Error:', msg);
            return res.status(500).json({ error: 'Failed to transfer king', details: msg });
        }
    });

    // TROY営業状態の変更
    app.post('/api/king-set-troy-open', async (req, res) => {
        const { playFabId, isOpen } = req.body || {};
        const requesterPlayFabId = String(playFabId || '').trim();
        const nextOpen = !!isOpen;
        if (!requesterPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const authenticatedPlayFabId = await requireAuthedPlayFabId(req, res, requesterPlayFabId);
        if (!authenticatedPlayFabId) return;

        try {
            const kingContext = await requireKingContext(authenticatedPlayFabId, firestore, nationDeps);
            let openedByLineUserId = '';
            if (nextOpen) {
                try {
                    openedByLineUserId = await getLineUserId(kingContext.kingId, nationDeps);
                } catch (lineError) {
                    console.warn('[king-set-troy-open] Failed to resolve opener LINE ID:', lineError?.errorMessage || lineError?.message || lineError);
                }
            }
            const context = {
                nation: kingContext.nation,
                mapping: kingContext.mapping,
                kingId: kingContext.kingId,
                openedByLineUserId
            };
            const result = await setGlobalTroyOpenState(context, nextOpen);
            let label = 'TROY';
            if (requesterPlayFabId) {
                label = await getPlayerDisplayName(requesterPlayFabId, { promisifyPlayFab, PlayFabServer }) || label;
            }
            const message = nextOpen ? 'TROYをOPEN！' : 'TROYをCLOSE。';
            addGlobalChatMessage(message, label);
            res.json(result);
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
            console.error('[king-set-troy-open] Error:', msg);
            res.status(500).json({ error: 'Failed to update troy status' });
        }
    });

    // スタッフ注文メニュー管理
    app.post('/api/king-update-menu', async (req, res) => {
        const { playFabId, action, name, content, price, emoji, id, menuId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const roomRef = getTroyRoomDoc(firestore, context.mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.data() || {};

            if (action === 'addCustom') {
                const safeMenuId = String(menuId || '').trim().toLowerCase();
                const allowedMenuIds = new Set(['beer', 'gin', 'vodka', 'rum', 'tequila', 'liqueur', 'whisky', 'mixer', 'soft', 'food', 'bottle']);
                if (!allowedMenuIds.has(safeMenuId)) return res.status(400).json({ error: 'Invalid menuId' });
                const safeName = String(name || '').trim().slice(0, 40);
                const safeContent = String(content || '').trim().slice(0, 80);
                const safePrice = Math.max(1, Math.floor(Number(price) || 0));
                const safeEmoji = String(emoji || '').trim().slice(0, 8) || '🍽';
                if (!safeName || !safePrice) return res.status(400).json({ error: 'name and price are required' });
                const current = Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : [];
                if (current.length >= 80) return res.status(400).json({ error: 'スタッフ用オーダーメニューは最大80件までです。' });
                const newItem = {
                    id: `custom-${Date.now()}`,
                    menuId: safeMenuId,
                    concept: safeName,
                    content: safeContent,
                    price: safePrice,
                    emoji: safeEmoji
                };
                const next = [...current, newItem];
                await roomRef.set({ menuCustomItems: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                return res.json({ success: true, menuCustomItems: next });
            }

            if (action === 'removeCustom') {
                const safeId = String(id || '').trim();
                if (!safeId) return res.status(400).json({ error: 'id is required' });
                const current = Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : [];
                const next = current.filter((item) => String(item?.id || '') !== safeId);
                await roomRef.set({ menuCustomItems: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                return res.json({ success: true, menuCustomItems: next });
            }

            return res.status(400).json({ error: 'Unknown action' });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
            console.error('[king-update-menu] Error:', msg);
            res.status(500).json({ error: 'Failed to update menu', details: String(msg) });
        }
    });

    // TROY状態取得
    app.post('/api/get-troy-status', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            let nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) {
                nation = await findOpenTroyNation(firestore) || TROY_ENTRY_DEFAULT_NATION;
            }
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.json({ isOpen: false, members: [], notInNation: true });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const isOpen = !!roomSnap.data()?.isOpen;

            const membersSnap = await roomRef
                .collection('members')
                .orderBy('joinedAt', 'asc')
                .limit(50)
                .get();
            const members = membersSnap.docs.map(doc => {
                const data = doc.data() || {};
                return {
                    playFabId: doc.id,
                    displayName: data.displayName || doc.id,
                    joinedAt: data.joinedAt ? data.joinedAt.toMillis?.() || data.joinedAt : null
                };
            });
            const roomDataFull = roomSnap.data() || {};
            res.json({
                isOpen,
                members,
                nation,
                menuDisabled: Array.isArray(roomDataFull.menuDisabled) ? roomDataFull.menuDisabled : [],
                menuSpecials: Array.isArray(roomDataFull.menuSpecials) ? roomDataFull.menuSpecials : [],
                menuCustomItems: Array.isArray(roomDataFull.menuCustomItems) ? roomDataFull.menuCustomItems : []
            });
        } catch (error) {
            console.error('[get-troy-status] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get troy status' });
        }
    });

    app.post('/api/troy-join', async (req, res) => {
        const { playFabId, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const requestedNation = String(req.body?.troyNation || req.body?.entryNation || '').trim().toLowerCase();
            const nation = requestedNation && getNationMappingByNation(requestedNation)
                ? requestedNation
                : await findOpenTroyNation(firestore);
            if (!nation) return res.status(403).json({ error: 'TroyClosed' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
            if (!roomSnap.exists || !roomData.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const name = String(displayName || '').trim().slice(0, 40) || memberId;
            const pictureUrl = String(req.body?.pictureUrl || req.body?.avatarUrl || '').trim().slice(0, 500);
            const memberRef = roomRef.collection('members').doc(memberId);
            const existingMemberSnap = await memberRef.get();
            const isNewEntry = !existingMemberSnap.exists;
            let usualItems = [];
            try {
                const orderStatsSnap = await roomRef.collection('orderStats').doc(memberId).get();
                usualItems = buildTroyUsualItemsPayload(orderStatsSnap.data() || {});
            } catch (historyError) {
                console.warn('[troy-join] Failed to load order history:', historyError?.message || historyError);
            }
            let entryLevel = 1;
            let entryContributionTotal = null;
            try {
                const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: memberId });
                const statsMap = buildStatsMapFromStatistics(statsResult?.Statistics);
                entryContributionTotal = normalizeTroyBountyNumber(statsMap[PLAYER_CONTRIBUTION_STAT] || 0);
                entryLevel = calculateLevelFromContribution(entryContributionTotal).level;
            } catch (_) {}
            const entryRankName = getPlayerRankNameByLevel(entryLevel);
            const entryRankBenefits = getPlayerRankServiceBenefitsByLevel(entryLevel);
            let entryChargeCreated = false;
            let entryChargeError = null;
            const memberPayload = {
                playFabId: memberId,
                displayName: name,
                ...(pictureUrl ? { avatarUrl: pictureUrl } : {}),
                level: entryLevel,
                rankName: entryRankName,
                rankBenefits: entryRankBenefits,
                usualItems,
                joinedAt: existingMemberSnap.exists ? (existingMemberSnap.data()?.joinedAt || admin.firestore.FieldValue.serverTimestamp()) : admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (entryContributionTotal !== null) {
                memberPayload.contributionTotal = entryContributionTotal;
                memberPayload.contributionUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
            }
            await memberRef.set(memberPayload, { merge: true });

            if (isNewEntry && TROY_ENTRY_CHARGE_AMOUNT > 0) {
                try {
                    const orderedAtMs = Date.now();
                    const entryChargeResult = await appendTroyCheckoutItem({
                        nation,
                        mapping,
                        roomRef,
                        roomData
                    }, {
                        receiverPlayFabId: memberId,
                        displayName: name,
                        name: TROY_ENTRY_CHARGE_ITEM_NAME,
                        price: TROY_ENTRY_CHARGE_AMOUNT,
                        quantity: 1,
                        menuCategory: 'entry',
                        menuCategoryLabel: 'チャージ',
                        orderId: `troy-entry:${memberId}:${nation}`,
                        orderedAtMs,
                        servedAtMs: orderedAtMs
                    });
                    entryChargeCreated = !!(entryChargeResult?.created || entryChargeResult?.duplicate);
                } catch (chargeError) {
                    entryChargeError = chargeError?.errorMessage || chargeError?.message || String(chargeError);
                    console.warn('[troy-join] Entry charge failed:', entryChargeError);
                }
            }

            pushDisplayEvent({
                type: 'flare',
                topic: 'troy-entry',
                label: `入店: ${name}`,
                level: entryLevel,
                rankName: entryRankName,
                rankBenefits: entryRankBenefits
            });
            return res.json({
                success: true,
                nation,
                entryBonusGranted: 0,
                entryBonusError: null,
                entryChargeAmount: isNewEntry ? TROY_ENTRY_CHARGE_AMOUNT : 0,
                entryStaffChipAmount: isNewEntry ? TROY_ENTRY_STAFF_CHIP_AMOUNT : 0,
                entryInstructionMessage: isNewEntry && TROY_ENTRY_STAFF_CHIP_AMOUNT > 0
                    ? `スタッフからチップ${TROY_ENTRY_STAFF_CHIP_AMOUNT.toLocaleString('ja-JP')}を受け取ってください`
                    : '',
                entryChargeCreated,
                entryChargeError,
                alreadyEntered: !isNewEntry
            });
        } catch (error) {
            console.error('[troy-join] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to join troy' });
        }
    });

    // TROY退店
    app.post('/api/troy-leave', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.json({ success: true });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.json({ success: true });

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            await roomRef.collection('members').doc(memberId).delete();
            pushDisplayEvent({
                type: 'refresh',
                topic: 'troy-leave'
            });
            res.json({ success: true });
        } catch (error) {
            console.error('[troy-leave] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to leave troy' });
        }
    });

    // TROYチャット取得
    app.post('/api/get-troy-chat', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(403).json({ error: 'NotInNation' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(403).json({ error: 'NotInNation' });

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }

            const snap = await roomRef
                .collection('chat')
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
            const messages = snap.docs
                .map((doc) => {
                    const data = doc.data() || {};
                    const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt;
                    return {
                        playFabId: data.playFabId || '',
                        message: data.message || '',
                        displayName: data.displayName || 'Player',
                        timestamp: ts || Date.now()
                    };
                })
                .reverse();

            res.json({ success: true, messages });
        } catch (error) {
            console.error('[get-troy-chat] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get troy chat' });
        }
    });

    // TROYチャット送信
    app.post('/api/send-troy-chat', async (req, res) => {
        const { playFabId, message } = req.body || {};
        const text = String(message || '').trim();
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!text) return res.status(400).json({ error: 'Message is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(403).json({ error: 'NotInNation' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(403).json({ error: 'NotInNation' });

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }
            const memberData = memberSnap.data() || {};
            const displayName = memberData.displayName || memberId;

            await roomRef.collection('chat').add({
                playFabId: memberId,
                displayName,
                message: text,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({ success: true });
        } catch (error) {
            console.error('[send-troy-chat] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to send troy chat' });
        }
    });

    async function resolveOpenTroyMemberContext(playFabId) {
        const nation = await findOpenTroyNation(firestore);
        if (!nation) {
            const error = new Error('TroyClosed');
            error.statusCode = 403;
            throw error;
        }
        const mapping = getNationMappingByNation(nation);
        if (!mapping) {
            const error = new Error('InvalidNation');
            error.statusCode = 400;
            throw error;
        }
        const memberId = normalizePlayFabId(playFabId);
        if (!memberId) {
            const error = new Error('InvalidPlayFabId');
            error.statusCode = 400;
            throw error;
        }
        const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
        const roomSnap = await roomRef.get();
        const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
        if (!roomSnap.exists || !roomData.isOpen) {
            const error = new Error('TroyClosed');
            error.statusCode = 403;
            throw error;
        }
        const memberRef = roomRef.collection('members').doc(memberId);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
            const error = new Error('NotInTroy');
            error.statusCode = 403;
            throw error;
        }
        return { nation, mapping, roomRef, roomData, memberId, memberRef, memberData: memberSnap.data() || {} };
    }

    function getTroyContributionDebtRef(playFabId) {
        const id = normalizePlayFabId(playFabId);
        if (!id || !firestore) return null;
        return firestore.collection(TROY_CONTRIBUTION_DEBT_COLLECTION).doc(id);
    }

    function normalizeContributionDebtAmount(value) {
        return Math.max(0, Math.floor(Number(value) || 0));
    }

    function normalizeContributionDebtRepayBps(value, fallback = 10000) {
        const parsed = Math.floor(Number(value));
        if (!Number.isFinite(parsed)) return Math.max(0, Math.min(10000, Math.floor(Number(fallback) || 0)));
        return Math.max(0, Math.min(10000, parsed));
    }

    function buildContributionDebtMessage(blockedAmount) {
        const blocked = normalizeContributionDebtAmount(blockedAmount);
        if (blocked <= 0) return '';
        return `${TROY_CONTRIBUTION_DEBT_MESSAGE}（-${blocked.toLocaleString('ja-JP')}）`;
    }

    async function applyTroyContributionDebtForContribution(playFabId, amount, options = {}) {
        const targetId = normalizePlayFabId(playFabId);
        const value = normalizeContributionDebtAmount(amount);
        const debtRepayBps = normalizeContributionDebtRepayBps(options.debtRepayBps, 10000);
        const debtRef = getTroyContributionDebtRef(targetId);
        if (!targetId || value <= 0 || !debtRef || !admin) {
            return {
                requestedAmount: value,
                contributionAmount: value,
                debtRepayBps,
                debtRepayCapAmount: 0,
                debtBlockedAmount: 0,
                debtRemaining: 0,
                debtMessage: ''
            };
        }

        const outcome = await firestore.runTransaction(async (transaction) => {
            const debtSnap = await transaction.get(debtRef);
            const data = debtSnap.exists ? (debtSnap.data() || {}) : {};
            const currentDebt = normalizeContributionDebtAmount(data.debt);
            const debtRepayCapAmount = Math.min(value, Math.floor((value * debtRepayBps) / 10000));
            const debtBlockedAmount = Math.min(currentDebt, debtRepayCapAmount);
            const contributionAmount = Math.max(0, value - debtBlockedAmount);
            const debtRemaining = Math.max(0, currentDebt - debtBlockedAmount);
            transaction.set(debtRef, {
                playFabId: targetId,
                debt: debtRemaining,
                totalBlocked: normalizeContributionDebtAmount(data.totalBlocked) + debtBlockedAmount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastBlockedAt: debtBlockedAmount > 0 ? admin.firestore.FieldValue.serverTimestamp() : data.lastBlockedAt || null
            }, { merge: true });
            return {
                requestedAmount: value,
                previousDebt: currentDebt,
                debtRepayBps,
                debtRepayCapAmount,
                contributionAmount,
                debtBlockedAmount,
                debtRemaining,
                debtMessage: buildContributionDebtMessage(debtBlockedAmount)
            };
        });

        let contribution = null;
        if (outcome.contributionAmount > 0) {
            try {
                contribution = await addPlayerNationContribution(targetId, outcome.contributionAmount, nationDeps);
            } catch (error) {
                try {
                    await firestore.runTransaction(async (transaction) => {
                        const debtSnap = await transaction.get(debtRef);
                        const data = debtSnap.exists ? (debtSnap.data() || {}) : {};
                        const currentDebt = normalizeContributionDebtAmount(data.debt);
                        transaction.set(debtRef, {
                            playFabId: targetId,
                            debt: currentDebt + outcome.debtBlockedAmount,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            lastRestoreAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    });
                } catch (restoreError) {
                    console.warn('[troy-contribution-debt] Failed to restore debt after contribution error:', restoreError?.message || restoreError);
                }
                throw error;
            }
        }

        return {
            ...outcome,
            contribution
        };
    }

    async function applyTroyContributionDebtForChipReturn(playFabId, amount) {
        return applyTroyContributionDebtForContribution(playFabId, amount, {
            debtRepayBps: TROY_CHIP_RETURN_DEBT_REPAY_BPS
        });
    }

    async function applyTroyContributionDebtForSettlement(playFabId, amount) {
        return applyTroyContributionDebtForContribution(playFabId, amount, {
            debtRepayBps: TROY_SETTLEMENT_DEBT_REPAY_BPS
        });
    }

    async function recordTroyCoinConversion(memberRef, requestId, direction, amount) {
        const safeRequestId = String(requestId || '').trim().slice(0, 120);
        const conversionRef = safeRequestId
            ? memberRef.collection('coinConversions').doc(safeRequestId)
            : null;
        const now = admin.firestore.FieldValue.serverTimestamp();
        return firestore.runTransaction(async (transaction) => {
            const memberSnap = await transaction.get(memberRef);
            if (!memberSnap.exists) {
                const error = new Error('NotInTroy');
                error.statusCode = 403;
                throw error;
            }
            if (conversionRef) {
                const conversionSnap = await transaction.get(conversionRef);
                if (conversionSnap.exists) {
                    const conversionData = conversionSnap.data() || {};
                    return {
                        duplicate: true,
                        direction: conversionData.direction || direction,
                        amount: Math.max(0, Math.floor(Number(conversionData.amount) || 0)),
                        coinConvertedTotal: Math.max(0, Math.floor(Number(conversionData.coinConvertedTotal) || 0)),
                        goldConvertedTotal: Math.max(0, Math.floor(Number(conversionData.goldConvertedTotal) || 0)),
                        contributionAmount: 0,
                        contributionAppliedTotal: Math.max(0, Math.floor(Number(conversionData.contributionAppliedTotal) || 0)),
                        contributionDebtAdded: 0
                    };
                }
            }

            const data = memberSnap.data() || {};
            const memberId = normalizePlayFabId(memberRef.id || data.playFabId || '');
            const debtRef = direction === 'gold_to_coin' ? getTroyContributionDebtRef(memberId) : null;
            const debtSnap = debtRef ? await transaction.get(debtRef) : null;
            const debtData = debtSnap?.exists ? (debtSnap.data() || {}) : {};
            const coinConvertedTotal = Math.max(0, Math.floor(Number(data.coinConvertedTotal) || 0));
            const goldConvertedTotal = Math.max(0, Math.floor(Number(data.goldConvertedTotal) || 0));
            const contributionAppliedTotal = Math.max(0, Math.floor(Number(data.coinGoldContributionTotal) || 0));
            let nextCoinConvertedTotal = coinConvertedTotal;
            let nextGoldConvertedTotal = goldConvertedTotal;
            let nextContributionAppliedTotal = contributionAppliedTotal;
            let contributionAmount = 0;
            let contributionDebtAdded = 0;

            if (direction === 'gold_to_coin') {
                nextCoinConvertedTotal += amount;
                if (debtRef) {
                    const currentDebt = normalizeContributionDebtAmount(debtData.debt);
                    contributionDebtAdded = amount;
                    transaction.set(debtRef, {
                        playFabId: memberId,
                        debt: currentDebt + contributionDebtAdded,
                        totalDebtAdded: normalizeContributionDebtAmount(debtData.totalDebtAdded) + contributionDebtAdded,
                        updatedAt: now,
                        lastDebtAddedAt: now
                    }, { merge: true });
                }
            } else if (direction === 'coin_to_gold') {
                nextGoldConvertedTotal += amount;
                const eligibleContributionTotal = Math.max(0, nextGoldConvertedTotal - nextCoinConvertedTotal);
                contributionAmount = Math.max(0, eligibleContributionTotal - contributionAppliedTotal);
                nextContributionAppliedTotal += contributionAmount;
            } else {
                const error = new Error('InvalidConversionDirection');
                error.statusCode = 400;
                throw error;
            }

            const update = {
                coinConvertedTotal: nextCoinConvertedTotal,
                goldConvertedTotal: nextGoldConvertedTotal,
                coinGoldContributionTotal: nextContributionAppliedTotal,
                updatedAt: now
            };
            if (direction === 'gold_to_coin') update.lastCoinConvertedAt = now;
            if (direction === 'coin_to_gold') update.lastGoldConvertedAt = now;
            transaction.set(memberRef, update, { merge: true });

            const result = {
                duplicate: false,
                direction,
                amount,
                coinConvertedTotal: nextCoinConvertedTotal,
                goldConvertedTotal: nextGoldConvertedTotal,
                contributionAmount,
                contributionAppliedTotal: nextContributionAppliedTotal,
                contributionDebtAdded
            };
            if (conversionRef) {
                transaction.set(conversionRef, {
                    ...result,
                    createdAt: now
                });
            }
            return result;
        });
    }

    async function updateTroyMemberRankSnapshot(memberRef, contribution) {
        const level = Math.max(1, Math.floor(Number(contribution?.level) || 0));
        if (!memberRef || level <= 0) return;
        const contributionTotal = normalizeTroyBountyNumber(contribution?.contributionTotal);
        try {
            const update = {
                level,
                rankName: getPlayerRankNameByLevel(level),
                rankBenefits: getPlayerRankServiceBenefitsByLevel(level),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (contributionTotal > 0) {
                update.contributionTotal = contributionTotal;
                update.contributionUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
            }
            await memberRef.set(update, { merge: true });
        } catch (rankError) {
            console.warn('[troy-member-rank] Failed to update rank snapshot:', rankError?.message || rankError);
        }
    }

    async function appendTroyCoinConversionLog(roomRef, entry = {}) {
        if (!roomRef || !admin) return;
        const now = Date.now();
        const logEntry = {
            id: String(entry.id || `coin-${now}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 80),
            playFabId: String(entry.playFabId || '').trim(),
            displayName: String(entry.displayName || entry.playFabId || 'お客様').trim().slice(0, 40),
            amount: Math.max(0, Math.floor(Number(entry.amount) || 0)),
            timestampMs: now
        };
        if (!logEntry.playFabId || logEntry.amount <= 0) return;
        await firestore.runTransaction(async (tx) => {
            const snap = await tx.get(roomRef);
            const current = Array.isArray(snap.data()?.coinConversionLogs) ? snap.data().coinConversionLogs : [];
            tx.set(roomRef, {
                coinConversionLogs: [logEntry, ...current].slice(0, 20),
                coinConversionLogsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
    }

    async function notifyTroyCoinConversionToOpener(roomData = {}, entry = {}) {
        if (!lineClient || typeof lineClient.pushMessage !== 'function') return null;
        const lineUserId = String(roomData?.openedByLineUserId || '').trim();
        if (!lineUserId) return null;
        const amount = Math.max(0, Math.floor(Number(entry.amount) || 0));
        const displayName = String(entry.displayName || entry.playFabId || 'お客様').trim() || 'お客様';
        if (amount <= 0) return null;
        const text = [
            '【TROY チップ化】',
            `${displayName}`,
            `${amount.toLocaleString('ja-JP')}Gをチップ化しました。`,
            'スタッフからチップを渡してください。'
        ].join('\n');
        await lineClient.pushMessage(lineUserId, { type: 'text', text });
        return { sent: true, lineUserId };
    }

    function buildTroyCoinConversionLogsPayload(roomData = {}) {
        const rows = Array.isArray(roomData?.coinConversionLogs) ? roomData.coinConversionLogs : [];
        return rows
            .map((entry) => ({
                id: String(entry?.id || '').trim(),
                playFabId: String(entry?.playFabId || '').trim(),
                displayName: String(entry?.displayName || entry?.playFabId || 'お客様').trim(),
                amount: Math.max(0, Math.floor(Number(entry?.amount) || 0)),
                timestampMs: Math.max(0, Math.floor(Number(entry?.timestampMs) || 0))
            }))
            .filter((entry) => entry.playFabId && entry.amount > 0)
            .slice(0, 20);
    }

    app.post('/api/troy-convert-gold-to-coin', async (req, res) => {
        const { playFabId } = req.body || {};
        const amount = normalizeTroyCoinConversionAmount(req.body?.amount);
        const requestId = normalizeRequiredRequestId(req.body?.requestId);
        if (!playFabId || amount <= 0) {
            return res.status(400).json({ error: 'playFabId and 100G単位の正しい金額が必要です。' });
        }
        if (!requestId) {
            return res.status(400).json({ error: 'requestId is required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await resolveOpenTroyMemberContext(requesterPlayFabId);
            const idempotencyId = `${requestId}:gold-to-coin`;
            await subtractEconomyItem(context.memberId, 'PS', amount, { idempotencyId });
            const conversion = await recordTroyCoinConversion(context.memberRef, requestId, 'gold_to_coin', amount);
            if (!conversion.duplicate) {
                const conversionEntry = {
                    id: requestId,
                    playFabId: context.memberId,
                    displayName: context.memberData?.displayName || context.memberId,
                    amount
                };
                try {
                    await appendTroyCoinConversionLog(context.roomRef, conversionEntry);
                } catch (logError) {
                    console.warn('[troy-convert-gold-to-coin] Failed to append coin conversion log:', logError?.message || logError);
                }
                try {
                    await notifyTroyCoinConversionToOpener(context.roomData, conversionEntry);
                } catch (notifyError) {
                    console.warn('[troy-convert-gold-to-coin] Failed to notify opener:', notifyError?.message || notifyError);
                }
            }
            let newBalance = null;
            let balanceSyncError = null;
            if (getCurrencyBalance) {
                try {
                    newBalance = await getCurrencyBalance(context.memberId, 'PS');
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: context.memberId,
                        Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: newBalance }]
                    });
                } catch (syncError) {
                    balanceSyncError = syncError?.errorMessage || syncError?.message || String(syncError);
                    console.warn('[troy-convert-gold-to-coin] Balance/stat sync failed:', balanceSyncError);
                }
            }
            res.json({
                success: true,
                amount,
                newBalance: Number.isFinite(newBalance) ? newBalance : undefined,
                balanceSyncError: balanceSyncError || undefined,
                ...conversion
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            const statusCode = error?.statusCode || (String(msg).includes('InsufficientFunds') ? 400 : 500);
            console.error('[troy-convert-gold-to-coin] Error:', msg);
            res.status(statusCode).json({ error: String(msg).includes('InsufficientFunds') ? 'ゴールドが不足しています。' : msg });
        }
    });

    app.post('/api/troy-convert-coin-to-gold', async (req, res) => {
        return res.status(410).json({ error: 'コイン返却は王の操作画面から行ってください。' });
    });

    app.post('/api/king-troy-return-coin', async (req, res) => {
        const { playFabId, receiverPlayFabId } = req.body || {};
        const amount = normalizeTroyCoinReturnAmount(req.body?.amount);
        const requestId = normalizeRequiredRequestId(req.body?.requestId);
        if (!playFabId || !receiverPlayFabId || amount <= 0) {
            return res.status(400).json({ error: 'playFabId, receiverPlayFabId and 正しい返却金額が必要です。' });
        }
        if (!requestId) {
            return res.status(400).json({ error: 'requestId is required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const kingContext = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const receiverId = normalizePlayFabId(receiverPlayFabId);
            if (!receiverId) return res.status(400).json({ error: 'Invalid receiver PlayFab ID' });

            const roomRef = getTroyRoomDoc(firestore, kingContext.mapping.groupName);
            const memberRef = roomRef.collection('members').doc(receiverId);
            const memberSnap = await memberRef.get();
            if (!memberSnap.exists) return res.status(403).json({ error: 'NotInTroy' });

            const idempotencyId = `${requestId}:king-coin-return`;
            await addEconomyItem(receiverId, 'PS', amount, { idempotencyId });
            const conversion = await recordTroyCoinConversion(memberRef, requestId, 'coin_to_gold', amount);

            let contribution = null;
            let contributionDebtResult = null;
            if (!conversion.duplicate && conversion.contributionAmount > 0) {
                try {
                    contributionDebtResult = await applyTroyContributionDebtForChipReturn(receiverId, conversion.contributionAmount);
                    contribution = contributionDebtResult?.contribution || null;
                    if (contribution) {
                        await updateTroyMemberRankSnapshot(memberRef, contribution);
                    }
                } catch (contributionError) {
                    console.warn('[king-troy-return-coin] Failed to update contribution:', contributionError?.errorMessage || contributionError?.message || contributionError);
                }
            }

            let newBalance = null;
            let balanceSyncError = null;
            if (getCurrencyBalance) {
                try {
                    newBalance = await getCurrencyBalance(receiverId, 'PS');
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: receiverId,
                        Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: newBalance }]
                    });
                } catch (syncError) {
                    balanceSyncError = syncError?.errorMessage || syncError?.message || String(syncError);
                    console.warn('[king-troy-return-coin] Balance/stat sync failed:', balanceSyncError);
                }
            }
            if (firestore && admin) {
                try {
                    const notification = {
                        type: 'king_coin_return',
                        fromId: kingContext.kingId,
                        amount,
                        currency: 'PS',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    };
                    if (Number.isFinite(newBalance)) {
                        notification.balanceAfter = newBalance;
                    }
                    await firestore
                        .collection('notifications')
                        .doc(receiverId)
                        .collection('items')
                        .add(notification);
                } catch (notifyError) {
                    console.warn('[king-troy-return-coin] Notification write failed:', notifyError?.message || notifyError);
                }
            }
            if (contribution) {
                pushDisplayEvent({
                    type: 'refresh',
                    topic: 'troy-ranking'
                });
            }
            res.json({
                success: true,
                amount,
                receiverPlayFabId: receiverId,
                newBalance: Number.isFinite(newBalance) ? newBalance : undefined,
                balanceSyncError: balanceSyncError || undefined,
                contribution,
                ...conversion,
                rawContributionAmount: conversion.contributionAmount,
                contributionAmount: Math.max(0, Math.floor(Number(contributionDebtResult?.contributionAmount) || 0)),
                contributionDebtBlockedAmount: Math.max(0, Math.floor(Number(contributionDebtResult?.debtBlockedAmount) || 0)),
                contributionDebtRemaining: Math.max(0, Math.floor(Number(contributionDebtResult?.debtRemaining) || 0)),
                contributionDebtMessage: contributionDebtResult?.debtMessage || ''
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            const statusCode = error?.statusCode || (String(msg).includes('NotKing') ? 403 : 500);
            console.error('[king-troy-return-coin] Error:', msg);
            res.status(statusCode).json({ error: msg });
        }
    });

    app.post('/api/king-grant-ps', async (req, res) => {
        const { playFabId, receiverPlayFabId, amount } = req.body || {};
        const requestId = normalizeRequiredRequestId(req.body?.requestId);
        if (!playFabId || !receiverPlayFabId) {
            return res.status(400).json({ error: 'playFabId and receiverPlayFabId are required' });
        }
        if (!requestId) {
            return res.status(400).json({ error: 'requestId is required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }
        if (playFabId === receiverPlayFabId) {
            return res.status(400).json({ error: 'Cannot grant to self' });
        }

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const receiverId = normalizePlayFabId(receiverPlayFabId);
            if (!receiverId) return res.status(400).json({ error: 'Invalid receiver PlayFab ID' });
            const cashbackInfo = await getNationTreasuryCashbackInfo(context.nation, firestore, nationDeps);
            const cashbackRateBps = cashbackInfo.rateBps;
            const treasuryRank = cashbackInfo.rank;
            const grantAmount = Math.floor(value * (cashbackRateBps / 10000));
            if (grantAmount <= 0) {
                const minReceived = Math.ceil(10000 / cashbackRateBps);
                return res.status(400).json({
                    error: 'Grant amount is zero',
                    details: `received=${value}, cashbackRateBps=${cashbackRateBps}, minReceived=${minReceived}`
                });
            }

            const idempotencyFor = (suffix) => requestId ? `${requestId}:${suffix}` : null;
            try {
                await addEconomyItem(receiverId, 'PS', grantAmount, { idempotencyId: idempotencyFor('ps-grant') });
            } catch (addError) {
                const addMessage = addError?.errorMessage || addError?.message || '';
                if (String(addMessage).includes('EntityKeyNotFound')) {
                    return res.status(400).json({ error: '受取人のアカウントが見つかりません。' });
                }
                return res.status(500).json({ error: 'Failed to add gold', details: addError?.errorMessage || addError?.message });
            }

            let treasuryUpdated = true;
            let treasuryErrorMessage = '';
            try {
                await addNationTreasury(context.nation, value, firestore, nationDeps, {
                    idempotencyId: idempotencyFor('treasury'),
                    contributorPlayFabId: receiverId,
                    source: 'king_grant_receipt',
                    label: '王の受領'
                });
            } catch (treasuryError) {
                treasuryUpdated = false;
                treasuryErrorMessage = treasuryError?.errorMessage || treasuryError?.message || String(treasuryError);
                console.warn('[king-grant-ps] Failed to add treasury:', treasuryErrorMessage);
            }

            if (firestore && admin) {
                try {
                    await firestore
                        .collection('notifications')
                        .doc(receiverId)
                        .collection('items')
                        .add({
                            type: 'king_grant',
                            fromId: context.kingId,
                            amount: grantAmount,
                            currency: 'PS',
                            receivedAmount: value,
                            cashbackRateBps,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                } catch (notifyError) {
                    console.warn('[king-grant-ps] Notification write failed:', notifyError?.message || notifyError);
                }
            }

            let receiverBalance = null;
            if (getCurrencyBalance) {
                receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: receiverId,
                    Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                });
            }

            res.json({
                success: true,
                receivedAmount: value,
                grantAmount,
                cashbackRateBps,
                treasuryRank,
                receiverNation: await getNationForPlayer(receiverId, { promisifyPlayFab, PlayFabServer }),
                receiverBalance: Number.isFinite(receiverBalance) ? receiverBalance : undefined,
                treasuryUpdated,
                treasuryError: treasuryUpdated ? undefined : treasuryErrorMessage
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-grant-ps] Error:', msg);
            res.status(500).json({ error: 'Failed to grant gold', details: msg });
        }
    });

    app.post('/api/king-direct-grant-ps', async (req, res) => {
        const { playFabId, receiverPlayFabId, amount } = req.body || {};
        const requestId = normalizeRequiredRequestId(req.body?.requestId);
        if (!playFabId || !receiverPlayFabId) {
            return res.status(400).json({ error: 'playFabId and receiverPlayFabId are required' });
        }
        if (!requestId) {
            return res.status(400).json({ error: 'requestId is required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0 || value % 100 !== 0) {
            return res.status(400).json({ error: 'Amount must be a positive multiple of 100' });
        }
        if (normalizePlayFabId(playFabId) === normalizePlayFabId(receiverPlayFabId)) {
            return res.status(400).json({ error: 'Cannot grant to self' });
        }

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const receiverId = normalizePlayFabId(receiverPlayFabId);
            if (!receiverId) return res.status(400).json({ error: 'Invalid receiver PlayFab ID' });

            const roomRef = getTroyRoomDoc(firestore, context.mapping.groupName);
            const memberSnap = await roomRef.collection('members').doc(receiverId).get();
            if (!memberSnap.exists) {
                return res.status(400).json({ error: 'Receiver is not in the TROY entry list' });
            }

            const idempotencyFor = (suffix) => requestId ? `${requestId}:${suffix}` : null;
            try {
                await addEconomyItem(receiverId, 'PS', value, { idempotencyId: idempotencyFor('ps-direct-grant') });
            } catch (addError) {
                const addMessage = addError?.errorMessage || addError?.message || '';
                if (String(addMessage).includes('EntityKeyNotFound')) {
                    return res.status(400).json({ error: 'Receiver account was not found' });
                }
                return res.status(500).json({ error: 'Failed to add gold', details: addError?.errorMessage || addError?.message });
            }

            let contribution = null;
            try {
                contribution = await addPlayerNationContribution(receiverId, value, nationDeps);
                await updateTroyMemberRankSnapshot(roomRef.collection('members').doc(receiverId), contribution);
            } catch (contributionError) {
                console.warn('[king-direct-grant-ps] Failed to update contribution:', contributionError?.errorMessage || contributionError?.message || contributionError);
            }

            if (firestore && admin) {
                try {
                    await firestore
                        .collection('notifications')
                        .doc(receiverId)
                        .collection('items')
                        .add({
                            type: 'king_direct_grant',
                            fromId: context.kingId,
                            amount: value,
                            currency: 'PS',
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                } catch (notifyError) {
                    console.warn('[king-direct-grant-ps] Notification write failed:', notifyError?.message || notifyError);
                }
            }

            let receiverBalance = null;
            let balanceSyncError = null;
            if (getCurrencyBalance) {
                try {
                    receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: receiverId,
                        Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                    });
                } catch (syncError) {
                    balanceSyncError = syncError?.errorMessage || syncError?.message || String(syncError);
                    console.warn('[king-direct-grant-ps] Balance/stat sync failed after grant:', balanceSyncError);
                }
            }
            if (contribution) {
                pushDisplayEvent({
                    type: 'refresh',
                    topic: 'troy-ranking'
                });
            }

            res.json({
                success: true,
                grantAmount: value,
                receiverNation: await getNationForPlayer(receiverId, { promisifyPlayFab, PlayFabServer }),
                receiverBalance: Number.isFinite(receiverBalance) ? receiverBalance : undefined,
                balanceSyncError: balanceSyncError || undefined,
                contribution
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-direct-grant-ps] Error:', msg);
            res.status(500).json({ error: 'Failed to direct grant gold', details: msg });
        }
    });

    async function resolveOpenTroyOrdersContext(requestedNationRaw) {
        const requestedNation = String(requestedNationRaw || '').trim().toLowerCase();
        const roomRef = getTroyRoomDoc(firestore);
        const roomSnap = await roomRef.get();
        const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
        if (!roomSnap.exists || !roomData.isOpen) return null;
        const roomNation = String(roomData.nation || '').trim().toLowerCase();
        const nation = getNationMappingByNation(roomNation)
            ? roomNation
            : (requestedNation && getNationMappingByNation(requestedNation) ? requestedNation : TROY_ENTRY_DEFAULT_NATION);
        const mapping = getNationMappingByNation(nation);
        if (!mapping) return null;
        return { nation, mapping, roomRef, roomData };
    }

    async function buildTroyOrdersPagePayload(context) {
        const menuCustomItems = Array.isArray(context.roomData?.menuCustomItems) ? context.roomData.menuCustomItems : [];
        if (!TROY_STAFF_CHECKOUT_ENABLED) {
            return {
                troyOpen: true,
                nation: context.nation,
                troyTodaySales: { total: 0, count: 0 },
                troyPendingCheckouts: [],
                troyMembers: buildTroyMemberPayload([]),
                troyCustomerOrderRequests: [],
                troyCoinConversionLogs: buildTroyCoinConversionLogsPayload(context.roomData),
                menuCustomItems,
                checkoutDisabled: true
            };
        }
        const [checkoutSnap, membersSnap, requestSnap, groupSnap] = await Promise.all([
            context.roomRef.collection('checkouts').limit(50).get(),
            context.roomRef.collection('members').orderBy('joinedAt', 'asc').limit(50).get(),
            context.roomRef.collection('customerOrderRequests').orderBy('createdAtMs', 'desc').limit(TROY_CUSTOMER_ORDER_REQUEST_LIMIT).get(),
            getNationGroupDoc(firestore, context.mapping.groupName).get()
        ]);
        const groupData = groupSnap.data() || {};
        return {
            troyOpen: true,
            nation: context.nation,
            troyTodaySales: buildTroyTodaySalesSnapshot(groupData, {
                dayKey: normalizeTroyBusinessDayKey(context.roomData?.troyBusinessDayKey)
            }),
            troyPendingCheckouts: buildTroyPendingCheckoutPayload(checkoutSnap.docs),
            troyMembers: buildTroyMemberPayload(membersSnap.docs),
            troyCustomerOrderRequests: buildTroyCustomerOrderRequestPayload(requestSnap.docs),
            troyCoinConversionLogs: buildTroyCoinConversionLogsPayload(context.roomData),
            menuCustomItems
        };
    }

    async function appendTroyCheckoutItem(context, payload = {}) {
        if (!TROY_STAFF_CHECKOUT_ENABLED) {
            const error = new Error('TroyCheckoutDisabled');
            error.statusCode = 503;
            throw error;
        }
        const receiverId = normalizePlayFabId(payload.receiverPlayFabId);
        const name = String(payload.name || '').trim().slice(0, 60);
        const price = Math.max(0, Math.floor(Number(payload.price) || 0));
        const quantity = Math.max(1, Math.min(99, Math.floor(Number(payload.quantity) || 1)));
        const menuImage = normalizeTroyMenuImagePath(payload.menuImage || payload.image || payload.iconImage);
        const menuCategory = normalizeTroySalesCategoryId(payload.menuCategory || payload.categoryId || payload.category);
        const menuCategoryLabel = normalizeTroySalesCategoryLabel(payload.menuCategoryLabel || payload.categoryLabel, {
            ...payload,
            menuCategory,
            name
        });
        if (!receiverId || !name) {
            const error = new Error('InvalidCheckoutItem');
            error.statusCode = 400;
            throw error;
        }
        const displayName = String(payload.displayName || receiverId).trim().slice(0, 40) || receiverId;
        const orderedAtMs = Math.max(0, Math.floor(Number(payload.orderedAtMs) || Date.now()));
        const orderId = String(payload.orderId || `staff:${receiverId}:${orderedAtMs}`).trim().slice(0, 120);
        const undoUntilMs = Math.max(0, Math.floor(Number(payload.undoUntilMs) || 0));
        const servedAtMs = Math.max(0, Math.floor(Number(payload.servedAtMs) || 0));
        const checkoutRef = context.roomRef.collection('checkouts').doc(receiverId);

        return firestore.runTransaction(async (tx) => {
            const checkoutSnap = await tx.get(checkoutRef);
            const checkoutData = checkoutSnap.exists ? (checkoutSnap.data() || {}) : {};
            const checkoutStatus = String(checkoutData.status || 'open').trim().toLowerCase();
            if (checkoutStatus && !['open', 'pending'].includes(checkoutStatus)) {
                const error = new Error('CheckoutAlreadyClosed');
                error.statusCode = 409;
                throw error;
            }

            const existingItems = Array.isArray(checkoutData.items) ? checkoutData.items : [];
            if (orderId && existingItems.some((item) => String(item?.orderId || '').trim() === orderId)) {
                return { created: false, duplicate: true };
            }

            const newItem = buildStoredTroyCheckoutItem({
                name,
                price,
                quantity,
                grantedPs: 0,
                cashbackRateBps: 0,
                orderId,
                orderedAtMs,
                undoUntilMs,
                servedAtMs,
                menuImage,
                menuCategory,
                menuCategoryLabel
            });
            if (!newItem) {
                const error = new Error('InvalidCheckoutItem');
                error.statusCode = 400;
                throw error;
            }

            const nextItems = existingItems.concat([newItem]);
            const normalized = normalizeTroyCheckoutItems(nextItems);
            const nextTotal = normalized.reduce((sum, item) => sum + item.lineTotal, 0);
            const nextTotalItems = normalized.reduce((sum, item) => sum + item.quantity, 0);
            const nextGrantTotal = normalized.reduce((sum, item) => sum + Math.max(0, Number(item.grantedPs) || 0), 0);
            const basePatch = checkoutSnap.exists ? {} : {
                playFabId: receiverId,
                displayName,
                status: 'open',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            tx.set(checkoutRef, {
                ...basePatch,
                playFabId: checkoutData.playFabId || receiverId,
                displayName: checkoutData.displayName || displayName,
                items: nextItems,
                total: nextTotal,
                totalItems: nextTotalItems,
                grantTotal: nextGrantTotal,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastOrderedAt: admin.firestore.Timestamp.fromMillis(orderedAtMs)
            }, { merge: true });

            return { created: true, duplicate: false, total: nextTotal, totalItems: nextTotalItems };
        });
    }

    async function createTroyCustomerOrderRequest(context, payload = {}) {
        if (!TROY_STAFF_CHECKOUT_ENABLED) {
            const error = new Error('TroyCheckoutDisabled');
            error.statusCode = 503;
            throw error;
        }
        const playFabId = normalizePlayFabId(payload.playFabId);
        if (!playFabId) {
            const error = new Error('playFabId is required');
            error.statusCode = 400;
            throw error;
        }
        const memberRef = context.roomRef.collection('members').doc(playFabId);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
            const error = new Error('NotInTroy');
            error.statusCode = 403;
            throw error;
        }
        const memberData = memberSnap.data() || {};
        const displayName = String(memberData.displayName || payload.displayName || playFabId).trim().slice(0, 40) || playFabId;
        const item = resolveTroyCustomerOrderItem(payload);
        const requestId = normalizeTroyCustomerOrderRequestId(payload.requestId)
            || `customer:${playFabId}:${Date.now()}`;
        const nowMs = Date.now();
        const requestRef = context.roomRef.collection('customerOrderRequests').doc(requestId);
        const requestData = {
            requestId,
            playFabId,
            displayName,
            nation: context.nation,
            status: 'pending',
            ...item,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtMs: nowMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAtMs: nowMs
        };
        const result = await firestore.runTransaction(async (tx) => {
            const requestSnap = await tx.get(requestRef);
            if (requestSnap.exists) {
                return {
                    created: false,
                    request: buildTroyCustomerOrderRequestPayload([requestSnap])[0] || { requestId, status: String(requestSnap.data()?.status || 'pending') }
                };
            }
            tx.set(requestRef, requestData);
            return {
                created: true,
                request: buildTroyCustomerOrderRequestPayload([{ id: requestId, data: () => requestData }])[0]
            };
        });
        if (result.created && result.request) {
            pushDisplayEvent(buildTroyCustomerOrderDisplayEvent(context, result.request, {
                topic: 'troy-customer-order'
            }));
        }
        return { success: true, duplicate: !result.created, request: result.request };
    }

    async function markTroyCustomerOrderRequestForReview(context, requestId, action) {
        const requestRef = context.roomRef.collection('customerOrderRequests').doc(requestId);
        const nowMs = Date.now();
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(requestRef);
            if (!snap.exists) {
                const error = new Error('OrderRequestNotFound');
                error.statusCode = 404;
                throw error;
            }
            const data = snap.data() || {};
            const status = String(data.status || 'pending').trim().toLowerCase();
            if (!['pending', 'processing'].includes(status)) {
                const error = new Error('OrderRequestAlreadyReviewed');
                error.statusCode = 409;
                throw error;
            }
            if (action === 'reject') {
                tx.set(requestRef, {
                    status: 'rejected',
                    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                    reviewedAtMs: nowMs,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAtMs: nowMs
                }, { merge: true });
                return { data, rejected: true };
            }
            tx.set(requestRef, {
                status: 'processing',
                processingAt: admin.firestore.FieldValue.serverTimestamp(),
                processingAtMs: nowMs,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAtMs: nowMs
            }, { merge: true });
            return { data, rejected: false };
        });
    }

    async function reviewTroyCustomerOrderRequest(context, payload = {}) {
        const requestId = normalizeTroyCustomerOrderRequestId(payload.requestId);
        const rawAction = String(payload.action || '').trim().toLowerCase();
        const action = rawAction === 'accept' ? 'accept' : (['reject', 'cancel', 'decline'].includes(rawAction) ? 'reject' : '');
        if (!requestId || !action) {
            const error = new Error('requestId and action are required');
            error.statusCode = 400;
            throw error;
        }
        const requestRef = context.roomRef.collection('customerOrderRequests').doc(requestId);
        const marked = await markTroyCustomerOrderRequestForReview(context, requestId, action);
        if (marked.rejected) {
            pushDisplayEvent(buildTroyCustomerOrderDisplayEvent(context, { ...marked.data, requestId }, {
                topic: 'troy-customer-order-reviewed',
                action: 'reject'
            }));
            return { success: true, action: 'reject', requestId };
        }

        const request = marked.data || {};
        const nowMs = Date.now();
        try {
            await appendTroyCheckoutItem(context, {
                receiverPlayFabId: request.playFabId,
                displayName: request.displayName || request.playFabId,
                name: request.name,
                price: request.price,
                quantity: request.quantity,
                menuImage: request.menuImage || request.image || request.iconImage,
                menuCategory: request.menuCategory || request.menuId,
                menuCategoryLabel: request.menuCategoryLabel,
                orderId: `customer-request:${requestId}`,
                orderedAtMs: nowMs,
                undoUntilMs: nowMs + 60000
            });
            await requestRef.set({
                status: 'accepted',
                reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                reviewedAtMs: nowMs,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAtMs: nowMs
            }, { merge: true });
            pushDisplayEvent(buildTroyCustomerOrderDisplayEvent(context, { ...request, requestId }, {
                topic: 'troy-customer-order-reviewed',
                action: 'accept'
            }));
            return { success: true, action: 'accept', requestId };
        } catch (error) {
            await requestRef.set({
                status: 'pending',
                reviewError: String(error?.message || error || '').slice(0, 240),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAtMs: Date.now()
            }, { merge: true });
            throw error;
        }
    }

    async function recordTroyOrderHistory(roomRef, receiverId, checkoutPayload = {}) {
        const normalizedReceiverId = normalizePlayFabId(receiverId);
        const historyItems = normalizeTroyCheckoutItems(checkoutPayload.items).filter(isTroyUsualOrderCandidate);
        if (!normalizedReceiverId || !historyItems.length) return [];
        const statsRef = roomRef.collection('orderStats').doc(normalizedReceiverId);
        const settledAtMs = Date.now();
        return firestore.runTransaction(async (tx) => {
            const statsSnap = await tx.get(statsRef);
            const statsData = statsSnap.exists ? (statsSnap.data() || {}) : {};
            const nextItems = mergeTroyOrderHistoryItems(statsData.items, historyItems, settledAtMs);
            tx.set(statsRef, {
                playFabId: normalizedReceiverId,
                displayName: checkoutPayload.displayName || normalizedReceiverId,
                items: nextItems,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastSettledAt: admin.firestore.Timestamp.fromMillis(settledAtMs)
            }, { merge: true });
            return nextItems;
        });
    }

    function buildTroyMenuConsumableRewards(checkoutPayload = {}) {
        const byItemId = new Map();
        normalizeTroyCheckoutItems(checkoutPayload.items)
            .filter(isTroyUsualOrderCandidate)
            .forEach((item) => {
                const image = normalizeTroyMenuImagePath(item.menuImage || item.image || item.iconImage);
                const itemId = getTroyMenuConsumableItemId(item.name, image);
                if (!itemId) return;
                const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
                const current = byItemId.get(itemId) || {
                    itemId,
                    name: item.name,
                    image,
                    quantity: 0
                };
                current.quantity += quantity;
                byItemId.set(itemId, current);
            });
        return [...byItemId.values()];
    }

    async function grantTroyMenuConsumables(playFabId, checkoutPayload = {}, checkoutStableId = '') {
        const targetId = normalizePlayFabId(playFabId);
        const rewards = buildTroyMenuConsumableRewards(checkoutPayload);
        if (!targetId || !rewards.length) {
            return { applied: false, targetPlayFabId: targetId, items: [], missingItems: [] };
        }

        const safeStableId = String(checkoutStableId || `${checkoutPayload.playFabId || targetId}:${checkoutPayload.createdAtMs || 0}:${checkoutPayload.total || 0}`).trim();
        const granted = [];
        for (const reward of rewards) {
            try {
                await addEconomyItem(targetId, reward.itemId, reward.quantity, {
                    idempotencyId: `troy-menu-consumable:${safeStableId}:${reward.itemId}`,
                    alternateIdType: 'FriendlyId'
                });
            } catch (grantError) {
                const message = grantError?.errorMessage || grantError?.message || String(grantError);
                const error = new Error(`MenuConsumableGrantFailed:${reward.name}`);
                error.statusCode = 500;
                error.details = `${reward.name}:${reward.itemId}:${message}`;
                throw error;
            }
            granted.push(reward);
        }

        return {
            applied: granted.length > 0,
            targetPlayFabId: targetId,
            items: granted,
            missingItems: []
        };
    }

    async function recordTroyMenuConsumableGrantFailure(context, failure = {}) {
        const rewards = buildTroyMenuConsumableRewards(failure.checkoutPayload || {});
        if (!context?.roomRef || !rewards.length) return '';
        const receiverId = normalizePlayFabId(failure.receiverId);
        const representativeId = normalizePlayFabId(failure.representativeId);
        const checkoutPayload = failure.checkoutPayload || {};
        const stableId = String(failure.checkoutStableId || `${receiverId}:${checkoutPayload.createdAtMs || checkoutPayload.updatedAtMs || 0}:${checkoutPayload.total || 0}`).trim();
        const docId = (stableId || `grant-failure-${Date.now()}`)
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 120);
        await context.roomRef.collection('menuConsumableGrantFailures').doc(docId).set({
            status: 'pending',
            receiverPlayFabId: receiverId,
            representativePlayFabId: representativeId,
            checkoutStableId: stableId,
            checkoutTotal: Math.max(0, Math.floor(Number(checkoutPayload.total) || 0)),
            checkoutTotalItems: Math.max(0, Math.floor(Number(checkoutPayload.totalItems) || 0)),
            checkoutCreatedAtMs: Math.max(0, Math.floor(Number(checkoutPayload.createdAtMs) || 0)),
            error: String(failure.error || '').slice(0, 600),
            items: rewards.map((item) => ({
                itemId: item.itemId,
                name: item.name,
                image: item.image,
                quantity: item.quantity
            })),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return docId;
    }

    async function settleTroyCheckoutForRoom(context, payload = {}, logPrefix = 'troy-orders-settle') {
        if (!TROY_STAFF_CHECKOUT_ENABLED) {
            const error = new Error('TroyCheckoutDisabled');
            error.statusCode = 503;
            throw error;
        }
        const receiverId = normalizePlayFabId(payload.receiverPlayFabId);
        if (!receiverId) {
            const error = new Error('InvalidReceiver');
            error.statusCode = 400;
            throw error;
        }

        const memberRef = context.roomRef.collection('members').doc(receiverId);
        const checkoutRef = context.roomRef.collection('checkouts').doc(receiverId);
        const checkoutSnap = await checkoutRef.get();
        if (!checkoutSnap.exists) {
            const error = new Error('CheckoutNotFound');
            error.statusCode = 404;
            throw error;
        }

        const checkoutPayload = buildTroyCheckoutPayload(checkoutSnap);
        if (!checkoutPayload || checkoutPayload.total <= 0) {
            const error = new Error('InvalidCheckout');
            error.statusCode = 400;
            throw error;
        }
        if (!['open', 'pending'].includes(checkoutPayload.status)) {
            const error = new Error('CheckoutAlreadyClosed');
            error.statusCode = 409;
            throw error;
        }

        const expected = Math.max(0, Math.floor(Number(payload.expectedTotal) || 0));
        if (expected > 0 && checkoutPayload.total !== expected) {
            const error = new Error('CheckoutChanged');
            error.statusCode = 409;
            error.currentTotal = checkoutPayload.total;
            throw error;
        }

        const requestId = String(payload.requestId || '').trim();
        const rawChipReturnAmount = Math.max(0, Math.floor(Number(payload.chipReturnAmount ?? payload.coinDepositAmount) || 0));
        const chipReturnAmount = rawChipReturnAmount > 0 ? normalizeTroyCoinReturnAmount(rawChipReturnAmount) : 0;
        if (rawChipReturnAmount > 0 && chipReturnAmount <= 0) {
            const error = new Error('InvalidChipReturnAmount');
            error.statusCode = 400;
            throw error;
        }
        const settleBaseId = requestId
            || `troy-settle:${receiverId}:${checkoutPayload.createdAtMs || checkoutPayload.updatedAtMs || 0}:${checkoutPayload.total}`;
        const idempotencyFor = (suffix) => `${settleBaseId}:${suffix}`;
        const checkoutStableId = `${receiverId}:${checkoutPayload.createdAtMs || checkoutPayload.updatedAtMs || 0}:${checkoutPayload.total}`;
        const representativeId = normalizePlayFabId(payload.settlementRepresentativePlayFabId || payload.representativePlayFabId || receiverId) || receiverId;

        let grantAmount = 0;
        let cashbackRateBps = 0;
        let treasuryRank = null;
        let grantApplied = false;
        let grantError = null;
        let menuConsumableGrant = { applied: false, targetPlayFabId: representativeId, items: [], missingItems: [] };
        let menuConsumableGrantError = null;
        let menuConsumableGrantFailureId = '';

        try {
            menuConsumableGrant = await grantTroyMenuConsumables(representativeId, checkoutPayload, checkoutStableId);
        } catch (menuGrantIssue) {
            menuConsumableGrantError = menuGrantIssue?.details || menuGrantIssue?.errorMessage || menuGrantIssue?.message || String(menuGrantIssue);
            console.warn(`[${logPrefix}] Menu consumable grant failed:`, menuConsumableGrantError);
            try {
                menuConsumableGrantFailureId = await recordTroyMenuConsumableGrantFailure(context, {
                    receiverId,
                    representativeId,
                    checkoutPayload,
                    checkoutStableId,
                    error: menuConsumableGrantError
                });
            } catch (recordError) {
                console.warn(`[${logPrefix}] Menu consumable grant failure record failed:`, recordError?.message || recordError);
            }
        }

        if (checkoutPayload.status === 'pending') {
            try {
                const cashbackInfo = await getNationTreasuryCashbackInfo(context.nation, firestore, nationDeps);
                cashbackRateBps = cashbackInfo.rateBps;
                treasuryRank = cashbackInfo.rank;
                grantAmount = Math.floor(checkoutPayload.total * (cashbackRateBps / 10000));
                if (grantAmount > 0) {
                    await addEconomyItem(receiverId, 'PS', grantAmount, { idempotencyId: idempotencyFor('ps-grant') });
                    grantApplied = true;
                    if (getCurrencyBalance) {
                        const receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                            PlayFabId: receiverId,
                            Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                        });
                    }
                }
            } catch (grantIssue) {
                grantError = grantIssue?.errorMessage || grantIssue?.message || String(grantIssue);
                console.warn(`[${logPrefix}] Legacy grant failed:`, grantError);
                const error = new Error('FailedToGrantPs');
                error.statusCode = 500;
                error.details = grantError;
                throw error;
            }
        }

        let chipReturnApplied = false;
        let chipReturnError = null;
        let chipReturnConversion = null;
        let chipReturnContribution = null;
        let chipReturnDebtResult = null;
        if (chipReturnAmount > 0) {
            try {
                const chipReturnRequestId = `${settleBaseId}:chip-return`;
                await addEconomyItem(receiverId, 'PS', chipReturnAmount, { idempotencyId: `troy-chip-return:${checkoutStableId}:${chipReturnAmount}` });
                chipReturnApplied = true;
                chipReturnConversion = await recordTroyCoinConversion(memberRef, chipReturnRequestId, 'coin_to_gold', chipReturnAmount);
                if (!chipReturnConversion.duplicate && chipReturnConversion.contributionAmount > 0) {
                    try {
                        chipReturnDebtResult = await applyTroyContributionDebtForChipReturn(receiverId, chipReturnConversion.contributionAmount);
                        chipReturnContribution = chipReturnDebtResult?.contribution || null;
                        if (chipReturnContribution) {
                            await updateTroyMemberRankSnapshot(memberRef, chipReturnContribution);
                        }
                    } catch (contributionError) {
                        console.warn(`[${logPrefix}] Chip return contribution failed:`, contributionError?.errorMessage || contributionError?.message || contributionError);
                    }
                }
                if (getCurrencyBalance) {
                    const receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: receiverId,
                        Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                    });
                }
                if (firestore && admin) {
                    try {
                        await firestore
                            .collection('notifications')
                            .doc(receiverId)
                            .collection('items')
                            .add({
                                type: 'troy_chip_return',
                                amount: chipReturnAmount,
                                currency: 'PS',
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                    } catch (notifyError) {
                        console.warn(`[${logPrefix}] Chip return notification failed:`, notifyError?.message || notifyError);
                    }
                }
            } catch (chipReturnIssue) {
                chipReturnError = chipReturnIssue?.errorMessage || chipReturnIssue?.message || String(chipReturnIssue);
                console.warn(`[${logPrefix}] Chip return failed:`, chipReturnError);
                const error = new Error('FailedToReturnChip');
                error.statusCode = 500;
                error.details = chipReturnError;
                throw error;
            }
        }

        let treasuryPs = null;
        let settlementContribution = null;
        let settlementContributionAmount = 0;
        let settlementDebtResult = null;
        try {
            const treasuryResult = await addNationTreasury(context.nation, checkoutPayload.total, firestore, nationDeps, {
                idempotencyId: idempotencyFor('treasury'),
                contributorPlayFabId: receiverId,
                contributorName: checkoutPayload.displayName,
                source: 'troy_settlement',
                label: 'TROY会計',
                note: checkoutPayload.summary || `${checkoutPayload.totalItems}点`,
                skipContributionUpdate: true,
                requireContribution: true
            });
            treasuryPs = treasuryResult?.treasuryPs ?? null;
            settlementDebtResult = await applyTroyContributionDebtForSettlement(receiverId, checkoutPayload.total);
            settlementContribution = settlementDebtResult?.contribution || null;
            settlementContributionAmount = Math.max(0, Math.floor(Number(settlementDebtResult?.contributionAmount) || 0));
            if (settlementContribution) {
                await updateTroyMemberRankSnapshot(memberRef, settlementContribution);
            }
        } catch (treasuryError) {
            const message = treasuryError?.errorMessage || treasuryError?.message || String(treasuryError);
            console.warn(`[${logPrefix}] Treasury failed:`, message);
            const error = new Error('FailedToUpdateTreasury');
            error.statusCode = 500;
            error.details = message;
            throw error;
        }

        let troyTodaySales = null;
        try {
            const settledAtMs = Date.now();
            troyTodaySales = await addTroyDailySales(context.nation, checkoutPayload.total, firestore, admin, {
                dayKey: normalizeTroyBusinessDayKey(context.roomData?.troyBusinessDayKey),
                items: checkoutPayload.items,
                settlementId: checkoutStableId,
                playFabId: receiverId,
                displayName: checkoutPayload.displayName,
                totalItems: checkoutPayload.totalItems,
                settledAtMs
            });
        } catch (salesError) {
            console.warn(`[${logPrefix}] Daily sales update failed:`, salesError?.message || salesError);
        }

        try {
            await recordTroyOrderHistory(context.roomRef, receiverId, checkoutPayload);
        } catch (historyError) {
            console.warn(`[${logPrefix}] Order history update failed:`, historyError?.message || historyError);
        }

        try {
            await checkoutRef.delete();
        } catch (deleteError) {
            const message = deleteError?.errorMessage || deleteError?.message || String(deleteError);
            console.warn(`[${logPrefix}] Checkout delete failed:`, message);
            const error = new Error('FailedToCloseCheckout');
            error.statusCode = 500;
            error.details = message;
            throw error;
        }

        try {
            await memberRef.delete();
        } catch (memberDeleteError) {
            console.warn(`[${logPrefix}] Member delete failed:`, memberDeleteError?.message || memberDeleteError);
        }

        pushDisplayEvent({
            type: 'flare',
            topic: 'troy-checkout',
            label: `会計済: ${checkoutPayload.displayName}${chipReturnAmount > 0 ? ` / チップ返却 ${chipReturnAmount}G` : ''}`
        });

        return {
            success: true,
            receivedAmount: checkoutPayload.total,
            totalItems: checkoutPayload.totalItems,
            grantAmount,
            cashbackRateBps,
            treasuryRank,
            treasuryUpdated: true,
            treasuryPs,
            settlementContributionAmount,
            settlementRawContributionAmount: checkoutPayload.total,
            settlementDebtBlockedAmount: Math.max(0, Math.floor(Number(settlementDebtResult?.debtBlockedAmount) || 0)),
            settlementDebtRemaining: Math.max(0, Math.floor(Number(settlementDebtResult?.debtRemaining) || 0)),
            settlementDebtMessage: settlementDebtResult?.debtMessage || '',
            settlementContribution,
            grantApplied,
            grantError,
            menuConsumableGrantApplied: !!menuConsumableGrant.applied,
            menuConsumableGrantTargetPlayFabId: menuConsumableGrant.targetPlayFabId || representativeId,
            menuConsumableGrantItems: menuConsumableGrant.items || [],
            menuConsumableGrantMissingItems: menuConsumableGrant.missingItems || [],
            menuConsumableGrantError,
            menuConsumableGrantFailureId,
            chipReturnAmount,
            chipReturnApplied,
            chipReturnError,
            chipReturnConversion,
            chipReturnContribution,
            chipReturnContributionAmount: Math.max(0, Math.floor(Number(chipReturnDebtResult?.contributionAmount) || 0)),
            chipReturnRawContributionAmount: Math.max(0, Math.floor(Number(chipReturnConversion?.contributionAmount) || 0)),
            chipReturnDebtBlockedAmount: Math.max(0, Math.floor(Number(chipReturnDebtResult?.debtBlockedAmount) || 0)),
            chipReturnDebtRemaining: Math.max(0, Math.floor(Number(chipReturnDebtResult?.debtRemaining) || 0)),
            chipReturnDebtMessage: chipReturnDebtResult?.debtMessage || '',
            coinDepositAmount: chipReturnAmount,
            coinDepositApplied: chipReturnApplied,
            coinDepositError: chipReturnError,
            settledStatus: checkoutPayload.status,
            troyTodaySales
        };
    }

    app.post('/api/troy-orders/list', async (req, res) => {
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) {
                return res.json({
                    troyOpen: false,
                    nation: null,
                    troyTodaySales: { total: 0, count: 0 },
                    troyPendingCheckouts: [],
                    troyMembers: [],
                    troyCustomerOrderRequests: [],
                    troyCoinConversionLogs: [],
                    menuCustomItems: []
                });
            }
            return res.json(await buildTroyOrdersPagePayload(context));
        } catch (error) {
            console.error('[troy-orders-list] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToLoadTroyOrders' });
        }
    });

    app.post('/api/troy-orders/item-status', async (req, res) => {
        if (!TROY_STAFF_CHECKOUT_ENABLED) return res.status(503).json({ error: 'TroyCheckoutDisabled' });
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });
            const receiverId = normalizePlayFabId(req.body?.receiverPlayFabId);
            const orderId = String(req.body?.orderId || '').trim();
            if (!receiverId || !orderId) {
                return res.status(400).json({ error: 'receiverPlayFabId and orderId are required' });
            }
            const served = req.body?.served === true;
            const checkoutRef = context.roomRef.collection('checkouts').doc(receiverId);
            const checkoutSnap = await checkoutRef.get();
            if (!checkoutSnap.exists) return res.status(404).json({ error: 'CheckoutNotFound' });
            const checkoutData = checkoutSnap.data() || {};
            const checkoutStatus = String(checkoutData.status || '').trim().toLowerCase();
            if (checkoutStatus && !['open', 'pending'].includes(checkoutStatus)) {
                return res.status(409).json({ error: 'CheckoutAlreadyClosed' });
            }
            const storedItems = Array.isArray(checkoutData.items) ? checkoutData.items : [];
            let matched = false;
            const servedAtMs = served ? Date.now() : 0;
            const nextItems = storedItems.map((item) => {
                if (String(item?.orderId || '').trim() !== orderId) return item;
                matched = true;
                const next = { ...(item || {}) };
                if (served) {
                    next.status = 'served';
                    next.servedAtMs = servedAtMs;
                } else {
                    delete next.status;
                    delete next.servedAtMs;
                }
                return next;
            });
            if (!matched) return res.status(404).json({ error: 'OrderItemNotFound' });
            await checkoutRef.set({
                items: nextItems,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return res.json({
                success: true,
                checkout: buildTroyCheckoutPayload({ ...checkoutData, items: nextItems })
            });
        } catch (error) {
            console.error('[troy-orders-item-status] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToUpdateOrderItemStatus' });
        }
    });

    app.post('/api/troy-orders/item-quantity', async (req, res) => {
        if (!TROY_STAFF_CHECKOUT_ENABLED) return res.status(503).json({ error: 'TroyCheckoutDisabled' });
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });
            const receiverId = normalizePlayFabId(req.body?.receiverPlayFabId);
            const orderId = String(req.body?.orderId || '').trim();
            const delta = Math.max(-99, Math.min(99, Math.floor(Number(req.body?.delta) || 0)));
            if (!receiverId || !orderId || !delta) {
                return res.status(400).json({ error: 'receiverPlayFabId, orderId and delta are required' });
            }
            if (orderId.startsWith('troy-entry:')) {
                return res.status(400).json({ error: 'EntryChargeQuantityLocked' });
            }
            const checkoutRef = context.roomRef.collection('checkouts').doc(receiverId);
            const nowMs = Date.now();
            const result = await firestore.runTransaction(async (tx) => {
                const checkoutSnap = await tx.get(checkoutRef);
                if (!checkoutSnap.exists) {
                    const error = new Error('CheckoutNotFound');
                    error.statusCode = 404;
                    throw error;
                }
                const checkoutData = checkoutSnap.data() || {};
                const checkoutStatus = String(checkoutData.status || '').trim().toLowerCase();
                if (checkoutStatus && !['open', 'pending'].includes(checkoutStatus)) {
                    const error = new Error('CheckoutAlreadyClosed');
                    error.statusCode = 409;
                    throw error;
                }
                const storedItems = Array.isArray(checkoutData.items) ? checkoutData.items : [];
                let matched = false;
                const nextItems = storedItems.map((item) => {
                    if (String(item?.orderId || '').trim() !== orderId) return item;
                    matched = true;
                    const next = { ...(item || {}) };
                    if (isTroyUndoProtectedItem(next)) {
                        const error = new Error('EntryChargeQuantityLocked');
                        error.statusCode = 400;
                        throw error;
                    }
                    const currentQuantity = Math.max(1, Math.floor(Number(next.quantity) || 1));
                    const nextQuantity = Math.max(1, Math.min(99, currentQuantity + delta));
                    next.quantity = nextQuantity;
                    if (delta > 0) {
                        delete next.status;
                        delete next.servedAtMs;
                    }
                    return next;
                });
                if (!matched) {
                    const error = new Error('OrderItemNotFound');
                    error.statusCode = 404;
                    throw error;
                }
                const normalized = normalizeTroyCheckoutItems(nextItems);
                const nextTotal = normalized.reduce((sum, item) => sum + item.lineTotal, 0);
                const nextTotalItems = normalized.reduce((sum, item) => sum + item.quantity, 0);
                const nextGrantTotal = normalized.reduce((sum, item) => sum + Math.max(0, Number(item.grantedPs) || 0), 0);
                tx.set(checkoutRef, {
                    items: nextItems,
                    total: nextTotal,
                    totalItems: nextTotalItems,
                    grantTotal: nextGrantTotal,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ...(delta > 0 ? { lastOrderedAt: admin.firestore.Timestamp.fromMillis(nowMs) } : {})
                }, { merge: true });
                return buildTroyCheckoutPayload({ ...checkoutData, items: nextItems, total: nextTotal, totalItems: nextTotalItems, grantTotal: nextGrantTotal, lastOrderedAt: nowMs });
            });
            return res.json({ success: true, checkout: result });
        } catch (error) {
            const status = Number(error?.statusCode) || 500;
            console.error('[troy-orders-item-quantity] Error:', error?.message || error);
            return res.status(status).json({ error: error?.message || 'FailedToUpdateOrderItemQuantity' });
        }
    });

    app.post('/api/troy-orders/remove-item', async (req, res) => {
        if (!TROY_STAFF_CHECKOUT_ENABLED) return res.status(503).json({ error: 'TroyCheckoutDisabled' });
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });
            const receiverId = normalizePlayFabId(req.body?.receiverPlayFabId);
            const orderId = String(req.body?.orderId || '').trim();
            if (!receiverId || !orderId) {
                return res.status(400).json({ error: 'receiverPlayFabId and orderId are required' });
            }
            const checkoutRef = context.roomRef.collection('checkouts').doc(receiverId);
            const result = await firestore.runTransaction(async (tx) => {
                const checkoutSnap = await tx.get(checkoutRef);
                if (!checkoutSnap.exists) {
                    const error = new Error('CheckoutNotFound');
                    error.statusCode = 404;
                    throw error;
                }
                const checkoutData = checkoutSnap.data() || {};
                const checkoutStatus = String(checkoutData.status || '').trim().toLowerCase();
                if (checkoutStatus && !['open', 'pending'].includes(checkoutStatus)) {
                    const error = new Error('CheckoutAlreadyClosed');
                    error.statusCode = 409;
                    throw error;
                }
                const storedItems = Array.isArray(checkoutData.items) ? checkoutData.items : [];
                let matched = false;
                const nextItems = storedItems.filter((item) => {
                    if (String(item?.orderId || '').trim() !== orderId) return true;
                    matched = true;
                    if (isTroyUndoProtectedItem(item)) {
                        const error = new Error('EntryChargeRemovalLocked');
                        error.statusCode = 400;
                        throw error;
                    }
                    return false;
                });
                if (!matched) {
                    const error = new Error('OrderItemNotFound');
                    error.statusCode = 404;
                    throw error;
                }
                const normalized = normalizeTroyCheckoutItems(nextItems);
                const nextTotal = normalized.reduce((sum, item) => sum + item.lineTotal, 0);
                const nextTotalItems = normalized.reduce((sum, item) => sum + item.quantity, 0);
                const nextGrantTotal = normalized.reduce((sum, item) => sum + Math.max(0, Number(item.grantedPs) || 0), 0);
                const nextLastOrderedAtMs = normalized.reduce((max, item) => Math.max(max, Math.floor(Number(item.orderedAtMs) || 0)), 0);
                tx.set(checkoutRef, {
                    items: nextItems,
                    total: nextTotal,
                    totalItems: nextTotalItems,
                    grantTotal: nextGrantTotal,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastOrderedAt: nextLastOrderedAtMs > 0
                        ? admin.firestore.Timestamp.fromMillis(nextLastOrderedAtMs)
                        : admin.firestore.FieldValue.delete()
                }, { merge: true });
                return buildTroyCheckoutPayload({
                    ...checkoutData,
                    items: nextItems,
                    total: nextTotal,
                    totalItems: nextTotalItems,
                    grantTotal: nextGrantTotal,
                    lastOrderedAt: nextLastOrderedAtMs
                });
            });
            return res.json({ success: true, checkout: result });
        } catch (error) {
            const status = Number(error?.statusCode) || 500;
            console.error('[troy-orders-remove-item] Error:', error?.message || error);
            return res.status(status).json({ error: error?.message || 'FailedToRemoveOrderItem' });
        }
    });

    app.post('/api/troy-orders/settle', async (req, res) => {
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });
            const result = await settleTroyCheckoutForRoom(context, req.body || {}, 'troy-orders-settle');
            return res.json(result);
        } catch (error) {
            const status = Number(error?.statusCode) || 500;
            const body = {
                error: error?.message || 'FailedToSettleTroyOrder'
            };
            if (error?.details) body.details = error.details;
            if (error?.currentTotal != null) body.currentTotal = error.currentTotal;
            console.error('[troy-orders-settle] Error:', error?.message || error);
            return res.status(status).json(body);
        }
    });

    app.post('/api/troy-orders/set-open', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nextOpen = !!req.body?.isOpen;
            const kingContext = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            let openedByLineUserId = '';
            if (nextOpen) {
                try {
                    openedByLineUserId = await getLineUserId(kingContext.kingId, nationDeps);
                } catch (lineError) {
                    console.warn('[troy-orders-set-open] Failed to resolve opener LINE ID:', lineError?.errorMessage || lineError?.message || lineError);
                }
            }
            const context = {
                nation: kingContext.nation,
                mapping: kingContext.mapping,
                kingId: kingContext.kingId,
                openedByLineUserId
            };
            const result = await setGlobalTroyOpenState(context, nextOpen);
            return res.json(result);
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
            console.error('[troy-orders-set-open] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToSetTroyOpen' });
        }
    });

    app.post('/api/troy-orders/customer-request', async (req, res) => {
        const playFabId = normalizePlayFabId(req.body?.playFabId);
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });
            const result = await createTroyCustomerOrderRequest(context, {
                ...(req.body || {}),
                playFabId: requesterPlayFabId
            });
            return res.json(result);
        } catch (error) {
            const status = Number(error?.statusCode) || 500;
            console.error('[troy-orders-customer-request] Error:', error?.message || error);
            return res.status(status).json({ error: error?.message || 'FailedToCreateCustomerOrderRequest' });
        }
    });

    app.post('/api/troy-orders/customer-request-review', async (req, res) => {
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });
            const result = await reviewTroyCustomerOrderRequest(context, req.body || {});
            return res.json(result);
        } catch (error) {
            const status = Number(error?.statusCode) || 500;
            console.error('[troy-orders-customer-request-review] Error:', error?.message || error);
            return res.status(status).json({ error: error?.message || 'FailedToReviewCustomerOrderRequest' });
        }
    });

    app.post('/api/troy-orders/add-item', async (req, res) => {
        try {
            const context = await resolveOpenTroyOrdersContext(req.body?.troyNation);
            if (!context) return res.status(403).json({ error: 'TroyClosed' });

            const receiverId = normalizePlayFabId(req.body?.receiverPlayFabId);
            const name = String(req.body?.name || '').trim().slice(0, 60);
            const price = Math.max(0, Math.floor(Number(req.body?.price) || 0));
            const quantity = Math.max(1, Math.min(99, Math.floor(Number(req.body?.quantity) || 1)));
            const menuImage = normalizeTroyMenuImagePath(req.body?.menuImage || req.body?.image || req.body?.iconImage);
            const menuCategory = normalizeTroySalesCategoryId(req.body?.menuCategory || req.body?.categoryId || req.body?.category);
            const menuCategoryLabel = normalizeTroySalesCategoryLabel(req.body?.menuCategoryLabel || req.body?.categoryLabel, {
                ...req.body,
                menuCategory,
                name
            });
            if (!receiverId || !name) return res.status(400).json({ error: 'receiverPlayFabId and name are required' });

            const memberRef = context.roomRef.collection('members').doc(receiverId);
            const memberSnap = await memberRef.get();
            if (!memberSnap.exists) return res.status(403).json({ error: 'NotInTroy' });
            const memberData = memberSnap.data() || {};
            const displayName = String(memberData.displayName || receiverId).trim();
            const orderedAtMs = Date.now();
            await appendTroyCheckoutItem(context, {
                receiverPlayFabId: receiverId,
                displayName,
                name,
                price,
                quantity,
                menuImage,
                menuCategory,
                menuCategoryLabel,
                orderId: `staff:${receiverId}:${orderedAtMs}`,
                orderedAtMs,
                undoUntilMs: orderedAtMs + 60000
            });
            return res.json({ success: true });
        } catch (error) {
            console.error('[troy-orders-add-item] Error:', error?.message || error);
            const status = Number(error?.statusCode) || 500;
            return res.status(status).json({ error: error?.message || 'FailedToAddItem' });
        }
    });

    app.get('/api/troy-orders/stream', async (req, res) => {
        const requestedNation = String(req.query.troyNation || req.query.nation || '').trim().toLowerCase();

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        let closed = false;
        let unsubCheckouts = null;
        let unsubRequests = null;
        let unsubRoom = null;
        let keepAliveTimer = null;
        let lastPayload = null;

        function send(payload) {
            if (closed || res.writableEnded) return;
            if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'troyOpen')) {
                lastPayload = payload;
            }
            try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (_) {}
        }

        function cleanup() {
            if (closed) return;
            closed = true;
            if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
            if (unsubCheckouts) { try { unsubCheckouts(); } catch (_) {} unsubCheckouts = null; }
            if (unsubRequests) { try { unsubRequests(); } catch (_) {} unsubRequests = null; }
            if (unsubRoom) { try { unsubRoom(); } catch (_) {} unsubRoom = null; }
            if (!res.writableEnded) try { res.end(); } catch (_) {}
        }

        req.on('close', cleanup);

        keepAliveTimer = setInterval(() => {
            if (closed || res.writableEnded) { cleanup(); return; }
            try { res.write(': keepalive\n\n'); } catch (_) { cleanup(); }
        }, 25000);

        try {
            const context = await resolveOpenTroyOrdersContext(requestedNation);
            if (!context) {
                send({ troyOpen: false, nation: null, troyTodaySales: { total: 0, count: 0 }, troyPendingCheckouts: [], troyMembers: [], troyCustomerOrderRequests: [], troyCoinConversionLogs: [], menuCustomItems: [] });
                if (!res.writableEnded) res.write('retry: 15000\n\n');
                cleanup();
                return;
            }

            send(await buildTroyOrdersPagePayload(context));

            if (!TROY_STAFF_CHECKOUT_ENABLED) {
                if (!res.writableEnded) res.write('retry: 15000\n\n');
                cleanup();
                return;
            }

            unsubCheckouts = context.roomRef.collection('checkouts').onSnapshot(async (snap) => {
                if (closed) return;
                try {
                    const [groupSnap, roomSnap, membersSnap, requestSnap] = await Promise.all([
                        getNationGroupDoc(firestore, context.mapping.groupName).get(),
                        context.roomRef.get(),
                        context.roomRef.collection('members').orderBy('joinedAt', 'asc').limit(50).get(),
                        context.roomRef.collection('customerOrderRequests').orderBy('createdAtMs', 'desc').limit(TROY_CUSTOMER_ORDER_REQUEST_LIMIT).get()
                    ]);
                    const roomData = roomSnap.data() || {};
                    send({
                        troyOpen: true,
                        nation: context.nation,
                        troyTodaySales: buildTroyTodaySalesSnapshot(groupSnap.data() || {}, {
                            dayKey: normalizeTroyBusinessDayKey(roomData.troyBusinessDayKey)
                        }),
                        troyPendingCheckouts: buildTroyPendingCheckoutPayload(snap.docs),
                        troyMembers: buildTroyMemberPayload(membersSnap.docs),
                        troyCustomerOrderRequests: buildTroyCustomerOrderRequestPayload(requestSnap.docs),
                        troyCoinConversionLogs: buildTroyCoinConversionLogsPayload(roomData),
                        menuCustomItems: Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : []
                    });
                } catch (e) {
                    console.warn('[troy-orders-stream] checkout snapshot error:', e?.message || e);
                }
            }, (err) => {
                console.warn('[troy-orders-stream] checkout listener error:', err?.message || err);
            });

            unsubRequests = context.roomRef.collection('customerOrderRequests').orderBy('createdAtMs', 'desc').limit(TROY_CUSTOMER_ORDER_REQUEST_LIMIT).onSnapshot(async (snap) => {
                if (closed) return;
                try {
                    const [groupSnap, roomSnap, membersSnap, checkoutSnap] = await Promise.all([
                        getNationGroupDoc(firestore, context.mapping.groupName).get(),
                        context.roomRef.get(),
                        context.roomRef.collection('members').orderBy('joinedAt', 'asc').limit(50).get(),
                        context.roomRef.collection('checkouts').limit(50).get()
                    ]);
                    const roomData = roomSnap.data() || {};
                    send({
                        troyOpen: true,
                        nation: context.nation,
                        troyTodaySales: buildTroyTodaySalesSnapshot(groupSnap.data() || {}, {
                            dayKey: normalizeTroyBusinessDayKey(roomData.troyBusinessDayKey)
                        }),
                        troyPendingCheckouts: buildTroyPendingCheckoutPayload(checkoutSnap.docs),
                        troyMembers: buildTroyMemberPayload(membersSnap.docs),
                        troyCustomerOrderRequests: buildTroyCustomerOrderRequestPayload(snap.docs),
                        troyCoinConversionLogs: buildTroyCoinConversionLogsPayload(roomData),
                        menuCustomItems: Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : []
                    });
                } catch (e) {
                    console.warn('[troy-orders-stream] customer request snapshot error:', e?.message || e);
                }
            }, (err) => {
                console.warn('[troy-orders-stream] customer request listener error:', err?.message || err);
            });

            unsubRoom = context.roomRef.onSnapshot((roomSnap) => {
                if (closed) return;
                const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
                if (!roomData.isOpen) {
                    send({ troyOpen: false, nation: context.nation, troyTodaySales: { total: 0, count: 0 }, troyPendingCheckouts: [], troyMembers: [], troyCustomerOrderRequests: [], troyCoinConversionLogs: [], menuCustomItems: [] });
                    if (!res.writableEnded) try { res.write('retry: 15000\n\n'); } catch (_) {}
                    cleanup();
                } else {
                    send({
                        troyOpen: true,
                        nation: context.nation,
                        troyTodaySales: lastPayload?.troyTodaySales || { total: 0, count: 0 },
                        troyPendingCheckouts: lastPayload?.troyPendingCheckouts || [],
                        troyMembers: lastPayload?.troyMembers || [],
                        troyCustomerOrderRequests: lastPayload?.troyCustomerOrderRequests || [],
                        troyCoinConversionLogs: buildTroyCoinConversionLogsPayload(roomData),
                        menuCustomItems: Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : []
                    });
                }
            }, (err) => {
                console.warn('[troy-orders-stream] room listener error:', err?.message || err);
            });

        } catch (e) {
            console.error('[troy-orders-stream] error:', e?.message || e);
            try { res.write(`event: error\ndata: ${JSON.stringify({ error: 'StreamError' })}\n\n`); } catch (_) {}
            cleanup();
        }
    });


    app.post('/api/king-exile', async (req, res) => {
        const { playFabId, targetPlayFabId } = req.body || {};
        if (!playFabId || !targetPlayFabId) {
            return res.status(400).json({ error: 'playFabId and targetPlayFabId are required' });
        }
        if (playFabId === targetPlayFabId) {
            return res.status(400).json({ error: 'Cannot exile self' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const kingCheck = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: requesterPlayFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });
            if (kingCheck && kingCheck.Error) {
                const msg = kingCheck.Error.Message || kingCheck.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing') || String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'Only the king can exile players' });
                }
                return res.status(500).json({ error: 'Failed to validate king', details: msg });
            }

            const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: requesterPlayFabId,
                Keys: ['Nation', 'Race']
            });
            const kingNation = String(kingRo?.Data?.Nation?.Value || '').toLowerCase();
            if (!kingNation) return res.status(400).json({ error: 'King nation not set' });
            const nationMapping = getNationMappingByNation(kingNation);
            if (!nationMapping) return res.status(400).json({ error: 'Invalid king nation' });
            const groupInfo = await ensureNationGroupExists(firestore, nationMapping, nationDeps);
            const kingNationGroupId = groupInfo.groupId;
            const targetNationIsland = nationMapping.island;

            const targetRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: targetPlayFabId,
                Keys: ['Race', 'Nation']
            });
            const targetRace = targetRo?.Data?.Race?.Value || null;
            const targetPrevNation = String(targetRo?.Data?.Nation?.Value || '').toLowerCase();

            const playerEntity = await getPlayerEntity(targetPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!playerEntity) return res.status(400).json({ error: 'Failed to resolve target entity' });

            if (targetPrevNation && targetPrevNation !== kingNation) {
                const prevMapping = getNationMappingByNation(targetPrevNation);
                if (prevMapping) {
                    try {
                        const prevGroup = await ensureNationGroupExists(firestore, prevMapping, nationDeps);
                        await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.RemoveMembers, {
                            Group: { Id: prevGroup.groupId, Type: 'group' },
                            Members: [playerEntity]
                        });
                    } catch (e) {
                        console.warn('[king-exile] RemoveMembers failed:', e?.errorMessage || e?.message || e);
                    }
                }
            }

            try {
                await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.AddMembers, {
                    Group: { Id: kingNationGroupId, Type: 'group' },
                    Members: [playerEntity]
                });
            } catch (e) {
                const msg = e?.errorMessage || e?.message || String(e);
                if (!String(msg).includes('EntityIsAlreadyMember')) throw e;
            }

            const avatarColor = getAvatarColorForNation(targetNationIsland || kingNation);
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: targetPlayFabId,
                Data: {
                    Nation: targetNationIsland || kingNation || null,
                    AvatarColor: avatarColor || 'brown',
                    NationChangedAt: String(Date.now())
                }
            });
            await ensureNationDisplayName(targetPlayFabId, targetNationIsland || kingNation || null, {
                promisifyPlayFab,
                PlayFabServer,
                PlayFabAdmin
            });

            const transferResult = await transferOwnedIslands(firestore, targetPlayFabId, requesterPlayFabId, targetNationIsland || kingNation || null);
            let starterIsland = null;
            try {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: targetPlayFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                const displayName = profile?.PlayerProfile?.DisplayName || null;
                starterIsland = await createStarterIsland({
                    playFabId: targetPlayFabId,
                    raceName: targetRace || 'Human',
                    nationIsland: targetNationIsland || kingNation || null,
                    displayName
                });
            } catch (e) {
                console.warn('[king-exile] Failed to create starter island:', e?.errorMessage || e?.message || e);
            }

            if (starterIsland?.respawnPosition) {
                await relocateActiveShip(firestore, targetPlayFabId, starterIsland.respawnPosition);
            }

            return res.json({
                success: true,
                nationIsland: targetNationIsland || kingNation || null,
                transferredIslands: transferResult.transferred,
                starterIsland
            });
        } catch (error) {
            console.error('[king-exile] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'Failed to exile player', details: error?.errorMessage || error?.message || error });
        }
    });

    // 国家通貨寄付
    app.post('/api/donate-nation-currency', async (req, res) => {
        const { playFabId, currency, amount } = req.body || {};
        if (!playFabId || !currency) {
            return res.status(400).json({ error: 'playFabId and currency are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) {
                return res.status(400).json({ error: 'Nation not set' });
            }
            const mapping = getNationMappingByNation(nation);
            if (!mapping) {
                return res.status(400).json({ error: 'Invalid nation' });
            }

            await subtractEconomyItem(requesterPlayFabId, String(currency).toUpperCase(), value);

            const normalizedCurrency = String(currency).toUpperCase();
            const groupEntity = await getNationGroupEntityKey(nation, firestore, nationDeps);
            if (!groupEntity) {
                return res.status(500).json({ error: 'Nation group not found' });
            }
            await addEconomyItem(groupEntity.Id, normalizedCurrency, value, groupEntity);
            const contribution = await addPlayerNationContribution(requesterPlayFabId, value, nationDeps);
            try {
                await appendNationTreasuryRecentEntry(nation, firestore, admin, {
                    amount: value,
                    currency: normalizedCurrency,
                    source: 'nation_donation',
                    label: '国庫寄付',
                    actorId: requesterPlayFabId
                });
            } catch (ledgerError) {
                console.warn('[donate-nation-currency] Failed to append treasury entry:', ledgerError?.message || ledgerError);
            }

            res.json({
                success: true,
                contribution: contribution?.contributionTotal ?? value,
                level: contribution?.level ?? 1
            });
        } catch (error) {
            console.error('[donate-nation-currency] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'Failed to donate currency' });
        }
    });

    // マップ占領状態取得
    app.post('/api/get-map-occupation', async (req, res) => {
        const { mapId } = req.body || {};
        if (!mapId) return res.status(400).json({ error: 'mapId is required' });
        try {
            const nation = await getMapOccupationNation(mapId, { promisifyPlayFab, PlayFabAdmin });
            res.json({ mapId, nation: nation || null });
        } catch (error) {
            console.error('[GetMapOccupation] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get map occupation' });
        }
    });

    // マップ占領状態一括取得
    app.post('/api/get-map-occupation-map', async (req, res) => {
        const { mapIds } = req.body || {};
        try {
            const map = await getMapOccupationMap({ promisifyPlayFab, PlayFabAdmin });
            if (Array.isArray(mapIds) && mapIds.length) {
                const filtered = {};
                mapIds.forEach((id) => {
                    const key = String(id || '').trim();
                    if (!key) return;
                    if (map[key]) filtered[key] = map[key];
                });
                return res.json({ map: filtered });
            }
            res.json({ map });
        } catch (error) {
            console.error('[GetMapOccupationMap] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get map occupation map' });
        }
    });

    app.post('/api/get-world-map-layout', async (_req, res) => {
        try {
            const layout = await getWorldMapLayout({ promisifyPlayFab, PlayFabAdmin });
            const placementOpen = await getWorldMapPlacementOpen({ promisifyPlayFab, PlayFabAdmin });
            res.json({ layout, placementOpen });
        } catch (error) {
            console.error('[get-world-map-layout] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get world map layout' });
        }
    });

    app.post('/api/swap-world-map-cells', async (req, res) => {
        const { playFabId, fromMapId, toMapId, fromIndex, toIndex } = req.body || {};
        if (!playFabId || !fromMapId || !toMapId) {
            return res.status(400).json({ error: 'playFabId/fromMapId/toMapId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const kingContext = await requireKingContext(requesterPlayFabId, firestore, { promisifyPlayFab, PlayFabServer });
            const placementOpen = await getWorldMapPlacementOpen({ promisifyPlayFab, PlayFabAdmin });
            if (!placementOpen) {
                return res.status(403).json({ error: 'PlacementClosed' });
            }
            const kingNation = String(kingContext.nation || '').toLowerCase();
            const fixedIds = new Set(['wands', 'swords', 'cups', 'pentacles']);
            const layout = await getWorldMapLayout({ promisifyPlayFab, PlayFabAdmin });
            const fromIdx = Number.isInteger(fromIndex) ? fromIndex : layout.indexOf(fromMapId);
            const toIdx = Number.isInteger(toIndex) ? toIndex : layout.indexOf(toMapId);
            if (fromIdx < 0 || toIdx < 0 || fromIdx >= layout.length || toIdx >= layout.length) {
                return res.status(400).json({ error: 'InvalidSwapIndex' });
            }
            const fromValue = layout[fromIdx];
            const toValue = layout[toIdx];
            if (!fromValue || !toValue) {
                return res.status(400).json({ error: 'MapNotInLayout' });
            }
            if (fixedIds.has(fromValue) || fixedIds.has(toValue)) {
                return res.status(400).json({ error: 'FixedMapCannotSwap' });
            }
            const isEmpty = (value) => String(value || '').trim() === EMPTY_MAP_ID;
            const fromEmpty = isEmpty(fromValue);
            const toEmpty = isEmpty(toValue);
            if (fromEmpty && toEmpty) {
                return res.status(400).json({ error: 'EmptySwapNotAllowed' });
            }
            const [fromNation, toNation] = await Promise.all([
                fromEmpty ? Promise.resolve(null) : getMapOccupationNation(fromValue, { promisifyPlayFab, PlayFabAdmin }),
                toEmpty ? Promise.resolve(null) : getMapOccupationNation(toValue, { promisifyPlayFab, PlayFabAdmin })
            ]);
            if (!fromEmpty && !toEmpty) {
                if (!fromNation || !toNation || fromNation !== toNation || fromNation !== kingNation) {
                    return res.status(403).json({ error: 'NotOwnedByNation' });
                }
            } else {
                const occupied = fromEmpty ? toNation : fromNation;
                if (!occupied || occupied !== kingNation) {
                    return res.status(403).json({ error: 'NotOwnedByNation' });
                }
            }
            const nextLayout = layout.slice();
            nextLayout[fromIdx] = toValue;
            nextLayout[toIdx] = fromValue;
            await setWorldMapLayout(nextLayout, { promisifyPlayFab, PlayFabAdmin });
            res.json({ layout: nextLayout });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'NotKing') return res.status(403).json({ error: 'NotKing' });
            console.error('[swap-world-map-cells] Error:', msg);
            res.status(500).json({ error: 'Failed to swap world map cells', details: msg });
        }
    });

    app.post('/api/get-nation-treasury-ranking', async (_req, res) => {
        try {
            const ranking = await getNationTreasuryRanking(firestore, nationDeps);
            res.json({ ranking });
        } catch (error) {
            console.error('[get-nation-treasury-ranking] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get nation treasury ranking' });
        }
    });

    app.post('/api/get-nation-levels', async (_req, res) => {
        try {
            const levels = {};
            for (const [nation, mapping] of Object.entries(NATION_GROUP_BY_NATION)) {
                const docRef = getNationGroupDoc(firestore, mapping.groupName);
                const snap = await docRef.get();
                const points = Math.max(0, Math.floor(Number(snap.data()?.arcanaPoints || 0)));
                levels[nation] = {
                    arcanaPoints: points,
                    nationLevel: calcNationLevel(points)
                };
            }
            res.json({ levels });
        } catch (error) {
            console.error('[get-nation-levels] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get nation levels' });
        }
    });
}

module.exports = {
    NATION_GROUP_BY_RACE,
    NATION_GROUP_BY_NATION,
    AVATAR_COLOR_BY_NATION,
    getAvatarColorForNation,
    getNationMappingByNation,
    getNationForPlayer,
    getNationGroupDoc,
    ensureNationGroupExists,
    getNationGroupIdByNation,
    getNationTaxRateBps,
    addNationTreasury,
    getNationTreasuryRanking,
    getMapOccupationNation,
    setMapOccupationNation,
    getPlayerEntity,
    normalizeLineUserIdList,
    getConfiguredTroyCloseSummaryLineUserIds,
    getTroyBusinessDayKey,
    buildTroyTodaySalesSnapshot,
    buildTroySalesBreakdownsFromItems,
    buildTroySalesPayouts,
    buildTroyUsualItemsPayload,
    mergeTroyOrderHistoryItems,
    buildTroyBountyRankingRow,
    formatTroyCloseSummaryMessage,
    initializeNationRoutes
};

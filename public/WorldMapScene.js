import * as Phaser from 'phaser';
import { RACE_COLORS } from 'config';
import { getFirestore, collection, getDocs, doc, updateDoc, addDoc, onSnapshot, query, where, orderBy, limit, setDoc, serverTimestamp } from 'firebase/firestore';
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import * as Ship from './js/ship.js?v=20260824-judgment-five-card-v1';
import * as Player from './js/player.js';
import { bindModalClose } from './js/modalClose.js';
import {
    getShipResourceStorage as fetchShipResourceStorage,
    consumeVoyageMp as requestConsumeVoyageMp,
    getCapitalWarState as requestCapitalWarState,
    performCapitalWarAction as requestCapitalWarAction,
    getShipSkillStatus as fetchShipSkillStatus,
    useShipSkill as requestUseShipSkill,
    triggerShipSkill as requestTriggerShipSkill
} from './js/playfabClient.js';
import {
    getCachedSkillData,
    setCachedSkillData,
    setSkillCooldown,
    isSkillReady,
    getSkillRemainingSec,
    mergeWithLocalCt,
    isSelfOnlySkill
} from './js/shipSkillClient.js';

// ========================================
// 定数定義
// ========================================

const RIDE_SYSTEM_ENABLED = false;
const LEGACY_BOARDING_BATTLE_ENABLED = false;

const GAME_CONFIG = {
    GRID_SIZE: 32,
    MAP_TILE_SIZE: 100,
    METERS_PER_TILE: 100,

    SHIP_VISION_RANGE: 300,
    SHIP_SPEED: 100,
    SHIP_MOVE_COOLDOWN: 500,
    SHIP_ACTION_COOLDOWN_MS: 5 * 60 * 1000,
    SHIP_ACTION_DURATION_MS: 3000,

    // UI設定
    MESSAGE_DISPLAY_DURATION: 2000,
    MINIMAP_SIZE: 100,
    MINIMAP_PADDING: 0,

    // Firestore更新設定
    SHIP_QUERY_UPDATE_INTERVAL: 4000,
    SHIP_QUERY_REFRESH_THRESHOLD: 0.75,

    CONSTRUCTION_BOUNCE_DURATION: 1000,
    CONSTRUCTION_CRANE_ROTATION: 2000,
    PARTICLE_LIFESPAN: 1000,
    PARTICLE_FREQUENCY: 500,

    FOG_ALPHA: 0.8,
    FOG_STEPS: 50,

    DEPTH: {
        SEA: 0,
        ISLAND: 1,
        SHIP: 2,
        BUILDING: 3,
        CONSTRUCTION: 4,
        NAME_TEXT: 10,
        INTERACTIVE_ZONE: 100,
        FOG: 999,
        MESSAGE: 1000,
        MINIMAP_BG: 1001,
        MINIMAP_TEXTURE: 1002,
        MINIMAP_MARKER: 1003
    }
};

const ISLAND_LAYOUTS = {
    small: { // 3x3
        tiles: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
        width: 3, height: 3,
        slots: { width: 1, height: 1, offsetX: 1, offsetY: 1 }
    },
    medium: { // 3x4
        tiles: [[1, 2, 2, 3], [4, 5, 5, 6], [7, 8, 8, 9]],
        width: 4, height: 3,
        slots: { width: 2, height: 1, offsetX: 1, offsetY: 1 }
    },
    large: { // 4x4
        tiles: [[1, 2, 2, 3], [4, 5, 5, 6], [4, 5, 5, 6], [7, 8, 8, 9]],
        width: 4, height: 4,
        slots: { width: 2, height: 2, offsetX: 1, offsetY: 1 }
    },
    giant: { // 5x5
        tiles: [[1, 2, 2, 2, 3], [4, 5, 5, 5, 6], [4, 5, 5, 5, 6], [4, 5, 5, 5, 6], [7, 8, 8, 8,  9]],
        width: 5, height: 5,
        slots: { width: 3, height: 3, offsetX: 1, offsetY: 1 }
    }
};

const BUILDING_META_DEFAULT = { nationTileOffset: false, clearGroundTiles: false };
const AREA_GRID_SIZE = 5;
const OUTSIDE_VISION_MULTIPLIER = 0.25;
const EMPTY_MAP_ID = 'empty';
const WORLD_MAP_FALLBACK_LAYOUT = [
    'pentacles', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'swords',
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, 'major_00', EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    'cups', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'wands'
];
const WORLD_MAP_ID_ALIAS = {
    fire: 'wands',
    water: 'cups',
    wind: 'swords',
    earth: 'pentacles'
};
const WORLD_MAP_LABEL_BY_ID = {
    wands: '火の国',
    cups: '水の国',
    swords: '風の国',
    pentacles: '地の国'
};

const NATION_BOUNDS = {
    earth: { minX: 0, maxX: 99, minY: 0, maxY: 99 },
    wind: { minX: 0, maxX: 99, minY: 0, maxY: 99 },
    fire: { minX: 0, maxX: 99, minY: 0, maxY: 99 },
    water: { minX: 0, maxX: 99, minY: 0, maxY: 99 },
    neutral: { minX: 0, maxX: 99, minY: 0, maxY: 99 }
};

const NATION_COLORS = {
    fire: 0xff4d4d,
    earth: 0x4caf50,
    wind: 0xffd34d,
    water: 0x4aa3ff
};

const BIOME_FRAME_BY_ID = {
    volcanic: 32,
    rocky: 33,
    mushroom: 34,
    lake: 35,
    forest: 36,
    sacred: 37
};

const BIOME_ID_BY_JP = {
    '火山': 'volcanic',
    '岩場': 'rocky',
    'キノコ': 'mushroom',
    '湖': 'lake',
    '森林': 'forest',
    '聖地': 'sacred'
};

const SHIP_ACTIONS = {
    ship_human_fighter: { type: 'fighter', label: '火炎噴射', description: '前方広角に炎を噴射し、範囲内の敵船に継続的な圧力をかける。', emoji: ['🔥', '🌪️'], rangeTiles: 6, angle: 75, damage: 340, effect: 'flame_cone', cooldownMs: 48_000 },
    ship_elf_fighter: { type: 'fighter', label: '毒ガス空爆', description: '中範囲の敵プレイヤーに毒ガスでHPダメージ。対人制圧向け。', emoji: ['🧪', '☠️'], radiusTiles: 6, damage: 180, effect: 'poison_gas', cooldownMs: 68_000 },
    ship_goblin_fighter: { type: 'fighter', label: 'ドリル突撃', description: '短距離突撃で前方の敵船に高ダメージを与える近接特化。', emoji: ['⚙️', '✨'], rangeTiles: 3, angle: 45, damage: 460, effect: 'drill_burst', cooldownMs: 52_000 },
    ship_orc_fighter: { type: 'fighter', label: '直撃砲', description: '細い射角で遠距離に高威力砲撃。命中時の破壊力が高い。', emoji: ['💣', '💥'], rangeTiles: 7, angle: 26, damage: 560, effect: 'cannon_shot', cooldownMs: 82_000 },

    ship_human_defender: { type: 'defender_shield', label: '艦隊防壁', description: '味方船を包む防壁を展開。一定時間、被ダメージを軽減する。', emoji: ['🛡️', '✨'], radiusTiles: 6, shieldRadiusTiles: 6, shieldDurationMs: 7000, shieldFactor: 0.65, effect: 'shield', cooldownMs: 58_000 },
    ship_elf_defender: { type: 'defender_gust', label: '疾風の渦', description: '広範囲の敵船の進路を乱す。編隊を崩して足並みを止める。', emoji: ['🌪️', '💨'], radiusTiles: 7, gustDistanceTiles: 4, effect: 'gust', cooldownMs: 62_000 },
    ship_goblin_defender: { type: 'defender_jamstorm', label: '砂嵐ノイズ', description: '範囲内の敵船アクションを封印し、ミニマップを攪乱する。', emoji: ['📡', '⚡'], radiusTiles: 6, jamDurationMs: 6000, stormDurationMs: 6500, effect: 'jamstorm', cooldownMs: 66_000 },
    ship_orc_defender: { type: 'defender_snare', label: '水中捕捉', description: '最寄りの敵船を長めに拘束して確実に足止めする。', emoji: ['🧊', '⚓'], rangeTiles: 6, snareDurationMs: 4200, effect: 'snare', cooldownMs: 72_000 },

    ship_human_merchant: { type: 'merchant', label: '水上滑走', description: '一定時間、島衝突を無効化して航路を短縮できる。', emoji: ['🚤', '💨'], durationMs: 7000, effect: 'island_pass', cooldownMs: 78_000 },
    ship_elf_merchant: { type: 'merchant', label: '視界縮小', description: '中範囲の敵視界を縮小し、索敵能力を落とす。', emoji: ['🌫️', '👁️'], durationMs: 6500, radiusTiles: 6, visionMultiplier: 0.55, effect: 'vision_shrink', cooldownMs: 74_000 },
    ship_goblin_merchant: { type: 'merchant', label: '水爆設置', description: '持続時間の長い水爆地雷を設置し、航路を制限する。', emoji: ['💧', '💣'], mineDurationMs: 15000, mineRadiusTiles: 2, mineDamage: 260, effect: 'minefield', cooldownMs: 79_000 },
    ship_orc_merchant: { type: 'merchant', label: '装甲展開', description: '短時間、船アクションと体当たりダメージを完全無効化。', emoji: ['🛡️', '🧱'], durationMs: 4500, effect: 'damage_immune', cooldownMs: 86_000 },

    ship_human_explorer: { type: 'explorer', label: '追い風加速', description: '短CTで速度と小回りを大きく上げる機動戦向け。', emoji: ['⛵', '💨'], durationMs: 5200, speedMultiplier: 1.6, agilityMultiplier: 0.55, cooldownMs: 46_000 },
    ship_elf_explorer: { type: 'explorer', label: '高度視認', description: '視界拡大とミニマップ強化で索敵を有利にする。', emoji: ['🌟', '👁️'], durationMs: 6200, visionMultiplier: 1.65, minimapBoostMs: 6200, cooldownMs: 52_000 },
    ship_goblin_explorer: { type: 'explorer', label: '泥沼散布', description: '範囲内の敵船を鈍足化し、追撃と離脱を補助する。', emoji: ['🟤', '🌫️'], radiusTiles: 5, slowMultiplier: 0.55, durationMs: 6200, effect: 'mud_slow', cooldownMs: 58_000 },
    ship_orc_explorer: { type: 'explorer', label: '岩皮突進', description: '突進中は船衝突を無視し、接触敵を大きくノックバック。', emoji: ['🪨', '💨'], durationMs: 5000, speedMultiplier: 1.45, ignoreShipCollision: true, radiusTiles: 3, knockbackDistanceTiles: 3, effect: 'knockback', cooldownMs: 63_000 }
};

if (typeof window !== 'undefined') {
    window.SHIP_ACTIONS = SHIP_ACTIONS;
}

const ISLAND_AUTO_ATTACK_CONFIG = {
    coastal_battery: { label: '沿岸砲台', emojis: ['💣'], hitChance: 0.5, mode: 'single', radiusTiles: 3, damage: 50, cooldownMs: 6000 },
    dragon_gate: { label: '竜撃砲門', emojis: ['💥'], hitChance: 0.5, mode: 'single', radiusTiles: 4, damage: 70, cooldownMs: 8000 },
    arcana_tower_judgement: { label: '裁きの塔', emojis: ['⚡'], hitChance: 0.3, mode: 'area', radiusTiles: 5, damage: 90, cooldownMs: 12000 }
};
const ISLAND_ATTACK_PREP_DURATION_MS = 4000;

function normalizeBiomeId(raw) {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    return BIOME_ID_BY_JP[trimmed] || trimmed.toLowerCase();
}

const NATION_TILE_INDEX = {
    fire: 0,
    earth: 1,
    wind: 2,
    water: 3
};

function getNationCenterTile(bounds) {
    if (!bounds) return { x: 0, y: 0 };
    const centerX = Math.floor((bounds.minX + bounds.maxX + 1) / 2);
    const centerY = Math.floor((bounds.minY + bounds.maxY + 1) / 2);
    return { x: centerX, y: centerY };
}

function getNationTileOffset(nation, visualWidth) {
    const key = String(nation || '').toLowerCase();
    const index = (key in NATION_TILE_INDEX) ? NATION_TILE_INDEX[key] : 0;
    const width = Math.max(1, Number(visualWidth) || 1);
    return width * index;
}

function getBuildingMeta(buildingId) {
    if (typeof window === 'undefined') return BUILDING_META_DEFAULT;
    const meta = window.buildingMetaById?.[buildingId];
    return meta || BUILDING_META_DEFAULT;
}

export default class WorldMapScene extends Phaser.Scene {
    constructor() {
        super('WorldMapScene');

        this.gridSize = GAME_CONFIG.GRID_SIZE;
        this.TILE_SIZE = GAME_CONFIG.GRID_SIZE;
        this.mapTileSize = GAME_CONFIG.MAP_TILE_SIZE;
        this.mapPixelSize = this.mapTileSize * this.gridSize;
        this.metersPerTile = GAME_CONFIG.METERS_PER_TILE;
        this.islandObjects = new Map();

        this.shipTween = null;

        this.playerInfo = { playFabId: null, race: null };
        this.mapId = null;
        this.mapLabel = null;
        this.mapTransitionCooldownUntil = 0;
        this.mapTransitionPromptOpen = false;
        this.mapTransitionRequireLeave = false;

        this.shipVisionRange = GAME_CONFIG.SHIP_VISION_RANGE;
        this.baseShipVisionRange = GAME_CONFIG.SHIP_VISION_RANGE;
        this.currentVisionRange = GAME_CONFIG.SHIP_VISION_RANGE;
        this.shipSpeed = GAME_CONFIG.SHIP_SPEED;
        this.shipBaseSpeed = GAME_CONFIG.SHIP_SPEED;

        this.playerShipItemId = null;
        this.playerShipClass = null;
        this.playerShipAssetData = null;
        this.shipActionCooldownUntil = 0;
        this.shipActionSpeedBoostUntil = 0;
        this.shipActionSpeedBoostMultiplier = 1;
        this.shipActionInvisibleUntil = 0;
        this.shipActionJammedUntil = 0;
        this.shipActionIslandPassUntil = 0;
        this.shipActionImmuneUntil = 0;
        this.shipActionMoveLockUntil = 0;
        this.shipRepairUntil = 0;
        this.shipActionSpeedDebuffUntil = 0;
        this.shipActionSpeedDebuffMultiplier = 1;
        this.shipActionVisionDebuffUntil = 0;
        this.shipActionVisionDebuffMultiplier = 1;
        this.shipActionVisionBoostUntil = 0;
        this.shipActionVisionBoostMultiplier = 1;
        this.shipActionAgilityUntil = 0;
        this.shipActionAgilityMultiplier = 1;
        this.shipActionIgnoreShipCollisionUntil = 0;
        this.shipActionMinimapBoostUntil = 0;
        this.shipActionUiLastUpdate = 0;
        this.shipActionActive = false;
        this.shipActionButton = null;
        this.shipActionStatus = null;
        this.shipCombatResourceStatus = null;
        this.shipSideCannonPanel = null;
        this.shipSideCannonButton = null;
        this.shipSideCannonStatus = null;
        this.shipSideCannonCooldownUntil = 0;
        this.shipSideCannonChargeUntil = 0;
        this.shipSideCannonUiLastUpdate = 0;
        this.shipSideCannonChargeTimer = null;
        this.shipNormalAttackPanel = null;
        this.shipNormalAttackButton = null;
        this.shipNormalAttackStatus = null;
        this.shipNormalAttackLockUntil = 0;
        this.shipNormalAttackUiLastUpdate = 0;
        // 船スキル
        this.shipSkillPanelOpen = false;
        this.shipSkillData = [];
        this.shipSkillCooldowns = {};
        this.shipSkillCtInterval = null;
        this.shipCombatResourceStorage = {
            activeShipId: null,
            cargoResources: {},
            cargoCapacity: 0,
            cargoUsed: 0
        };
        this.shipCombatResourceFetchedAt = 0;
        this.shipCombatResourceFetchPromise = null;
        this.shipCombatResourcePollIntervalMs = 10_000;
        this.shipCombatResourceBackoffUntil = 0;
        this.onShipCombatResourceWindowFocus = null;
        this.onShipCombatResourceVisibilityChange = null;
        this.onMapTabVisible = null;
        this.hitStopUntil = 0;
        this.hitStopTimer = null;
        this.hitStopActive = false;
        this.webAudioCtx = null;
        this.createIslandButton = null;

        this.attackPrepVisionRange = null;
        this.attackPrepUntil = 0;
        this.attackPrepTimer = null;
        this.islandAttackCooldownById = new Map();
        this.navTargetId = null;
        this.navTargetLabel = null;

        this.canMove = true;
        this.moveCooldown = GAME_CONFIG.SHIP_MOVE_COOLDOWN;
        this.baseMoveCooldown = GAME_CONFIG.SHIP_MOVE_COOLDOWN;
        this.cameraFollowLerp = 1;
        this.currentCameraFollowTarget = null;
        this.shipMoving = false;
        this.shipMovePending = false;
        this.shipTargetX = 0;
        this.shipTargetY = 0;
        this.shipTargetIsland = null;
        this.shipArrivalTimer = null;
        this.shipDockRecoveryTimer = null;
        this.shipDockRecoveryBusy = false;
        this.shipDockRecoveryIslandId = null;
        this.collidingIsland = null;
        this.commandMenuOpen = false;
        this.islandCommandRefreshTimer = null;
        this.islandCaptureCompleteTimer = null;
        this.capitalCaptureCompleteTimer = null;
        this.islandCaptureAlertStateById = new Map();
        this.capitalWarStateByNation = new Map();
        this.lastEnemyShipActionWarnAt = new Map();
        this.lastIncomingThreatWarnAt = 0;
        this.collidingShipId = null;
        this.shipPanelSuppressed = false;
        this.mapOccupationNation = null;
        this.isInOwnedArea = true;

        // Firestore 関連
        this.firestore = null;
        this.otherShips = new Map();
        this.shipsUnsubscribe = null;
        this.shipGeoUnsubscribes = [];
        this.lastShipQueryCenter = null;
        this.lastShipQueryUpdate = 0;

        this.shipCollisionRadius = 20;
        this.lastRamDamageAt = new Map(); // playFabId -> timestamp
        this.lastShipHitFxAt = new Map(); // playFabId -> timestamp
        this.shipActionEventsUnsubscribe = null;
        this.shipActionEventsSeen = new Set();
        this.shipActionMines = [];
        this.shipBattleEventsUnsubscribe = null;
        this.shipBattleEventsSeen = new Set();
        this.shipBattleShield = new Map(); // playFabId -> battle end timestamp
        this.shipBattleHiddenUntil = new Map(); // playFabId -> hidden end timestamp
        this.shipBattleSmokeTimers = new Map(); // playFabId -> Phaser time event
        this.boardingButton = null;
        this.boardingTargetId = null;
        this.boardingVisible = false;
        this.lastBoardingAt = 0;
        this.boardingCooldownMs = 60 * 1000;
        this.rideRequestUnsubscribe = null;
        this.rideStatusUnsubscribe = null;
        this.rideSelfUnsubscribe = null;
        this.rideRequestSeen = new Set();
        this.rideStatusSeen = new Set();
        this.rideStatusInitialized = false;
        this.rideRequestTtlMs = 45 * 1000;
        this.ridingShipId = null;
        this.ridingOwnerId = null;
        this.ridingSince = null;
        this.rideLeaveButton = null;
        this.rideStatusLabel = null;
        this.rideHostMissingSince = 0;
        this.rideSyncTimer = null;
        this.myPassengerIcons = [];
        this.ghostShip = null;
        this.ghostShipTween = null;
        this.ghostShipCheckTimer = null;
        this.ghostShipVelocity = null;
        this.ghostShipSpeed = 18;

        this.minimapStormOverlay = null;
        this.minimapStormUntil = 0;
        this.minimapStormTimer = null;
        this.lastMinimapOverlayDrawAt = 0;

        this.constructionSprites = [];
        this.constructionUnsubscribe = null;
        this.lastConstructingIslandIds = new Set();
        this.demolishedSprites = [];
        this.demolishedUnsubscribe = null;

        this.playerHp = { current: null, max: null };
        this.playerShipDomain = null;
        this.respawnInFlight = false;
        this.onActiveShipChanged = null;
    }

    preload() {
        this.load.spritesheet('ship_sprite', 'Sprites/Ships/ships.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('ship_sprite_red', 'Sprites/Ships/ships_red.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('ship_sprite_blue', 'Sprites/Ships/ships_blue.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('ship_sprite_yellow', 'Sprites/Ships/ships_yellow.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('ship_sprite_green', 'Sprites/Ships/ships_green.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('ship_sprite_black', 'Sprites/Ships/ships_black.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('guild_ship_sprite', 'Sprites/Ships/guildShips.png', { frameWidth: 48, frameHeight: 48 });
        const nowHour = new Date().getHours();
        const isNight = nowHour % 2 === 0;
        const mapTilesSrc = isNight ? 'Sprites/Buildings/buildings2.png' : 'Sprites/Buildings/buildings.png';
        this.load.spritesheet('map_tiles', mapTilesSrc, { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('building_tiles', mapTilesSrc, { frameWidth: 32, frameHeight: 32 });
    }

    isNightHour() {
        const hour = new Date().getHours();
        return hour % 2 === 0;
    }

    getRandomGhostBaseFrame() {
        if (typeof window === 'undefined') return 0;
        const catalog = window.shipCatalog;
        if (!catalog || typeof catalog !== 'object') return 0;
        const entries = Object.values(catalog)
            .map(item => Number(item?.baseFrame))
            .filter(frame => Number.isFinite(frame));
        if (!entries.length) return 0;
        return entries[Math.floor(Math.random() * entries.length)];
    }

    getGhostIdleFrame(baseFrame) {
        const sheetCols = 32;
        const baseRow = Math.floor(baseFrame / sheetCols);
        const baseCol = baseFrame % sheetCols;
        return (baseRow * sheetCols) + (baseCol + 1);
    }

    spawnGhostShip() {
        if (this.ghostShip) return;
        if (this.isAirDomain(this.playerShipDomain)) return;
        const margin = this.TILE_SIZE * 6;
        const maxX = this.mapPixelSize - margin;
        const maxY = this.mapPixelSize - margin;
        const x = Phaser.Math.Between(margin, maxX);
        const y = Phaser.Math.Between(margin, maxY);
        const baseFrame = this.getRandomGhostBaseFrame();
        const idleFrame = this.getGhostIdleFrame(baseFrame);
        const sprite = this.add.sprite(x, y, 'ship_sprite_black', idleFrame);
        sprite.setAlpha(0.65);
        sprite.setDepth(GAME_CONFIG.DEPTH.SEA + 2);
        sprite.setTint(0x9cc5ff);
        sprite.__isGhost = true;
        this.ghostShip = sprite;
        this.ignoreOnUiCamera(sprite);
        const angle = Phaser.Math.DegToRad(Phaser.Math.Between(0, 359));
        this.ghostShipVelocity = {
            x: Math.cos(angle) * this.ghostShipSpeed,
            y: Math.sin(angle) * this.ghostShipSpeed
        };
    }

    removeGhostShip() {
        if (this.ghostShipTween) {
            this.ghostShipTween.stop();
            this.ghostShipTween = null;
        }
        if (this.ghostShip) {
            this.ghostShip.destroy();
            this.ghostShip = null;
        }
        this.ghostShipVelocity = null;
    }

    refreshGhostShipByTime() {
        if (this.isNightHour()) {
            this.spawnGhostShip();
        } else {
            this.removeGhostShip();
        }
    }

    updateGhostShip(deltaMs) {
        if (!this.ghostShip || !this.ghostShipVelocity) return;
        const dt = Math.max(0, Number(deltaMs || 0)) / 1000;
        if (!dt) return;
        const sprite = this.ghostShip;
        const margin = this.TILE_SIZE * 3;
        let nextX = sprite.x + this.ghostShipVelocity.x * dt;
        let nextY = sprite.y + this.ghostShipVelocity.y * dt;
        const minX = margin;
        const minY = margin;
        const maxX = this.mapPixelSize - margin;
        const maxY = this.mapPixelSize - margin;
        if (nextX <= minX || nextX >= maxX) {
            this.ghostShipVelocity.x *= -1;
            nextX = Phaser.Math.Clamp(nextX, minX, maxX);
        }
        if (nextY <= minY || nextY >= maxY) {
            this.ghostShipVelocity.y *= -1;
            nextY = Phaser.Math.Clamp(nextY, minY, maxY);
        }
        const buffer = this.TILE_SIZE * 2;
        if (this.islandObjects && this.islandObjects.size > 0) {
            for (const island of this.islandObjects.values()) {
                const left = island.x - buffer;
                const right = island.x + island.width + buffer;
                const top = island.y - buffer;
                const bottom = island.y + island.height + buffer;
                if (nextX >= left && nextX <= right && nextY >= top && nextY <= bottom) {
                    const distLeft = Math.abs(nextX - left);
                    const distRight = Math.abs(right - nextX);
                    const distTop = Math.abs(nextY - top);
                    const distBottom = Math.abs(bottom - nextY);
                    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
                    if (minDist === distLeft || minDist === distRight) {
                        this.ghostShipVelocity.x *= -1;
                    } else {
                        this.ghostShipVelocity.y *= -1;
                    }
                    nextX = sprite.x + this.ghostShipVelocity.x * dt;
                    nextY = sprite.y + this.ghostShipVelocity.y * dt;
                    break;
                }
            }
        }
        sprite.setPosition(nextX, nextY);
    }

    init(data) {
        console.log('[WorldMapScene] init called with data:', data);
        console.log('[WorldMapScene] window.__phaserPlayerInfo:', window.__phaserPlayerInfo);

        // シーン再利用時に前回の状態をクリーンアップ
        this.cleanupPreviousState();

        if (data && data.playFabId) {
            this.playerInfo = data;
        } else if (window.__phaserPlayerInfo && window.__phaserPlayerInfo.playFabId) {
            this.playerInfo = window.__phaserPlayerInfo;
        } else {
            this.playerInfo = { playFabId: null, race: null };
        }
        this.mapId = data?.mapId || window.__phaserPlayerInfo?.mapId || this.mapId;
        this.mapLabel = data?.mapLabel || window.__phaserPlayerInfo?.mapLabel || this.mapLabel;

        console.log('[WorldMapScene] Final playerInfo:', this.playerInfo);
    }

    cleanupPreviousState() {
        // Firestoreサブスクリプションを解除
        if (this.shipsUnsubscribe) {
            this.shipsUnsubscribe();
            this.shipsUnsubscribe = null;
        }
        if (this.shipGeoUnsubscribes && this.shipGeoUnsubscribes.length > 0) {
            this.shipGeoUnsubscribes.forEach(unsub => typeof unsub === 'function' && unsub());
            this.shipGeoUnsubscribes = [];
        }

        if (this.constructionUnsubscribe) {
            this.constructionUnsubscribe();
            this.constructionUnsubscribe = null;
        }
        if (this.lastConstructingIslandIds) {
            this.lastConstructingIslandIds.clear();
        }

        if (this.demolishedUnsubscribe) {
            this.demolishedUnsubscribe();
            this.demolishedUnsubscribe = null;
        }

        if (this.shipActionEventsUnsubscribe) {
            this.shipActionEventsUnsubscribe();
            this.shipActionEventsUnsubscribe = null;
        }
        if (this.shipActionEventsSeen) {
            this.shipActionEventsSeen.clear();
        }
        if (this.shipBattleEventsUnsubscribe) {
            this.shipBattleEventsUnsubscribe();
            this.shipBattleEventsUnsubscribe = null;
        }
        if (this.shipBattleEventsSeen) {
            this.shipBattleEventsSeen.clear();
        }
        if (this.shipBattleShield) {
            this.shipBattleShield.clear();
        }
        if (this.shipBattleHiddenUntil) {
            this.shipBattleHiddenUntil.clear();
        }
        if (this.shipBattleSmokeTimers) {
            this.shipBattleSmokeTimers.forEach(timer => timer?.remove?.());
            this.shipBattleSmokeTimers.clear();
        }
        if (this.rideRequestUnsubscribe) {
            this.rideRequestUnsubscribe();
            this.rideRequestUnsubscribe = null;
        }
        if (this.rideStatusUnsubscribe) {
            this.rideStatusUnsubscribe();
            this.rideStatusUnsubscribe = null;
        }
        if (this.rideSelfUnsubscribe) {
            this.rideSelfUnsubscribe();
            this.rideSelfUnsubscribe = null;
        }
        if (this.rideRequestSeen) {
            this.rideRequestSeen.clear();
        }
        if (this.rideStatusSeen) {
            this.rideStatusSeen.clear();
        }
        this.rideStatusInitialized = false;
        this.rideHostMissingSince = 0;
        if (this.rideStatusLabel) {
            this.rideStatusLabel.remove?.();
            this.rideStatusLabel = null;
        }
        if (this.myPassengerIcons && this.myPassengerIcons.length > 0) {
            this.myPassengerIcons.forEach(icon => icon?.destroy?.());
            this.myPassengerIcons = [];
        }
        if (this.rideSyncTimer) {
            this.rideSyncTimer.remove();
            this.rideSyncTimer = null;
        }
        if (this.rideLeaveButton) {
            this.rideLeaveButton.remove();
            this.rideLeaveButton = null;
        }

        this.removeGhostShip();
        if (this.ghostShipCheckTimer) {
            this.ghostShipCheckTimer.remove();
            this.ghostShipCheckTimer = null;
        }

        // 他の船のスプライトを破棄
        if (this.otherShips && this.otherShips.size > 0) {
            this.otherShips.forEach((shipObject) => {
                this.destroyShipHpBar(shipObject?.sprite);
                this.destroyShipNameLabel(shipObject?.sprite);
                shipObject.sprite?.destroy?.();
            });
            this.otherShips.clear();
        }

        // 島オブジェクトのスプライトを破棄
        if (this.islandObjects && this.islandObjects.size > 0) {
            this.islandObjects.forEach((islandData) => {
                if (islandData.sprites) {
                    islandData.sprites.forEach(sprite => sprite?.destroy?.());
                }
                if (islandData.buildingSprites) {
                    islandData.buildingSprites.forEach(sprite => sprite?.destroy?.());
                }
                islandData.nameText?.destroy?.();
                islandData.interactiveZone?.destroy?.();
                islandData.physicsGroup?.destroy?.(true);
            });
            this.islandObjects.clear();
        }

        // 建設・破壊スプライトを破棄
        if (this.constructionSprites && this.constructionSprites.length > 0) {
            this.constructionSprites.forEach(sprite => sprite?.destroy?.());
            this.constructionSprites = [];
        }
        if (this.demolishedSprites && this.demolishedSprites.length > 0) {
            this.demolishedSprites.forEach(sprite => sprite?.destroy?.());
            this.demolishedSprites = [];
        }

        // 状態変数をリセット
        this.shipTween = null;
        this.canMove = true;
        this.shipMoving = false;
        this.shipTargetX = 0;
        this.shipTargetY = 0;
        this.shipTargetIsland = null;
        this.shipArrivalTimer = null;
        this.collidingIsland = null;
        this.commandMenuOpen = false;
        this.firestore = null;
        this.lastShipQueryCenter = null;
        this.lastShipQueryUpdate = 0;
        this.boardingButton = null;
        this.boardingTargetId = null;
        this.boardingVisible = false;
        this.collidingShipId = null;
        this.shipPanelSuppressed = false;
        if (this.lastRamDamageAt) {
            this.lastRamDamageAt.clear();
        }
        this.shipAnims = {};
        this.destroyShipHpBar(this.playerShip);
        this.destroyShipShadow(this.playerShip);
        this.playerHp = { current: null, max: null };
        this.playerShipDomain = null;
        this.respawnInFlight = false;
        if (this.onActiveShipChanged && typeof window !== 'undefined') {
            window.removeEventListener('ship:active-changed', this.onActiveShipChanged);
            this.onActiveShipChanged = null;
        }

        console.log('[WorldMapScene] Previous state cleaned up');
    }

    ignoreOnUiCamera(objects) {
        if (!this.uiCamera) return objects;
        if (Array.isArray(objects)) {
            objects.forEach(obj => obj && obj !== this.fogGraphics && this.uiCamera.ignore(obj));
        } else if (objects && objects !== this.fogGraphics) {
            this.uiCamera.ignore(objects);
        }
        return objects;
    }

    setMapReady(ready, options = {}) {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('tabContentMap');
        if (!container) return;
        if (ready) {
            container.classList.add('map-ready');
            const overlay = container.querySelector('.map-loading-overlay');
            if (overlay) {
                overlay.style.pointerEvents = 'none';
                const fadeMs = Number(options.fadeMs || 0);
                if (fadeMs > 0) {
                    overlay.style.transition = `opacity ${fadeMs}ms ease`;
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        overlay.style.display = 'none';
                        overlay.style.transition = '';
                    }, fadeMs);
                } else {
                    overlay.style.opacity = '0';
                    requestAnimationFrame(() => {
                        overlay.style.display = 'none';
                    });
                }
            }
            if (typeof window !== 'undefined' && window.__pendingFirstMapNav?.islandId) {
                const targetId = window.__pendingFirstMapNav.islandId;
                const setOk = this.setNavigationTarget(targetId);
                if (setOk) {
                    window.__pendingFirstMapNav = null;
                }
            }
        } else {
            container.classList.remove('map-ready');
            const overlay = container.querySelector('.map-loading-overlay');
            if (overlay) {
                const mapId = typeof window !== 'undefined' ? (window.__currentMapId || '') : '';
                const mapLabel = typeof window !== 'undefined' ? (window.__currentMapLabel || mapId || '-') : '-';
                const cells = overlay.querySelectorAll('.world-map-modal-cell');
                const statusEl = overlay.querySelector('#mapLoadingStatus');
                const grid = overlay.querySelector('#worldMapGrid');
                if (grid) {
                    grid.style.visibility = '';
                }
                if (statusEl) {
                    statusEl.classList.add('is-hidden');
                }
                const loadTarotSpriteMeta = () => {
                    if (typeof window === 'undefined') return Promise.resolve(null);
                    if (window.__tarotSpriteMetaPromise) return window.__tarotSpriteMetaPromise;
                    window.__tarotSpriteMetaPromise = new Promise((resolve) => {
                        const img = window.__tarotSpriteImage || new Image();
                        window.__tarotSpriteImage = img;
                        img.onload = () => {
                            const expectedWidth = 48 * 10;
                            const expectedHeight = 80 * 12;
                            const usesPadding = img.naturalWidth !== expectedWidth || img.naturalHeight !== expectedHeight;
                            const tileWidth = usesPadding ? 48 : img.naturalWidth / 10;
                            const tileHeight = usesPadding ? 80 : img.naturalHeight / 12;
                            resolve({
                                width: img.naturalWidth,
                                height: img.naturalHeight,
                                tileWidth,
                                tileHeight
                            });
                        };
                        img.onerror = () => resolve(null);
                        if (!img.src) {
                            img.decoding = 'async';
                            img.src = 'Sprites/Buildings/tarot.png';
                        }
                    });
                    return window.__tarotSpriteMetaPromise;
                };
                const applyTarotIndex = (cell, tarotIndex, spriteMeta) => {
                    if (!Number.isFinite(tarotIndex) || tarotIndex < 0) return;
                    const col = tarotIndex % 10;
                    const row = Math.floor(tarotIndex / 10);
                    const tileWidth = spriteMeta?.tileWidth || 48;
                    const tileHeight = spriteMeta?.tileHeight || 80;
                    const image = (typeof window !== 'undefined' && window.__tarotSpriteImage) ? window.__tarotSpriteImage : null;
                    const sheetWidth = spriteMeta?.width || image?.naturalWidth || tileWidth * 10;
                    const sheetHeight = spriteMeta?.height || image?.naturalHeight || tileHeight * 12;
                    cell.style.setProperty('--tarot-sheet-w', `${sheetWidth}px`);
                    cell.style.setProperty('--tarot-sheet-h', `${sheetHeight}px`);
                    cell.style.setProperty('--tarot-tile-w', `${tileWidth}px`);
                    cell.style.setProperty('--tarot-tile-h', `${tileHeight}px`);
                    cell.style.setProperty('--tarot-x', `${col * tileWidth}px`);
                    cell.style.setProperty('--tarot-y', `${row * tileHeight}px`);
                    cell.classList.add('has-tarot');
                };
                const highlightCell = (cell, majorNumber, mapLabelText, matchedRef, mapIdText) => {
                    const labelKey = String(cell.dataset.mapLabel || '').trim();
                    const cellIndex = Number(cell.dataset.index);
                    const cellLetter = String(cell.dataset.letter || '').toUpperCase();
                    const emptyCellIdMatch = String(mapIdText || '').match(/^empty_cell_(\d{1,2})$/);
                    if (!matchedRef.matched && emptyCellIdMatch && Number.isInteger(cellIndex) && Number(emptyCellIdMatch[1]) === cellIndex) {
                        cell.classList.add('is-current');
                        matchedRef.matched = true;
                        matchedRef.cell = cell;
                        return;
                    }
                    if (!matchedRef.matched && mapLabelText) {
                        const seaLabelMatch = String(mapLabelText).match(/^未開拓海域\s+([A-Z])$/);
                        if (seaLabelMatch && cellLetter === seaLabelMatch[1].toUpperCase()) {
                            cell.classList.add('is-current');
                            matchedRef.matched = true;
                            matchedRef.cell = cell;
                            return;
                        }
                    }
                    if (!labelKey) return;
                    if (!matchedRef.matched && mapIdText && cell.dataset.mapId === mapIdText) {
                        cell.classList.add('is-current');
                        matchedRef.matched = true;
                        matchedRef.cell = cell;
                        return;
                    }
                    if (!matchedRef.matched && mapLabelText.includes(labelKey)) {
                        cell.classList.add('is-current');
                        matchedRef.matched = true;
                        matchedRef.cell = cell;
                        return;
                    }
                    if (!matchedRef.matched && Number.isFinite(majorNumber)) {
                        const numMatch = labelKey.match(/^(\d+)\./);
                        if (numMatch && Number(numMatch[1]) === majorNumber) {
                            cell.classList.add('is-current');
                            matchedRef.matched = true;
                            matchedRef.cell = cell;
                        }
                    }
                };
                const applyNationLevels = (levels, spriteMeta) => {
                    const baseByNation = { fire: 0, earth: 20, water: 40, wind: 60 };
                    const clampLevel = (value) => {
                        const num = Math.floor(Number(value) || 1);
                        return Math.max(1, Math.min(14, num));
                    };
                    const matchedRef = { matched: false, cell: null };
                    const majorMatch = String(mapId).match(/major_(\d{2})/);
                    const majorNumber = majorMatch ? Number(majorMatch[1]) : null;
                    if (!spriteMeta) {
                        spriteMeta = { width: 512, height: 1024, tileWidth: 48, tileHeight: 80 };
                    }
                    cells.forEach((cell) => {
                        cell.classList.remove('is-current');
                        const nation = String(cell.dataset.nation || '').trim();
                        if (nation && baseByNation[nation] !== undefined) {
                            const levelRaw = levels?.[nation]?.nationLevel ?? levels?.[nation]?.level ?? 1;
                            const level = clampLevel(levelRaw);
                            applyTarotIndex(cell, baseByNation[nation] + (level - 1), spriteMeta);
                        } else {
                            const tarotIndexRaw = cell.dataset.tarotIndex;
                            if (tarotIndexRaw) {
                                applyTarotIndex(cell, Number(tarotIndexRaw), spriteMeta);
                            }
                        }
                        highlightCell(cell, majorNumber, mapLabel, matchedRef, mapId);
                    });
                    const world = overlay.querySelector('.map-loading-world');
                    if (world && matchedRef.cell) {
                        const worldRect = world.getBoundingClientRect();
                        const cellRect = matchedRef.cell.getBoundingClientRect();
                        if (worldRect.width && worldRect.height) {
                            const centerX = cellRect.left + cellRect.width / 2 - worldRect.left;
                            const centerY = cellRect.top + cellRect.height / 2 - worldRect.top;
                            const originX = Math.max(0, Math.min(100, (centerX / worldRect.width) * 100));
                            const originY = Math.max(0, Math.min(100, (centerY / worldRect.height) * 100));
                            world.style.transformOrigin = `${originX}% ${originY}%`;
                        } else {
                            world.style.transformOrigin = '50% 50%';
                        }
                    }
                };
                const applyOccupationColors = async (cellsList) => {
                    const nationClassByKey = {
                        fire: 'is-occupied-fire',
                        water: 'is-occupied-water',
                        earth: 'is-occupied-earth',
                        wind: 'is-occupied-wind',
                        neutral: 'is-occupied-neutral'
                    };
                    cellsList.forEach((cell) => {
                        Object.values(nationClassByKey).forEach(cls => cell.classList.remove(cls));
                    });
                    const mapIds = [];
                    const fallbackByMapId = {};
                    cellsList.forEach((cell) => {
                        const mapIdValue = cell.dataset.mapId;
                        if (!mapIdValue) return;
                        if (mapIdValue === EMPTY_MAP_ID) {
                            cell.classList.add(nationClassByKey.neutral);
                            return;
                        }
                        mapIds.push(mapIdValue);
                        fallbackByMapId[mapIdValue] = String(cell.dataset.nation || '').toLowerCase();
                    });
                    const applyFromMap = (occupationMap) => {
                        cellsList.forEach((cell) => {
                            const mapIdValue = cell.dataset.mapId;
                            if (!mapIdValue || mapIdValue === EMPTY_MAP_ID) return;
                            const fallback = fallbackByMapId[mapIdValue] || '';
                            const nationKey = String(occupationMap?.[mapIdValue] || fallback || '').toLowerCase() || 'neutral';
                            const cls = nationClassByKey[nationKey] || nationClassByKey.neutral;
                            cell.classList.add(cls);
                        });
                    };
                    const now = Date.now();
                    const cached = window.__worldMapOccupationMap;
                    const cachedAt = Number(window.__worldMapOccupationFetchedAt || 0);
                    const cacheFresh = cached && cachedAt && now - cachedAt < 60000;
                    if (cacheFresh) {
                        applyFromMap(cached);
                        return;
                    }
                    if (!mapIds.length) return;
                    try {
                        const res = await fetch('/api/get-map-occupation-map', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mapIds })
                        });
                        if (!res.ok) throw new Error('Failed to get occupation map');
                        const data = await res.json();
                        const map = data?.map || {};
                        window.__worldMapOccupationMap = map;
                        window.__worldMapOccupationFetchedAt = Date.now();
                        applyFromMap(map);
                    } catch {
                        applyFromMap(null);
                    }
                };
                if (cells.length) {
                    applyNationLevels(null, null);
                    const loadLevels = async () => {
                        try {
                            const spriteMeta = await loadTarotSpriteMeta();
                            const response = await fetch('/api/get-nation-levels', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({})
                            });
                            if (!response.ok) throw new Error('Failed to fetch levels');
                            const data = await response.json();
                            applyNationLevels(data?.levels || {}, spriteMeta);
                        } catch (error) {
                            const spriteMeta = await loadTarotSpriteMeta();
                            applyNationLevels(null, spriteMeta);
                        } finally {
                            await applyOccupationColors(cells);
                        }
                    };
                    loadLevels().finally(() => {
                        if (grid) grid.style.visibility = '';
                        if (statusEl) statusEl.classList.add('is-hidden');
                        const world = overlay.querySelector('.map-loading-world');
                        if (world) {
                            world.classList.remove('is-animating');
                            void world.offsetWidth;
                            world.classList.add('is-animating');
                        }
                    });
                }
                overlay.style.display = '';
                overlay.style.opacity = '';
                overlay.style.pointerEvents = '';
            }
        }
    }

    async create() {
        this.setMapReady(false);
        if (this.cameras?.main) {
            this.cameras.main.roundPixels = true;
        }
        if (this.uiCamera) {
            this.uiCamera.roundPixels = true;
        }
        if (!this.mapId && typeof window !== 'undefined') {
            this.mapId = window.__currentMapId || this.mapId;
        }
        const halfSize = this.mapPixelSize / 2;
        const seaQuadrants = [];
        const createSeaQuadrant = (col, row) => {
            const sprite = this.add.tileSprite(col * halfSize, row * halfSize, halfSize, halfSize, 'map_tiles', 0)
                .setOrigin(0, 0)
                .setDepth(GAME_CONFIG.DEPTH.SEA);
            seaQuadrants.push(sprite);
            return sprite;
        };
        const nationKey = this.getNationKey();
        const nationBounds = NATION_BOUNDS[nationKey];
        const nationCenter = getNationCenterTile(nationBounds);
        const nationCenterWorld = {
            x: (nationCenter.x + 0.5) * this.gridSize,
            y: (nationCenter.y + 0.5) * this.gridSize
        };
        const primaryCol = nationCenterWorld.x < halfSize ? 0 : 1;
        const primaryRow = nationCenterWorld.y < halfSize ? 0 : 1;
        createSeaQuadrant(primaryCol, primaryRow);
        this.time.delayedCall(300, () => {
            for (let row = 0; row < 2; row += 1) {
                for (let col = 0; col < 2; col += 1) {
                    if (col === primaryCol && row === primaryRow) continue;
                    createSeaQuadrant(col, row);
                }
            }
        });
        this.seaBackgrounds = seaQuadrants;
        if (typeof window !== 'undefined') {
            window.worldMapScene = this;
        }
        if (this.game?.canvas?.style) {
            this.game.canvas.style.backgroundColor = '#000000';
        }
        const seaBackground = this.add.rectangle(0, 0, this.mapPixelSize, this.mapPixelSize, 0x000000, 0)
            .setOrigin(0, 0);
        seaBackground.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, this.mapPixelSize, this.mapPixelSize),
            Phaser.Geom.Rectangle.Contains
        );

        // Prevent DOM UI interactions from also triggering Phaser input (pointerup is listened on window).
        if (typeof document !== 'undefined') {
            const stop = (e) => {
                if (!e) return;
                if (typeof e.stopPropagation === 'function') e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            };
            const panels = [
                document.getElementById('islandCommandPanel'),
                document.getElementById('mapChatArea'),
                document.getElementById('mapSelectModal'),
                document.getElementById('mapLoadingOverlay'),
                document.getElementById('mapTransitionModal')
            ];
            panels.forEach((panel) => {
                if (!panel || panel.dataset.phaserBlockerInstalled) return;
                ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach((type) => {
                    panel.addEventListener(type, stop);
                });
                panel.addEventListener('touchmove', (e) => {
                    stop(e);
                }, { passive: true });
                panel.dataset.phaserBlockerInstalled = '1';
            });
        }

        seaBackground.on('pointerup', (pointer) => {
            if (this.ridingShipId) {
                return;
            }
            if (typeof document !== 'undefined' && document.querySelector('.building-bottom-sheet.active')) return;
            if (typeof document !== 'undefined') {
                const modal = document.getElementById('mapSelectModal');
                if (modal && modal.style.display !== 'none') return;
            }
            if (this.commandMenuOpen) {
                this.hideCommandMenu();
            }
            if (!this.isPointerInsideVisionArea(pointer)) {
                this.showMessage('視界の外は移動できません。');
                return;
            }
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            console.log('[Sea] Background clicked at world:', worldPoint.x, worldPoint.y);
            this.moveShipTo(worldPoint.x, worldPoint.y, null);
        });

        // 船スプライトは行単位で向き別に並ぶ。baseFrame を基準に相対オフセットで参照する。
        this.shipSpriteBaseFrame = 0; // 既定の船スプライト基準フレーム
        const sheetCols = 32;
        const baseFrame = this.shipSpriteBaseFrame;
        const baseRow = Math.floor(baseFrame / sheetCols);
        const baseCol = baseFrame % sheetCols;
        const frameAt = (rowOffset, colOffset) => (baseRow + rowOffset) * sheetCols + (baseCol + colOffset);

        this.shipAnims = {};

        this.physics.world.setBounds(0, 0, this.mapPixelSize, this.mapPixelSize);

        const initialPos = this.getInitialSpawnPosition();
        this.playerShip = this.physics.add.sprite(initialPos.x, initialPos.y, this.getShipSpriteSheetKey(window.myAvatarBaseInfo?.AvatarColor));
        this.playerShip.setFrame(1);
        this.playerShip.setDepth(GAME_CONFIG.DEPTH.SHIP);

        this.playerShip.body.setSize(24, 24);
        this.playerShip.body.setCollideWorldBounds(true);
        
        this.playerShip.clearTint();
        this.updatePassengerIconsForHost(this.playerShip, 0, this.myPassengerIcons);
        this.updatePassengerIconsForHost(this.playerShip, 0, this.myPassengerIcons);

        this.navArrow = this.add.triangle(0, 0, 0, -10, -7, 6, 7, 6, 0xffffff, 0.9);
        this.navArrow.setDepth(GAME_CONFIG.DEPTH.SHIP + 1);
        this.navArrow.setVisible(false);
        this.navDistanceText = this.add.text(0, 0, '', {
            fontSize: '12px',
            fill: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: { x: 6, y: 4 }
        });
        this.navDistanceText.setOrigin(0.5, 1);
        this.navDistanceText.setDepth(GAME_CONFIG.DEPTH.SHIP + 1);
        this.navDistanceText.setVisible(false);

        // shipTypeKey がまだ解決できていない間も、最低限アニメーションできるようにデフォルトを用意
        {
            const sheetKey = this.playerShip.texture?.key || 'ship_sprite';
            const defaultShipTypeKey = `_default__${sheetKey}__bf0`;
            this.generateShipAnims(0, defaultShipTypeKey);
            this.playerShip.shipTypeKey = defaultShipTypeKey;
            this.playerShip.lastAnimKey = 'ship_down';
            const idleFrame = this.shipAnims?.[defaultShipTypeKey]?.idleFrames?.ship_down;
            if (idleFrame !== undefined) this.playerShip.setFrame(idleFrame);
        }
        
        this.cameras.main.setBounds(0, 0, this.mapPixelSize, this.mapPixelSize);
        this.setCameraFollowTarget(this.playerShip);
        this.updateZoomFromVisionRange();

        this.fogGraphics = this.add.graphics();
        this.fogGraphics.setDepth(GAME_CONFIG.DEPTH.FOG);
        this.fogGraphics.setScrollFactor(0);

        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.setScroll(0, 0);
        this.cameras.main.ignore(this.fogGraphics);
        this.ignoreOnUiCamera([...(this.seaBackgrounds || []), this.playerShip]);

        this.positionText = this.add.text(12, this.scale.height - 10, '', {
            fontSize: '12px',
            fill: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: { x: 6, y: 4 }
        });
        this.positionText.setOrigin(0, 1);
        this.positionText.setScrollFactor(0);
        this.positionText.setDepth(GAME_CONFIG.DEPTH.FOG + 1);
        this.cameras.main.ignore(this.positionText);
        
        // 6. メッセージUI（showMessage / showError 用）
        this.messageText = this.add.text(this.cameras.main.width / 2, 18, '', {
            fontSize: '16px',
            fill: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 10, y: 6 }
        });
        this.messageText.setOrigin(0.5, 0);
        this.messageText.setScrollFactor(0);
        this.messageText.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        this.messageText.setVisible(false);
        this.cameras.main.ignore(this.messageText);

        this.createBoardingButton();
        this.setupShipActionUi();
        this.setupShipSideCannonUi();
        this.setupShipNormalAttackUi();
        this.setupShipSkillUi();
        this.setupCreateIslandUi();
        this.setupRideLeaveUi();

        this.scale.on('resize', () => {
            this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height);
            if (this.uiCamera) this.uiCamera.setSize(this.scale.width, this.scale.height);
            this.updateZoomFromVisionRange();
            if (this.positionText) this.positionText.setPosition(12, this.scale.height - 10);
            this.updateMapActionBarLayout();
        });

        if (typeof window !== 'undefined') {
            this.onActiveShipChanged = async (event) => {
                const shipId = event?.detail?.shipId;
                if (!shipId || !this.playerInfo?.playFabId) return;
                try {
                    const assetData = await Ship.getShipAsset(this.playerInfo.playFabId, shipId, true);
                    if (assetData) {
                        this.setPlayerShipAssetData(assetData);
                        this.requestShipCombatResourceStorage(true);
                        if (assetData.Domain) {
                            this.playerShipDomain = String(assetData.Domain).toLowerCase();
                        }
                        const color = window.myAvatarBaseInfo?.AvatarColor;
                        const sheetKey = this.getShipSpriteSheetKey(color);
            if (this.playerShip?.texture?.key !== sheetKey) {
                this.playerShip.setTexture(sheetKey);
            }
                        const isDestroyed = Number(assetData?.Stats?.CurrentHP) <= 0;
                        const baseFrame = isDestroyed ? 0 : Number(assetData?.baseFrame);
                        if (Number.isFinite(baseFrame) && assetData?.ItemId) {
                            const shipTypeKey = `${assetData.ItemId}__${sheetKey}__bf${baseFrame}`;
                            this.generateShipAnims(baseFrame, shipTypeKey);
                            this.playerShip.shipTypeKey = shipTypeKey;
                            this.playerShip.lastAnimKey = 'ship_down';
                            const idleFrame = this.shipAnims?.[shipTypeKey]?.idleFrames?.ship_down;
                            if (idleFrame !== undefined) this.playerShip.setFrame(idleFrame);
                        }
            if (assetData?.Domain) {
                this.playerShipDomain = String(assetData.Domain).toLowerCase();
            }
            this.applyPlayerShipDomain();
            if (assetData?.Stats) {
                const currentHp = Number(assetData.Stats.CurrentHP);
                const maxHp = Number(assetData.Stats.MaxHP);
                if (Number.isFinite(currentHp) && Number.isFinite(maxHp)) {
                    this.playerHp = { current: currentHp, max: maxHp };
                            }
                        }
                    }
                    const vision = Number(assetData?.Stats?.VisionRange);
                    if (Number.isFinite(vision) && vision > 0) {
                        this.shipVisionRange = vision;
                        this.baseShipVisionRange = vision;
                        this.updateZoomFromVisionRange();
                        if (this.firestore) {
                            const { doc, setDoc } = await import('firebase/firestore');
                            const shipRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
                            await setDoc(shipRef, { shipVisionRange: vision, shipId }, { merge: true });
                        }
                    }
                } catch (error) {
                    console.warn('[WorldMapScene] Failed to update vision range from active ship:', error);
                }
            };
            window.addEventListener('ship:active-changed', this.onActiveShipChanged);
        }

        // 8. GuildShips.png の設定（48x48 / cols=21）
        this.guildShipSheetCols = 21;
        this.guildShipColorOffsets = { white: 0, red: 3, blue: 6, yellow: 9, green: 12 };

        // 9. Firestore から島データを読み込む（world_map）
        try {
            const db = getFirestore();
            const querySnapshot = await getDocs(collection(db, this.getWorldMapCollectionName()));

            if (querySnapshot.empty) {
                console.warn('[WorldMapScene] No islands found in Firestore');
                this.showError('島データが見つかりませんでした。');
            }

            let loadedCount = 0;
            querySnapshot.forEach((docSnapshot) => {
                try {
                    const data = docSnapshot.data();

                    if (!data.coordinate || typeof data.coordinate.x !== 'number' || typeof data.coordinate.y !== 'number') {
                        console.error(`[WorldMapScene] Invalid coordinate data for island ${docSnapshot.id}`, data);
                        return;
                    }

                    if (data.type === 'obstacle') {
                        this.createObstacle({
                            id: docSnapshot.id,
                            x: data.coordinate.x * this.gridSize,
                            y: data.coordinate.y * this.gridSize,
                            name: data.name || '障害物',
                            width: data.width || 1,
                            height: data.height || 1,
                            visualWidth: data.visualWidth || data.width || 1,
                            visualHeight: data.visualHeight || data.height || 1,
                            tileIndex: Number.isFinite(Number(data.tileIndex)) ? Number(data.tileIndex) : 133
                        });
                        loadedCount++;
                        return;
                    }

                    this.createIsland({
                        id: docSnapshot.id,
                        x: data.coordinate.x * this.gridSize,
                        y: data.coordinate.y * this.gridSize,
                        name: data.name || '名称未設定',
                        size: data.size || 'small',
                        ownerNation: data.ownerNation || data.ownerRace,
                        ownerId: data.ownerId,
                        nation: data.nation || null,
                        occupationStatus: data.occupationStatus || null,
                        biome: data.biome,
                        biomeFrame: data.biomeFrame,
                        buildingSlots: data.buildingSlots,
                        buildings: data.buildings || [],
                        captureState: data.captureState || null
                    });
                    loadedCount++;
                } catch (islandError) {
                    console.error(`[WorldMapScene] Failed to create island ${docSnapshot.id}:`, islandError);
                }
            });

            console.log(`[WorldMapScene] Successfully loaded ${loadedCount} islands`);
        } catch (error) {
            console.error('[WorldMapScene] Error fetching island data from Firestore:', error);
            this.showError('マップデータの読み込みに失敗しました。\\n時間をおいて再度お試しください。');
        }

        // 10. ミニマップ
        this.createMinimap();

        // 11. Firestore 初期化（ships同期など）
        await this.initializeFirestore();
        if (RIDE_SYSTEM_ENABLED) await this.subscribeToRideRequests();
        if (RIDE_SYSTEM_ENABLED && this.time) {
            this.rideSyncTimer = this.time.addEvent({
                delay: 250,
                loop: true,
                callback: () => this.syncRidePosition()
            });
        }
        this.updatePassengerIconsForHost(this.playerShip, 0, this.myPassengerIcons);

        // UI camera should only render fog + minimap.
        if (this.uiCamera) {
            const uiKeep = new Set([
                this.fogGraphics,
                this.minimapGraphics,
                this.minimapTexture,
                this.minimapPlayerMarker
            ]);
            this.uiCamera.ignore(this.children.list.filter(child => !uiKeep.has(child)));
        }

        this.refreshGhostShipByTime();
        if (this.ghostShipCheckTimer) {
            this.ghostShipCheckTimer.remove();
        }
        this.ghostShipCheckTimer = this.time.addEvent({
            delay: 60_000,
            loop: true,
            callback: () => this.refreshGhostShipByTime()
        });

        this.setMapReady(true, { fadeMs: 1350 });
    }

    createObstacle(data) {
        const logicW = Math.max(1, Number(data.width) || 1);
        const logicH = Math.max(1, Number(data.height) || 1);
        const visualW = Math.max(1, Number(data.visualWidth) || logicW);
        const visualH = Math.max(1, Number(data.visualHeight) || logicH);
        const tileIndex = Number.isFinite(Number(data.tileIndex)) ? Number(data.tileIndex) : 133;

        const obstacleSprites = [];
        const sheetCols = 32;
        const baseX = data.x;
        const baseY = data.y + (logicH * this.TILE_SIZE);

        for (let dy = 0; dy < visualH; dy++) {
            for (let dx = 0; dx < visualW; dx++) {
                const frameIndex = tileIndex + dx - (dy * sheetCols);
                const tileX = data.x + (dx * this.TILE_SIZE);
                const tileY = baseY - (dy * this.TILE_SIZE);
                const tileSprite = this.add.sprite(tileX, tileY, 'building_tiles', frameIndex).setOrigin(0, 1);
                tileSprite.setDepth(GAME_CONFIG.DEPTH.BUILDING);
                this.ignoreOnUiCamera(tileSprite);
                obstacleSprites.push(tileSprite);
            }
        }

        const collider = this.add.zone(data.x, data.y, logicW * this.TILE_SIZE, logicH * this.TILE_SIZE).setOrigin(0, 0);
        this.physics.add.existing(collider, true);
        collider.__logicH = logicH;

        if (this.playerShip) {
            this.physics.add.collider(this.playerShip, collider, () => {
                if (this.isAirDomain(this.playerShipDomain) && logicH <= 2) return;
                if (this.shipMoving) {
                    this.shipMoving = false;
                    this.playerShip.body.setVelocity(0, 0);
                    if (this.shipTween) this.shipTween.stop();
                    if (this.shipArrivalTimer) this.shipArrivalTimer.remove();
                    this.stopShipAnimation();
                    this.updateMyShipStoppedPosition();
                }
            });
        }

        this.ignoreOnUiCamera(collider);
        collider.setDepth(GAME_CONFIG.DEPTH.BUILDING - 1);
        if (!this.obstacleObjects) this.obstacleObjects = new Map();
        this.obstacleObjects.set(data.id, { sprites: obstacleSprites, collider: collider, logicH });
    }

    /**
     *
     *
     *
     *
     */
    generateShipAnims(baseFrame, keySuffix) {
        const normalizedBaseFrame = Number(baseFrame);
        if (!Number.isFinite(normalizedBaseFrame)) {
            console.warn(`[Anims] Invalid baseFrame for ${keySuffix}:`, baseFrame);
            baseFrame = 0;
        } else {
            baseFrame = normalizedBaseFrame;
        }
        if (this.shipAnims[keySuffix]) {
            return;
        }

        console.log(`[Anims] Generating animations for ship type ${keySuffix} with baseFrame ${baseFrame}`);

        const sheet = this.getShipSpriteSheetKeyFromSuffix(keySuffix);
        const sheetCols = 32;
        const baseRow = Math.floor(baseFrame / sheetCols);
        const baseCol = baseFrame % sheetCols;
        const frameAt = (rowOffset, colOffset) => (baseRow + rowOffset) * sheetCols + (baseCol + colOffset);

        const animsToCreate = [
            { key: `ship_down${keySuffix}`, start: frameAt(0, 0), end: frameAt(0, 2) },
            { key: `ship_down_left${keySuffix}`, start: frameAt(0, 3), end: frameAt(0, 5) },
            { key: `ship_left${keySuffix}`, start: frameAt(1, 0), end: frameAt(1, 2) },
            { key: `ship_down_right${keySuffix}`, start: frameAt(1, 3), end: frameAt(1, 5) },
            { key: `ship_right${keySuffix}`, start: frameAt(2, 0), end: frameAt(2, 2) },
            { key: `ship_up_left${keySuffix}`, start: frameAt(2, 3), end: frameAt(2, 5) },
            { key: `ship_up${keySuffix}`, start: frameAt(3, 0), end: frameAt(3, 2) },
            { key: `ship_up_right${keySuffix}`, start: frameAt(3, 3), end: frameAt(3, 5) },
        ];

        animsToCreate.forEach(anim => {
            if (!this.anims.exists(anim.key)) {
                this.anims.create({
                    key: anim.key,
                    frames: this.anims.generateFrameNumbers(sheet, { start: anim.start, end: anim.end }),
                    frameRate: 10,
                    repeat: -1
                });
            }
        });

        this.shipAnims[keySuffix] = {
            idleFrames: {
                'ship_down': frameAt(0, 1),
                'ship_down_left': frameAt(0, 4),
                'ship_left': frameAt(1, 1),
                'ship_down_right': frameAt(1, 4),
                'ship_right': frameAt(2, 1),
                'ship_up_left': frameAt(2, 4),
                'ship_up': frameAt(3, 1),
                'ship_up_right': frameAt(3, 4)
            },
            lastAnimKey: 'ship_down'
        };
    }

    normalizeShipColorKey(color) {
        const key = String(color || '').toLowerCase().trim();
        if (key === 'red' || key === 'blue' || key === 'yellow' || key === 'green' || key === 'brown') return key;
        return 'brown';
    }

    getShipSpriteSheetKey(color) {
        const c = this.normalizeShipColorKey(color);
        if (c === 'brown') return 'ship_sprite';
        return `ship_sprite_${c}`;
    }

    getShipSpriteSheetKeyFromSuffix(keySuffix) {
        const suffix = String(keySuffix || '');
        const parts = suffix.split('__');
        const maybeSheet = parts.find(p => p === 'ship_sprite' || p.startsWith('ship_sprite_')) || null;
        if (maybeSheet && this.textures?.exists && this.textures.exists(maybeSheet)) return maybeSheet;
        return 'ship_sprite';
    }
    


    /**
     *
     */
    createMinimap() {
        const minimapSize = GAME_CONFIG.MINIMAP_SIZE;
        const minimapPadding = GAME_CONFIG.MINIMAP_PADDING;
        const minimapScale = minimapSize / this.mapPixelSize;
        const gridCells = Math.max(1, Math.floor(this.mapTileSize / AREA_GRID_SIZE));
        const cellPx = minimapSize / gridCells;

        // ミニマップを右上に固定表示
        const minimapX = (this.scale?.width || this.cameras.main.width) - minimapSize - minimapPadding;
        const minimapY = minimapPadding;

        this.minimapGraphics = this.add.graphics();
        this.minimapGraphics.setScrollFactor(0);
        this.minimapGraphics.setDepth(GAME_CONFIG.DEPTH.MINIMAP_BG);
        if (this.cameras?.main) this.cameras.main.ignore(this.minimapGraphics);

        this.minimapGraphics.fillStyle(0x000000, 0.7);
        this.minimapGraphics.fillRect(minimapX, minimapY, minimapSize, minimapSize);

        // ミニマップの枠線
        this.minimapGraphics.lineStyle(2, 0xffffff, 1);
        this.minimapGraphics.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
        this.minimapGraphics.lineStyle(1, 0xffffff, 0.35);
        for (let i = 0; i <= gridCells; i++) {
            const x = minimapX + i * cellPx;
            const y = minimapY + i * cellPx;
            this.minimapGraphics.lineBetween(x, minimapY, x, minimapY + minimapSize);
            this.minimapGraphics.lineBetween(minimapX, y, minimapX + minimapSize, y);
        }

        this.minimapTexture = this.add.renderTexture(0, 0, minimapSize, minimapSize);
        this.minimapTexture.setOrigin(0, 0);
        this.minimapTexture.setPosition(minimapX, minimapY);
        this.minimapTexture.setScrollFactor(0);
        this.minimapTexture.setDepth(GAME_CONFIG.DEPTH.MINIMAP_TEXTURE);
        if (this.cameras?.main) this.cameras.main.ignore(this.minimapTexture);

        this.minimapPlayerMarker = this.add.graphics();
        this.minimapPlayerMarker.setScrollFactor(0);
        this.minimapPlayerMarker.setDepth(GAME_CONFIG.DEPTH.MINIMAP_MARKER);
        if (this.cameras?.main) this.cameras.main.ignore(this.minimapPlayerMarker);

        this.minimapConfig = {
            x: minimapX,
            y: minimapY,
            size: minimapSize,
            scale: minimapScale
        };

        this.drawOwnedAreasOnMinimap();

        this.updateMinimapPosition();
    }

    updateMinimapPosition() {
        if (!this.minimapConfig) return;
        const minimapSize = this.minimapConfig.size;
        const minimapPadding = GAME_CONFIG.MINIMAP_PADDING;
        const viewWidth = this.scale?.width || this.cameras.main.width;
        const minimapX = viewWidth - minimapSize - minimapPadding;
        const minimapY = minimapPadding;
        const visible = true;
        const gridCells = Math.max(1, Math.floor(this.mapTileSize / AREA_GRID_SIZE));
        const cellPx = minimapSize / gridCells;

        this.minimapConfig.x = minimapX;
        this.minimapConfig.y = minimapY;

        if (this.minimapGraphics) {
            this.minimapGraphics.clear();
            if (visible) {
                this.minimapGraphics.fillStyle(0x000000, 0.7);
                this.minimapGraphics.fillRect(minimapX, minimapY, minimapSize, minimapSize);
                this.minimapGraphics.lineStyle(2, 0xffffff, 1);
                this.minimapGraphics.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
                this.minimapGraphics.lineStyle(1, 0xffffff, 0.35);
                for (let i = 0; i <= gridCells; i++) {
                    const x = minimapX + i * cellPx;
                    const y = minimapY + i * cellPx;
                    this.minimapGraphics.lineBetween(x, minimapY, x, minimapY + minimapSize);
                    this.minimapGraphics.lineBetween(minimapX, y, minimapX + minimapSize, y);
                }
            }
        }
        if (this.minimapTexture) {
            this.minimapTexture.setPosition(minimapX, minimapY);
            this.minimapTexture.setVisible(visible);
        }
        if (this.minimapPlayerMarker) {
            this.minimapPlayerMarker.setPosition(0, 0);
            this.minimapPlayerMarker.setVisible(visible);
        }
    }

    drawOwnedAreasOnMinimap() {
        if (!this.minimapTexture || !this.minimapConfig) return;
        const minimapSize = this.minimapConfig.size;
        this.minimapTexture.clear();

        const graphics = this.add.graphics();
        const myId = this.playerInfo?.playFabId || null;
        const myNation = String(this.playerInfo?.nation || '').toLowerCase();
        const now = Date.now();
        const scale = this.minimapConfig.scale;
        const ownedColor = 0x4cc9f0;
        const capitalColor = 0xffd166;
        const dotSize = 3;
        const capitalSize = 4;
        this.islandObjects.forEach((island) => {
            if (!island) return;
            const centerX = island.x + (island.width / 2);
            const centerY = island.y + (island.height / 2);
            const mx = centerX * scale;
            const my = centerY * scale;
            if (island.occupationStatus === 'capital') {
                graphics.fillStyle(capitalColor, 0.9);
                graphics.fillRect(mx - capitalSize / 2, my - capitalSize / 2, capitalSize, capitalSize);
                return;
            }
            if (myId && island.ownerId === myId) {
                graphics.fillStyle(ownedColor, 0.85);
                graphics.fillRect(mx - dotSize / 2, my - dotSize / 2, dotSize, dotSize);
            }

            const captureState = this.getIslandCaptureState(island);
            const queue = Array.isArray(captureState?.queue) ? captureState.queue : [];
            if (queue.length > 0) {
                const leader = queue[0] || null;
                const leaderNation = String(leader?.nation || '').toLowerCase();
                const ownerNation = String(island?.nation || island?.Nation || '').toLowerCase();
                const isMyQueue = !!leader && (leader.playFabId === myId || (!!myNation && leaderNation === myNation));
                const isEnemyWarning = !isMyQueue;
                const pulse = 0.75 + (Math.sin(now / 180) * 0.2);
                const warningColor = isEnemyWarning
                    ? (ownerNation && ownerNation === myNation ? 0xff5d73 : 0xffa94d)
                    : (ownerNation && leaderNation && ownerNation === leaderNation ? 0x6dd3ff : 0x63e6be);
                const warningSize = isEnemyWarning ? 3.5 : 2.5;
                graphics.lineStyle(1, warningColor, Phaser.Math.Clamp(pulse, 0.45, 1));
                graphics.strokeCircle(mx, my, warningSize + 1.5);
                graphics.fillStyle(warningColor, Phaser.Math.Clamp(pulse, 0.55, 1));
                graphics.fillCircle(mx, my, warningSize);
            }
        });

        this.minimapTexture.draw(graphics, 0, 0);
        graphics.destroy();
    }

    getWorldMapCollectionName() {
        if (!this.mapId) return 'world_map';
        return `world_map_${this.mapId}`;
    }

    getMyGuildId() {
        if (typeof window === 'undefined') return null;
        return window.currentGuildId || null;
    }

    hasEnemyInView() {
        if (!this.playerShip) return false;
        const myGuildId = this.getMyGuildId();
        if (!myGuildId) return false;

        const cam = this.cameras?.main;
        const screenWidth = this.scale?.width || cam?.width || 0;
        const zoom = cam?.zoom || 1;
        const radius = (screenWidth / 2) / zoom;

        let found = false;
        this.otherShips.forEach((shipObject) => {
            if (found) return;
            const sprite = shipObject?.sprite;
            const data = shipObject?.data;
            const otherGuildId = data?.guildId;
            if (!sprite || !otherGuildId || otherGuildId === myGuildId) return;
            const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, sprite.x, sprite.y);
            if (dist <= radius) found = true;
        });

        return found;
    }

    updateZoomFromVisionRange() {
        const cam = this.cameras?.main;
        const visionRange = this.getEffectiveVisionRange();
        if (!cam || !Number.isFinite(visionRange) || visionRange <= 0) return;
        const screenWidth = this.scale?.width || cam.width;
        if (!Number.isFinite(screenWidth) || screenWidth <= 0) return;
        const idealZoom = screenWidth / (visionRange * 2);
        const zoom = Math.max(1, Math.floor(idealZoom));
        cam.setZoom(zoom);
        this.currentVisionRange = screenWidth / (zoom * 2);
    }

    getEffectiveVisionRange() {
        if (this.attackPrepUntil && Date.now() < this.attackPrepUntil) {
            const prepRange = Number(this.attackPrepVisionRange);
            if (Number.isFinite(prepRange) && prepRange > 0) return prepRange;
        }
        const base = Number.isFinite(Number(this.baseShipVisionRange))
            ? Number(this.baseShipVisionRange)
            : Number(this.shipVisionRange);
        const now = Date.now();
        const boostActive = now < this.shipActionVisionBoostUntil;
        const debuffActive = now < this.shipActionVisionDebuffUntil;
        const boostMultiplier = boostActive ? Number(this.shipActionVisionBoostMultiplier) || 1 : 1;
        const debuffMultiplier = debuffActive ? Number(this.shipActionVisionDebuffMultiplier) || 1 : 1;
        const adjusted = base * boostMultiplier * debuffMultiplier;
        if (this.isInOwnedArea) return adjusted;
        return Math.max(50, Math.floor(adjusted * OUTSIDE_VISION_MULTIPLIER));
    }

    getCurrentVisionRange() {
        const value = Number(this.currentVisionRange);
        if (Number.isFinite(value) && value > 0) return value;
        return this.getEffectiveVisionRange();
    }

    getIslandCenterPoint(islandData) {
        if (!islandData) return null;
        const layout = ISLAND_LAYOUTS[islandData.size] || ISLAND_LAYOUTS.small;
        const width = layout.width * this.TILE_SIZE;
        const height = layout.height * this.TILE_SIZE;
        const x = Number(islandData.x) + width / 2;
        const y = Number(islandData.y) + height / 2;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    getIslandAutoAttackConfig(islandData) {
        if (!islandData || !Array.isArray(islandData.buildings)) return null;
        const building = islandData.buildings.find(b => b && b.status === 'completed');
        const buildingId = building?.buildingId || building?.id || null;
        if (!buildingId) return null;
        return ISLAND_AUTO_ATTACK_CONFIG[buildingId] || null;
    }

    activateIslandAttackVision(rangeTiles) {
        const rangePx = Math.max(1, Number(rangeTiles) || 0) * this.TILE_SIZE;
        if (!Number.isFinite(rangePx) || rangePx <= 0) return;
        this.attackPrepVisionRange = rangePx;
        this.attackPrepUntil = Date.now() + ISLAND_ATTACK_PREP_DURATION_MS;
        if (this.attackPrepTimer) clearTimeout(this.attackPrepTimer);
        this.updateZoomFromVisionRange();
        this.attackPrepTimer = setTimeout(() => {
            this.attackPrepVisionRange = null;
            this.attackPrepUntil = 0;
            this.attackPrepTimer = null;
            this.updateZoomFromVisionRange();
        }, ISLAND_ATTACK_PREP_DURATION_MS);
    }

    getIslandAttackCooldownRemaining(islandId, config) {
        if (!islandId || !config) return 0;
        const cooldownMs = Number(config.cooldownMs) || 0;
        if (cooldownMs <= 0) return 0;
        const lastAt = Number(this.islandAttackCooldownById.get(islandId) || 0);
        const remaining = (lastAt + cooldownMs) - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    getNationKey() {
        const explicit = String(this.playerInfo?.nation || this.playerInfo?.Nation || '').toLowerCase();
        if (explicit && NATION_BOUNDS[explicit]) return explicit;
        const race = String(this.playerInfo?.race || '').toLowerCase();
        if (race === 'human') return 'fire';
        if (race === 'orc') return 'earth';
        if (race === 'elf') return 'wind';
        if (race === 'goblin') return 'water';
        return null;
    }

    getInitialSpawnPosition() {
        const pendingSide = this.consumePendingMapSpawn();
        if (pendingSide) {
            const pos = this.getEdgeSpawnPosition(pendingSide);
            this.pendingMapSpawnPos = pos;
            return pos;
        }
        const nation = this.getNationKey();
        const bounds = NATION_BOUNDS[nation];
        if (!bounds) return { x: 400, y: 300 };
        const center = getNationCenterTile(bounds);
        const x = (center.x + 0.5) * this.gridSize;
        const y = (center.y + 0.5) * this.gridSize;
        return {
            x: Phaser.Math.Clamp(x, 0, this.mapPixelSize),
            y: Phaser.Math.Clamp(y, 0, this.mapPixelSize)
        };
    }

    consumePendingMapSpawn() {
        if (typeof window === 'undefined') return null;
        const pending = window.__pendingMapSpawn;
        if (!pending || !pending.mapId || pending.mapId !== this.mapId) return null;
        window.__pendingMapSpawn = null;
        return pending.side || null;
    }

    getEdgeSpawnPosition(side) {
        const marginTiles = 2;
        const minTile = marginTiles;
        const maxTile = Math.max(minTile, this.mapTileSize - 1 - marginTiles);
        const pick = () => Phaser.Math.Between(minTile, maxTile);
        let tileX = pick();
        let tileY = pick();
        switch (side) {
            case 'north':
                tileY = minTile;
                break;
            case 'south':
                tileY = maxTile;
                break;
            case 'east':
                tileX = maxTile;
                break;
            case 'west':
                tileX = minTile;
                break;
            default:
                break;
        }
        const x = (tileX + 0.5) * this.gridSize;
        const y = (tileY + 0.5) * this.gridSize;
        return {
            x: Phaser.Math.Clamp(x, 0, this.mapPixelSize),
            y: Phaser.Math.Clamp(y, 0, this.mapPixelSize)
        };
    }

    isMapOwnedByPlayer() {
        const playerNation = String(this.playerInfo?.nation || '').toLowerCase();
        const occupiedNation = String(this.mapOccupationNation || '').toLowerCase();
        if (!occupiedNation) return true;
        return !!playerNation && playerNation === occupiedNation;
    }

    isIslandInOwnedArea(_islandData) {
        return this.isMapOwnedByPlayer();
    }

    async loadMapOccupation() {
        if (!this.mapId) return;
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/get-map-occupation') : '/api/get-map-occupation'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapId: this.mapId })
            });
            if (!res.ok) return;
            const data = await res.json();
            this.mapOccupationNation = data?.nation ? String(data.nation).toLowerCase() : null;
            this.updateAreaControlState();
        } catch (error) {
            console.warn('[MapOccupation] Failed to load:', error);
        }
    }

    updateAreaControlState() {
        const owned = this.isMapOwnedByPlayer();
        if (owned !== this.isInOwnedArea) {
            this.isInOwnedArea = owned;
            this.updateZoomFromVisionRange();
        }
    }

    createIsland(data) {
        const layoutData = ISLAND_LAYOUTS[data.size] || ISLAND_LAYOUTS.small;
        const layout = layoutData.tiles;
        const islandWidth = layoutData.width * this.TILE_SIZE;
        const islandHeight = layoutData.height * this.TILE_SIZE;

        const islandSprites = [];
        const islandTileMap = new Map();
        const islandPhysicsGroup = this.physics.add.staticGroup();

        for (let row = 0; row < layout.length; row++) {
            for (let col = 0; col < layout[row].length; col++) {
                const tileIndex = layout[row][col];
                if (tileIndex !== null) {
                    const tileX = data.x + col * this.TILE_SIZE;
                    const tileY = data.y + row * this.TILE_SIZE;

                    const isInnerRow = (row > 0 && row < layoutData.height - 1);
                    const isInnerCol = (col > 0 && col < layoutData.width - 1);
                    const hasCollision = (isInnerRow && isInnerCol);

                    if (hasCollision) {
                        const tile = this.physics.add.staticSprite(tileX, tileY, 'map_tiles', tileIndex);
                        tile.setOrigin(0, 0);
                        tile.setDepth(GAME_CONFIG.DEPTH.ISLAND);
                        this.ignoreOnUiCamera(tile);
                        tile.body.setSize(this.TILE_SIZE, this.TILE_SIZE);
                        tile.body.setOffset(0, 0);
                        tile.refreshBody();
                        tile.__islandTile = true;
                        tile.__tileRow = row;
                        tile.__tileCol = col;
                        islandTileMap.set(`${col},${row}`, tile);
                        islandSprites.push(tile);
                        islandPhysicsGroup.add(tile);
                    } else {
                        const tile = this.add.sprite(tileX, tileY, 'map_tiles', tileIndex).setOrigin(0, 0);
                        tile.setDepth(GAME_CONFIG.DEPTH.ISLAND);
                        tile.__islandTile = true;
                        tile.__tileRow = row;
                        tile.__tileCol = col;
                        islandTileMap.set(`${col},${row}`, tile);
                        islandSprites.push(tile);
                    }
                }
            }
        }

        let biomeFrame = (data.biomeFrame !== null && data.biomeFrame !== undefined)
            ? Number(data.biomeFrame)
            : null;
        if (!Number.isFinite(biomeFrame)) {
            const biomeId = normalizeBiomeId(data.biome);
            biomeFrame = biomeId ? BIOME_FRAME_BY_ID[biomeId] : null;
        }
        if (biomeFrame !== null && biomeFrame !== undefined) {
            if (!Number.isFinite(biomeFrame)) return;
            const iconX = data.x + (islandWidth / 2);
            const iconY = data.y + (islandHeight / 2);
            const icon = this.add.sprite(iconX, iconY, 'building_tiles', biomeFrame).setOrigin(0.5, 0.5);
            icon.setDepth(GAME_CONFIG.DEPTH.BUILDING);
            islandSprites.push(icon);
        }

        const resolveSlotDims = (layout) => {
            switch (layout) {
                case '1x1': return { width: 1, height: 1 };
                case '1x2': return { width: 2, height: 1 };
                case '2x2': return { width: 2, height: 2 };
                case '3x3': return { width: 3, height: 3 };
                default: return null;
            }
        };

        const slotDimsFromDoc = resolveSlotDims(data.buildingSlots?.layout);
        const slotGridWidth = (slotDimsFromDoc?.width || layoutData.slots.width);
        const slotGridHeight = (slotDimsFromDoc?.height || layoutData.slots.height);
        const slotGrid = Array(slotGridHeight).fill(null).map(() => Array(slotGridWidth).fill(false));

        const computeBuildingRenderSlotX = (logicWidth, visualWidth, slotX) => {
            const lw = Math.max(1, Number(logicWidth) || 1);
            const vw = Math.max(1, Number(visualWidth) || lw);
            const deltaX = Math.max(0, vw - lw);
            const leftOverflowX = Math.floor(deltaX / 2); // 偶数:左右同じ / 奇数:右が+1
            return slotX - leftOverflowX;
        };

        const buildingSprites = [];
        if (data.buildings && Array.isArray(data.buildings)) {
            const activeBuildings = data.buildings.filter(b => b && b.status === 'completed');
            const buildingsToRender = activeBuildings.length > 0 ? [activeBuildings[0]] : [];
            buildingsToRender.forEach(building => {
                const buildingId = building.buildingId || building.id || null;
                const baseTileIndex = (typeof building.tileIndex === 'number') ? building.tileIndex : 17;

                const bWidth = (building.width || 1);
                const bHeight = (building.height || 1);
                const vWidth = (building.visualWidth || bWidth);
                const vHeight = (building.visualHeight || bHeight);
                const buildingMeta = buildingId ? getBuildingMeta(buildingId) : BUILDING_META_DEFAULT;
                const nation = data?.nation;
                let buildingLevel = Number(building.level);
                if (!Number.isFinite(buildingLevel)) {
                    const match = String(buildingId || '').match(/_lv(\d+)$/i);
                    buildingLevel = match ? Number(match[1]) : 1;
                }
                const disableNationOffset = String(buildingId || '').startsWith('my_house') && buildingLevel <= 1;
                const nationOffset = (!disableNationOffset && buildingMeta?.nationTileOffset === true)
                    ? getNationTileOffset(nation, vWidth)
                    : 0;
                const tileIndex = baseTileIndex + nationOffset;

                let slotX = building.x;
                let slotY = building.y;
                if ((slotX == null || slotY == null) && typeof building.slotIndex === 'number') {
                    // slotIndex は「左下=0」のインデックスとする（bottom-left indexing）
                    // slotGrid は上が 0 行目なので、建物の論理サイズ(bHeight)ぶん上に伸びるよう top-left 行へ変換する。
                    const index = building.slotIndex;
                    slotX = index % slotGridWidth;
                    const bottomRowFromTop = (slotGridHeight - 1) - Math.floor(index / slotGridWidth);
                    slotY = bottomRowFromTop - (bHeight - 1);
                }
                if (slotX == null || slotY == null) {
                    slotX = Math.max(0, Math.floor((slotGridWidth - bWidth) / 2));
                    slotY = Math.max(0, Math.floor((slotGridHeight - bHeight) / 2));
                }

                if (typeof slotX !== 'number' || typeof slotY !== 'number') {
                    console.warn(`[WorldMapScene] Skipping building with no slot coords:`, building);
                    return;
                }

                let canPlace = true;
                for (let y = 0; y < bHeight; y++) {
                    for (let x = 0; x < bWidth; x++) {
                        if (slotY + y >= slotGrid.length || slotX + x >= slotGrid[0].length || slotGrid[slotY + y][slotX + x]) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (!canPlace) break;
                }

                if (canPlace) {
                    for (let y = 0; y < bHeight; y++) {
                        for (let x = 0; x < bWidth; x++) {
                            slotGrid[slotY + y][slotX + x] = true;
                        }
                    }

                    const renderSlotX = computeBuildingRenderSlotX(bWidth, vWidth, slotX);
                    const buildingX = data.x + (layoutData.slots.offsetX + renderSlotX) * this.TILE_SIZE;
                    const buildingY = data.y + (layoutData.slots.offsetY + slotY) * this.TILE_SIZE;
                    const baseX = buildingX;
                    const baseY = buildingY + (bHeight * this.TILE_SIZE);

                    if (buildingMeta?.clearGroundTiles) {
                        const startCol = layoutData.slots.offsetX + renderSlotX;
                        const baseRow = layoutData.slots.offsetY + slotY + (bHeight - 1);
                        for (let dy = 0; dy < vHeight; dy++) {
                            const row = baseRow - dy;
                            for (let dx = 0; dx < vWidth; dx++) {
                                const col = startCol + dx;
                                if (row < 0 || col < 0 || row >= layoutData.height || col >= layoutData.width) continue;
                                const tile = islandTileMap.get(`${col},${row}`);
                                if (tile) {
                                    tile.setAlpha(0);
                                    tile.__hiddenByBuilding = buildingId || true;
                                }
                            }
                        }
                    }

                    if (vWidth > 1 || vHeight > 1) {
                        const sheetCols = 32;
                        for (let dy = 0; dy < vHeight; dy++) {
                            for (let dx = 0; dx < vWidth; dx++) {
                                const frameIndex = tileIndex + dx - (dy * sheetCols);
                                const tileX = buildingX + (dx * this.TILE_SIZE);
                                const tileY = buildingY + (bHeight * this.TILE_SIZE) - (dy * this.TILE_SIZE);
                                const tileSprite = this.add.sprite(tileX, tileY, 'building_tiles', frameIndex).setOrigin(0, 1);
                                tileSprite.setDepth(GAME_CONFIG.DEPTH.BUILDING);
                                tileSprite.__logicSize = { x: bWidth, y: bHeight };
                                tileSprite.__visualSize = { x: vWidth, y: vHeight };
                                buildingSprites.push(tileSprite);
                            }
                        }
                    } else {
                        const buildingSprite = this.add.sprite(buildingX, buildingY + (bHeight * this.TILE_SIZE), 'building_tiles', tileIndex).setOrigin(0, 1);
                        buildingSprite.setDepth(GAME_CONFIG.DEPTH.BUILDING);
                        this.ignoreOnUiCamera(buildingSprite);
                        buildingSprite.__logicSize = { x: bWidth, y: bHeight };
                        buildingSprite.__visualSize = { x: vWidth, y: vHeight };
                        buildingSprites.push(buildingSprite);
                    }

                    const ownerNation = data.ownerNation || data.ownerRace;
                    const maxHp = Number.isFinite(Number(building.maxHp))
                        ? Number(building.maxHp)
                        : Math.max(1, bWidth * bHeight * 100);
                    const currentHp = Number.isFinite(Number(building.currentHp))
                        ? Math.max(0, Number(building.currentHp))
                        : maxHp;
                    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0;
                    const barWidth = vWidth * this.TILE_SIZE;
                    const barHeight = 4;
                    const barX = baseX;
                    const barY = baseY + 4;

                    const hpBar = this.add.graphics();
                    const ownerColor = this.getNationColor(ownerNation);
                    hpBar.fillStyle(0x000000, 0.6);
                    hpBar.fillRect(barX, barY, barWidth, barHeight);
                    hpBar.fillStyle(ownerColor, 0.9);
                    hpBar.fillRect(barX + 1, barY + 1, Math.max(0, (barWidth - 2) * ratio), Math.max(1, barHeight - 2));
                    hpBar.setDepth(GAME_CONFIG.DEPTH.BUILDING - 1);
                    this.ignoreOnUiCamera(hpBar);
                    buildingSprites.push(hpBar);

                    // アイコン重ね描画は廃止
                } else {
                    console.warn(`建物の配置に失敗しました: 島「${data.name}」のスロット(${slotX}, ${slotY})には配置できません。`);
                }
            });
        }

        const ownerNation = data.ownerNation || data.ownerRace;
        const nameColor = this.getNationColor(ownerNation);
        const nameText = this.add.text(data.x + islandWidth / 2, data.y + islandHeight + 10, data.name, {
            fontSize: '14px',
            fill: `#${nameColor.toString(16).padStart(6, '0')}`,
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        nameText.setDepth(GAME_CONFIG.DEPTH.NAME_TEXT);
        this.ignoreOnUiCamera(nameText);

        const interactiveZone = this.add.zone(data.x, data.y, islandWidth, islandHeight).setOrigin(0, 0);
        this.ignoreOnUiCamera(interactiveZone);
        interactiveZone.setDepth(GAME_CONFIG.DEPTH.INTERACTIVE_ZONE);
        interactiveZone.setInteractive();
        interactiveZone.on('pointerup', async () => {
            console.log(`[Island] 島クリック: ${data.name}`);

            if (this.isIslandPassActive()) {
                this.showMessage('島の上を通過中です。');
                return;
            }

            const dockBuffer = this.isAirDomain(this.playerShipDomain) ? 0 : this.TILE_SIZE * 0.4;
            const currentIsland = this.getCurrentIslandUnderPlayer(dockBuffer);
            const isDockedIsland =
                (this.collidingIsland && this.collidingIsland.id === islandData.id) ||
                (currentIsland && currentIsland.id === islandData.id);

            if (isDockedIsland) {
                this.collidingIsland = islandData;
                const tutorial = (typeof window !== 'undefined') ? window.__tutorialFirstIsland : null;
                if (tutorial?.stage === 'arrived' && tutorial?.islandId === islandData.id) {
                    await this.openBuildingMenuForIsland(islandData);
                    return;
                }
                this.showIslandCommandMenu(islandData);
            } else {
                this.moveShipTo(data.x + islandWidth / 2, data.y + islandHeight / 2, islandData);
            }
        });

        const islandData = {
            id: data.id,
            x: data.x,
            y: data.y,
            mapId: data.mapId || this.mapId,
            width: islandWidth,
            height: islandHeight,
            name: data.name,
            size: data.size || 'small',
            type: data.type,
            ownerNation: ownerNation,
            ownerId: data.ownerId,
            biome: data.biome,
            buildings: Array.isArray(data.buildings) ? data.buildings : [],
            occupationStatus: data.occupationStatus || null,
            captureState: data.captureState || null,
            sprites: islandSprites,
            buildingSprites: buildingSprites,
            nameText: nameText,
            interactiveZone: interactiveZone,
            physicsGroup: islandPhysicsGroup
        };

        if (this.playerShip) {
            const collider = this.physics.add.collider(this.playerShip, islandPhysicsGroup, () => {
                if (this.isIslandPassActive()) {
                    return;
                }
                if (!this.isAirDomain(this.playerShipDomain) && this.shipMoving) {
                    this.stopShipMovement();
                    this.canMove = true;
                }

                if (!this.collidingIsland) {
                    this.collidingIsland = islandData;
                    this.showMessage(`${islandData.name}に到着しました。`);
                    this.showIslandCommandMenu(islandData);
                }
            });
            islandData.collider = collider;
        }

        this.islandObjects.set(data.id, islandData);
    }

    getRaceColor(raceId) {
        return RACE_COLORS[raceId] || 0x808080;
    }

    getNationColor(nation) {
        const key = String(nation || '').toLowerCase();
        return NATION_COLORS[key] ?? 0x808080;
    }

    /**
     *
     *
     *
     *
     *
     * @param {Object} rect - 遏ｩ蠖｢ {x, y, width, height}
     *
     */
    lineIntersectsRect(x1, y1, x2, y2, rect) {
        const left = rect.x;
        const right = rect.x + rect.width;
        const top = rect.y;
        const bottom = rect.y + rect.height;

        if ((x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
            (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)) {
            return true;
        }

        return this.lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||    // 上辺
               this.lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom) || // 右辺
               this.lineIntersectsLine(x1, y1, x2, y2, left, bottom, right, bottom) || // 下辺
               this.lineIntersectsLine(x1, y1, x2, y2, left, top, left, bottom);      // 左辺
    }

    /**
     *
     * @param {number} x1, y1, x2, y2 - 線分1
     * @param {number} x3, y3, x4, y4 - 線分2
     *
     */
    lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));
        if (denom === 0) return false; // 平行

        const ua = (((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3))) / denom;
        const ub = (((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3))) / denom;

        return (ua >= 0 && ua <= 1) && (ub >= 0 && ub <= 1);
    }

    showMessage(message) {
        if (!this.messageText) return;

        this.messageText.setText(message);
        this.messageText.setVisible(true);

        if (this.messageTimer) {
            this.messageTimer.remove();
        }

        this.messageTimer = this.time.delayedCall(GAME_CONFIG.MESSAGE_DISPLAY_DURATION, () => {
            this.messageText.setVisible(false);
        });
    }

    isPointerInsideVisionArea(pointer) {
        if (!pointer || !this.cameras || !this.cameras.main) return false;
        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;
        const centerX = screenWidth / 2;
        const centerY = screenHeight / 2;
        const visionPx = screenWidth / 2;
        const dx = pointer.x - centerX;
        const dy = pointer.y - centerY;
        return (dx * dx + dy * dy) <= (visionPx * visionPx);
    }

    /**
     *
     *
     */
    showError(message) {
        const errorText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            message,
            {
                fontSize: '16px',
                fill: '#ff0000',
                backgroundColor: '#000000',
                padding: { x: 20, y: 10 },
                align: 'center'
            }
        );
        errorText.setOrigin(0.5);
        errorText.setScrollFactor(0);
        errorText.setDepth(GAME_CONFIG.DEPTH.MESSAGE + 1);
    }

    async autoDisembarkPassengersWithoutMp(durationMs, fallbackX, fallbackY) {
        if (!this.firestore || !this.playerInfo?.playFabId || !Number.isFinite(durationMs) || durationMs <= 0) {
            return { droppedCount: 0, droppedNames: [] };
        }

        try {
            const rideQuery = query(
                collection(this.firestore, 'ships'),
                where('ridingOwnerId', '==', this.playerInfo.playFabId)
            );
            const snapshot = await getDocs(rideQuery);
            if (!snapshot || snapshot.empty) {
                return { droppedCount: 0, droppedNames: [] };
            }

            const droppedNames = [];
            for (const passengerDoc of snapshot.docs) {
                const data = passengerDoc.data() || {};
                const passengerId = String(data.playFabId || passengerDoc.id || '').trim();
                if (!passengerId) continue;

                let voyageResult = null;
                try {
                    voyageResult = await requestConsumeVoyageMp(passengerId, durationMs, { isSilent: true });
                } catch (error) {
                    console.warn('[Ride] Failed to consume passenger voyage MP:', passengerId, error);
                    voyageResult = null;
                }

                if (voyageResult && String(voyageResult.status || '') !== 'blocked') {
                    continue;
                }

                await setDoc(doc(this.firestore, 'ships', passengerDoc.id), {
                    ridingShipId: null,
                    ridingOwnerId: null,
                    ridingSince: null,
                    currentX: fallbackX,
                    currentY: fallbackY,
                    targetX: fallbackX,
                    targetY: fallbackY,
                    arrivalTime: null,
                    position: { x: fallbackX, y: fallbackY },
                    movement: {
                        isMoving: false,
                        departureTime: null,
                        arrivalTime: null,
                        departurePos: { x: fallbackX, y: fallbackY },
                        destinationPos: { x: fallbackX, y: fallbackY }
                    },
                    updatedAt: serverTimestamp()
                }, { merge: true });

                const displayName = String(data.displayName || passengerId).trim();
                droppedNames.push(displayName || passengerId);
            }

            return {
                droppedCount: droppedNames.length,
                droppedNames
            };
        } catch (error) {
            console.warn('[Ride] Failed to prepare passengers for voyage:', error);
            return { droppedCount: 0, droppedNames: [] };
        }
    }

    async moveShipTo(x, y, targetIsland, options = {}) {
        console.log('[moveShipTo] Called with x:', x, 'y:', y, 'targetIsland:', targetIsland);
        this.hideBoardingButton();

        const startX = this.playerShip.x;
        const startY = this.playerShip.y;
        const now = Date.now();

        if (now < this.shipActionMoveLockUntil) {
            this.showMessage('拘束されて動けない...');
            return;
        }
        if (this.shipRepairUntil && now < this.shipRepairUntil) {
            const remain = Math.max(1, Math.ceil((this.shipRepairUntil - now) / 1000));
            this.showMessage(`修復中... 残り${remain}秒`);
            return;
        }

        if (this.shipMoving || this.shipMovePending || !this.canMove) {
            this.showMessage(this.shipMoving || this.shipMovePending ? '移動中です。' : (!this.canMove ? '移動クールダウン中です。' : '遠すぎて移動できません。'));
            return;
        }

        if (this.collidingIsland && (!targetIsland || targetIsland.id !== this.collidingIsland.id)) {
            if (this.isPlayerInIslandCapture(this.collidingIsland)) {
                this.clearIslandCommandTimers(true);
                void this.startIslandCaptureFlow(this.collidingIsland, 'cancel', { silent: true });
            }
            void this.leaveCapitalCaptureSilently(this.collidingIsland);
        }

        this.hideIslandCommandMenu();

        const distance = Phaser.Math.Distance.Between(startX, startY, x, y);
        const speed = this.getEffectiveShipSpeed();
        const duration = (distance / speed) * 1000;
        if (!options?.skipMpCost && this.playerInfo?.playFabId) {
            this.shipMovePending = true;
            try {
                const voyageResult = await Player.consumeVoyageMp(this.playerInfo.playFabId, duration);
                if (!voyageResult) {
                    this.showMessage('航海準備に失敗した...');
                    return;
                }
                if (voyageResult.status === 'blocked') {
                    this.showMessage(voyageResult.error || '長距離航海にはMPが足りない...');
                    return;
                }
                const passengerPrep = await this.autoDisembarkPassengersWithoutMp(duration, startX, startY);
                if (passengerPrep.droppedCount > 0) {
                    if (passengerPrep.droppedNames.length === 1) {
                        this.showMessage(`${passengerPrep.droppedNames[0]}はMP不足で自動下船した。`);
                    } else if (passengerPrep.droppedNames.length === 2) {
                        this.showMessage(`${passengerPrep.droppedNames[0]}、${passengerPrep.droppedNames[1]}はMP不足で自動下船した。`);
                    } else {
                        this.showMessage(`${passengerPrep.droppedNames[0]} ほか${passengerPrep.droppedCount - 1}人はMP不足で自動下船した。`);
                    }
                } else if (Number(voyageResult.voyageCost || 0) > 0 && voyageResult.message) {
                    this.showMessage(voyageResult.message);
                }
            } finally {
                this.shipMovePending = false;
            }
        }
        this.stopDockedMpRecoveryTimer();
        this.updateMyShipPosition(x, y);

        const animKey = this.getShipAnimKey(startX, startY, x, y);
        const shipTypeKey = this.playerShip.shipTypeKey;
        if (shipTypeKey) {
            const fullAnimKey = animKey + shipTypeKey;
            if (this.anims.exists(fullAnimKey)) {
                this.playerShip.anims.play(fullAnimKey, true);
                this.playerShip.lastAnimKey = animKey;
            } else {
                console.warn(`Animation key ${fullAnimKey} not found.`);
            }
        }

        this.canMove = false;
        this.shipMoving = true;
        this.shipTargetX = x;
        this.shipTargetY = y;
        this.shipTargetIsland = targetIsland;

        const angleRad = Phaser.Math.Angle.Between(startX, startY, x, y);
        this.physics.velocityFromAngle(Phaser.Math.RadToDeg(angleRad), speed, this.playerShip.body.velocity);

        this.shipArrivalTimer = this.time.delayedCall(duration, () => {
            if (this.shipMoving) this.onShipArrived();
        });
    }

    forceMoveTo(x, y) {
        if (!this.playerShip) return;
        if (this.shipMoving) {
            this.stopShipMovement();
        }
        this.canMove = true;
        this.moveShipTo(x, y, null, { skipMpCost: true });
    }

    onShipArrived() {
        this.shipMoving = false;
        this.playerShip.body.setVelocity(0, 0);

        this.stopShipAnimation();
        this.updateMyShipStoppedPosition();

        if (this.shipTargetIsland) {
            this.collidingIsland = this.shipTargetIsland;
            if (!this.commandMenuOpen) {
                this.showIslandCommandMenu(this.shipTargetIsland);
            }
            this.startDockedMpRecoveryForIsland(this.shipTargetIsland);
        } else {
            this.stopDockedMpRecoveryTimer();
        }

        if (this.hasEnemyInView()) {
            this.time.delayedCall(this.moveCooldown, () => {
                this.canMove = true;
            });
        } else {
            this.canMove = true;
        }
    }

    stopDockedMpRecoveryTimer() {
        if (this.shipDockRecoveryTimer) {
            this.shipDockRecoveryTimer.remove(false);
            this.shipDockRecoveryTimer = null;
        }
        this.shipDockRecoveryBusy = false;
        this.shipDockRecoveryIslandId = null;
    }

    getActiveIslandBuildingIdsForDock(islandData) {
        if (!Array.isArray(islandData?.buildings)) return [];
        return islandData.buildings
            .filter((building) => building && building.status !== 'demolished')
            .map((building) => String(building.itemId || building.id || '').trim().toLowerCase())
            .filter(Boolean);
    }

    isDockRecoveryIsland(islandData) {
        if (!islandData || !this.playerInfo?.playFabId) return false;
        const activeIds = this.getActiveIslandBuildingIdsForDock(islandData);
        if (activeIds.length === 0) return false;

        const myPlayFabId = String(this.playerInfo.playFabId || '').trim();
        const playerNation = String(this.playerInfo?.nation || '').toLowerCase();
        const islandOwnerId = String(islandData.ownerId || '').trim();
        const islandNation = String(islandData.ownerNation || islandData.nation || '').toLowerCase();
        const isOwner = !!myPlayFabId && islandOwnerId === myPlayFabId;
        const isFriendlyNation = !!playerNation && !!islandNation && islandNation === playerNation;

        const hasMyHome = activeIds.some((id) => id.startsWith('my_house'));
        if (hasMyHome && isOwner) return true;

        const hasPort = activeIds.includes('shipyard') || activeIds.includes('repair_dock');
        return hasPort && (isOwner || isFriendlyNation);
    }

    async tryRecoverDockedMp(islandData) {
        if (!this.playerInfo?.playFabId || this.shipDockRecoveryBusy) return;
        const currentIsland = this.collidingIsland || islandData;
        if (!currentIsland || !islandData || currentIsland.id !== islandData.id) return;
        if (this.shipMoving || !this.isDockRecoveryIsland(currentIsland)) return;

        this.shipDockRecoveryBusy = true;
        try {
            const result = await Player.recoverDockedMp(this.playerInfo.playFabId);
            if (result?.status === 'ok' && Number(result.recovered || 0) > 0 && result.message) {
                this.showMessage(result.message);
            }
        } catch (error) {
            console.error('[dock-mp-recovery] Failed:', error);
        } finally {
            this.shipDockRecoveryBusy = false;
        }
    }

    startDockedMpRecoveryForIsland(islandData) {
        this.stopDockedMpRecoveryTimer();
        if (!islandData || !this.isDockRecoveryIsland(islandData)) return;

        this.shipDockRecoveryIslandId = islandData.id;
        void this.tryRecoverDockedMp(islandData);
        this.shipDockRecoveryTimer = this.time.addEvent({
            delay: 30 * 1000,
            loop: true,
            callback: () => {
                const currentIsland = this.collidingIsland || islandData;
                if (!currentIsland || currentIsland.id !== islandData.id || !this.isDockRecoveryIsland(currentIsland)) {
                    this.stopDockedMpRecoveryTimer();
                    return;
                }
                void this.tryRecoverDockedMp(currentIsland);
            }
        });
    }

    stopShipAnimation() {
        this.playerShip.anims.stop();
        const shipTypeKey = this.playerShip.shipTypeKey;
        const lastAnimKey = this.playerShip.lastAnimKey || 'ship_down';

        if (shipTypeKey && this.shipAnims[shipTypeKey]) {
            const idleFrame = this.shipAnims[shipTypeKey].idleFrames[lastAnimKey];
            if (idleFrame !== undefined) {
                this.playerShip.setFrame(idleFrame);
            }
        } else {
            this.playerShip.setFrame(1); // Fallback
        }
    }

    // 方向ごとのフレーム帯: down 0..2 / left 21..23 / right 42..44 / up 63..65
    getGuildShipFrame(directionKey, frameIndex, layerKey, colorKey) {
        const cols = this.guildShipSheetCols ?? 21;
        const dirMap = { down: 0, left: 1, right: 2, up: 3 };
        const dirIndex = dirMap[directionKey] ?? 0;
        const colBase = this.guildShipColorOffsets?.[colorKey] ?? 0;

        const blockMap = { top: 0, middle: 4, bottom: 8 };
        const blockRowStart = blockMap[layerKey] ?? 0;
        const row = blockRowStart + dirIndex;

        return row * cols + colBase + frameIndex;
    }

    createGuildShipVisual(x, y, sailColorKey = 'white') {
        const container = this.add.container(x, y);
        container.setDepth(GAME_CONFIG.DEPTH.SHIP);

        const ship = this.add.sprite(0, 0, 'guild_ship_sprite', this.getGuildShipFrame('down', 1, 'top', 'white'));
        const sailTop = this.add.sprite(0, 0, 'guild_ship_sprite', this.getGuildShipFrame('down', 1, 'top', sailColorKey));
        const sailMiddle = this.add.sprite(0, 0, 'guild_ship_sprite', this.getGuildShipFrame('down', 1, 'middle', sailColorKey));
        const sailBottom = this.add.sprite(0, 0, 'guild_ship_sprite', this.getGuildShipFrame('down', 1, 'bottom', sailColorKey));

        sailTop.setVisible(sailColorKey !== 'white');

        container.add([ship, sailBottom, sailMiddle, sailTop]);

        return {
            container,
            ship,
            sailTop,
            sailMiddle,
            sailBottom,
            sailColorKey,
            directionKey: 'down',
            frameIndex: 1
        };
    }

    setGuildShipVisualFrame(visual, directionKey, frameIndex) {
        if (!visual) return;
        const color = visual.sailColorKey ?? 'white';
        visual.directionKey = directionKey;
        visual.frameIndex = frameIndex;

        visual.ship.setFrame(this.getGuildShipFrame(directionKey, frameIndex, 'top', 'white'));
        visual.sailTop.setFrame(this.getGuildShipFrame(directionKey, frameIndex, 'top', color));
        visual.sailMiddle.setFrame(this.getGuildShipFrame(directionKey, frameIndex, 'middle', color));
        visual.sailBottom.setFrame(this.getGuildShipFrame(directionKey, frameIndex, 'bottom', color));
        visual.sailTop.setVisible(color !== 'white');
    }

    setGuildShipVisualColor(visual, sailColorKey) {
        if (!visual) return;
        visual.sailColorKey = sailColorKey;
        this.setGuildShipVisualFrame(visual, visual.directionKey ?? 'down', visual.frameIndex ?? 1);
    }

    createBoardingButton() {
        if (!LEGACY_BOARDING_BATTLE_ENABLED) return;
        const camera = this.cameras.main;
        const width = 240;
        const height = 44;
        const x = camera.width / 2;
        const yHidden = camera.height + height;

        const bg = this.add.rectangle(0, 0, width, height, 0x111827, 0.95);
        bg.setStrokeStyle(2, 0xffffff, 0.25);

        const label = this.add.text(0, 0, '乗り込み', {
            fontSize: '16px',
            color: '#ffffff'
        }).setOrigin(0.5);

        const container = this.add.container(x, yHidden, [bg, label]);
        container.setScrollFactor(0);
        container.setDepth(GAME_CONFIG.DEPTH.MESSAGE + 5);
        container.setSize(width, height);
        container.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);

        container.on('pointerup', () => {
            if (!this.boardingTargetId) return;
            const restriction = this.getBoardingRestriction(this.boardingTargetId);
            if (restriction?.blocked) {
                this.showMessage(restriction.message);
                return;
            }
            if (typeof window !== 'undefined' && typeof window.startBattleWithOpponent === 'function') {
                window.startBattleWithOpponent(this.boardingTargetId);
                this.hideBoardingButton();
            } else {
                console.warn('[Boarding] Battle system not ready: window.startBattleWithOpponent not found');
            }
        });

        this.boardingButton = { container, label, yHidden, yShown: camera.height - 60 };
        this.boardingVisible = false;
        container.setVisible(false);
    }

    setupShipActionUi() {
        if (typeof document === 'undefined') return;
        const panel = document.getElementById('shipActionPanel');
        const button = document.getElementById('shipActionButton');
        const status = document.getElementById('shipActionStatus');
        if (!panel || !button || !status) return;

        this.shipActionButton = button;
        this.shipActionStatus = status;
        const bar = document.getElementById('mapActionBar');
        let resourceStatus = document.getElementById('shipCombatResourceStatus');
        if (!resourceStatus) {
            resourceStatus = document.createElement('div');
            resourceStatus.className = 'ship-combat-resource-status';
            if (bar) {
                bar.prepend(resourceStatus);
            } else {
                panel.prepend(resourceStatus);
            }
        }
        this.shipCombatResourceStatus = resourceStatus;
        button.addEventListener('click', () => this.triggerShipAction());
        this.registerShipCombatResourceRefreshTriggers();
        this.requestShipCombatResourceStorage(true);
        this.updateShipCombatResourceHud();
        this.updateMapActionBarLayout();
        this.updateShipActionUi(true);
    }

    normalizeShipCombatResourceStorage(data = null) {
        const source = data || {};
        const normalizeMap = (map) => {
            const result = {};
            ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'].forEach((code) => {
                result[code] = Math.max(0, Math.trunc(Number(map?.[code] || 0)));
            });
            return result;
        };
        return {
            activeShipId: source.activeShipId || null,
            cargoResources: normalizeMap(source.cargoResources),
            cargoCapacity: Math.max(0, Math.trunc(Number(source.cargoCapacity || 0))),
            cargoUsed: Math.max(0, Math.trunc(Number(source.cargoUsed || 0)))
        };
    }

    sumShipCombatResourceMap(map = null) {
        return ['RR', 'RG', 'RY', 'RB', 'RT', 'RS']
            .reduce((sum, code) => sum + Math.max(0, Math.trunc(Number(map?.[code] || 0))), 0);
    }

    setShipCombatResourceStorage(data = null) {
        const source = (data && typeof data === 'object') ? data : {};
        const prev = this.normalizeShipCombatResourceStorage(this.shipCombatResourceStorage);
        const hasProp = (key) => Object.prototype.hasOwnProperty.call(source, key);
        const next = this.normalizeShipCombatResourceStorage({
            activeShipId: hasProp('activeShipId') ? source.activeShipId : prev.activeShipId,
            cargoResources: hasProp('cargoResources') ? source.cargoResources : prev.cargoResources,
            cargoCapacity: hasProp('cargoCapacity') ? source.cargoCapacity : prev.cargoCapacity,
            cargoUsed: hasProp('cargoUsed')
                ? source.cargoUsed
                : (hasProp('cargoResources') ? this.sumShipCombatResourceMap(source.cargoResources) : prev.cargoUsed)
        });
        this.shipCombatResourceStorage = next;
        this.updateShipCombatResourceHud();
        this.updateShipActionUi(true);
        this.updateShipSideCannonUi(true);
        this.updateShipNormalAttackUi(true);
    }

    applyShipCombatResourceDelta(resourceMap = null, multiplier = 1) {
        const delta = this.normalizeShipCombatResourceStorage({ cargoResources: resourceMap }).cargoResources;
        const prev = this.normalizeShipCombatResourceStorage(this.shipCombatResourceStorage);
        const nextCargo = {};
        ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'].forEach((code) => {
            const current = Math.max(0, Math.trunc(Number(prev.cargoResources?.[code] || 0)));
            const change = Math.max(0, Math.trunc(Number(delta?.[code] || 0))) * multiplier;
            nextCargo[code] = Math.max(0, current + change);
        });
        this.setShipCombatResourceStorage({
            cargoResources: nextCargo,
            cargoUsed: this.sumShipCombatResourceMap(nextCargo)
        });
    }

    registerShipCombatResourceRefreshTriggers() {
        if (typeof window === 'undefined' || typeof document === 'undefined' || this.onShipCombatResourceWindowFocus) {
            return;
        }
        const refreshIfMapVisible = () => {
            if (document.body?.dataset.currentTab !== 'map') return;
            this.applyShipCombatResourceDelta(cargoOutcome.dropped || {}, -1);
        };
        this.onShipCombatResourceWindowFocus = () => {
            refreshIfMapVisible();
        };
        this.onShipCombatResourceVisibilityChange = () => {
            if (document.hidden) return;
            refreshIfMapVisible();
        };
        this.onMapTabVisible = () => {
            this.applyShipCombatResourceDelta(cargoOutcome.dropped || {}, -1);
            this.updateMapActionBarLayout();
        };
        window.addEventListener('focus', this.onShipCombatResourceWindowFocus);
        document.addEventListener('visibilitychange', this.onShipCombatResourceVisibilityChange);
        window.addEventListener('tab:map-visible', this.onMapTabVisible);
    }

    buildShipCombatResourceHudText() {
        const storage = this.shipCombatResourceStorage || {};
        if (!storage.activeShipId) {
            return '海戦資源 利用にはアクティブ船が必要';
        }
        const cargo = storage.cargoResources || {};
        const powder = Math.max(0, Math.trunc(Number(cargo.RR || 0)));
        const repair = Math.max(0, Math.trunc(Number(cargo.RG || 0)));
        const hpAid = Math.max(0, Math.trunc(Number(cargo.RY || 0)));
        const mpAid = Math.max(0, Math.trunc(Number(cargo.RB || 0)));
        const used = Math.max(0, Math.trunc(Number(storage.cargoUsed || 0)));
        const cap = Math.max(0, Math.trunc(Number(storage.cargoCapacity || 0)));
        return `海戦資源 🧨${powder} 🪨${repair} 🍄${hpAid} 🫙${mpAid} / 船倉 ${used}/${cap}`;
    }

    updateMapActionBarLayout() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const bar = document.getElementById('mapActionBar');
        if (!bar) return;
        bar.style.bottom = '';
    }

    updateShipCombatResourceHud() {
        if (!this.shipCombatResourceStatus) return;
        this.shipCombatResourceStatus.textContent = this.buildShipCombatResourceHudText();
    }

    isShipCombatResourceThrottleError(error) {
        const message = [
            error?.error,
            error?.errorMessage,
            error?.message
        ].filter(Boolean).join(' ');
        return /maximum API request rate|throttl/i.test(message);
    }

    requestShipCombatResourceStorage(force = false) {
        const playFabId = this.playerInfo?.playFabId;
        if (!playFabId) return;
        const now = Date.now();
        if (this.shipCombatResourceFetchPromise) return;
        if (now < this.shipCombatResourceBackoffUntil) return;
        if (!force && (now - this.shipCombatResourceFetchedAt) < this.shipCombatResourcePollIntervalMs) return;
        this.shipCombatResourceFetchedAt = now;
        this.shipCombatResourceFetchPromise = fetchShipResourceStorage(playFabId, { isSilent: true })
            .then((data) => {
                if (!data?.success) return;
                this.shipCombatResourceBackoffUntil = 0;
                this.setShipCombatResourceStorage(data);
            })
            .catch((error) => {
                if (this.isShipCombatResourceThrottleError(error)) {
                    this.shipCombatResourceBackoffUntil = Date.now() + 30_000;
                }
                console.warn('[ShipCombatHud] Failed to load ship resource storage:', error);
            })
            .finally(() => {
                this.shipCombatResourceFetchPromise = null;
            });
    }

    setupShipSideCannonUi() {
        if (typeof document === 'undefined') return;
        const panel = document.getElementById('shipSideCannonPanel');
        const button = document.getElementById('shipSideCannonButton');
        const status = document.getElementById('shipSideCannonStatus');
        if (!panel || !button || !status) return;

        this.shipSideCannonPanel = panel;
        this.shipSideCannonButton = button;
        this.shipSideCannonStatus = status;
        button.addEventListener('click', () => this.triggerShipSideCannon());
        this.updateShipSideCannonUi(true);
    }

    setupShipNormalAttackUi() {
        if (typeof document === 'undefined') return;
        const panel = document.getElementById('shipNormalAttackPanel');
        const button = document.getElementById('shipNormalAttackButton');
        const status = document.getElementById('shipNormalAttackStatus');
        if (!panel || !button || !status) return;

        this.shipNormalAttackPanel = panel;
        this.shipNormalAttackButton = button;
        this.shipNormalAttackStatus = status;
        button.addEventListener('click', () => this.triggerShipNormalAttack());
        this.updateShipNormalAttackUi(true);
    }

    // ────────────────────────────────────────────────────────
    // 船スキル UI
    // ────────────────────────────────────────────────────────

    setupShipSkillUi() {
        if (typeof document === 'undefined') return;
        const toggleBtn = document.getElementById('shipSkillToggleButton');
        const sheet = document.getElementById('shipSkillSheet');
        const closeBtn = document.getElementById('shipSkillSheetClose');
        if (!toggleBtn || !sheet || !closeBtn) return;

        toggleBtn.addEventListener('click', () => this.toggleShipSkillSheet());
        bindModalClose(closeBtn, () => this.closeShipSkillSheet(), {
            overlay: sheet,
            closeOnBackdrop: true,
            closeOnEscape: true,
            icon: true,
            isOpen: () => this.shipSkillPanelOpen
        });
    }

    toggleShipSkillSheet() {
        if (this.shipSkillPanelOpen) {
            this.closeShipSkillSheet();
        } else {
            this.openShipSkillSheet();
        }
    }

    openShipSkillSheet() {
        const sheet = document.getElementById('shipSkillSheet');
        const toggleBtn = document.getElementById('shipSkillToggleButton');
        if (!sheet) return;
        this.shipSkillPanelOpen = true;
        sheet.classList.add('is-open');
        sheet.setAttribute('aria-hidden', 'false');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        this.loadShipSkillStatus();
    }

    closeShipSkillSheet() {
        const sheet = document.getElementById('shipSkillSheet');
        const toggleBtn = document.getElementById('shipSkillToggleButton');
        if (!sheet) return;
        this.shipSkillPanelOpen = false;
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        this.stopShipSkillCtTick();
    }

    loadShipSkillStatus() {
        const playFabId = window.myPlayFabId;
        if (!playFabId) return;

        // キャッシュがあれば CT だけローカルで補完して即描画（サーバー不要）
        const cached = getCachedSkillData();
        if (cached?.skills) {
            const skills = mergeWithLocalCt(cached.skills);
            this.shipSkillData = skills;
            this.renderShipSkillPanel(skills, cached.roleKey);
            this.startShipSkillCtTick();
            return;
        }

        // 初回のみサーバーからデッキ＋スキル情報を取得してキャッシュ
        fetchShipSkillStatus(playFabId, { silent: true })
            .then((data) => {
                if (!data?.skills) return;
                setCachedSkillData(data);
                const skills = mergeWithLocalCt(data.skills);
                this.shipSkillData = skills;
                this.renderShipSkillPanel(skills, data.roleKey);
                this.startShipSkillCtTick();
            })
            .catch((err) => {
                console.warn('[ShipSkill] Failed to load status:', err);
            });
    }

    renderShipSkillPanel(skills, roleKey) {
        const grid = document.getElementById('shipSkillGrid');
        const emptyMsg = document.getElementById('shipSkillEmptyMsg');
        const roleLabel = document.getElementById('shipSkillRoleLabel');
        if (!grid) return;

        if (roleLabel) roleLabel.textContent = roleKey && roleKey !== 'Incomplete' ? `◆ ${roleKey}` : '';

        const validSkills = (skills || []).filter((s) => !s.error);
        if (validSkills.length === 0) {
            grid.innerHTML = '';
            if (emptyMsg) emptyMsg.hidden = false;
            return;
        }
        if (emptyMsg) emptyMsg.hidden = true;

        const ELEMENT_ICON = { fire: '🔥', wind: '🌀', water: '💧', earth: '🛡', none: '✨' };
        const RANGE_LABEL = { self: '自', near: '近', medium: '中', far: '遠', global: '全' };
        const CIRCUMFERENCE = 2 * Math.PI * 24; // r=24

        grid.innerHTML = validSkills.map((skill) => {
            const icon = ELEMENT_ICON[skill.element] || '⚡';
            const rangeLabel = RANGE_LABEL[skill.range] || skill.range;
            const castLabel = skill.castTime > 0 ? `詠唱${skill.castTime}s` : '即時';
            const isTriggered = skill.activationType === 'triggered';
            const remaining = skill.remainingSec || 0;
            const total = skill.cooldownSec || 1;
            const progress = remaining > 0 ? (remaining / total) : 0;
            const dashOffset = CIRCUMFERENCE * (1 - progress);

            return `<button
                class="ship-skill-card${remaining === 0 ? ' is-ready' : ''}"
                data-card-item-id="${skill.cardItemId}"
                data-element="${skill.element}"
                data-ct-remaining="${remaining}"
                data-ct-total="${total}"
                onclick="window.useShipSkillCard('${skill.cardItemId}', '${skill.skillName}')"
                ${isTriggered ? 'disabled title="自動発動スキル"' : ''}
            >
                ${isTriggered ? '<span class="ship-skill-auto-badge">自動</span>' : ''}
                <div class="ship-skill-ct-ring-wrap">
                    <svg viewBox="0 0 56 56">
                        <circle class="ship-skill-ct-ring-bg" cx="28" cy="28" r="24"/>
                        <circle class="ship-skill-ct-ring-fill"
                            cx="28" cy="28" r="24"
                            stroke-dasharray="${CIRCUMFERENCE.toFixed(1)}"
                            stroke-dashoffset="${(CIRCUMFERENCE * progress).toFixed(1)}"
                            data-ct-ring
                        />
                    </svg>
                    <div class="ship-skill-ct-inner">
                        <span class="ship-skill-ct-icon">${icon}</span>
                        <span class="ship-skill-ct-sec" data-ct-label>${remaining > 0 ? remaining + 's' : ''}</span>
                    </div>
                </div>
                <span class="ship-skill-card-name">${skill.skillName}</span>
                <div class="ship-skill-card-meta">
                    <span class="ship-skill-card-range">${rangeLabel}</span>
                    <span class="ship-skill-card-cast">${castLabel}</span>
                </div>
                <p class="ship-skill-card-desc">${skill.description || ''}</p>
            </button>`;
        }).join('');
    }

    startShipSkillCtTick() {
        this.stopShipSkillCtTick();
        this.shipSkillCtInterval = setInterval(() => this.tickShipSkillCt(), 1000);
    }

    stopShipSkillCtTick() {
        if (this.shipSkillCtInterval) {
            clearInterval(this.shipSkillCtInterval);
            this.shipSkillCtInterval = null;
        }
    }

    tickShipSkillCt() {
        const grid = document.getElementById('shipSkillGrid');
        if (!grid || !this.shipSkillPanelOpen) return;
        const CIRCUMFERENCE = 2 * Math.PI * 24;

        grid.querySelectorAll('.ship-skill-card').forEach((card) => {
            const ctKey = card.dataset.cardItemId;
            if (!ctKey) return;

            // CT は localStorage から読む（サーバー参照なし）
            const remaining = getSkillRemainingSec(ctKey);
            const prev = Number(card.dataset.ctRemaining) || 0;
            const total = Number(card.dataset.ctTotal) || 1;

            card.dataset.ctRemaining = remaining;

            const label = card.querySelector('[data-ct-label]');
            if (label) label.textContent = remaining > 0 ? `${remaining}s` : '';

            const ring = card.querySelector('[data-ct-ring]');
            if (ring) {
                const progress = remaining > 0 ? remaining / total : 0;
                ring.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * progress).toFixed(1));
            }

            if (prev > 0 && remaining === 0) {
                card.classList.add('is-ready', 'is-ready-flash');
                card.removeAttribute('disabled');
                setTimeout(() => card.classList.remove('is-ready-flash'), 700);
                const statusChip = document.getElementById('shipSkillStatus');
                if (statusChip) {
                    statusChip.textContent = 'スキル Ready';
                    setTimeout(() => { statusChip.textContent = ''; }, 4000);
                }
            }
        });
    }

    useShipSkillCard(cardItemId, skillName) {
        const playFabId = window.myPlayFabId;
        if (!playFabId) return;

        // 1. CT チェック（localStorage、サーバー不要）
        if (!isSkillReady(cardItemId)) {
            const rem = getSkillRemainingSec(cardItemId);
            this.showMessage(`⏳ CT中 残${rem}s`);
            return;
        }

        // 2. スキル情報をキャッシュから取得
        const skillInfo = (this.shipSkillData || []).find((s) => s.cardItemId === cardItemId);
        if (!skillInfo) return;

        // 3. CT を即座に localStorage に記録（楽観的更新）
        const cooldownMs = (skillInfo.cooldownSec || 30) * 1000;
        setSkillCooldown(cardItemId, Date.now() + cooldownMs);
        this.updateCardCtDisplay(cardItemId, skillInfo.cooldownSec);

        this.showMessage(`⚡ ${skillName} 発動！`);

        // 4. 自己効果スキル → ローカルだけで完結（サーバー呼び出しなし）
        if (isSelfOnlySkill(skillInfo)) {
            this.applyLocalShipSkillEffect(skillInfo);
            return;
        }

        // 5. 他プレイヤーへの効果 → fire-and-forget（await しない）
        const context = {};
        const nearestEnemy = this.getNearestEnemyShipId?.();
        if (nearestEnemy) context.targetPlayFabId = nearestEnemy;
        requestUseShipSkill(playFabId, cardItemId, context, { silent: true }).catch(() => {});
    }

    updateCardCtDisplay(cardItemId, cooldownSec) {
        const card = document.querySelector(`.ship-skill-card[data-card-item-id="${cardItemId}"]`);
        if (!card) return;
        const total = cooldownSec || 30;
        card.dataset.ctRemaining = total;
        card.dataset.ctTotal = total;
        card.classList.remove('is-ready');
        const label = card.querySelector('[data-ct-label]');
        if (label) label.textContent = `${total}s`;
        const ring = card.querySelector('[data-ct-ring]');
        if (ring) ring.setAttribute('stroke-dashoffset', '0');
    }

    applyLocalShipSkillEffect(skillInfo) {
        const subtype = skillInfo?.effect?.subtype || skillInfo?.effectSubtype;
        const value   = skillInfo?.effect?.value;
        const dur     = (skillInfo?.effect?.duration || 0) * 1000;
        const nowMs   = Date.now();

        switch (subtype) {
            case 'invincible-escape':
                this.shipActionImmuneUntil = nowMs + (dur || 5000);
                break;
            case 'stealth':
                this.setPlayerShipInvisible?.(true);
                this.shipActionInvisibleUntil = nowMs + (dur || 45000);
                break;
            case 'charge':
                this.shipActionSpeedBoostMultiplier = value?.speedMult || 3;
                this.shipActionSpeedBoostUntil = nowMs + (dur || 10000);
                break;
            case 'berserker':
                this.shipActionSpeedBoostMultiplier = 1;
                this.shipActionSpeedBoostUntil = nowMs + (dur || 20000);
                break;
            case 'fortify':
                this.shipActionMoveLockUntil = nowMs + (dur || 15000);
                break;
            case 'blink':
                this.teleportPlayerShipRandom?.();
                break;
            default:
                break;
        }
    }

    isPlayerGuildShip() {
        const shipClass = String(this.playerShipClass || '').toLowerCase();
        if (shipClass === 'guild') return true;
        const itemId = String(this.playerShipItemId || '').toLowerCase();
        if (itemId.includes('guild')) return true;
        const shipType = String(this.playerShipAssetData?.ShipType || '').toLowerCase();
        if (shipType.includes('guild')) return true;
        const classFromAsset = String(this.playerShipAssetData?.Class || this.playerShipAssetData?.class || '').toLowerCase();
        if (classFromAsset.includes('guild')) return true;
        return !!this.playerShipAssetData?.isGuildShip || !!this.playerShipAssetData?.guildShip;
    }

    canUseShipSideCannon() {
        const shipClass = String(this.playerShipClass || '').toLowerCase();
        if (shipClass === 'fighter' || shipClass === 'defender' || shipClass === 'merchant') {
            return true;
        }
        return this.isPlayerGuildShip();
    }

    getShipSideCannonInfo() {
        return {
            type: 'side_cannon',
            label: '舷側砲',
            emoji: ['💣', '💥'],
            effect: 'broadside',
            rangeTiles: 5,
            angle: 72,
            damage: 280,
            chargeMs: 150,
            hitStopMs: 80,
            cooldownMs: 60_000
        };
    }

    getShipNormalAttackInfo() {
        const shipClass = this.isPlayerGuildShip()
            ? 'guild'
            : String(this.playerShipClass || this.playerShipAssetData?.Class || this.playerShipAssetData?.class || '').toLowerCase();
        const base = {
            type: 'normal_cannon',
            label: '通常砲撃',
            emoji: ['💥'],
            effect: 'normal_cannon',
            rangeTiles: 3.5,
            angle: 38,
            damage: 45,
            broadside: false
        };
        if (shipClass === 'fighter') {
            return { ...base, label: '直射砲', rangeTiles: 5.5, angle: 28, damage: 95, effect: 'cannon_shot', emoji: ['💣'] };
        }
        if (shipClass === 'defender') {
            return { ...base, type: 'normal_broadside', label: '舷側射撃', rangeTiles: 4, angle: 55, damage: 70, effect: 'broadside', broadside: true, emoji: ['💥'] };
        }
        if (shipClass === 'merchant') {
            return { ...base, label: '牽制射撃', rangeTiles: 3.5, angle: 70, damage: 62, effect: 'normal_scatter', emoji: ['✨'] };
        }
        if (shipClass === 'explorer') {
            return { ...base, label: '速射', rangeTiles: 6, angle: 20, damage: 50, effect: 'cannon_shot', emoji: ['💨'] };
        }
        if (shipClass === 'guild') {
            return { ...base, type: 'normal_broadside', label: '艦隊射撃', rangeTiles: 5, angle: 60, damage: 85, effect: 'broadside', broadside: true, emoji: ['💣', '💥'] };
        }
        return base;
    }

    updateShipNormalAttackUi(force = false) {
        if (!this.shipNormalAttackButton || !this.shipNormalAttackStatus) return;
        const now = Date.now();
        if (!force && now - this.shipNormalAttackUiLastUpdate < 160) return;
        this.shipNormalAttackUiLastUpdate = now;

        const info = this.getShipNormalAttackInfo();
        const jamRemaining = Math.max(0, this.shipActionJammedUntil - now);
        const lockRemaining = Math.max(0, this.shipNormalAttackLockUntil - now);
        const hasShip = !!this.playerShip && (!!this.playerShipClass || !!this.playerShipItemId || this.isPlayerGuildShip());
        const inBattle = this.isShipInBattle(this.playerInfo?.playFabId);
        const canUse = hasShip && !inBattle && jamRemaining <= 0 && lockRemaining <= 0;

        if (this.shipNormalAttackPanel) {
            this.shipNormalAttackPanel.style.display = 'flex';
        }
        this.shipNormalAttackButton.disabled = !canUse;
        this.shipNormalAttackButton.textContent = '通常攻撃';

        if (!hasShip) {
            this.shipNormalAttackStatus.textContent = '船が必要';
            return;
        }
        if (inBattle) {
            this.shipNormalAttackStatus.textContent = '戦闘中不可';
            return;
        }
        if (jamRemaining > 0) {
            this.shipNormalAttackStatus.textContent = `妨害中 (${Math.ceil(jamRemaining / 1000)}s)`;
            return;
        }
        this.shipNormalAttackStatus.textContent = `${info.label} 威力${info.damage}`;
    }

    triggerShipNormalAttack() {
        if (!this.playerShip || !this.playerInfo?.playFabId) {
            this.showMessage('通常攻撃を使用できません。');
            return;
        }
        if (this.isShipInBattle(this.playerInfo.playFabId)) {
            this.showMessage('戦闘中は通常攻撃を使用できません。');
            return;
        }
        const now = Date.now();
        if (now < this.shipActionJammedUntil) {
            this.showMessage(`妨害中 (${Math.ceil((this.shipActionJammedUntil - now) / 1000)}s)`);
            return;
        }
        if (now < this.shipNormalAttackLockUntil) {
            return;
        }

        const actionInfo = this.getShipNormalAttackInfo();
        this.shipNormalAttackLockUntil = now + 220;
        this.updateShipNormalAttackUi(true);
        this.emitShipActionEvent(actionInfo, this.playerShip.x, this.playerShip.y);
        if (Array.isArray(actionInfo.emoji) && actionInfo.emoji.length > 0) {
            this.playEmojiBurst(actionInfo.emoji, this.playerShip.x, this.playerShip.y - 16, { fontSize: 16, rise: 16, duration: 520 });
        }
        this.applyShipNormalAttack(actionInfo);
        this.time.delayedCall(230, () => this.updateShipNormalAttackUi(true));
    }

    applyShipNormalAttack(actionInfo = {}) {
        if (!this.playerShip) return;
        const tile = this.TILE_SIZE;
        const range = tile * Math.max(1, Number(actionInfo.rangeTiles) || 3);
        const angle = Number(actionInfo.angle) || 38;
        const damage = Number(actionInfo.damage) || 40;
        const effectColor = this.getActionEffectColor(actionInfo.effect, 0xffd166);
        if (actionInfo.broadside) {
            const broadsideBundle = this.getDefenderBroadsideBundle(actionInfo);
            if (!broadsideBundle?.targets?.length) {
                this.showMessage('対象がいません');
                this.applyDefenderBroadsideAction(actionInfo, broadsideBundle);
                return;
            }
            this.applyDefenderBroadsideAction(actionInfo, broadsideBundle);
            return;
        }

        const heading = this.getFacingAngleRad();
        const targets = this.getTargetsInCone(range, angle);
        this.playActionConeEffectAt(this.playerShip.x, this.playerShip.y, range, angle, heading, effectColor);
        this.playCannonShot(this.playerShip.x, this.playerShip.y, range, heading, {
            glyph: actionInfo.effect === 'normal_scatter' ? '✨' : '💥',
            durationMs: 150,
            impactGlyph: '💥',
            impactTint: 0xffef9f
        });
        this.applyShipActionDamage(targets, damage);
    }

    updateShipSideCannonUi(force = false) {
        if (!this.shipSideCannonButton || !this.shipSideCannonStatus) return;
        const now = Date.now();
        if (!force && now - this.shipSideCannonUiLastUpdate < 250) return;
        this.shipSideCannonUiLastUpdate = now;
        this.updateShipCombatResourceHud();

        const panel = this.shipSideCannonPanel;
        const allowedClass = this.canUseShipSideCannon();
        const cooldownRemaining = Math.max(0, this.shipSideCannonCooldownUntil - now);
        const chargeRemaining = Math.max(0, this.shipSideCannonChargeUntil - now);
        const jamRemaining = Math.max(0, this.shipActionJammedUntil - now);
        const canUse = !!this.playerShip && allowedClass && cooldownRemaining <= 0 && jamRemaining <= 0 && chargeRemaining <= 0 && !this.shipSideCannonConsuming;
        const hasShipInfo = !!this.playerShipClass || !!this.playerShipItemId || this.isPlayerGuildShip();
        const shouldShow = hasShipInfo && allowedClass;

        if (panel) {
            panel.style.display = 'flex';
        }
        this.shipSideCannonButton.disabled = !canUse;
        if (!shouldShow) {
            this.shipSideCannonStatus.textContent = hasShipInfo ? '対応船のみ' : '船が必要';
            return;
        }
        if (jamRemaining > 0) {
            const seconds = Math.ceil(jamRemaining / 1000);
            this.shipSideCannonStatus.textContent = `妨害中 (${seconds}s)`;
            return;
        }
        if (cooldownRemaining > 0) {
            const seconds = Math.ceil(cooldownRemaining / 1000);
            this.shipSideCannonStatus.textContent = `再装填 ${seconds}s / 火薬 ${Math.max(0, Math.trunc(Number(this.shipCombatResourceStorage?.cargoResources?.RR || 0)))}`;
            return;
        }
        if (this.shipSideCannonConsuming) {
            this.shipSideCannonStatus.textContent = '火薬確認中...';
            return;
        }
        if (chargeRemaining > 0) {
            const seconds = Math.max(0.1, Math.ceil(chargeRemaining / 100) / 10);
            this.shipSideCannonStatus.textContent = `照準中 (${seconds}s)`;
            return;
        }
        this.shipSideCannonStatus.textContent = '左右へ舷側砲撃 (🧨x1)';
    }

    async consumeShipSideCannonAmmo() {
        if (!this.playerInfo?.playFabId || this.shipSideCannonConsuming) return false;
        this.shipSideCannonConsuming = true;
        this.updateShipSideCannonUi(true);
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/consume-ship-broadside') : '/api/consume-ship-broadside'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playFabId: this.playerInfo.playFabId })
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                this.showMessage(data?.error || '舷側砲の火薬が足りません');
                return false;
            }
            this.setShipCombatResourceStorage({
                activeShipId: data.shipId || this.shipCombatResourceStorage?.activeShipId,
                cargoResources: data.balances,
                cargoUsed: this.sumShipCombatResourceMap(data.balances)
            });
            return true;
        } catch (error) {
            console.warn('[ShipSideCannon] Failed to consume ammo:', error);
            this.showMessage('舷側砲の火薬消費に失敗しました');
            return false;
        } finally {
            this.shipSideCannonConsuming = false;
            this.updateShipSideCannonUi(true);
        }
    }

    triggerShipSideCannon() {
        if (!this.playerShip || !this.playerInfo?.playFabId) {
            this.showMessage('アクションを使用できません。');
            return;
        }
        if (!this.canUseShipSideCannon()) {
            this.showMessage('この船では舷側砲を使用できません。');
            return;
        }
        if (this.isShipInBattle(this.playerInfo.playFabId)) {
            this.showMessage('戦闘中は舷側砲を使用できません。');
            return;
        }
        const now = Date.now();
        if (now < this.shipActionJammedUntil) {
            const seconds = Math.ceil((this.shipActionJammedUntil - now) / 1000);
            this.showMessage(`妨害中 (${seconds}s)`);
            return;
        }
        if (now < this.shipSideCannonCooldownUntil) {
            const seconds = Math.ceil((this.shipSideCannonCooldownUntil - now) / 1000);
            this.showMessage(`舷側砲クールダウン中 (${seconds}s)`);
            return;
        }
        if (this.shipSideCannonConsuming) {
            this.showMessage('舷側砲の火薬を確認中です');
            return;
        }
        if (now < this.shipSideCannonChargeUntil) {
            this.showMessage('舷側砲を照準中...');
            return;
        }

        const actionInfo = this.getShipSideCannonInfo();
        const chargeMs = Math.max(80, Number(actionInfo.chargeMs) || 150);
        this.shipSideCannonChargeUntil = now + chargeMs;
        this.playSideCannonChargeEffect(chargeMs);
        this.playShipActionTelegraph(actionInfo, chargeMs + 120);
        this.playSideCannonSfx('charge');
        this.updateShipSideCannonUi(true);
        if (this.shipSideCannonChargeTimer) {
            this.shipSideCannonChargeTimer.remove(false);
            this.shipSideCannonChargeTimer = null;
        }

        this.shipSideCannonChargeTimer = this.time.delayedCall(chargeMs, async () => {
            this.shipSideCannonChargeTimer = null;
            this.shipSideCannonChargeUntil = 0;
            const fireNow = Date.now();
            if (!this.playerShip || !this.playerInfo?.playFabId) {
                this.updateShipSideCannonUi(true);
                return;
            }
            if (this.isShipInBattle(this.playerInfo.playFabId)) {
                this.showMessage('舷側砲は中断されました。');
                this.updateShipSideCannonUi(true);
                return;
            }
            if (fireNow < this.shipActionJammedUntil) {
                this.showMessage('舷側砲は妨害されました。');
                this.updateShipSideCannonUi(true);
                return;
            }
            const broadsideBundle = this.getDefenderBroadsideBundle(actionInfo);
            if (!broadsideBundle.targets.length) {
                this.showMessage('対象がいません');
                this.updateShipSideCannonUi(true);
                return;
            }
            const consumed = await this.consumeShipSideCannonAmmo();
            if (!consumed) {
                this.updateShipSideCannonUi(true);
                return;
            }

            this.playSideCannonSfx('fire');
            if (Array.isArray(actionInfo.emoji) && actionInfo.emoji.length > 0) {
                this.playEmojiBurst(actionInfo.emoji, this.playerShip.x, this.playerShip.y - 16, { fontSize: 19, rise: 20, duration: 680 });
            }
            this.emitShipActionEvent(actionInfo, this.playerShip.x, this.playerShip.y);
            this.applyDefenderBroadsideAction(actionInfo, broadsideBundle);
            this.showMessage(`${actionInfo.label}！`);

            this.shipSideCannonCooldownUntil = fireNow + (Number(actionInfo.cooldownMs) || 60_000);
            this.updateShipSideCannonUi(true);
        });
    }

    setupCreateIslandUi() {
        if (typeof document === 'undefined') return;
        const button = document.getElementById('createIslandButton');
        if (!button) return;
        this.createIslandButton = button;
        button.addEventListener('click', () => {
            void this.requestCreateIslandAtCurrentPosition();
        });
        this.updateCreateIslandUi();
    }

    updateCreateIslandUi() {
        if (!this.createIslandButton) return;
        const repairing = !!this.shipRepairUntil && Date.now() < this.shipRepairUntil;
        const canCreateArea = (() => {
            const playerNation = String(this.playerInfo?.nation || '').toLowerCase();
            if (!playerNation) return false;
            const occupiedNation = String(this.mapOccupationNation || '').toLowerCase();
            const mapNationById = (() => {
                const mapKey = String(this.mapId || '').toLowerCase();
                if (mapKey === 'wands') return 'fire';
                if (mapKey === 'pentacles') return 'earth';
                if (mapKey === 'swords') return 'wind';
                if (mapKey === 'cups') return 'water';
                return '';
            })();
            const effectiveNation = occupiedNation || mapNationById;
            return !!effectiveNation && effectiveNation === playerNation;
        })();
        const canCreate = !!this.playerInfo?.playFabId && !!this.mapId && canCreateArea && !this.shipMoving && !this.ridingShipId && !repairing;
        this.createIslandButton.disabled = !canCreate;
    }

    async openIslandSizeSelectDialog(sizeCostMap, sizeLabelMap) {
        if (typeof document === 'undefined') return 'small';

        const options = [
            { key: 'small', label: `${sizeLabelMap.small || '小'}サイズ`, cost: Number(sizeCostMap.small || 0), detail: '小さな島（3x3）' },
            { key: 'large', label: `${sizeLabelMap.large || '中'}サイズ`, cost: Number(sizeCostMap.large || 0), detail: '標準的な島（3x4）' },
            { key: 'giant', label: `${sizeLabelMap.giant || '大'}サイズ`, cost: Number(sizeCostMap.giant || 0), detail: '大きな島（4x4）' }
        ];

        return await new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.zIndex = '4200';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.background = 'rgba(2, 6, 23, 0.7)';

            const card = document.createElement('div');
            card.style.width = 'min(420px, 92vw)';
            card.style.borderRadius = '12px';
            card.style.border = '1px solid rgba(255,255,255,0.18)';
            card.style.background = 'rgba(15, 23, 42, 0.98)';
            card.style.padding = '14px';
            card.style.color = '#fff';
            card.style.boxShadow = '0 18px 40px rgba(0,0,0,0.55)';

            const title = document.createElement('div');
            title.textContent = '島サイズを選択してください';
            title.style.fontWeight = '700';
            title.style.marginBottom = '10px';
            card.appendChild(title);

            options.forEach((option) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.style.width = '100%';
                btn.style.display = 'flex';
                btn.style.justifyContent = 'space-between';
                btn.style.alignItems = 'center';
                btn.style.padding = '10px 12px';
                btn.style.marginBottom = '8px';
                btn.style.borderRadius = '8px';
                btn.style.border = '1px solid rgba(255,255,255,0.18)';
                btn.style.background = 'rgba(30,41,59,0.92)';
                btn.style.color = '#fff';
                btn.style.cursor = 'pointer';
                btn.innerHTML = `
                    <span style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
                        <span style="font-weight:700;">${option.label}</span>
                        <span style="font-size:11px; color:rgba(255,255,255,0.78);">${option.detail}</span>
                    </span>
                    <span style="font-weight:700; color:#facc15;">${option.cost.toLocaleString('ja-JP')} Ps</span>
                `;
                btn.addEventListener('click', () => {
                    overlay.remove();
                    resolve(option.key);
                });
                card.appendChild(btn);
            });

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = 'キャンセル';
            cancel.style.width = '100%';
            cancel.style.padding = '10px 12px';
            cancel.style.borderRadius = '8px';
            cancel.style.border = '1px solid rgba(255,255,255,0.14)';
            cancel.style.background = 'rgba(2,6,23,0.6)';
            cancel.style.color = '#cbd5e1';
            cancel.style.cursor = 'pointer';
            cancel.addEventListener('click', () => {
                overlay.remove();
                resolve(null);
            });
            card.appendChild(cancel);

            overlay.addEventListener('click', (event) => {
                if (event.target !== overlay) return;
                overlay.remove();
                resolve(null);
            });

            overlay.appendChild(card);
            document.body.appendChild(overlay);
        });
    }

    async requestCreateIslandAtCurrentPosition() {
        if (!this.playerShip || !this.playerInfo?.playFabId || !this.mapId) return;
        if (this.shipMoving) {
            this.showMessage('移動中は島を作成できません。');
            return;
        }
        if (this.ridingShipId) {
            this.showMessage('同乗中は島を作成できません。');
            return;
        }
        const sizeCostMap = { small: 500, large: 2500, giant: 5000 };
        const sizeLabelMap = { small: '小', large: '中', giant: '大' };
        const selectedSize = await this.openIslandSizeSelectDialog(sizeCostMap, sizeLabelMap);
        if (!selectedSize) return;
        const costPs = Number(sizeCostMap[selectedSize] || 0);
        const doCreate = typeof window === 'undefined' || typeof window.confirm !== 'function'
            ? true
            : window.confirm(`${sizeLabelMap[selectedSize] || selectedSize}サイズの島を作成しますか？\n必要Ps: ${costPs.toLocaleString('ja-JP')} Ps`);
        if (!doCreate) return;

        try {
            const endpoint = window.buildApiUrl ? window.buildApiUrl('/api/create-island') : '/api/create-island';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playFabId: this.playerInfo.playFabId,
                    mapId: this.mapId,
                    worldX: this.playerShip.x,
                    worldY: this.playerShip.y,
                    size: selectedSize
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const code = String(data?.error || '');
                if (code === 'IslandPositionOccupied') {
                    this.showMessage('その位置には島を作成できません。少し移動してください。');
                    return;
                }
                if (code === 'MapNotOwnedByPlayerNation') {
                    this.showMessage('自国が支配していない海域では島を作成できません。');
                    return;
                }
                if (code === 'InsufficientFunds') {
                    const required = Number(data?.details?.required || costPs || 0);
                    const balance = Number(data?.details?.balance || 0);
                    this.showMessage(`Ps不足: 必要${required.toLocaleString('ja-JP')} / 所持${balance.toLocaleString('ja-JP')}`);
                    return;
                }
                this.showMessage(data?.error || '島の作成に失敗しました。');
                return;
            }

            const island = data?.island;
            const coord = island?.coordinate || {};
            if (!island?.id || !Number.isFinite(Number(coord.x)) || !Number.isFinite(Number(coord.y))) {
                this.showMessage('島作成の応答が不正です。');
                return;
            }

            if (!this.islandObjects.has(island.id)) {
                this.createIsland({
                    ...island,
                    x: Number(coord.x) * this.gridSize,
                    y: Number(coord.y) * this.gridSize,
                    mapId: this.mapId
                });
            }
            const paidPs = Number(data?.costPs || costPs || 0);
            this.showMessage(`${island.name || '新規島'}を作成しました。（-${paidPs.toLocaleString('ja-JP')}Ps）`);
        } catch (error) {
            console.error('[create-island] Failed:', error);
            this.showMessage('島の作成に失敗しました。');
        }
    }

    setPlayerShipAssetData(assetData) {
        this.playerShipAssetData = assetData || null;
        const itemId = String(assetData?.ItemId || '').trim();
        this.playerShipItemId = itemId || null;
        const catalogItem = this.resolveShipCatalogItem(assetData);
        const classFromCatalog = String(catalogItem?.class || catalogItem?.Class || '').toLowerCase().trim();
        this.playerShipClass = classFromCatalog || this.getShipClassFromItemId(itemId);
        if (assetData?.Domain) {
            this.playerShipDomain = String(assetData.Domain).toLowerCase();
        }
        const baseSpeed = Number(assetData?.Stats?.Speed);
        if (Number.isFinite(baseSpeed) && baseSpeed > 0) {
            this.shipBaseSpeed = baseSpeed;
            this.shipSpeed = baseSpeed;
        }
        this.applyPlayerShipDomain();
        this.updateShipActionUi(true);
        this.updateShipSideCannonUi(true);
    }

    getShipClassFromItemId(itemId) {
        const key = String(itemId || '').toLowerCase();
        if (!key) return null;
        if (key === 'ship_common_boat' || key.includes('common')) return 'common';
        if (key === 'guild' || key.includes('guild')) return 'guild';
        if (key.includes('explorer')) return 'explorer';
        if (key.includes('merchant')) return 'merchant';
        if (key.includes('defender')) return 'defender';
        if (key.includes('fighter')) return 'fighter';
        return null;
    }

    getShipClassLabel(shipClass) {
        const key = String(shipClass || '').toLowerCase();
        if (key === 'common') return '初期ボート';
        if (key === 'explorer') return 'Explorer';
        if (key === 'merchant') return 'Merchant';
        if (key === 'defender') return 'Defender';
        if (key === 'fighter') return 'Fighter';
        if (key === 'guild') return 'ギルドシップ';
        return '対象船';
    }

    getOtherShipClass(shipObject) {
        if (!shipObject) return null;
        const classFromData = String(
            shipObject?.data?.shipClass
            || shipObject?.data?.ShipClass
            || shipObject?.data?.class
            || shipObject?.data?.Class
            || ''
        ).toLowerCase().trim();
        const normalizedFromData = this.getShipClassFromItemId(classFromData);
        if (normalizedFromData) return normalizedFromData;

        const shipTypeKey = String(shipObject?.shipTypeKey || '').trim();
        if (shipTypeKey.includes('__')) {
            const itemId = shipTypeKey.split('__')[0];
            const normalizedFromItemId = this.getShipClassFromItemId(itemId);
            if (normalizedFromItemId) return normalizedFromItemId;
        }

        const shipId = String(shipObject?.data?.shipId || '').trim();
        const normalizedFromShipId = this.getShipClassFromItemId(shipId);
        if (normalizedFromShipId) return normalizedFromShipId;
        return null;
    }

    getBoardingRestriction(targetPlayFabId) {
        const target = this.otherShips.get(targetPlayFabId);
        if (!target) return null;

        const myNation = String(this.playerInfo?.nation || '').toLowerCase();
        const targetNation = String(target?.data?.nation || target?.data?.Nation || target?.sprite?.__ownerNation || '').toLowerCase();
        if (myNation && targetNation && myNation === targetNation) {
            return null;
        }

        const attackerItemId = String(this.playerShipItemId || '').toLowerCase();
        const attackerClass = String(
            this.playerShipClass
            || this.getShipClassFromItemId(attackerItemId)
            || ''
        ).toLowerCase();
        const blockedAttackers = new Set(['explorer', 'common']);
        if (!blockedAttackers.has(attackerClass)) return null;

        const isGuildShip = !!target?.isGuildShip || !!target?.data?.isGuildShip || !!target?.data?.guildShip;
        const defenderClass = isGuildShip ? 'guild' : this.getOtherShipClass(target);
        const protectedDefenders = new Set(['fighter', 'defender', 'merchant']);
        if (!isGuildShip && !protectedDefenders.has(String(defenderClass || '').toLowerCase())) {
            return null;
        }

        const attackerLabel = this.getShipClassLabel(attackerClass);
        const defenderLabel = isGuildShip ? 'ギルドシップ' : this.getShipClassLabel(defenderClass);
        return {
            blocked: true,
            attackerClass,
            defenderClass: isGuildShip ? 'guild' : defenderClass,
            message: `${attackerLabel}では${defenderLabel}に乗り込めません。`
        };
    }

    resolveShipCatalogItem(assetData = null) {
        if (typeof window === 'undefined') return null;
        const catalog = window.shipCatalog;
        if (!catalog || typeof catalog !== 'object') return null;
        const itemId = String((assetData?.ItemId || this.playerShipItemId || '')).trim();
        if (itemId && catalog[itemId]) return catalog[itemId];
        const shipType = String(assetData?.ShipType || this.playerShipAssetData?.ShipType || '').trim();
        if (!shipType) return null;
        return Object.values(catalog).find(item => item && item.DisplayName === shipType) || null;
    }

    getShipActionType() {
        const itemId = String(this.playerShipItemId || '').toLowerCase();
        if (itemId === 'ship_common_boat') return { type: 'none', label: 'None' };
        const catalogItem = this.resolveShipCatalogItem();
        const friendlyId = String(catalogItem?.FriendlyId || catalogItem?.friendlyId || '').toLowerCase();
        const byItem = SHIP_ACTIONS[itemId] || (friendlyId ? SHIP_ACTIONS[friendlyId] : null);
        if (byItem) return { ...byItem };
        const shipClass = this.playerShipClass;
        if (shipClass === 'explorer') return { type: 'explorer', label: '探索加速', emoji: ['⛵'], durationMs: 4500, speedMultiplier: 1.35, cooldownMs: 55_000 };
        if (shipClass === 'merchant') return { type: 'merchant', label: '補給機動', emoji: ['🚤', '💨'], durationMs: 5000, effect: 'island_pass', cooldownMs: 70_000 };
        if (shipClass === 'defender') return { type: 'defender_shield', label: '防衛障壁', emoji: ['🛡️'], radiusTiles: 5, shieldRadiusTiles: 5, shieldDurationMs: 6000, shieldFactor: 0.7, effect: 'shield', cooldownMs: 70_000 };
        if (shipClass === 'fighter') return { type: 'fighter', label: '砲撃', emoji: ['⚔️'], rangeTiles: 5, angle: 45, damage: 320, cooldownMs: 60_000 };
        return { type: 'none', label: 'None' };
    }

    getEffectiveShipSpeed() {
        const now = Date.now();
        const boostActive = now < this.shipActionSpeedBoostUntil;
        const debuffActive = now < this.shipActionSpeedDebuffUntil;
        const boostMultiplier = boostActive ? Number(this.shipActionSpeedBoostMultiplier) || 1.5 : 1;
        const debuffMultiplier = debuffActive ? Number(this.shipActionSpeedDebuffMultiplier) || 1 : 1;
        const currentMp = Math.max(0, Number(Player.getMyPlayerStats?.()?.MP || 0));
        const mpMultiplier = currentMp <= 0 ? 0.7 : 1;
        return Math.max(1, this.shipBaseSpeed * boostMultiplier * debuffMultiplier * mpMultiplier);
    }

    updateShipActionUi(force = false) {
        if (!this.shipActionButton || !this.shipActionStatus) return;
        const now = Date.now();
        if (!force && now - this.shipActionUiLastUpdate < 250) return;
        this.shipActionUiLastUpdate = now;
        this.updateShipCombatResourceHud();

        const actionInfo = this.getShipActionType();
        const cooldownRemaining = Math.max(0, this.shipActionCooldownUntil - now);
        const jamRemaining = Math.max(0, this.shipActionJammedUntil - now);
        const canUse = cooldownRemaining <= 0 && jamRemaining <= 0 && actionInfo.type !== 'none';

        this.shipActionButton.disabled = !canUse;
        this.shipActionButton.textContent = '船アクション';

        if (actionInfo.type === 'none') {
            this.shipActionStatus.textContent = '行動なし';
            return;
        }

        if (jamRemaining > 0) {
            const seconds = Math.ceil(jamRemaining / 1000);
            this.shipActionStatus.textContent = `妨害中 (${seconds}s)`;
        } else if (cooldownRemaining > 0) {
            const seconds = Math.ceil(cooldownRemaining / 1000);
            this.shipActionStatus.textContent = `再装填 ${seconds}s / 補修 ${Math.max(0, Math.trunc(Number(this.shipCombatResourceStorage?.cargoResources?.RG || 0)))}`;
        } else {
            this.shipActionStatus.textContent = actionInfo.label;
        }
    }

    updateShipActionEffects() {
        const now = Date.now();
        if (now >= this.shipActionInvisibleUntil && this.playerShip?.alpha !== 1) {
            this.setPlayerShipInvisible(false);
        }
        if (now >= this.shipActionSpeedBoostUntil) {
            this.shipActionSpeedBoostMultiplier = 1;
        }
        if (now >= this.shipActionSpeedDebuffUntil) {
            this.shipActionSpeedDebuffMultiplier = 1;
        }
        this.shipSpeed = this.getEffectiveShipSpeed();

        const agilityActive = now < this.shipActionAgilityUntil;
        const agilityMultiplier = agilityActive ? Number(this.shipActionAgilityMultiplier) || 1 : 1;
        this.moveCooldown = Math.max(0, Math.floor(this.baseMoveCooldown * agilityMultiplier));

        const islandPassActive = now < this.shipActionIslandPassUntil;
        this.setIslandCollisionEnabled(!islandPassActive);

        if (now < this.shipActionMoveLockUntil) {
            if (this.shipMoving) {
                this.stopShipMovement();
            }
            this.canMove = false;
        } else if (!this.shipMoving) {
            this.canMove = true;
        }

        const visionDebuffExpired = this.shipActionVisionDebuffUntil && now >= this.shipActionVisionDebuffUntil;
        const visionBoostExpired = this.shipActionVisionBoostUntil && now >= this.shipActionVisionBoostUntil;
        if (visionDebuffExpired) {
            this.shipActionVisionDebuffUntil = 0;
            this.shipActionVisionDebuffMultiplier = 1;
            this.updateZoomFromVisionRange();
        }
        if (visionBoostExpired) {
            this.shipActionVisionBoostUntil = 0;
            this.shipActionVisionBoostMultiplier = 1;
            this.shipActionMinimapBoostUntil = 0;
            this.updateZoomFromVisionRange();
        }
    }

    isAirDomain(domain) {
        const key = String(domain || '').toLowerCase();
        return key === 'air' || key === 'sky' || key === 'flight' || key === 'flying';
    }

    isWaterDomain(domain) {
        const key = String(domain || '').toLowerCase();
        return key === 'water' || key === 'underwater' || key === 'sea_underwater' || key === 'submarine';
    }

    formatShipCargoOutcomeText(resources) {
        const labels = {
            RR: '🧨',
            RG: '🪨',
            RY: '🍄',
            RB: '🫙',
            RT: '🪾',
            RS: '🪵'
        };
        const parts = Object.entries(resources || {})
            .map(([itemId, amount]) => [String(itemId || '').trim(), Number(amount || 0) || 0])
            .filter(([itemId, amount]) => itemId && amount > 0)
            .map(([itemId, amount]) => `${labels[itemId] || itemId}x${amount}`);
        return parts.join(' ');
    }

    getShipCargoEmoji(itemId) {
        const key = String(itemId || '').trim().toUpperCase();
        const emojiMap = {
            RR: '🧨',
            RG: '🪨',
            RY: '🍄',
            RB: '🫙',
            RT: '🪾',
            RS: '🪵'
        };
        return emojiMap[key] || '📦';
    }

    getWorldShipSpriteByPlayFabId(playFabId) {
        const key = String(playFabId || '').trim();
        if (!key) return null;
        if (key === this.playerInfo?.playFabId) {
            return this.playerShip || null;
        }
        return this.otherShips.get(key)?.sprite || null;
    }

    playShipCargoTransferFx(cargoOutcome, winnerId, defeatedId) {
        if (!cargoOutcome || Number(cargoOutcome.totalTransferred || 0) <= 0) return;
        const sourceSprite = this.getWorldShipSpriteByPlayFabId(defeatedId);
        const targetSprite = this.getWorldShipSpriteByPlayFabId(winnerId);
        if (!sourceSprite || !targetSprite) return;
        const entries = Object.entries(cargoOutcome.transferred || {})
            .map(([itemId, amount]) => [String(itemId || '').trim().toUpperCase(), Math.max(0, Math.floor(Number(amount) || 0))])
            .filter(([itemId, amount]) => itemId && amount > 0);
        if (entries.length === 0) return;
        let delayOffset = 0;
        entries.forEach(([itemId, amount]) => {
            const emoji = this.getShipCargoEmoji(itemId);
            const bursts = Math.max(1, Math.min(4, amount));
            for (let i = 0; i < bursts; i += 1) {
                this.time.delayedCall(delayOffset + (i * 60), () => {
                    if (!sourceSprite.active || !targetSprite.active) return;
                    const sx = sourceSprite.x + Phaser.Math.Between(-8, 8);
                    const sy = sourceSprite.y - 10 + Phaser.Math.Between(-4, 4);
                    const tx = targetSprite.x + Phaser.Math.Between(-8, 8);
                    const ty = targetSprite.y - 14 + Phaser.Math.Between(-6, 3);
                    this.playEmojiShot(emoji, sx, sy, tx, ty);
                });
            }
            const floatDelay = delayOffset + (bursts * 60) + 120;
            this.time.delayedCall(floatDelay, () => {
                if (!targetSprite.active) return;
                this.spawnDamageNumber(targetSprite.x, targetSprite.y - 20, `+${amount}${emoji}`, 0x7be495);
            });
            delayOffset += 120;
        });
    }

    notifyShipCargoOutcome(cargoOutcome, winnerId, defeatedId) {
        if (!cargoOutcome) {
            return;
        }
        const canShowMessage = typeof window !== 'undefined' && typeof window.showRpgMessage === 'function';
        const myId = this.playerInfo?.playFabId || null;
        if (!myId) return;
        this.playShipCargoTransferFx(cargoOutcome, winnerId, defeatedId);

        if (myId === defeatedId && Number(cargoOutcome.totalDropped || 0) > 0) {
            const lostText = this.formatShipCargoOutcomeText(cargoOutcome.dropped || {});
            this.applyShipCombatResourceDelta(cargoOutcome.dropped || {}, -1);
            this.showMessage(lostText ? `流失 ${lostText}` : '流失');
            if (canShowMessage) {
                window.showRpgMessage(lostText ? `船倉資源を失った ${lostText}` : '船倉資源を失った');
            }
            return;
        }

        if (myId === winnerId) {
            if (Number(cargoOutcome.totalTransferred || 0) > 0) {
                const gainedText = this.formatShipCargoOutcomeText(cargoOutcome.transferred || {});
                this.applyShipCombatResourceDelta(cargoOutcome.transferred || {}, 1);
                this.showMessage(gainedText ? `戦利品 ${gainedText}` : '戦利品獲得');
                if (canShowMessage) {
                    window.showRpgMessage(gainedText ? `船倉資源を奪った ${gainedText}` : '船倉資源を奪った');
                }
            } else if (Number(cargoOutcome.totalDropped || 0) > 0) {
                if (canShowMessage) {
                    window.showRpgMessage('敵の資源は海に沈んだ…');
                }
            }
        }
    }

    applyPlayerShipDomain() {
        if (!this.playerShip?.body) return;
        const isAir = this.isAirDomain(this.playerShipDomain);
        this.playerShip.setDepth(isAir ? GAME_CONFIG.DEPTH.SHIP + 1 : GAME_CONFIG.DEPTH.SHIP);
        this.playerShip.body.checkCollision.none = isAir;
        this.updateShipShadow(this.playerShip);
    }

    applyShipDomainDepth(sprite, domain) {
        if (!sprite) return;
        const isAir = this.isAirDomain(domain);
        sprite.setDepth(isAir ? GAME_CONFIG.DEPTH.SHIP + 1 : GAME_CONFIG.DEPTH.SHIP);
    }

    setPlayerShipInvisible(isInvisible) {
        if (!this.playerShip) return;
        this.playerShip.setAlpha(isInvisible ? 0 : 1);
        if (this.playerShip.__hpBar) {
            this.playerShip.__hpBar.setVisible(!isInvisible);
        }
        if (this.playerShip.__shadow) {
            this.playerShip.__shadow.setVisible(!isInvisible);
        }
    }

    setIslandCollisionEnabled(enabled) {
        if (!this.islandObjects) return;
        this.islandObjects.forEach((islandData) => {
            if (islandData?.collider) {
                islandData.collider.active = !!enabled;
            }
        });
    }

    isIslandPassActive() {
        return Date.now() < this.shipActionIslandPassUntil;
    }

    stopShipMovement() {
        if (!this.playerShip) return;
        this.stopDockedMpRecoveryTimer();
        this.shipMoving = false;
        this.playerShip.body.setVelocity(0, 0);
        if (this.shipTween) {
            this.shipTween.stop();
        }
        if (this.shipArrivalTimer) {
            this.shipArrivalTimer.remove();
        }
        this.stopShipAnimation();
        this.updateMyShipStoppedPosition();
    }

    applyMoveLock(durationMs) {
        const until = Date.now() + Math.max(0, Number(durationMs) || 0);
        if (until <= Date.now()) return;
        this.shipActionMoveLockUntil = Math.max(this.shipActionMoveLockUntil, until);
        this.showMessage('拘束されて動けない...');
        this.stopShipMovement();
        this.canMove = false;
    }

    applySpeedDebuff(multiplier, durationMs) {
        const until = Date.now() + Math.max(0, Number(durationMs) || 0);
        if (until <= Date.now()) return;
        const value = Number(multiplier);
        if (!Number.isFinite(value) || value <= 0 || value >= 1) return;
        this.shipActionSpeedDebuffUntil = Math.max(this.shipActionSpeedDebuffUntil, until);
        this.shipActionSpeedDebuffMultiplier = Math.min(this.shipActionSpeedDebuffMultiplier, value);
        this.showMessage('速度が落ちた...');
    }

    applyVisionDebuff(multiplier, durationMs) {
        const until = Date.now() + Math.max(0, Number(durationMs) || 0);
        if (until <= Date.now()) return;
        const value = Number(multiplier);
        if (!Number.isFinite(value) || value <= 0 || value >= 1) return;
        this.shipActionVisionDebuffUntil = Math.max(this.shipActionVisionDebuffUntil, until);
        this.shipActionVisionDebuffMultiplier = Math.min(this.shipActionVisionDebuffMultiplier, value);
        this.updateZoomFromVisionRange();
        this.showMessage('視界が狭まった...');
    }

    applyVisionBoost(multiplier, durationMs, minimapBoostMs = 0) {
        const until = Date.now() + Math.max(0, Number(durationMs) || 0);
        if (until <= Date.now()) return;
        const value = Number(multiplier);
        if (!Number.isFinite(value) || value <= 1) return;
        this.shipActionVisionBoostUntil = Math.max(this.shipActionVisionBoostUntil, until);
        this.shipActionVisionBoostMultiplier = Math.max(this.shipActionVisionBoostMultiplier, value);
        if (minimapBoostMs > 0) {
            this.shipActionMinimapBoostUntil = Math.max(this.shipActionMinimapBoostUntil, Date.now() + Math.max(0, Number(minimapBoostMs) || 0));
        }
        this.updateZoomFromVisionRange();
        this.showMessage('視界が広がった...');
    }

    triggerShipAction() {
        if (!this.playerShip || !this.playerInfo?.playFabId) {
            this.showMessage('アクションを使用できません。');
            return;
        }
        if (this.isShipInBattle(this.playerInfo.playFabId)) {
            this.showMessage('戦闘中はアクションを使用できません。');
            return;
        }
        const actionInfo = this.getShipActionType();
        if (!actionInfo || actionInfo.type === 'none') {
            this.showMessage('使用できるアクションがありません。');
            return;
        }
        const now = Date.now();
        if (now < this.shipActionCooldownUntil) {
            const seconds = Math.ceil((this.shipActionCooldownUntil - now) / 1000);
            this.showMessage(`クールダウン中 (${seconds}s)`);
            return;
        }
        if (now < this.shipActionJammedUntil) {
            const seconds = Math.ceil((this.shipActionJammedUntil - now) / 1000);
            this.showMessage(`妨害中 (${seconds}s)`);
            return;
        }

        this.playShipActionTelegraph(actionInfo, 320);

        if (Array.isArray(actionInfo.emoji) && actionInfo.emoji.length > 0) {
            const actionType = String(actionInfo.type || '').toLowerCase();
            const burstOptions = actionInfo.type === 'fighter'
                ? { fontSize: 20, rise: 22, duration: 680 }
                : actionType.startsWith('defender')
                    ? { fontSize: 18, rise: 18, duration: 640 }
                    : { fontSize: 16, rise: 16, duration: 600 };
            this.playEmojiBurst(actionInfo.emoji, this.playerShip.x, this.playerShip.y - 16, burstOptions);
        }
        const eventInfo = { ...actionInfo };
        if (actionInfo.type === 'defender_shield') {
            eventInfo.radiusTiles = Number(actionInfo.shieldRadiusTiles) || Number(actionInfo.radiusTiles) || null;
            eventInfo.effect = 'shield';
            eventInfo.shieldDurationMs = Number(actionInfo.shieldDurationMs) || null;
        }
        this.emitShipActionEvent(eventInfo, this.playerShip.x, this.playerShip.y);

        if (actionInfo.type === 'explorer') {
            const duration = Number(actionInfo.durationMs) || GAME_CONFIG.SHIP_ACTION_DURATION_MS;
            if (Number.isFinite(actionInfo.speedMultiplier)) {
                this.shipActionSpeedBoostUntil = now + duration;
                this.shipActionSpeedBoostMultiplier = Number(actionInfo.speedMultiplier) || 1.5;
                this.showMessage(`${actionInfo.label || '速度上昇'}!`);
            }
            if (Number.isFinite(actionInfo.agilityMultiplier)) {
                this.shipActionAgilityUntil = now + duration;
                this.shipActionAgilityMultiplier = Number(actionInfo.agilityMultiplier) || 1;
            }
            if (Number.isFinite(actionInfo.visionMultiplier)) {
                this.applyVisionBoost(actionInfo.visionMultiplier, duration, actionInfo.minimapBoostMs || 0);
            }
            if (actionInfo.ignoreShipCollision) {
                this.shipActionIgnoreShipCollisionUntil = now + duration;
            }
            this.spawnExplorerDecoys(actionInfo);
        } else if (actionInfo.type === 'merchant') {
            const duration = Number(actionInfo.durationMs) || GAME_CONFIG.SHIP_ACTION_DURATION_MS;
            if (actionInfo.effect === 'island_pass') {
                this.shipActionIslandPassUntil = now + duration;
                this.showMessage(`${actionInfo.label || '島を通過'}!`);
            } else if (actionInfo.effect === 'damage_immune') {
                this.showMessage(`${actionInfo.label || '装甲展開'}!`);
                this.applyShipActionImmune(duration);
            } else if (actionInfo.effect === 'minefield') {
                this.showMessage(`${actionInfo.label || '水爆設置'}!`);
                const mine = {
                    ownerId: this.playerInfo.playFabId,
                    x: this.playerShip.x,
                    y: this.playerShip.y,
                    radius: (Number(actionInfo.mineRadiusTiles) || 2) * this.TILE_SIZE,
                    damage: Number(actionInfo.mineDamage) || 200,
                    expiresAt: now + Math.max(0, Number(actionInfo.mineDurationMs) || 12000),
                    emojis: Array.isArray(actionInfo.emoji) ? actionInfo.emoji : ['💧', '💣']
                };
                this.registerShipActionMine(mine);
            } else if (actionInfo.effect === 'vision_shrink') {
                this.showMessage(`${actionInfo.label || '視界縮小'}!`);
            } else {
                this.showMessage(`${actionInfo.label || '支援'}!`);
            }
        } else if (actionInfo.type === 'defender' || actionInfo.type === 'defender_shield' || actionInfo.type === 'defender_broadside' || actionInfo.type === 'defender_gust' || actionInfo.type === 'defender_snare' || actionInfo.type === 'defender_jamstorm') {
            this.applyDefenderAction(actionInfo);
        } else if (actionInfo.type === 'fighter') {
            this.applyFighterAction(actionInfo);
        }

        const cooldownMs = Number(actionInfo?.cooldownMs) || GAME_CONFIG.SHIP_ACTION_COOLDOWN_MS;
        this.shipActionCooldownUntil = now + cooldownMs;
        this.updateShipActionUi(true);
    }

    getPlayerFacingVector() {
        const body = this.playerShip?.body;
        if (body && (Math.abs(body.velocity.x) > 0.1 || Math.abs(body.velocity.y) > 0.1)) {
            const len = Math.hypot(body.velocity.x, body.velocity.y) || 1;
            return { x: body.velocity.x / len, y: body.velocity.y / len };
        }
        const lastAnim = this.playerShip?.lastAnimKey || 'ship_down';
        const map = {
            ship_up: { x: 0, y: -1 },
            ship_down: { x: 0, y: 1 },
            ship_left: { x: -1, y: 0 },
            ship_right: { x: 1, y: 0 },
            ship_up_left: { x: -0.7, y: -0.7 },
            ship_up_right: { x: 0.7, y: -0.7 },
            ship_down_left: { x: -0.7, y: 0.7 },
            ship_down_right: { x: 0.7, y: 0.7 }
        };
        return map[lastAnim] || { x: 0, y: 1 };
    }

    getTargetsInCone(rangePx, angleDeg) {
        if (!this.playerShip) return [];
        const origin = { x: this.playerShip.x, y: this.playerShip.y };
        const heading = this.getFacingAngleRad();
        return this.getTargetsInConeAt(origin, heading, rangePx, angleDeg);
    }

    getTargetsInConeAt(origin, headingRad, rangePx, angleDeg) {
        const facing = { x: Math.cos(headingRad), y: Math.sin(headingRad) };
        const cosThreshold = Math.cos(Phaser.Math.DegToRad(angleDeg / 2));
        const targets = [];
        this.otherShips.forEach((shipObject, otherId) => {
            const sprite = shipObject?.sprite;
            if (!sprite) return;
            const dx = sprite.x - origin.x;
            const dy = sprite.y - origin.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 0 || dist > rangePx) return;
            const dot = (dx / dist) * facing.x + (dy / dist) * facing.y;
            if (dot >= cosThreshold) {
                targets.push({ playFabId: otherId, distance: dist });
            }
        });
        return targets;
    }

    async applyShipActionDamage(targets, damage, attackerIdOverride = null, fxOptions = null) {
        if (!targets.length) {
            this.showMessage('対象がいません');
            return;
        }
        const filtered = targets.filter(target => !this.isShipInBattle(target.playFabId));
        if (filtered.length === 0) {
            this.showMessage('戦闘中の相手には攻撃できません。');
            return;
        }
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ship-action-damage') : '/api/ship-action-damage'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attackerId: attackerIdOverride || this.playerInfo.playFabId,
                    targets: filtered.map(t => t.playFabId),
                    damage: damage
                })
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                this.showMessage('攻撃に失敗しました');
            } else {
                const hitCount = Number(data?.hits) || filtered.length;
                this.showMessage(`命中 ${hitCount}`);
                if (Array.isArray(data.results)) {
                    data.results.forEach((result) => {
                        if (!result || result.skipped || result.error) return;
                        const target = this.otherShips.get(result.playFabId);
                        if (target && target.sprite) {
                            const maxHp = Number(target.hp?.max || result.hp || 0);
                            target.hp = { current: Number(result.hp), max: maxHp };
                            this.playShipHitEffect(
                                target.sprite.x,
                                target.sprite.y,
                                result.damageTaken,
                                target.sprite,
                                this.playerShip?.x,
                                this.playerShip?.y
                            );
                            if (result.respawnPosition) {
                                target.sprite.setPosition(result.respawnPosition.x, result.respawnPosition.y);
                            }
                        }
                        if (result.respawned) {
                            this.notifyShipCargoOutcome(result.cargoOutcome, attackerIdOverride || this.playerInfo?.playFabId, result.playFabId);
                        }
                    });
                }
                if (hitCount > 0 && fxOptions?.impactSfx) {
                    this.playSideCannonSfx('impact');
                }
                if (hitCount > 0 && fxOptions?.hitStopOnHit) {
                    this.applyHitStop(Number(fxOptions?.hitStopMs) || 80);
                }
            }
        } catch (e) {
            console.warn('[ShipAction] Damage request failed:', e);
            this.showMessage('攻撃に失敗しました');
        }
    }

    async applyShipActionShield(targets, durationMs, shieldFactor) {
        if (!targets.length) {
            this.showMessage('味方がいません');
            return;
        }
        const shieldDuration = Math.max(0, Number(durationMs) || 0);
        if (shieldDuration <= 0) {
            this.showMessage('守護時間がありません');
            return;
        }
        const factorRaw = Number.isFinite(Number(shieldFactor)) ? Number(shieldFactor) : 0.6;
        const factor = Math.min(1, Math.max(0.2, factorRaw));
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ship-action-shield') : '/api/ship-action-shield'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attackerId: this.playerInfo.playFabId,
                    targets: targets.map(t => t.playFabId),
                    durationMs: shieldDuration,
                    shieldFactor: factor
                })
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                this.showMessage('守護に失敗しました');
            }
        } catch (e) {
            console.warn('[ShipAction] Shield request failed:', e);
            this.showMessage('守護に失敗しました');
        }
    }

    async applyShipActionImmune(durationMs) {
        if (!this.playerInfo?.playFabId) return;
        const immuneDuration = Math.max(0, Number(durationMs) || 0);
        if (immuneDuration <= 0) return;
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ship-action-immune') : '/api/ship-action-immune'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playFabId: this.playerInfo.playFabId,
                    durationMs: immuneDuration
                })
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                this.showMessage('装甲展開に失敗しました');
                return;
            }
            this.shipActionImmuneUntil = Math.max(this.shipActionImmuneUntil, Date.now() + immuneDuration);
        } catch (e) {
            console.warn('[ShipAction] Immune request failed:', e);
            this.showMessage('装甲展開に失敗しました');
        }
    }

    async applyShipActionPlayerDamage(targets, damage) {
        if (!targets.length) {
            this.showMessage('対象がいません');
            return;
        }
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ship-action-player-damage') : '/api/ship-action-player-damage'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attackerId: this.playerInfo.playFabId,
                    targets: targets.map(t => t.playFabId),
                    damage: damage
                })
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                this.showMessage('毒ガスが効かなかった');
            } else {
                this.showMessage(`毒ガス命中 ${data?.hits || targets.length}`);
            }
        } catch (e) {
            console.warn('[ShipAction] Player damage request failed:', e);
            this.showMessage('毒ガスが効かなかった');
        }
    }

    registerShipActionMine(mineOrX, y, radiusTiles, damage, durationMs, ownerId) {
        let mine = mineOrX;
        if (Number.isFinite(mineOrX) && Number.isFinite(y)) {
            mine = {
                ownerId: ownerId || null,
                x: Number(mineOrX),
                y: Number(y),
                radius: (Number(radiusTiles) || 2) * this.TILE_SIZE,
                damage: Number(damage) || 200,
                expiresAt: Date.now() + Math.max(0, Number(durationMs) || 12000),
                emojis: ['💧', '💣']
            };
        }
        if (!mine || !Number.isFinite(mine.x) || !Number.isFinite(mine.y)) return;
        this.shipActionMines.push(mine);
        if (Array.isArray(mine.emojis) && mine.emojis.length > 0) {
            this.playEmojiBurst(mine.emojis, mine.x, mine.y - 8);
        }
    }

    updateShipActionMines() {
        if (!this.playerShip || !Array.isArray(this.shipActionMines) || this.shipActionMines.length === 0) return;
        const now = Date.now();
        this.shipActionMines = this.shipActionMines.filter((mine) => {
            if (!mine || mine.triggered) return false;
            if (mine.expiresAt && now >= mine.expiresAt) return false;
            const radius = Number(mine.radius) || 0;
            if (radius <= 0) return true;
            const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, mine.x, mine.y);
            if (dist > radius) return true;
            if (mine.ownerId && mine.ownerId === this.playerInfo?.playFabId) return true;
            mine.triggered = true;
            this.playEmojiBurst(['💥', '💧'], mine.x, mine.y - 8);
            if (Number.isFinite(mine.damage) && mine.damage > 0) {
                this.applyShipActionDamage([{ playFabId: this.playerInfo.playFabId, distance: dist }], mine.damage, mine.ownerId);
            }
            return false;
        });
    }

    spawnExplorerDecoys(actionInfo = {}) {
        if (!this.playerShip) return;
        const count = Math.max(0, Number(actionInfo.decoyCount) || 0);
        if (count <= 0) return;
        const offsetTiles = Math.max(1, Number(actionInfo.decoyOffsetTiles) || 3);
        const offsetPx = offsetTiles * this.TILE_SIZE;
        const decoyInfo = {
            type: actionInfo.type,
            label: actionInfo.label,
            emoji: ['💨', '❓'],
            effect: 'decoy'
        };
        for (let i = 0; i < count; i += 1) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dist = Phaser.Math.FloatBetween(offsetPx * 0.6, offsetPx);
            const x = this.playerShip.x + Math.cos(angle) * dist;
            const y = this.playerShip.y + Math.sin(angle) * dist;
            this.emitShipActionEvent(decoyInfo, x, y);
        }
    }

    async triggerIslandAutoAttack(islandData, config) {
        if (!config || !this.playerInfo?.playFabId) return;
        const islandId = islandData?.id || null;
        const remainingCooldownMs = this.getIslandAttackCooldownRemaining(islandId, config);
        if (remainingCooldownMs > 0) {
            const cooldownSeconds = Math.max(1, Math.ceil(remainingCooldownMs / 1000));
            this.showMessage(`攻撃準備まで残り${cooldownSeconds}秒`);
            return;
        }
        const center = this.getIslandCenterPoint(islandData);
        if (!center) return;
        const rangeTiles = Number(config.radiusTiles) || 0;
        if (!Number.isFinite(rangeTiles) || rangeTiles <= 0) return;

        this.activateIslandAttackVision(rangeTiles);

        const rangePx = rangeTiles * this.TILE_SIZE;
        const myNation = String(this.playerInfo?.nation || this.playerInfo?.Nation || '').toLowerCase();
        const candidates = [];
        this.otherShips.forEach((shipObject, otherId) => {
            const sprite = shipObject?.sprite;
            if (!sprite) return;
            const dist = Phaser.Math.Distance.Between(center.x, center.y, sprite.x, sprite.y);
            if (!Number.isFinite(dist) || dist > rangePx) return;
            const otherNation = String(shipObject?.data?.nation || shipObject?.data?.Nation || sprite.__ownerNation || '').toLowerCase();
            if (myNation && otherNation && myNation === otherNation) return;
            const displayName = shipObject?.data?.displayName || shipObject?.data?.name || shipObject?.data?.playerName || otherId;
            candidates.push({ playFabId: otherId, sprite, distance: dist, name: displayName });
        });

        if (candidates.length === 0) {
            this.showMessage('範囲内に敵がいません');
            return;
        }

        if (islandId) {
            this.islandAttackCooldownById.set(islandId, Date.now());
        }

        let hitTargets = [];
        if (config.mode === 'single') {
            candidates.sort((a, b) => a.distance - b.distance);
            const target = candidates[0];
            if (Math.random() <= Number(config.hitChance)) {
                hitTargets = [target];
            }
        } else {
            hitTargets = candidates.filter(() => Math.random() <= Number(config.hitChance));
        }

        if (hitTargets.length === 0) {
            this.showMessage('攻撃が外れた');
            return;
        }

        const damageValue = Number(config.damage) || 0;
        if (Number.isFinite(damageValue) && damageValue > 0) {
            const primaryTarget = hitTargets[0];
            const targetLabel = primaryTarget?.name || primaryTarget?.playFabId || '敵';
            const msg = `HIT！${targetLabel}に${Math.round(damageValue)}ダメージ！`;
            if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                window.showRpgMessage(msg);
            } else {
                this.showMessage(msg);
            }
        }

        const actionInfo = {
            type: 'island_attack',
            label: config.label || 'IslandAttack',
            emoji: Array.isArray(config.emojis) ? config.emojis : []
        };

        const emitPromises = [];
        hitTargets.forEach((target) => {
            if (actionInfo.emoji.length > 0) {
                const emoji = actionInfo.emoji[Math.floor(Math.random() * actionInfo.emoji.length)];
                this.playEmojiShot(emoji, center.x, center.y - 6, target.sprite.x, target.sprite.y - 8);
                this.playEmojiBurst(actionInfo.emoji, target.sprite.x, target.sprite.y - 12);
            }
            emitPromises.push(this.emitShipActionEvent(actionInfo, target.sprite.x, target.sprite.y));
        });
        await Promise.all(emitPromises);

        if (Number.isFinite(damageValue) && damageValue > 0) {
            await this.applyShipActionDamage(
                hitTargets.map(t => ({ playFabId: t.playFabId, distance: t.distance })),
                damageValue
            );
        }
    }

    applyFighterAction(actionInfo) {
        const tile = this.TILE_SIZE;
        const range = tile * Math.max(1, Number(actionInfo?.rangeTiles) || 5);
        const angle = Number(actionInfo?.angle) || 50;
        const damage = Number(actionInfo?.damage) || 300;
        const radiusTiles = Number(actionInfo?.radiusTiles);
        const heading = this.getFacingAngleRad();
        const effectColor = this.getActionEffectColor(actionInfo?.effect, 0xffd166);
        if (Number.isFinite(radiusTiles) && radiusTiles > 0) {
            const radius = tile * radiusTiles;
            const targets = [];
            this.otherShips.forEach((shipObject, otherId) => {
                const sprite = shipObject?.sprite;
                if (!sprite) return;
                const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, sprite.x, sprite.y);
                if (dist <= radius) {
                    targets.push({ playFabId: otherId, distance: dist });
                }
            });
            this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, radius, effectColor);
            if (actionInfo?.effect === 'poison_gas') {
                this.applyShipActionPlayerDamage(targets, damage);
            } else {
                this.applyShipActionDamage(targets, damage);
            }
            return;
        }
        const targets = this.getTargetsInCone(range, angle);
        this.playActionConeEffectAt(this.playerShip.x, this.playerShip.y, range, angle, heading, effectColor);
        if (actionInfo?.effect === 'cannon_shot') {
            this.playCannonShot(this.playerShip.x, this.playerShip.y, range, heading);
        }
        if (actionInfo?.effect === 'drill_burst') {
            this.playDrillBurst(this.playerShip.x, this.playerShip.y, heading);
        }
        this.applyShipActionDamage(targets, damage);
    }

    async applyDefenderAction(actionInfo = {}) {
        if (!this.playerShip) return;
        if (actionInfo.type === 'defender_broadside') {
            this.applyDefenderBroadsideAction(actionInfo);
            return;
        }
        if (actionInfo.type === 'defender_gust') {
            this.applyDefenderGustAction(actionInfo);
            return;
        }
        if (actionInfo.type === 'defender_snare') {
            this.applyDefenderSnareAction(actionInfo);
            return;
        }
        if (actionInfo.type === 'defender_jamstorm') {
            this.applyDefenderJamStormAction(actionInfo);
            return;
        }
        await this.applyDefenderShieldAction(actionInfo);
    }

    getDefenderBroadsideBundle(actionInfo = {}) {
        if (!this.playerShip) return null;
        const isSideCannon = String(actionInfo?.type || '').toLowerCase() === 'side_cannon';
        const tile = this.TILE_SIZE;
        const range = tile * Math.max(1, Number(actionInfo?.rangeTiles) || 5);
        const angle = Number(actionInfo?.angle) || 60;
        const damage = Number(actionInfo?.damage) || 280;
        const origin = { x: this.playerShip.x, y: this.playerShip.y };
        const heading = this.getFacingAngleRad();
        const effectColor = this.getActionEffectColor(actionInfo?.effect, 0xffd34d);
        const leftHeading = heading - Math.PI / 2;
        const rightHeading = heading + Math.PI / 2;
        const leftTargets = this.getTargetsInConeAt(origin, leftHeading, range, angle);
        const rightTargets = this.getTargetsInConeAt(origin, rightHeading, range, angle);
        const targetMap = new Map();
        [...leftTargets, ...rightTargets].forEach((target) => {
            if (!target || !target.playFabId) return;
            const existing = targetMap.get(target.playFabId);
            if (!existing || target.distance < existing.distance) {
                targetMap.set(target.playFabId, target);
            }
        });
        return {
            isSideCannon,
            range,
            angle,
            damage,
            origin,
            effectColor,
            leftHeading,
            rightHeading,
            targets: Array.from(targetMap.values())
        };
    }

    applyDefenderBroadsideAction(actionInfo = {}, broadsideBundle = null) {
        if (!this.playerShip) return;
        const info = broadsideBundle || this.getDefenderBroadsideBundle(actionInfo);
        if (!info) return;
        const { isSideCannon, range, angle, damage, origin, effectColor, leftHeading, rightHeading, targets } = info;
        this.playActionConeEffectAt(origin.x, origin.y, range, angle, leftHeading, effectColor);
        this.playActionConeEffectAt(origin.x, origin.y, range, angle, rightHeading, effectColor);
        const cannonFxOptions = isSideCannon
            ? { glyph: '💣', durationMs: 180, impactGlyph: '💥', impactTint: 0xffef9f }
            : null;
        this.playCannonShot(origin.x, origin.y, range, leftHeading, cannonFxOptions);
        this.playCannonShot(origin.x, origin.y, range, rightHeading, cannonFxOptions);
        this.applyShipActionDamage(targets, damage, null, isSideCannon
            ? { hitStopOnHit: true, hitStopMs: Number(actionInfo?.hitStopMs) || 80, impactSfx: true }
            : null
        );
    }

    applyDefenderGustAction(actionInfo = {}) {
        if (!this.playerShip) return;
        const radiusTiles = Number(actionInfo.radiusTiles) || 0;
        if (!Number.isFinite(radiusTiles) || radiusTiles <= 0) {
            this.showMessage('範囲がありません');
            return;
        }
        const radius = radiusTiles * this.TILE_SIZE;
        this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, radius, this.getActionEffectColor(actionInfo?.effect, 0xa5d8ff));
        this.showMessage(`${actionInfo.label || '疾風'}!`);
    }

    applyDefenderSnareAction(actionInfo = {}) {
        if (!this.playerShip || !this.playerInfo?.playFabId) return;
        const range = this.TILE_SIZE * Math.max(1, Number(actionInfo.rangeTiles) || 5);
        const myNation = String(this.playerInfo?.nation || this.playerInfo?.Nation || '').toLowerCase();
        let nearest = null;
        this.otherShips.forEach((shipObject, otherId) => {
            const sprite = shipObject?.sprite;
            if (!sprite) return;
            const otherNation = String(shipObject?.data?.nation || shipObject?.data?.Nation || sprite.__ownerNation || '').toLowerCase();
            if (myNation && otherNation && myNation === otherNation) return;
            const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, sprite.x, sprite.y);
            if (dist > range) return;
            if (!nearest || dist < nearest.distance) {
                nearest = { playFabId: otherId, distance: dist, x: sprite.x, y: sprite.y };
            }
        });
        if (!nearest) {
            this.showMessage('対象がいません');
            return;
        }
        const eventInfo = {
            ...actionInfo,
            targetId: nearest.playFabId,
            radiusTiles: Number(actionInfo.rangeTiles) || null,
            snareDurationMs: Number(actionInfo.snareDurationMs) || 0,
            effect: 'snare'
        };
        const traceColor = this.getActionEffectColor(eventInfo.effect, 0x7fb3d5);
        this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, this.TILE_SIZE * 1.2, traceColor);
        this.playEmojiShot('⚓', this.playerShip.x, this.playerShip.y - 6, nearest.x, nearest.y - 8);
        this.emitShipActionEvent(eventInfo, nearest.x, nearest.y);
        this.showMessage(`${actionInfo.label || '捕捉'}!`);
    }

    applyDefenderJamStormAction(actionInfo = {}) {
        if (!this.playerShip) return;
        const radiusTiles = Number(actionInfo.radiusTiles) || 0;
        if (!Number.isFinite(radiusTiles) || radiusTiles <= 0) {
            this.showMessage('範囲がありません');
            return;
        }
        const radius = radiusTiles * this.TILE_SIZE;
        this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, radius, this.getActionEffectColor(actionInfo?.effect, 0xb18cff));
        this.showMessage(`${actionInfo.label || '砂嵐'}!`);
    }

    async applyDefenderShieldAction(actionInfo = {}) {
        if (!this.playerShip || !this.playerInfo?.playFabId) return;
        const radiusTiles = Number(actionInfo?.shieldRadiusTiles) || Number(actionInfo?.radiusTiles) || 0;
        const durationMs = Number(actionInfo?.shieldDurationMs) || 7000;
        const shieldFactor = Number(actionInfo?.shieldFactor);
        if (!Number.isFinite(radiusTiles) || radiusTiles <= 0) {
            this.showMessage('守護範囲がありません');
            return;
        }
        const radiusPx = radiusTiles * this.TILE_SIZE;
        const myNation = String(this.playerInfo?.nation || this.playerInfo?.Nation || '').toLowerCase();
        const targets = [];
        this.otherShips.forEach((shipObject, otherId) => {
            const sprite = shipObject?.sprite;
            if (!sprite) return;
            const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, sprite.x, sprite.y);
            if (dist > radiusPx) return;
            const otherNation = String(shipObject?.data?.nation || shipObject?.data?.Nation || sprite.__ownerNation || '').toLowerCase();
            if (myNation && otherNation && myNation !== otherNation) return;
            targets.push({ playFabId: otherId });
        });
        targets.push({ playFabId: this.playerInfo.playFabId });

        this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, radiusPx, this.getActionEffectColor(actionInfo?.effect, 0x7be495));
        if (Array.isArray(actionInfo?.emoji) && actionInfo.emoji.length > 0) {
            this.playEmojiBurst(actionInfo.emoji, this.playerShip.x, this.playerShip.y - 14);
        }
        await this.applyShipActionShield(targets, durationMs, shieldFactor);
        this.showMessage(`${actionInfo.label || '守護'}を展開`);
    }

    async damageBuildingOnIsland(islandId, damage = 300) {
        if (!this.firestore || !islandId) return;
        const { doc, getDoc, updateDoc } = await import('firebase/firestore');
        const islandRef = doc(this.firestore, this.getWorldMapCollectionName(), islandId);
        const snap = await getDoc(islandRef);
        if (!snap.exists()) {
            this.showMessage('島が見つかりません');
            return;
        }
        const data = snap.data() || {};
        const buildings = Array.isArray(data.buildings) ? data.buildings.slice() : [];
        const idx = buildings.findIndex(b => b && b.status !== 'demolished');
        if (idx === -1) {
            this.showMessage('建物がありません');
            return;
        }

        const b = buildings[idx];
        const maxHpFallback = (() => {
            if (Number.isFinite(Number(b.buildTimeSeconds))) return Number(b.buildTimeSeconds);
            if (Number.isFinite(Number(b.durationMs))) return Math.max(1, Math.floor(Number(b.durationMs) / 1000));
            return Number(b.maxHp) || 1;
        })();
        const maxHp = Number(b.maxHp) || maxHpFallback;
        const current = Number.isFinite(Number(b.currentHp)) ? Number(b.currentHp) : maxHp;
        const next = Math.max(0, current - Number(damage || 0));
        const nextEntry = { ...b, maxHp, currentHp: next };
        if (next <= 0) {
            nextEntry.status = 'demolished';
        }
        buildings[idx] = nextEntry;
        await updateDoc(islandRef, { buildings });
        await this.reloadIslandFromFirestore(islandId);
        this.showMessage(next <= 0 ? '建物を破壊しました' : '建物にダメージ');
    }

    async reloadIslandFromFirestore(islandId) {
        if (!this.firestore) return;
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(this.firestore, this.getWorldMapCollectionName(), islandId));
        if (!snap.exists()) return;
        const data = snap.data() || {};
        this.removeIslandById(islandId);
        this.createIsland({
            id: snap.id,
            x: data.coordinate.x * this.gridSize,
            y: data.coordinate.y * this.gridSize,
            name: data.name || '名称未設定',
            size: data.size || 'small',
            ownerNation: data.ownerNation || data.ownerRace,
            ownerId: data.ownerId,
            biome: data.biome,
            biomeFrame: data.biomeFrame,
            buildingSlots: data.buildingSlots,
            buildings: data.buildings || [],
            captureState: data.captureState || null,
            mapId: this.mapId
        });
    }

    removeIslandById(islandId) {
        const islandData = this.islandObjects.get(islandId);
        if (!islandData) return;
        islandData.sprites?.forEach(sprite => sprite?.destroy?.());
        islandData.buildingSprites?.forEach(sprite => sprite?.destroy?.());
        islandData.nameText?.destroy?.();
        islandData.captureOverlay?.container?.destroy?.();
        islandData.interactiveZone?.destroy?.();
        islandData.physicsGroup?.destroy?.(true);
        this.islandObjects.delete(islandId);
    }

    focusIslandById(islandId) {
        if (!islandId || !this.islandObjects) return;
        const islandData = this.islandObjects.get(islandId);
        if (!islandData) return;
        const cam = this.cameras?.main;
        if (cam) {
            cam.centerOn(islandData.x + islandData.width / 2, islandData.y + islandData.height / 2);
        }
        this.showIslandCommandMenu(islandData);
    }

    openBuildingMenuById(islandId) {
        if (!islandId || !this.islandObjects) return;
        const islandData = this.islandObjects.get(islandId);
        if (!islandData) return;
        this.openBuildingMenuForIsland(islandData);
    }

    setNavigationTarget(islandId) {
        if (!islandId || !this.islandObjects) return false;
        const islandData = this.islandObjects.get(islandId);
        if (!islandData) return false;
        this.navTargetId = islandId;
        this.navTargetLabel = islandData.name || 'NAV';
        this.updateNavigationHud();
        return true;
    }

    clearNavigationTarget() {
        this.navTargetId = null;
        this.navTargetLabel = null;
        this.updateNavigationHud();
    }

    getCurrentIslandUnderPlayer(buffer = 0) {
        if (!this.playerShip || !this.islandObjects || this.islandObjects.size === 0) return null;
        const px = this.playerShip.x;
        const py = this.playerShip.y;
        let currentIsland = null;
        this.islandObjects.forEach((islandData) => {
            if (currentIsland || !islandData) return;
            const withinX = px >= islandData.x - buffer && px <= islandData.x + islandData.width + buffer;
            const withinY = py >= islandData.y - buffer && py <= islandData.y + islandData.height + buffer;
            if (withinX && withinY) {
                currentIsland = islandData;
            }
        });
        return currentIsland;
    }

    updateNavigationHud() {
        const hud = document.getElementById('mapNavHud');
        const arrowEl = document.getElementById('mapNavArrow');
        const labelEl = document.getElementById('mapNavLabel');
        const distanceEl = document.getElementById('mapNavDistance');
        const clearBtn = document.getElementById('mapNavClear');
        if (clearBtn && !clearBtn.dataset.bound) {
            clearBtn.dataset.bound = '1';
            clearBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.clearNavigationTarget();
            });
        }
        if (!this.navTargetId || !this.playerShip || !this.islandObjects) {
            if (hud) hud.hidden = true;
            if (this.navArrow) this.navArrow.setVisible(false);
            if (this.navDistanceText) this.navDistanceText.setVisible(false);
            return;
        }
        const islandData = this.islandObjects.get(this.navTargetId);
        if (!islandData) {
            if (hud) hud.hidden = true;
            if (this.navArrow) this.navArrow.setVisible(false);
            if (this.navDistanceText) this.navDistanceText.setVisible(false);
            return;
        }
        const targetX = islandData.x + islandData.width / 2;
        const targetY = islandData.y + islandData.height / 2;
        const dx = targetX - this.playerShip.x;
        const dy = targetY - this.playerShip.y;
        const currentIsland = this.getCurrentIslandUnderPlayer();
        if (currentIsland && currentIsland.id === islandData.id) {
            if (typeof window !== 'undefined' && window.__tutorialFirstIsland?.stage === 'nav') {
                const tutorial = window.__tutorialFirstIsland;
                if (tutorial?.islandId === this.navTargetId && typeof window.showRpgMessage === 'function') {
                    window.showRpgMessage(window.rpgSay?.tutorialArrived ? window.rpgSay.tutorialArrived() : '島に到着した！');
                    tutorial.stage = 'arrived';
                }
            }
            this.clearNavigationTarget();
            return;
        }
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distTiles = Math.max(0, Math.round(distPx / this.TILE_SIZE));

        const angleRad = Math.atan2(dy, dx);
        if (hud) {
            hud.hidden = false;
        }
        if (labelEl) {
            const navigationLabel = this.navTargetLabel || islandData.name || 'NAV';
            if (labelEl.textContent !== navigationLabel) {
                labelEl.textContent = navigationLabel;
                labelEl.title = navigationLabel;
                const labelLength = Array.from(navigationLabel).length;
                labelEl.classList.toggle('is-long', labelLength >= 10);
                labelEl.classList.toggle('is-very-long', labelLength >= 16);
            }
        }
        if (distanceEl) {
            distanceEl.textContent = `距離 ${distTiles}`;
        }
        if (arrowEl) {
            arrowEl.style.transform = `rotate(${angleRad + Math.PI / 2}rad)`;
        }
        if (this.navArrow) this.navArrow.setVisible(false);
        if (this.navDistanceText) this.navDistanceText.setVisible(false);
    }

    updatePositionHud() {
        if (!this.positionText || !this.playerShip) return;
        const tileX = Math.floor(this.playerShip.x / this.TILE_SIZE);
        const tileY = Math.floor(this.playerShip.y / this.TILE_SIZE);
        this.positionText.setText(`x:${tileX} y:${tileY}`);
    }

    showBoardingButton(targetPlayFabId, displayName = '') {
        if (!LEGACY_BOARDING_BATTLE_ENABLED) return;
        this.showShipCommandMenu(targetPlayFabId, displayName);
    }

    hideBoardingButton() {
        this.hideShipCommandMenu();
    }

    showShipCommandMenu(targetPlayFabId, displayName = '') {
        if (!LEGACY_BOARDING_BATTLE_ENABLED) {
            this.hideShipCommandMenu();
            return;
        }
        const panel = document.getElementById('islandCommandPanel');
        const title = document.getElementById('islandCommandTitle');
        const actionBtn = document.getElementById('islandCommandAction');
        const attackBtn = document.getElementById('islandCommandAttack');
        const closeBtn = document.getElementById('islandCommandClose');

        if (!panel || !title || !actionBtn || !attackBtn || !closeBtn) {
            console.error('[showShipCommandMenu] HTMLパネルが見つかりません');
            return;
        }

        this.wireIslandCommandPullToClose();

        if (this.isShipInBattle(this.playerInfo?.playFabId) || this.isShipInBattle(targetPlayFabId)) {
            this.showMessage('戦闘中は乗り込めません。');
            return;
        }
        const myNation = String(this.playerInfo?.nation || '').toLowerCase();
        const target = this.otherShips.get(targetPlayFabId);
        const targetNation = String(target?.data?.nation || target?.data?.Nation || target?.sprite?.__ownerNation || '').toLowerCase();
        const restriction = this.getBoardingRestriction(targetPlayFabId);
        if (restriction?.blocked) {
            this.showMessage(restriction.message);
            return;
        }
        const isGuildShip = !!target?.isGuildShip || !!target?.data?.isGuildShip || !!target?.data?.guildShip;
        if (isGuildShip) {
            this.showMessage('ギルドシップには乗り込めません。');
            return;
        }
        if (myNation && targetNation && myNation === targetNation) {
            this.boardingTargetId = targetPlayFabId;
            title.textContent = displayName ? `船: ${displayName}` : '船';
            actionBtn.textContent = '同乗廃止';
            actionBtn.className = 'island-command-btn info';
            attackBtn.style.display = 'none';
            const newActionBtn = actionBtn.cloneNode(true);
            actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newActionBtn.addEventListener('click', () => {
                this.showMessage('他プレイヤーの同乗は廃止されました。');
            });
            bindModalClose(newCloseBtn, () => {
                this.hideShipCommandMenu();
            });
            setTimeout(() => {
                panel.classList.add('active');
            }, 10);
            this.commandMenuOpen = true;
            return;
        }

        this.boardingTargetId = targetPlayFabId;
        console.log('[Boarding] showShipCommandMenu', { targetPlayFabId, displayName });
        title.textContent = displayName ? `船: ${displayName}` : '船';

        const buttonText = '乗り込む';
        const buttonClass = 'warning';
        const onClick = () => {
            console.log('[Boarding] clicked', { target: this.boardingTargetId });
            if (!this.boardingTargetId) return;
            const clickRestriction = this.getBoardingRestriction(this.boardingTargetId);
            if (clickRestriction?.blocked) {
                this.showMessage(clickRestriction.message);
                return;
            }
            const now = Date.now();
            if (now - this.lastBoardingAt < this.boardingCooldownMs) {
                const remainMs = this.boardingCooldownMs - (now - this.lastBoardingAt);
                const remainSec = Math.ceil(remainMs / 1000);
                this.showMessage(`連続乗り込みは${remainSec}秒後に可能です。`);
                return;
            }
            const target = this.otherShips.get(this.boardingTargetId);
            const distance = target?.sprite
                ? Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, target.sprite.x, target.sprite.y)
                : Number.POSITIVE_INFINITY;
            console.log('[Boarding] distance', { distance, shipCollisionRadius: this.shipCollisionRadius });
            const allowedDistance = Math.max(this.shipCollisionRadius * 2, 96);
            if (!Number.isFinite(distance) || distance > allowedDistance) {
                this.showMessage('距離が離れているため乗り込めません。');
                return;
            }
            if (typeof window !== 'undefined' && typeof window.startBattleWithOpponent === 'function') {
                console.log('[Boarding] startBattleWithOpponent', { opponentId: this.boardingTargetId });
                this.lastBoardingAt = now;
                window.startBattleWithOpponent(this.boardingTargetId);
                this.hideShipCommandMenu();
            } else {
                console.warn('[Boarding] Battle system not ready: window.startBattleWithOpponent not found', { startBattleWithOpponent: window?.startBattleWithOpponent });
            }
        };

        actionBtn.textContent = buttonText;
        actionBtn.className = 'island-command-btn ' + buttonClass;

        const newActionBtn = actionBtn.cloneNode(true);
        actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
        const newAttackBtn = attackBtn.cloneNode(true);
        attackBtn.parentNode.replaceChild(newAttackBtn, attackBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newAttackBtn.style.display = 'none';

        newActionBtn.addEventListener('click', onClick);
        newActionBtn.addEventListener('pointerdown', () => console.log('[Boarding] pointerdown'));
        newActionBtn.addEventListener('pointerup', () => console.log('[Boarding] pointerup'));
        bindModalClose(newCloseBtn, () => {
            this.shipPanelSuppressed = true;
            this.hideShipCommandMenu();
        });

        setTimeout(() => {
            panel.classList.add('active');
        }, 10);

        this.commandMenuOpen = true;
    }

    hideShipCommandMenu() {
        const panel = document.getElementById('islandCommandPanel');
        if (panel) {
            panel.classList.remove('active');
        }
        this.boardingTargetId = null;
        this.commandMenuOpen = false;
    }

    setupRideLeaveUi() {
        if (!RIDE_SYSTEM_ENABLED) return;
        if (typeof document === 'undefined' || this.rideLeaveButton) return;
        const label = document.createElement('div');
        label.id = 'rideStatusLabel';
        label.style.position = 'fixed';
        label.style.right = '16px';
        label.style.bottom = '168px';
        label.style.zIndex = '9999';
        label.style.padding = '8px 12px';
        label.style.borderRadius = '10px';
        label.style.border = '1px solid rgba(255,255,255,0.18)';
        label.style.background = 'rgba(15,23,42,0.88)';
        label.style.color = '#fff';
        label.style.fontSize = '12px';
        label.style.lineHeight = '1.35';
        label.style.display = 'none';
        document.body.appendChild(label);
        this.rideStatusLabel = label;

        const button = document.createElement('button');
        button.id = 'rideLeaveButton';
        button.textContent = '下船する';
        button.style.position = 'fixed';
        button.style.right = '16px';
        button.style.bottom = '120px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 14px';
        button.style.borderRadius = '10px';
        button.style.border = '1px solid rgba(255,255,255,0.3)';
        button.style.background = 'rgba(15,23,42,0.9)';
        button.style.color = '#fff';
        button.style.display = 'none';
        button.addEventListener('click', () => {
            void this.leaveRide();
        });
        document.body.appendChild(button);
        this.rideLeaveButton = button;
        this.updateRideStatusUi();
    }

    updateRideLeaveUi() {
        if (!this.rideLeaveButton) return;
        if (!RIDE_SYSTEM_ENABLED) {
            this.rideLeaveButton.style.display = 'none';
            this.updateRideStatusUi();
            return;
        }
        this.rideLeaveButton.style.display = this.ridingShipId ? 'block' : 'none';
        this.updateRideStatusUi();
    }

    getRideStatusText() {
        if (!RIDE_SYSTEM_ENABLED) return '';
        const passengerCount = Math.max(0, Array.from(this.otherShips.values())
            .filter((entry) => entry?.data?.ridingOwnerId === this.playerInfo?.playFabId)
            .length);
        if (this.ridingShipId && this.ridingOwnerId) {
            const hostShip = this.otherShips.get(this.ridingOwnerId);
            const hostName = String(hostShip?.displayName || hostShip?.data?.displayName || hostShip?.data?.ownerName || this.ridingOwnerId || '不明').trim();
            return `同乗中: ${hostName}`;
        }
        if (passengerCount > 0) {
            const capacity = Math.max(1, Number(this.playerShip?.data?.crewCapacity || this.activeShip?.crewCapacity || this.playerShip?.crewCapacity || passengerCount + 1));
            const occupied = Math.min(capacity, passengerCount + 1);
            return `乗客 ${occupied}/${capacity}`;
        }
        return '';
    }

    updateRideStatusUi() {
        if (!this.rideStatusLabel) return;
        const text = this.getRideStatusText();
        this.rideStatusLabel.textContent = text;
        this.rideStatusLabel.style.display = text ? 'block' : 'none';
    }

    async requestRide(targetPlayFabId, displayName = '') {
        if (!RIDE_SYSTEM_ENABLED) {
            this.showMessage('他プレイヤーの同乗は廃止されました。');
            return;
        }
        if (!this.firestore || !this.playerInfo?.playFabId || !targetPlayFabId) return;
        if (this.ridingShipId) {
            this.showMessage('すでに同乗中です。下船してから申請してください。');
            return;
        }
        try {
            const { doc, setDoc, serverTimestamp, getDoc } = await import('firebase/firestore');
            const requestId = `${targetPlayFabId}_${this.playerInfo.playFabId}`;
            const requestRef = doc(this.firestore, 'shipRideRequests', requestId);
            const existingSnap = await getDoc(requestRef);
            if (existingSnap.exists()) {
                const existing = existingSnap.data() || {};
                const status = String(existing.status || '');
                const expiresAtMs = Number(existing.expiresAtMs || 0);
                if (status === 'pending' && expiresAtMs > Date.now()) {
                    this.showMessage('すでに同乗申請中です。返答を待ってください。');
                    return;
                }
            }
            await setDoc(requestRef, {
                requestId,
                requesterId: this.playerInfo.playFabId,
                requesterName: window.myLineProfile?.displayName || 'Unknown',
                targetId: targetPlayFabId,
                targetName: displayName || '',
                status: 'pending',
                expiresAtMs: Date.now() + this.rideRequestTtlMs,
                mapId: this.mapId || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true });
            this.showMessage('同乗申請を送りました。');
        } catch (error) {
            console.warn('[Ride] Failed to request ride:', error);
            this.showMessage('同乗申請に失敗しました。');
        }
    }

    async subscribeToRideRequests() {
        if (!RIDE_SYSTEM_ENABLED) return;
        if (!this.firestore || !this.playerInfo?.playFabId) return;
        const { collection, query, where, onSnapshot, doc } = await import('firebase/firestore');
        if (this.rideRequestUnsubscribe) {
            this.rideRequestUnsubscribe();
            this.rideRequestUnsubscribe = null;
        }
        const reqQuery = query(
            collection(this.firestore, 'shipRideRequests'),
            where('targetId', '==', this.playerInfo.playFabId),
            where('status', '==', 'pending')
        );
        this.rideRequestUnsubscribe = onSnapshot(reqQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data() || {};
                const requestId = data.requestId || change.doc.id;
                const expiresAtMs = Number(data.expiresAtMs || 0);
                if (expiresAtMs > 0 && expiresAtMs <= Date.now()) {
                    void (async () => {
                        try {
                            const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
                            await setDoc(doc(this.firestore, 'shipRideRequests', requestId), {
                                status: 'expired',
                                updatedAt: serverTimestamp()
                            }, { merge: true });
                        } catch (error) {
                            console.warn('[Ride] Failed to expire request:', error);
                        }
                    })();
                    return;
                }
                if (change.type !== 'added') return;
                const signature = `${requestId}:${expiresAtMs || 0}`;
                if (this.rideRequestSeen.has(signature)) return;
                this.rideRequestSeen.add(signature);
                void this.promptRideRequest(data);
            });
        });

        const statusQuery = query(
            collection(this.firestore, 'shipRideRequests'),
            where('requesterId', '==', this.playerInfo.playFabId)
        );
        this.rideStatusSeen.clear();
        this.rideStatusInitialized = false;
        this.rideStatusUnsubscribe = onSnapshot(statusQuery, (snapshot) => {
            if (!this.rideStatusInitialized) {
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data() || {};
                    const requestId = data.requestId || docSnap.id;
                    const status = String(data.status || '');
                    this.rideStatusSeen.add(`${requestId}:${status}`);
                });
                this.rideStatusInitialized = true;
                return;
            }
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'removed') return;
                const data = change.doc.data() || {};
                const requestId = data.requestId || change.doc.id;
                const status = String(data.status || '');
                const signature = `${requestId}:${status}`;
                if (this.rideStatusSeen.has(signature)) return;
                this.rideStatusSeen.add(signature);
                if (status === 'accepted' && data.targetId) {
                    this.showMessage('同乗が承認されました。');
                } else if (status === 'denied') {
                    this.showMessage('同乗が拒否されました。');
                }
            });
        });

        if (this.rideSelfUnsubscribe) {
            this.rideSelfUnsubscribe();
            this.rideSelfUnsubscribe = null;
        }
        const selfRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
        this.rideSelfUnsubscribe = onSnapshot(selfRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() || {};
            if (!RIDE_SYSTEM_ENABLED) {
                const changed = !!this.ridingShipId || !!this.ridingOwnerId;
                this.ridingShipId = null;
                this.ridingOwnerId = null;
                this.ridingSince = null;
                this.canMove = true;
                if (changed) {
                    this.updateRideLeaveUi();
                    this.updateRideCameraFollow();
                }
                return;
            }
            const ridingShipId = String(data?.ridingShipId || '').trim();
            const ridingOwnerId = String(data?.ridingOwnerId || '').trim();
            const changed = this.ridingShipId !== ridingShipId || this.ridingOwnerId !== ridingOwnerId;
            this.ridingShipId = ridingShipId || null;
            this.ridingOwnerId = ridingOwnerId || null;
            this.ridingSince = data?.ridingSince || null;
            this.canMove = !this.ridingShipId;
            if (changed) {
                this.updateRideLeaveUi();
                this.updateRideCameraFollow();
            }
        });
    }

    async promptRideRequest(request) {
        if (!request || !request.requesterId || !request.targetId) return;
        if (!RIDE_SYSTEM_ENABLED) {
            await this.respondRideRequest(request, false);
            return;
        }
        if (this.ridingShipId) {
            await this.respondRideRequest(request, false);
            return;
        }
        const name = request.requesterName || '味方';
        const accept = await this.showRideRequestModal(`${name}が同乗申請しています。`, request);
        await this.respondRideRequest(request, !!accept);
    }

    async respondRideRequest(request, accepted) {
        try {
            const { doc, setDoc, serverTimestamp, getDoc, query, collection, where, getDocs } = await import('firebase/firestore');
            const requestId = request.requestId || `${request.targetId}_${request.requesterId}`;
            const reqRef = doc(this.firestore, 'shipRideRequests', requestId);
            const expiresAtMs = Number(request?.expiresAtMs || 0);
            if (expiresAtMs > 0 && expiresAtMs <= Date.now()) {
                await setDoc(reqRef, {
                    status: 'expired',
                    updatedAt: serverTimestamp()
                }, { merge: true });
                this.showMessage('同乗申請の有効期限が切れました。');
                return;
            }
            if (!accepted) {
                await setDoc(reqRef, {
                    status: 'denied',
                    updatedAt: serverTimestamp()
                }, { merge: true });
                return;
            }

            const targetDoc = await getDoc(doc(this.firestore, 'ships', request.targetId));
            const targetData = targetDoc.exists() ? targetDoc.data() : {};
            const crewCapacity = Number(targetData?.crewCapacity);
            if (Number.isFinite(crewCapacity) && crewCapacity > 0) {
                const passengerQuery = query(
                    collection(this.firestore, 'ships'),
                    where('ridingOwnerId', '==', request.targetId)
                );
                const passengerSnap = await getDocs(passengerQuery);
                const passengerCount = passengerSnap.size || 0;
                if (passengerCount + 1 >= crewCapacity) {
                    const occupied = Math.max(1, passengerCount + 1);
                    await setDoc(reqRef, {
                        status: 'denied',
                        updatedAt: serverTimestamp(),
                        reason: 'CrewCapacityFull'
                    }, { merge: true });
                    this.showMessage(`定員です（${occupied}/${crewCapacity}）。`);
                    return;
                }
            }
            await setDoc(reqRef, {
                status: 'accepted',
                updatedAt: serverTimestamp()
            }, { merge: true });
            const targetShipId = targetData?.shipId || null;
            const targetPos = targetData?.position || { x: targetData?.currentX, y: targetData?.currentY };
            const passengerRef = doc(this.firestore, 'ships', request.requesterId);
            await setDoc(passengerRef, {
                ridingShipId: targetShipId || null,
                ridingOwnerId: request.targetId,
                ridingSince: Date.now(),
                currentX: targetPos?.x ?? null,
                currentY: targetPos?.y ?? null,
                position: targetPos || null,
                updatedAt: serverTimestamp()
            }, { merge: true });
            this.showMessage('同乗を承認しました。');
        } catch (error) {
            console.warn('[Ride] Failed to respond ride request:', error);
        }
    }

    async leaveRide() {
        if (!this.firestore || !this.playerInfo?.playFabId) return;
        try {
            const shipRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
            const currentX = Number.isFinite(this.playerShip?.x) ? this.playerShip.x : null;
            const currentY = Number.isFinite(this.playerShip?.y) ? this.playerShip.y : null;
            await setDoc(shipRef, {
                ridingShipId: null,
                ridingOwnerId: null,
                ridingSince: null,
                currentX,
                currentY,
                targetX: currentX,
                targetY: currentY,
                arrivalTime: null,
                position: (currentX != null && currentY != null) ? { x: currentX, y: currentY } : null,
                movement: (currentX != null && currentY != null) ? {
                    isMoving: false,
                    departureTime: null,
                    arrivalTime: null,
                    departurePos: { x: currentX, y: currentY },
                    destinationPos: { x: currentX, y: currentY }
                } : null,
                updatedAt: serverTimestamp()
            }, { merge: true });
            this.ridingShipId = null;
            this.ridingOwnerId = null;
            this.ridingSince = null;
            this.rideHostMissingSince = 0;
            this.canMove = true;
            this.updateRideLeaveUi();
            this.updateRideCameraFollow();
            const passengerCount = Array.from(this.otherShips.values())
                .filter((entry) => entry?.data?.ridingOwnerId === this.playerInfo?.playFabId)
                .length;
            this.updatePassengerIconsForHost(this.playerShip, passengerCount, this.myPassengerIcons);
            this.updateRideStatusUi();
            this.showMessage('下船しました。');
        } catch (error) {
            console.warn('[Ride] Failed to leave ride:', error);
        }
    }

    updateRideCameraFollow() {
        if (!this.cameras?.main) return;
        if (RIDE_SYSTEM_ENABLED && this.ridingShipId && this.ridingOwnerId) {
            const targetShip = this.otherShips.get(this.ridingOwnerId);
            const targetSprite = targetShip?.sprite;
            if (targetSprite) {
                this.setCameraFollowTarget(targetSprite);
                return;
            }
        }
        if (this.playerShip) {
            this.setCameraFollowTarget(this.playerShip);
        }
    }

    setCameraFollowTarget(targetSprite) {
        if (!this.cameras?.main || !targetSprite) return;
        if (this.currentCameraFollowTarget === targetSprite) return;
        this.currentCameraFollowTarget = targetSprite;
        this.cameras.main.startFollow(targetSprite, true, this.cameraFollowLerp, this.cameraFollowLerp);
    }

    syncRidePosition() {
        if (!RIDE_SYSTEM_ENABLED) return;
        if (!this.ridingShipId || !this.ridingOwnerId || !this.playerShip) return;
        const targetShip = this.otherShips.get(this.ridingOwnerId);
        const targetSprite = targetShip?.sprite;
        if (!targetSprite) {
            if (!this.rideHostMissingSince) {
                this.rideHostMissingSince = Date.now();
                return;
            }
            if (Date.now() - this.rideHostMissingSince >= 2500) {
                this.showMessage('乗っていた船との接続が切れたため自動下船しました。');
                this.rideHostMissingSince = 0;
                void this.leaveRide();
            }
            return;
        }
        this.rideHostMissingSince = 0;
        this.playerShip.setPosition(targetSprite.x, targetSprite.y);
        this.updateRideCameraFollow();
        const passengerCount = Array.from(this.otherShips.values())
            .filter((entry) => entry?.data?.ridingOwnerId === this.playerInfo?.playFabId)
            .length;
        this.updatePassengerIconsForHost(this.playerShip, passengerCount, this.myPassengerIcons);
        this.updateRideStatusUi();
    }

    updatePassengerIconsForHost(hostSprite, passengerCount, store) {
        if (!hostSprite || !Number.isFinite(passengerCount)) return;
        const maxIcons = Math.min(6, Math.max(0, passengerCount));
        while (store.length > maxIcons) {
            const icon = store.pop();
            icon?.destroy?.();
        }
        while (store.length < maxIcons) {
            const icon = this.add.circle(0, 0, 4, 0xffffff, 0.9);
            icon.setDepth(GAME_CONFIG.DEPTH.SHIP + 2);
            store.push(icon);
        }
        const spacing = 10;
        const startX = hostSprite.x - ((maxIcons - 1) * spacing) / 2;
        const y = hostSprite.y - 28;
        store.forEach((icon, index) => {
            icon.setPosition(startX + index * spacing, y);
        });
    }

    showRideRequestModal(message, request) {
        return new Promise((resolve) => {
            if (typeof document === 'undefined') {
                resolve(false);
                return;
            }
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.background = 'rgba(0,0,0,0.6)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';

            const panel = document.createElement('div');
            panel.style.background = 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))';
            panel.style.border = '1px solid rgba(148,163,184,0.35)';
            panel.style.borderRadius = '12px';
            panel.style.padding = '18px';
            panel.style.minWidth = '260px';
            panel.style.maxWidth = '320px';
            panel.style.color = '#fff';
            panel.style.boxShadow = '0 10px 28px rgba(0,0,0,0.45)';

            const title = document.createElement('div');
            title.textContent = '同乗申請';
            title.style.fontSize = '14px';
            title.style.fontWeight = '700';
            title.style.marginBottom = '10px';

            const body = document.createElement('div');
            body.textContent = message || '同乗申請があります。';
            body.style.fontSize = '13px';
            body.style.lineHeight = '1.4';
            body.style.marginBottom = '12px';

            const detail = document.createElement('div');
            detail.textContent = request?.targetName ? `船: ${request.targetName}` : '';
            detail.style.fontSize = '12px';
            detail.style.opacity = '0.75';
            detail.style.marginBottom = '12px';

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '8px';

            const approveBtn = document.createElement('button');
            approveBtn.textContent = '承認';
            approveBtn.style.flex = '1';
            approveBtn.style.padding = '8px';
            approveBtn.style.borderRadius = '8px';
            approveBtn.style.border = '1px solid rgba(34,197,94,0.6)';
            approveBtn.style.background = 'rgba(34,197,94,0.25)';
            approveBtn.style.color = '#fff';

            const denyBtn = document.createElement('button');
            denyBtn.textContent = '拒否';
            denyBtn.style.flex = '1';
            denyBtn.style.padding = '8px';
            denyBtn.style.borderRadius = '8px';
            denyBtn.style.border = '1px solid rgba(239,68,68,0.6)';
            denyBtn.style.background = 'rgba(239,68,68,0.2)';
            denyBtn.style.color = '#fff';

            actions.appendChild(approveBtn);
            actions.appendChild(denyBtn);
            panel.appendChild(title);
            panel.appendChild(body);
            if (detail.textContent) panel.appendChild(detail);
            panel.appendChild(actions);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            const cleanup = () => {
                overlay.remove();
            };

            approveBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            denyBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
        });
    }

    async ramShipDamage(otherPlayFabId, shipObject) {
        const myId = this.playerInfo?.playFabId;
        if (!myId || !otherPlayFabId) return;
        if (this.isShipInBattle(myId) || this.isShipInBattle(otherPlayFabId)) return;

        if (String(myId) > String(otherPlayFabId)) return;

        const now = Date.now();
        const lastAt = this.lastRamDamageAt.get(otherPlayFabId) || 0;
        if (now - lastAt < 5000) return;
        this.lastRamDamageAt.set(otherPlayFabId, now);

        try {
            const attackerFacing = this.playerShip?.lastAnimKey || 'ship_down';
            const defenderFacing = shipObject?.lastAnimKey || 'ship_down';
            const attackerPos = (this.playerShip && Number.isFinite(this.playerShip.x) && Number.isFinite(this.playerShip.y))
                ? { x: this.playerShip.x, y: this.playerShip.y }
                : null;
            const defenderPos = (shipObject?.sprite && Number.isFinite(shipObject.sprite.x) && Number.isFinite(shipObject.sprite.y))
                ? { x: shipObject.sprite.x, y: shipObject.sprite.y }
                : null;
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ram-ship') : '/api/ram-ship'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attackerId: myId,
                    defenderId: otherPlayFabId,
                    attackerFacing,
                    defenderFacing,
                    attackerPos,
                    defenderPos,
                    damage: 5,
                    mapId: this.mapId || null
                })
            });
            const data = await res.json();
            if (!res.ok) {
                console.warn('[ShipCollision] ram-ship failed:', data);
            } else if (data && typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                const attacker = data.attacker;
                const defender = data.defender;
                if (attacker?.playFabId === myId) {
                    const maxHp = Number(this.playerHp?.max || attacker.hp || 0);
                    this.playerHp = { current: Number(attacker.hp), max: maxHp };
                    this.playShipHitEffect(
                        this.playerShip?.x,
                        this.playerShip?.y,
                        attacker.damageTaken,
                        this.playerShip,
                        defenderPos?.x,
                        defenderPos?.y
                    );
                } else if (attacker?.playFabId) {
                    const target = this.otherShips.get(attacker.playFabId);
                    if (target && target.sprite) {
                        const maxHp = Number(target.hp?.max || attacker.hp || 0);
                        target.hp = { current: Number(attacker.hp), max: maxHp };
                        this.playShipHitEffect(
                            target.sprite.x,
                            target.sprite.y,
                            attacker.damageTaken,
                            target.sprite,
                            defenderPos?.x,
                            defenderPos?.y
                        );
                    }
                }
                if (defender?.playFabId === myId) {
                    const maxHp = Number(this.playerHp?.max || defender.hp || 0);
                    this.playerHp = { current: Number(defender.hp), max: maxHp };
                    this.playShipHitEffect(
                        this.playerShip?.x,
                        this.playerShip?.y,
                        defender.damageTaken,
                        this.playerShip,
                        attackerPos?.x,
                        attackerPos?.y
                    );
                } else if (defender?.playFabId) {
                    const target = this.otherShips.get(defender.playFabId);
                    if (target && target.sprite) {
                        const maxHp = Number(target.hp?.max || defender.hp || 0);
                        target.hp = { current: Number(defender.hp), max: maxHp };
                        this.playShipHitEffect(
                            target.sprite.x,
                            target.sprite.y,
                            defender.damageTaken,
                            target.sprite,
                            attackerPos?.x,
                            attackerPos?.y
                        );
                    }
                }
                if (Number(attacker?.damageTaken || 0) > 0 || Number(defender?.damageTaken || 0) > 0) {
                    this.applyHitStop(95);
                }
                const attackerRespawned = data.attacker?.playFabId === myId && data.attacker?.respawned;
                const defenderRespawned = data.defender?.playFabId === myId && data.defender?.respawned;
                if (attackerRespawned || defenderRespawned) {
                    const msg = window.rpgSay?.shipSunk ? window.rpgSay.shipSunk() : 'ふねが沈んだ…';
                    window.showRpgMessage(msg);
                    const revive = window.rpgSay?.shipRespawned ? window.rpgSay.shipRespawned() : 'ふねが復活した！';
                    setTimeout(() => window.showRpgMessage(revive), 1200);
                }
                if (data?.cargoOutcome) {
                    const winnerId = data.attacker?.respawned && !data.defender?.respawned
                        ? data.defender?.playFabId
                        : (!data.attacker?.respawned && data.defender?.respawned ? data.attacker?.playFabId : null);
                    const defeatedId = data.attacker?.respawned && !data.defender?.respawned
                        ? data.attacker?.playFabId
                        : (!data.attacker?.respawned && data.defender?.respawned ? data.defender?.playFabId : null);
                    this.notifyShipCargoOutcome(data.cargoOutcome, winnerId, defeatedId);
                }
            }
        } catch (error) {
            console.warn('[ShipCollision] ram-ship request error:', error);
        }
    }

    handleShipCollision(otherPlayFabId, shipObject) {
        if (!this.playerShip || !shipObject?.sprite) return;
        const isGuildShip = !!shipObject?.isGuildShip;
        if (isGuildShip) {
            this.showMessage('ギルドシップに接近しました。');
            this.shipPanelSuppressed = true;
        }

        // 閾ｪ闊ｹ蛛懈ｭ｢
        if (this.shipMoving) {
            this.shipMoving = false;
        }
        this.playerShip.body?.setVelocity(0, 0);
        if (this.shipTween) this.shipTween.stop();
        if (this.shipArrivalTimer) this.shipArrivalTimer.remove();
        this.stopShipAnimation();
        this.updateMyShipStoppedPosition();
        this.canMove = true;

        shipObject.motion = null;
        shipObject.sprite.body?.setVelocity(0, 0);
        shipObject.sprite.anims?.stop();
        const idleKey = shipObject.lastAnimKey || 'ship_down';
        const shipTypeKey = shipObject.shipTypeKey;
        if (shipTypeKey && this.shipAnims?.[shipTypeKey]) {
            const idleFrame = this.shipAnims[shipTypeKey].idleFrames?.[idleKey];
            if (idleFrame !== undefined) shipObject.sprite.setFrame(idleFrame);
        }

        const inBattle = this.isShipInBattle(this.playerInfo?.playFabId) || this.isShipInBattle(otherPlayFabId);
        if (inBattle) {
            return;
        }

        const myNation = String(this.playerInfo?.nation || '').toLowerCase();
        const otherNation = String(shipObject?.data?.nation || shipObject?.data?.Nation || shipObject?.sprite?.__ownerNation || '').toLowerCase();

        this.playShipHitEffect(
            (this.playerShip.x + shipObject.sprite.x) / 2,
            (this.playerShip.y + shipObject.sprite.y) / 2,
            null
        );
        if (!myNation || !otherNation || myNation !== otherNation) {
            this.ramShipDamage(otherPlayFabId, shipObject);
        }

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(50);
        }

        const restriction = this.getBoardingRestriction(otherPlayFabId);
        if (restriction?.blocked) {
            this.showMessage(restriction.message);
            return;
        }

        if (!isGuildShip) {
            this.showBoardingButton(otherPlayFabId, shipObject.data?.displayName || '');
            this.showMessage('接近しました。乗り込み可能です。');
            return;
        }

        this.showMessage('ギルドシップには乗り込めません。');
    }

    createShipHpBar(sprite) {
        if (!sprite) return null;
        if (sprite.__hpBar) return sprite.__hpBar;
        const hpBar = this.add.graphics();
        hpBar.setDepth(GAME_CONFIG.DEPTH.SHIP - 1);
        this.ignoreOnUiCamera(hpBar);
        sprite.__hpBar = hpBar;
        return hpBar;
    }

    destroyShipHpBar(sprite) {
        if (sprite?.__hpBar?.destroy) {
            sprite.__hpBar.destroy();
        }
        if (sprite) {
            sprite.__hpBar = null;
        }
    }

    createShipNameLabel(sprite, text = '') {
        if (!sprite) return null;
        if (sprite.__nameLabel) return sprite.__nameLabel;
        const label = this.add.text(sprite.x, sprite.y - 22, text, {
            fontSize: '11px',
            fontStyle: '700',
            color: '#ffffff',
            stroke: '#0f172a',
            strokeThickness: 3,
            shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 3, fill: true }
        });
        label.setOrigin(0.5, 1);
        label.setDepth(GAME_CONFIG.DEPTH.SHIP + 2);
        this.ignoreOnUiCamera(label);
        sprite.__nameLabel = label;
        return label;
    }

    destroyShipNameLabel(sprite) {
        if (sprite?.__nameLabel?.destroy) {
            sprite.__nameLabel.destroy();
        }
        if (sprite) {
            sprite.__nameLabel = null;
        }
    }

    updateShipNameLabel(shipObject) {
        const sprite = shipObject?.sprite;
        if (!sprite) return;
        const displayName = String(
            shipObject?.data?.displayName
            || shipObject?.data?.name
            || shipObject?.data?.playerName
            || shipObject?.data?.playFabId
            || ''
        ).trim();
        if (!displayName) {
            this.destroyShipNameLabel(sprite);
            return;
        }
        const label = this.createShipNameLabel(sprite, displayName);
        if (!label) return;
        if (label.text !== displayName) {
            label.setText(displayName);
        }
        label.setPosition(sprite.x, sprite.y - 22);
        label.setVisible(sprite.visible !== false);
    }

    updateShipHpBar(sprite, currentHp, maxHp) {
        if (!sprite || !Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) return;
        const hpBar = this.createShipHpBar(sprite);
        const barWidth = 28;
        const barHeight = 4;
        const barX = sprite.x - (barWidth / 2);
        const barY = sprite.y + 18;
        const ratio = Math.max(0, Math.min(1, currentHp / maxHp));

        hpBar.clear();
        const shipColor = (sprite.__ownerNation || sprite.__avatarColor)
            ? this.getNationColor(sprite.__ownerNation || sprite.__avatarColor)
            : this.getNationColor(this.playerInfo?.nation);
        hpBar.fillStyle(0x000000, 0.6);
        hpBar.fillRect(barX, barY, barWidth, barHeight);
        hpBar.fillStyle(shipColor, 0.9);
        hpBar.fillRect(barX + 1, barY + 1, Math.max(0, (barWidth - 2) * ratio), Math.max(1, barHeight - 2));
    }

    flashShipHitTarget(targetSprite, sourceX = null, sourceY = null) {
        if (!targetSprite || !targetSprite.active) return;
        if (typeof targetSprite.clearTint === 'function') {
            targetSprite.setTintFill(0xffffff);
            this.time.delayedCall(90, () => {
                if (targetSprite.active && typeof targetSprite.clearTint === 'function') {
                    targetSprite.clearTint();
                }
            });
        }
        const baseScaleX = Number(targetSprite.scaleX) || 1;
        const baseScaleY = Number(targetSprite.scaleY) || 1;
        if (targetSprite.__shipHitScaleTween) {
            targetSprite.__shipHitScaleTween.stop();
        }
        if (targetSprite.__shipHitTiltTween) {
            targetSprite.__shipHitTiltTween.stop();
        }
        targetSprite.setScale(baseScaleX, baseScaleY);
        targetSprite.angle = 0;
        targetSprite.__shipHitScaleTween = this.tweens.add({
            targets: targetSprite,
            scaleX: baseScaleX * 1.08,
            scaleY: baseScaleY * 1.08,
            duration: 90,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => {
                if (targetSprite.active) {
                    targetSprite.setScale(baseScaleX, baseScaleY);
                }
            }
        });
        const tiltSign = Number.isFinite(sourceX) && Number.isFinite(targetSprite.x)
            ? (sourceX <= targetSprite.x ? 1 : -1)
            : (Phaser.Math.Between(0, 1) === 0 ? -1 : 1);
        targetSprite.__shipHitTiltTween = this.tweens.add({
            targets: targetSprite,
            angle: 6 * tiltSign,
            duration: 70,
            yoyo: true,
            ease: 'Sine.easeOut',
            onComplete: () => {
                if (targetSprite.active) {
                    targetSprite.angle = 0;
                }
            }
        });
        const hpBar = targetSprite.__hpBar;
        if (hpBar && hpBar.active) {
            if (hpBar.__shipHitFlashTween) {
                hpBar.__shipHitFlashTween.stop();
            }
            hpBar.setAlpha(1);
            hpBar.__shipHitFlashTween = this.tweens.add({
                targets: hpBar,
                alpha: 0.35,
                duration: 70,
                yoyo: true,
                repeat: 1,
                ease: 'Sine.easeOut',
                onComplete: () => {
                    if (hpBar.active) {
                        hpBar.setAlpha(1);
                    }
                }
            });
        }
    }

    playShipHitEffect(x, y, damageValue = null, targetSprite = null, sourceX = null, sourceY = null) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const now = Date.now();
        const key = `${Math.round(x)}:${Math.round(y)}`;
        const lastAt = this.lastShipHitFxAt.get(key) || 0;
        if (now - lastAt < 300) return;
        this.lastShipHitFxAt.set(key, now);

        if (Number.isFinite(damageValue)) {
            this.spawnDamageNumber(x, y - 12, `-${Math.round(damageValue)}`, 0xff6b6b);
        }
        this.spawnImpactBurst(x, y);
        this.playEmojiBurst(['💦', '💧', '💥'], x, y - 6, { fontSize: 15, rise: 18, duration: 520 });
        this.flashShipHitTarget(targetSprite, sourceX, sourceY);
        if (this.cameras?.main) {
            this.cameras.main.shake(110, 0.003);
        }
    }

    spawnDamageNumber(x, y, text, color) {
        const label = this.add.text(x, y, text, {
            fontSize: '12px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        });
        label.setOrigin(0.5);
        label.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        this.ignoreOnUiCamera(label);
        label.setTint(color);
        this.tweens.add({
            targets: label,
            y: y - 14,
            alpha: 0,
            duration: 700,
            ease: 'Sine.easeOut',
            onComplete: () => label.destroy()
        });
    }

    spawnImpactBurst(x, y) {
        const particles = this.add.particles(x, y, 'map_tiles', {
            frame: 0,
            speed: { min: 40, max: 140 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.3, end: 0 },
            lifespan: 350,
            quantity: 10,
            alpha: { start: 0.9, end: 0 }
        });
        particles.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        this.ignoreOnUiCamera(particles);
        this.time.delayedCall(360, () => particles.destroy());
    }

    getActionEffectColor(effect, fallback = 0x7bdff2) {
        const key = String(effect || '').toLowerCase();
        if (!key) return fallback;
        const colorMap = {
            flame_cone: 0xff6b35,
            poison_gas: 0x77dd77,
            drill_burst: 0xc77dff,
            cannon_shot: 0xffd166,
            broadside: 0xffd34d,
            gust: 0xa5d8ff,
            jam: 0xb18cff,
            jamstorm: 0xb18cff,
            snare: 0x7fb3d5,
            shield: 0x7be495,
            island_pass: 0x64d2ff,
            vision_shrink: 0x9b7bff,
            minefield: 0x74c69d,
            mud_slow: 0x8d6e63,
            knockback: 0xf4a261
        };
        return colorMap[key] || fallback;
    }

    playSideCannonChargeEffect(durationMs = 150) {
        if (!this.playerShip) return;
        const x = this.playerShip.x;
        const y = this.playerShip.y;
        const ring = this.add.graphics();
        ring.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        ring.setAlpha(0.95);
        this.ignoreOnUiCamera(ring);
        ring.lineStyle(2, 0xffe08a, 0.95);
        ring.strokeCircle(x, y, this.TILE_SIZE * 0.75);
        this.tweens.add({
            targets: ring,
            alpha: 0,
            scaleX: 1.25,
            scaleY: 1.25,
            duration: Math.max(80, Number(durationMs) || 150),
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy()
        });
    }

    getWebAudioContext() {
        if (typeof window === 'undefined') return null;
        if (this.webAudioCtx && this.webAudioCtx.state !== 'closed') return this.webAudioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try {
            this.webAudioCtx = new Ctx();
            return this.webAudioCtx;
        } catch (error) {
            return null;
        }
    }

    playSideCannonSfx(stage = 'fire') {
        const ctx = this.getWebAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.value = 0.07;
        master.connect(ctx.destination);

        const playTone = (type, freqFrom, freqTo, duration, gainStart, gainEnd) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freqFrom, now);
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), now + duration);
            gain.gain.setValueAtTime(gainStart, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd), now + duration);
            osc.connect(gain);
            gain.connect(master);
            osc.start(now);
            osc.stop(now + duration);
        };

        if (stage === 'charge') {
            playTone('sine', 260, 420, 0.14, 0.07, 0.0001);
            return;
        }
        if (stage === 'impact') {
            playTone('triangle', 90, 45, 0.16, 0.09, 0.0001);
            return;
        }
        playTone('square', 130, 70, 0.14, 0.12, 0.0001);
        playTone('triangle', 75, 40, 0.2, 0.08, 0.0001);
    }

    applyHitStop(durationMs = 80) {
        if (!this.physics?.world || !this.time) return;
        const holdMs = Math.max(30, Number(durationMs) || 80);
        const until = Date.now() + holdMs;
        this.hitStopUntil = Math.max(this.hitStopUntil, until);
        if (!this.hitStopActive) {
            this.physics.world.pause();
            this.tweens.pauseAll();
            this.hitStopActive = true;
        }
        if (this.hitStopTimer) {
            this.hitStopTimer.remove(false);
            this.hitStopTimer = null;
        }
        this.hitStopTimer = this.time.delayedCall(holdMs, () => {
            this.hitStopTimer = null;
            if (Date.now() < this.hitStopUntil) return;
            if (this.hitStopActive) {
                this.physics.world.resume();
                this.tweens.resumeAll();
                this.hitStopActive = false;
            }
        });
    }

    playActionConeEffect(range, angleDeg) {
        if (!this.playerShip) return;
        this.playActionConeEffectAt(this.playerShip.x, this.playerShip.y, range, angleDeg, this.getFacingAngleRad());
    }

    playActionConeEffectAt(x, y, range, angleDeg, headingRad = 0, color = 0xffd166, options = null) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const effectOptions = options || {};
        const graphics = this.add.graphics();
        graphics.setAlpha(0.95);
        graphics.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        this.ignoreOnUiCamera(graphics);
        const start = headingRad - Phaser.Math.DegToRad(angleDeg / 2);
        const end = headingRad + Phaser.Math.DegToRad(angleDeg / 2);
        const fillAlpha = Number.isFinite(Number(effectOptions.fillAlpha)) ? Phaser.Math.Clamp(Number(effectOptions.fillAlpha), 0, 1) : 0.22;
        const lineAlpha = Number.isFinite(Number(effectOptions.lineAlpha)) ? Phaser.Math.Clamp(Number(effectOptions.lineAlpha), 0, 1) : 0.78;
        const lineWidth = Math.max(1, Number(effectOptions.lineWidth) || 2);
        const effectDuration = Math.max(120, Number(effectOptions.durationMs) || 260);
        graphics.fillStyle(color, fillAlpha);
        graphics.lineStyle(lineWidth, color, lineAlpha);
        graphics.beginPath();
        graphics.moveTo(x, y);
        graphics.arc(x, y, range, start, end, false);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: effectDuration,
            ease: 'Quad.easeOut',
            onComplete: () => graphics.destroy()
        });
    }

    playActionCircleEffect(radius) {
        if (!this.playerShip) return;
        this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, radius);
    }

    playActionCircleEffectAt(x, y, radius, color = 0x7bdff2, options = null) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const effectOptions = options || {};
        const graphics = this.add.graphics();
        graphics.setAlpha(0.95);
        graphics.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        this.ignoreOnUiCamera(graphics);
        const lineAlpha = Number.isFinite(Number(effectOptions.lineAlpha)) ? Phaser.Math.Clamp(Number(effectOptions.lineAlpha), 0, 1) : 0.78;
        const fillAlpha = Number.isFinite(Number(effectOptions.fillAlpha)) ? Phaser.Math.Clamp(Number(effectOptions.fillAlpha), 0, 1) : 0.18;
        const lineWidth = Math.max(1, Number(effectOptions.lineWidth) || 2);
        const effectDuration = Math.max(120, Number(effectOptions.durationMs) || 280);
        graphics.lineStyle(lineWidth, color, lineAlpha);
        graphics.strokeCircle(x, y, radius);
        graphics.fillStyle(color, fillAlpha);
        graphics.fillCircle(x, y, radius);
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: effectDuration,
            ease: 'Quad.easeOut',
            onComplete: () => graphics.destroy()
        });
    }

    playShipActionTelegraph(actionInfo = {}, durationMs = 320) {
        if (!this.playerShip) return;
        const effectColor = this.getActionEffectColor(actionInfo?.effect, 0xffd166);
        const effectOptions = {
            durationMs,
            fillAlpha: 0.1,
            lineAlpha: 0.92,
            lineWidth: 3
        };
        const type = String(actionInfo?.type || '').toLowerCase();
        const rangeTiles = Number(actionInfo?.rangeTiles) || 0;
        const radiusTiles = Number(actionInfo?.radiusTiles) || 0;
        if (Number.isFinite(radiusTiles) && radiusTiles > 0) {
            this.playActionCircleEffectAt(this.playerShip.x, this.playerShip.y, radiusTiles * this.TILE_SIZE, effectColor, effectOptions);
            return;
        }
        if (!Number.isFinite(rangeTiles) || rangeTiles <= 0) return;
        const range = rangeTiles * this.TILE_SIZE;
        const heading = this.getFacingAngleRad();
        if (type === 'defender_broadside' || type === 'side_cannon') {
            const angle = Number(actionInfo?.angle) || 60;
            this.playActionConeEffectAt(this.playerShip.x, this.playerShip.y, range, angle, heading - Math.PI / 2, effectColor, effectOptions);
            this.playActionConeEffectAt(this.playerShip.x, this.playerShip.y, range, angle, heading + Math.PI / 2, effectColor, effectOptions);
            this.playActionTelegraphLine(this.playerShip.x, this.playerShip.y, range, heading - Math.PI / 2, effectColor, durationMs);
            this.playActionTelegraphLine(this.playerShip.x, this.playerShip.y, range, heading + Math.PI / 2, effectColor, durationMs);
            return;
        }
        const angle = Number(actionInfo?.angle) || 50;
        this.playActionConeEffectAt(this.playerShip.x, this.playerShip.y, range, angle, heading, effectColor, effectOptions);
        this.playActionTelegraphLine(this.playerShip.x, this.playerShip.y, range, heading, effectColor, durationMs);
    }

    playActionTelegraphLine(x, y, range, headingRad = 0, color = 0xffd166, durationMs = 320) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(range) || range <= 0) return;
        const dx = Math.cos(headingRad);
        const dy = Math.sin(headingRad);
        const startX = x + dx * 14;
        const startY = y + dy * 14;
        const endX = x + dx * range;
        const endY = y + dy * range;
        const graphics = this.add.graphics();
        graphics.setAlpha(0.92);
        graphics.setDepth(GAME_CONFIG.DEPTH.MESSAGE);
        this.ignoreOnUiCamera(graphics);
        graphics.lineStyle(3, color, 0.92);
        graphics.beginPath();
        graphics.moveTo(startX, startY);
        graphics.lineTo(endX, endY);
        graphics.strokePath();
        graphics.fillStyle(color, 0.9);
        graphics.fillCircle(endX, endY, 3);
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: Math.max(140, Number(durationMs) || 320),
            ease: 'Quad.easeOut',
            onComplete: () => graphics.destroy()
        });
    }

    notifyIslandCaptureAlert(islandData, stateLabel, leaderName, isEnemyWarning) {
        if (!islandData?.id || !isEnemyWarning) return;
        const key = `${stateLabel}:${leaderName}`;
        if (this.islandCaptureAlertStateById.get(islandData.id) === key) return;
        this.islandCaptureAlertStateById.set(islandData.id, key);
        const islandName = islandData.name || '島';
        this.showMessage(`${islandName} ${stateLabel}`);
    }

    playEmojiBurst(emojis, x, y, options = {}) {
        if (!Array.isArray(emojis) || emojis.length === 0) return;
        const count = Math.min(8, Math.max(3, emojis.length * 2));
        const fontSize = Math.max(14, Math.min(28, Number(options.fontSize) || 16));
        const rise = Math.max(10, Math.min(40, Number(options.rise) || 16));
        const burstDuration = Math.max(260, Math.min(1400, Number(options.duration) || 600));
        for (let i = 0; i < count; i += 1) {
            const emoji = emojis[i % emojis.length];
            const offsetX = Phaser.Math.Between(-14, 14);
            const offsetY = Phaser.Math.Between(-10, 10);
            const text = this.add.text(x + offsetX, y + offsetY, emoji, { fontSize: `${fontSize}px` });
            text.setOrigin(0.5);
            text.setDepth(GAME_CONFIG.DEPTH.MESSAGE + 1);
            this.ignoreOnUiCamera(text);
            this.tweens.add({
                targets: text,
                y: y + offsetY - rise,
                alpha: 0,
                duration: burstDuration,
                ease: 'Sine.easeOut',
                onComplete: () => text.destroy()
            });
        }
    }

    playEmojiShot(emoji, startX, startY, endX, endY) {
        if (!emoji) return;
        const text = this.add.text(startX, startY, emoji, { fontSize: '16px' });
        text.setOrigin(0.5);
        text.setDepth(GAME_CONFIG.DEPTH.MESSAGE + 1);
        this.ignoreOnUiCamera(text);
        this.tweens.add({
            targets: text,
            x: endX,
            y: endY,
            duration: 260,
            ease: 'Quad.easeOut',
            onComplete: () => text.destroy()
        });
    }

    playCannonShot(x, y, range, headingRad, options = null) {
        const dx = Math.cos(headingRad);
        const dy = Math.sin(headingRad);
        const startX = x + dx * 18;
        const startY = y + dy * 18;
        const endX = x + dx * range;
        const endY = y + dy * range;
        const glyph = String(options?.glyph || '💣');
        const durationMs = Math.max(120, Number(options?.durationMs) || 240);
        const impactGlyph = String(options?.impactGlyph || '💥');
        const impactTint = Number.isFinite(Number(options?.impactTint)) ? Number(options?.impactTint) : 0xffe066;
        const shot = this.add.text(startX, startY, glyph, { fontSize: '16px' });
        shot.setOrigin(0.5);
        shot.setDepth(GAME_CONFIG.DEPTH.MESSAGE + 1);
        this.ignoreOnUiCamera(shot);
        this.tweens.add({
            targets: shot,
            x: endX,
            y: endY,
            duration: durationMs,
            ease: 'Sine.easeOut',
            onComplete: () => {
                shot.destroy();
                this.spawnImpactBurst(endX, endY);
                this.spawnDamageNumber(endX, endY - 10, impactGlyph, impactTint);
            }
        });
    }

    playDrillBurst(x, y, headingRad) {
        const dx = Math.cos(headingRad);
        const dy = Math.sin(headingRad);
        const impactX = x + dx * 22;
        const impactY = y + dy * 22;
        this.spawnImpactBurst(impactX, impactY);
        this.spawnDamageNumber(impactX, impactY - 8, '✨', 0xffe066);
        if (this.cameras?.main) {
            this.cameras.main.shake(90, 0.003);
        }
    }

    getFacingAngleRad() {
        const facing = this.getPlayerFacingVector();
        return Math.atan2(facing.y, facing.x);
    }

    async emitShipActionEvent(actionInfo, x, y) {
        if (!this.firestore || !this.mapId || !this.playerInfo?.playFabId) return;
        const payload = {
            mapId: this.mapId,
            sourceId: this.playerInfo.playFabId,
            type: actionInfo?.type || null,
            label: actionInfo?.label || null,
            emojis: Array.isArray(actionInfo?.emoji) ? actionInfo.emoji : [],
            effect: actionInfo?.effect || null,
            targetId: actionInfo?.targetId || null,
            x: Number(x),
            y: Number(y),
            durationMs: Number(actionInfo?.durationMs) || null,
            rangeTiles: Number(actionInfo?.rangeTiles) || null,
            radiusTiles: Number(actionInfo?.radiusTiles) || null,
            angle: Number(actionInfo?.angle) || null,
            heading: this.getFacingAngleRad(),
            jamDurationMs: Number(actionInfo?.jamDurationMs) || null,
            shieldDurationMs: Number(actionInfo?.shieldDurationMs) || null,
            snareDurationMs: Number(actionInfo?.snareDurationMs) || null,
            gustDistanceTiles: Number(actionInfo?.gustDistanceTiles) || null,
            knockbackDistanceTiles: Number(actionInfo?.knockbackDistanceTiles) || null,
            visionMultiplier: Number(actionInfo?.visionMultiplier) || null,
            slowMultiplier: Number(actionInfo?.slowMultiplier) || null,
            mineRadiusTiles: Number(actionInfo?.mineRadiusTiles) || null,
            mineDurationMs: Number(actionInfo?.mineDurationMs) || null,
            mineDamage: Number(actionInfo?.mineDamage) || null,
            stormDurationMs: Number(actionInfo?.stormDurationMs) || null,
            createdAt: Date.now()
        };
        try {
            await addDoc(collection(this.firestore, 'ship_action_events'), payload);
        } catch (error) {
            console.warn('[ShipActionEvent] Failed to emit:', error);
        }
    }

    getShipNationById(playFabId) {
        if (!playFabId) return '';
        if (playFabId === this.playerInfo?.playFabId) {
            return String(this.playerInfo?.nation || '').toLowerCase();
        }
        const target = this.otherShips.get(playFabId);
        return String(target?.data?.nation || target?.data?.Nation || target?.sprite?.__ownerNation || '').toLowerCase();
    }

    isThreateningShipAction(data = {}) {
        const effect = String(data?.effect || '').toLowerCase();
        const type = String(data?.type || '').toLowerCase();
        if (type === 'defender_shield' || type === 'support') return false;
        const safeEffects = new Set([
            '',
            'shield',
            'support',
            'speed_boost',
            'island_pass',
            'invisible'
        ]);
        return !safeEffects.has(effect);
    }

    showEnemyShipActionWarning(sourceId, label, fallbackX, fallbackY) {
        if (!sourceId || !this.isEnemyShipId(sourceId)) return;
        const now = Date.now();
        const lastAt = Number(this.lastEnemyShipActionWarnAt.get(sourceId) || 0);
        if (now - lastAt < 900) return;
        this.lastEnemyShipActionWarnAt.set(sourceId, now);
        const sprite = this.otherShips.get(sourceId)?.sprite || null;
        const x = Number.isFinite(sprite?.x) ? sprite.x : Number(fallbackX);
        const y = Number.isFinite(sprite?.y) ? sprite.y : Number(fallbackY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const text = /砲|弾|爆|砲撃/.test(String(label || '')) ? '砲撃' : '攻撃';
        this.spawnDamageNumber(x, y - 26, '⚠', 0xff7b7b);
        this.spawnDamageNumber(x, y - 10, text, 0xffd166);
    }

    isPointThreatenedByShipAction(px, py, originX, originY, data = {}) {
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(originX) || !Number.isFinite(originY)) return false;
        const radiusTiles = Number(data?.radiusTiles);
        if (Number.isFinite(radiusTiles) && radiusTiles > 0) {
            const radius = this.TILE_SIZE * radiusTiles;
            return Phaser.Math.Distance.Between(px, py, originX, originY) <= radius;
        }

        const rangeTiles = Number(data?.rangeTiles);
        const angleDeg = Number(data?.angle);
        if (!(Number.isFinite(rangeTiles) && rangeTiles > 0 && Number.isFinite(angleDeg))) {
            return false;
        }

        const range = this.TILE_SIZE * rangeTiles;
        const dx = px - originX;
        const dy = py - originY;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        if (dist > range) return false;

        const effect = String(data?.effect || '').toLowerCase();
        const heading = Number(data?.heading) || 0;
        const halfAngle = Phaser.Math.DegToRad(Math.max(1, angleDeg) / 2);
        const targetAngle = Math.atan2(dy, dx);
        const headings = effect === 'broadside'
            ? [heading - Math.PI / 2, heading + Math.PI / 2]
            : [heading];

        return headings.some((candidate) => {
            const diff = Phaser.Math.Angle.Wrap(targetAngle - candidate);
            return Math.abs(diff) <= halfAngle;
        });
    }

    showIncomingThreatWarning(label = '') {
        if (!this.playerShip) return;
        const now = Date.now();
        if (now - this.lastIncomingThreatWarnAt < 800) return;
        this.lastIncomingThreatWarnAt = now;
        const text = /砲|弾|爆|砲撃/.test(String(label || '')) ? '危険砲撃' : '危険';
        this.spawnDamageNumber(this.playerShip.x, this.playerShip.y - 30, '‼', 0xff6b6b);
        this.spawnDamageNumber(this.playerShip.x, this.playerShip.y - 14, text, 0xffd166);
        if (this.cameras?.main) {
            this.cameras.main.shake(80, 0.0024);
        }
    }

    isEnemyShipId(playFabId) {
        if (!playFabId || !this.playerInfo?.playFabId) return false;
        if (playFabId === this.playerInfo.playFabId) return false;
        const myNation = String(this.playerInfo?.nation || '').toLowerCase();
        const targetNation = this.getShipNationById(playFabId);
        if (!myNation || !targetNation) return false;
        return myNation !== targetNation;
    }

    isEnemyPair(sourcePlayFabId, targetPlayFabId) {
        if (!sourcePlayFabId || !targetPlayFabId) return false;
        if (sourcePlayFabId === targetPlayFabId) return false;
        const sourceNation = this.getShipNationById(sourcePlayFabId);
        const targetNation = this.getShipNationById(targetPlayFabId);
        if (!sourceNation || !targetNation) return false;
        return sourceNation !== targetNation;
    }

    setForcedMotionForShip(shipObject, targetX, targetY) {
        if (!shipObject?.sprite) return;
        const startX = shipObject.sprite.x;
        const startY = shipObject.sprite.y;
        const distance = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
        const speed = Number(shipObject?.data?.speed || this.shipSpeed || 0);
        const durationMs = speed > 0 ? Math.max(120, (distance / speed) * 1000) : 300;
        shipObject.motion = {
            startX,
            startY,
            endX: targetX,
            endY: targetY,
            durationMs,
            startedAt: Date.now()
        };
    }

    applyForcedDrift(playFabId, distanceTiles) {
        if (!Number.isFinite(distanceTiles) || distanceTiles <= 0) return;
        const sprite = playFabId === this.playerInfo?.playFabId
            ? this.playerShip
            : this.otherShips.get(playFabId)?.sprite;
        if (!sprite) return;
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distance = this.TILE_SIZE * distanceTiles;
        const targetX = Phaser.Math.Clamp(sprite.x + Math.cos(angle) * distance, 0, this.mapPixelSize);
        const targetY = Phaser.Math.Clamp(sprite.y + Math.sin(angle) * distance, 0, this.mapPixelSize);
        if (playFabId === this.playerInfo?.playFabId) {
            this.forceMoveTo(targetX, targetY);
        } else {
            const shipObject = this.otherShips.get(playFabId);
            this.setForcedMotionForShip(shipObject, targetX, targetY);
        }
    }

    applyKnockbackFrom(sourceX, sourceY, playFabId, distanceTiles) {
        if (!Number.isFinite(distanceTiles) || distanceTiles <= 0) return;
        const sprite = playFabId === this.playerInfo?.playFabId
            ? this.playerShip
            : this.otherShips.get(playFabId)?.sprite;
        if (!sprite) return;
        const dx = sprite.x - sourceX;
        const dy = sprite.y - sourceY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const distance = this.TILE_SIZE * distanceTiles;
        const targetX = Phaser.Math.Clamp(sprite.x + (dx / len) * distance, 0, this.mapPixelSize);
        const targetY = Phaser.Math.Clamp(sprite.y + (dy / len) * distance, 0, this.mapPixelSize);
        if (playFabId === this.playerInfo?.playFabId) {
            this.forceMoveTo(targetX, targetY);
        } else {
            const shipObject = this.otherShips.get(playFabId);
            this.setForcedMotionForShip(shipObject, targetX, targetY);
        }
    }

    subscribeToShipActionEvents() {
        if (!this.firestore || !this.mapId) return;
        if (this.shipActionEventsUnsubscribe) {
            this.shipActionEventsUnsubscribe();
        }

        const eventsQuery = query(
            collection(this.firestore, 'ship_action_events'),
            where('mapId', '==', this.mapId),
            orderBy('createdAt', 'desc'),
            limit(25)
        );

        this.shipActionEventsUnsubscribe = onSnapshot(eventsQuery, (snapshot) => {
            const now = Date.now();
            snapshot.docChanges().forEach((change) => {
                if (change.type !== 'added') return;
                const docSnap = change.doc;
                if (!docSnap?.exists()) return;
                if (this.shipActionEventsSeen.has(docSnap.id)) return;
                this.shipActionEventsSeen.add(docSnap.id);
                if (this.shipActionEventsSeen.size > 200) {
                    this.shipActionEventsSeen.clear();
                }

                const data = docSnap.data() || {};
                const createdAt = Number(data.createdAt) || 0;
                if (createdAt && now - createdAt > 5000) return;
                if (data.sourceId && data.sourceId === this.playerInfo?.playFabId) return;

                const x = Number(data.x);
                const y = Number(data.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;

                if (this.isThreateningShipAction(data)) {
                    this.showEnemyShipActionWarning(data.sourceId || null, data.label || '', x, y);
                }

                const effect = String(data.effect || '').toLowerCase();
                if (Array.isArray(data.emojis) && data.emojis.length > 0) {
                    this.playEmojiBurst(data.emojis, x, y - 12);
                }
                const radiusTiles = Number(data.radiusTiles);
                if (Number.isFinite(radiusTiles)) {
                    const radius = this.TILE_SIZE * radiusTiles;
                    const color = this.getActionEffectColor(effect, 0x7bdff2);
                    this.playActionCircleEffectAt(x, y, radius, color);
                    if (effect === 'minefield') {
                        const mineRadiusTiles = Number(data.mineRadiusTiles) || 2;
                        const mineDurationMs = Number(data.mineDurationMs) || 12000;
                        const mineDamage = Number(data.mineDamage) || 10;
                        this.registerShipActionMine(x, y, mineRadiusTiles, mineDamage, mineDurationMs, data.sourceId || null);
                    }

                    const targets = [];
                    if (this.playerShip) {
                        const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, x, y);
                        if (dist <= radius) {
                            targets.push(this.playerInfo?.playFabId);
                        }
                    }
                    this.otherShips.forEach((shipObject, otherId) => {
                        if (!shipObject?.sprite) return;
                        const dist = Phaser.Math.Distance.Between(shipObject.sprite.x, shipObject.sprite.y, x, y);
                        if (dist <= radius) targets.push(otherId);
                    });

                    const eventTargetId = data.targetId || null;
                    const sourceId = data.sourceId || null;
                    targets.forEach((targetId) => {
                        if (!targetId) return;
                        if (sourceId) {
                            if (!this.isEnemyPair(sourceId, targetId)) return;
                        } else if (!this.isEnemyShipId(targetId)) {
                            return;
                        }
                        if (effect === 'snare' && eventTargetId && targetId !== eventTargetId) return;
                        if (effect === 'jam' || effect === 'jamstorm') {
                            const jamDuration = Number(data.jamDurationMs) || 0;
                            if (jamDuration > 0) {
                                const until = Date.now() + jamDuration;
                                if (targetId === this.playerInfo?.playFabId) {
                                    this.shipActionJammedUntil = Math.max(this.shipActionJammedUntil, until);
                                    this.showMessage('妨害された...');
                                }
                            }
                        }
                        if (effect === 'jamstorm') {
                            const stormDuration = Number(data.stormDurationMs) || 0;
                            if (stormDuration > 0 && targetId === this.playerInfo?.playFabId) {
                                this.applyMinimapStorm(stormDuration);
                            }
                        }
                        if (effect === 'vision_shrink') {
                            const visionMultiplier = Number(data.visionMultiplier) || 0.7;
                            const durationMs = Number(data.durationMs) || 6000;
                            if (targetId === this.playerInfo?.playFabId) {
                                this.applyVisionDebuff(visionMultiplier, durationMs);
                            }
                        }
                        if (effect === 'mud_slow') {
                            const slowMultiplier = Number(data.slowMultiplier) || 0.6;
                            const durationMs = Number(data.durationMs) || 6000;
                            if (targetId === this.playerInfo?.playFabId) {
                                this.applySpeedDebuff(slowMultiplier, durationMs);
                            }
                        }
                        if (effect === 'gust') {
                            const driftTiles = Number(data.gustDistanceTiles) || 2;
                            this.applyForcedDrift(targetId, driftTiles);
                        }
                        if (effect === 'snare') {
                            const snareDuration = Number(data.snareDurationMs) || 0;
                            if (snareDuration > 0 && targetId === this.playerInfo?.playFabId) {
                                this.applyMoveLock(snareDuration);
                            }
                        }
                        if (effect === 'knockback') {
                            const knockbackTiles = Number(data.knockbackDistanceTiles) || 2;
                            this.applyKnockbackFrom(x, y, targetId, knockbackTiles);
                        }
                    });
                    if (targets.includes(this.playerInfo?.playFabId)) {
                        this.showIncomingThreatWarning(data.label || effect);
                    }
                } else if (Number.isFinite(Number(data.rangeTiles)) && Number.isFinite(Number(data.angle))) {
                    const range = this.TILE_SIZE * Number(data.rangeTiles);
                    const heading = Number(data.heading) || 0;
                    const angle = Number(data.angle);
                    const color = this.getActionEffectColor(effect, 0xffd166);
                    if (effect === 'broadside') {
                        this.playActionConeEffectAt(x, y, range, angle, heading - Math.PI / 2, color);
                        this.playActionConeEffectAt(x, y, range, angle, heading + Math.PI / 2, color);
                    } else {
                        this.playActionConeEffectAt(x, y, range, angle, heading, color);
                    }
                    if (this.playerShip && this.isPointThreatenedByShipAction(this.playerShip.x, this.playerShip.y, x, y, data)) {
                        this.showIncomingThreatWarning(data.label || effect);
                    }
                } else {
                    this.spawnImpactBurst(x, y);
                }
            });
        }, (error) => {
            console.warn('[ShipActionEvent] Subscribe failed:', error);
        });
    }

    getBattleShieldUntil(playFabId) {
        if (!playFabId) return 0;
        if (playFabId === this.playerInfo?.playFabId) {
            return Number(window.__battleActiveUntil || 0);
        }
        return Number(this.shipBattleShield?.get(playFabId) || 0);
    }

    isShipInBattle(playFabId) {
        const until = this.getBattleShieldUntil(playFabId);
        return until > Date.now();
    }

    markShipInBattle(playFabId, durationMs) {
        if (!playFabId) return;
        const until = Date.now() + Math.max(0, Number(durationMs) || 0);
        const current = Number(this.shipBattleShield.get(playFabId) || 0);
        if (until > current) {
            this.shipBattleShield.set(playFabId, until);
        }
        const hiddenCurrent = Number(this.shipBattleHiddenUntil.get(playFabId) || 0);
        if (until > hiddenCurrent) {
            this.shipBattleHiddenUntil.set(playFabId, until);
        }
        this.setShipBattleVisibility(playFabId, false);
        this.spawnBattleSmoke(playFabId, durationMs);

        if (this.time?.delayedCall) {
            this.time.delayedCall(Math.max(0, Number(durationMs) || 0), () => {
                if (!this.isShipInBattle(playFabId)) {
                    this.setShipBattleVisibility(playFabId, true);
                }
            });
        }
    }

    playBattleEmojiForShip(playFabId, emojis) {
        const sprite = playFabId === this.playerInfo?.playFabId
            ? this.playerShip
            : this.otherShips.get(playFabId)?.sprite;
        if (!sprite) return;
        const list = Array.isArray(emojis) && emojis.length > 0 ? emojis : ['⚔️', '💥'];
        this.playEmojiBurst(list, sprite.x, sprite.y - 18);
    }

    setShipBattleVisibility(playFabId, visible) {
        if (!playFabId) return;
        if (playFabId === this.playerInfo?.playFabId) {
            if (visible) {
                const now = Date.now();
                if (now < this.shipActionInvisibleUntil) {
                    this.setPlayerShipInvisible(true);
                    return;
                }
            }
            this.setPlayerShipInvisible(!visible);
            return;
        }
        const shipObject = this.otherShips.get(playFabId);
        if (!shipObject?.sprite) return;
        shipObject.sprite.setAlpha(visible ? 1 : 0);
        if (shipObject.sprite.__hpBar) {
            shipObject.sprite.__hpBar.setVisible(visible);
        }
        if (shipObject.sprite.__nameLabel) {
            shipObject.sprite.__nameLabel.setVisible(visible && shipObject.sprite.visible !== false);
        }
        if (shipObject.sprite.__shadow) {
            shipObject.sprite.__shadow.setVisible(visible);
        }
    }

    spawnBattleSmoke(playFabId, durationMs) {
        if (!playFabId || !this.time) return;
        const existing = this.shipBattleSmokeTimers.get(playFabId);
        if (existing) {
            existing.remove(false);
            this.shipBattleSmokeTimers.delete(playFabId);
        }
        const emojis = ['💨', '☁️', '💥'];
        const repeatMs = 450;
        const repeatCount = Math.max(1, Math.ceil((Number(durationMs) || 0) / repeatMs));
        let fired = 0;
        const timer = this.time.addEvent({
            delay: repeatMs,
            callback: () => {
                fired += 1;
                const sprite = playFabId === this.playerInfo?.playFabId
                    ? this.playerShip
                    : this.otherShips.get(playFabId)?.sprite;
                if (sprite) {
                    this.playEmojiBurst(emojis, sprite.x, sprite.y - 6);
                }
                if (fired >= repeatCount) {
                    timer.remove(false);
                    this.shipBattleSmokeTimers.delete(playFabId);
                }
            },
            loop: true
        });
        this.shipBattleSmokeTimers.set(playFabId, timer);
    }

    subscribeToShipBattleEvents() {
        if (!this.firestore || !this.mapId) return;
        if (this.shipBattleEventsUnsubscribe) {
            this.shipBattleEventsUnsubscribe();
        }

        const eventsQuery = query(
            collection(this.firestore, 'ship_battle_events'),
            where('mapId', '==', this.mapId),
            orderBy('createdAt', 'desc'),
            limit(25)
        );

        this.shipBattleEventsUnsubscribe = onSnapshot(eventsQuery, (snapshot) => {
            const now = Date.now();
            snapshot.docChanges().forEach((change) => {
                if (change.type !== 'added') return;
                const docSnap = change.doc;
                if (!docSnap?.exists()) return;
                if (this.shipBattleEventsSeen.has(docSnap.id)) return;
                this.shipBattleEventsSeen.add(docSnap.id);
                if (this.shipBattleEventsSeen.size > 200) {
                    this.shipBattleEventsSeen.clear();
                }

                const data = docSnap.data() || {};
                const createdAt = Number(data.createdAt) || 0;
                if (createdAt && now - createdAt > 6000) return;

                const durationMs = Number(data.durationMs) || 5000;
                const participants = Array.isArray(data.participantIds) ? data.participantIds : [];
                const emojis = Array.isArray(data.emojis) ? data.emojis : ['⚔️', '💥'];

                participants.forEach((id) => {
                    this.markShipInBattle(id, durationMs);
                    this.playBattleEmojiForShip(id, emojis);
                });
            });
        }, (error) => {
            console.warn('[ShipBattleEvent] Subscribe failed:', error);
        });
    }

    createShipShadow(sprite) {
        if (!sprite) return null;
        if (sprite.__shadow) return sprite.__shadow;
        const shadow = this.add.graphics();
        shadow.setDepth(GAME_CONFIG.DEPTH.SHIP - 2);
        this.ignoreOnUiCamera(shadow);
        sprite.__shadow = shadow;
        return shadow;
    }

    destroyShipShadow(sprite) {
        if (sprite?.__shadow?.destroy) {
            sprite.__shadow.destroy();
        }
        if (sprite) {
            sprite.__shadow = null;
        }
    }

    updateShipShadow(sprite) {
        if (!sprite) return;
        const shadow = this.createShipShadow(sprite);
        const shadowW = 22;
        const shadowH = 8;
        const shadowX = sprite.x;
        const shadowY = sprite.y + 12;
        shadow.clear();
        shadow.fillStyle(0x000000, 0.35);
        shadow.fillEllipse(shadowX, shadowY, shadowW, shadowH);
    }

    updateShipShadows() {
        if (this.playerShip && this.playerShipDomain === 'air') {
            this.updateShipShadow(this.playerShip);
        } else {
            this.destroyShipShadow(this.playerShip);
        }

        this.otherShips.forEach((shipObject) => {
            const domain = String(shipObject?.domain || shipObject?.data?.Domain || '').toLowerCase();
            if (domain === 'air' && shipObject?.sprite) {
                this.updateShipShadow(shipObject.sprite);
            } else {
                this.destroyShipShadow(shipObject?.sprite);
            }
        });
    }

    async respawnPlayerShipIfNeeded(shipId) {
        if (this.respawnInFlight || !this.playerInfo?.playFabId || !shipId) return null;
        this.respawnInFlight = true;
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/respawn-ship') : '/api/respawn-ship'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playFabId: this.playerInfo.playFabId, shipId, reason: 'hp_zero' })
            });
            if (!res.ok) return null;
            const data = await res.json();
            const pos = data?.position;
            if (pos && this.playerShip) {
                this.playerShip.setPosition(pos.x, pos.y);
            }
            if (Number.isFinite(Number(data?.repairUntil))) {
                this.shipRepairUntil = Number(data.repairUntil);
            }
            return pos || null;
        } catch (error) {
            console.warn('[WorldMapScene] Respawn request failed:', error);
            return null;
        } finally {
            this.respawnInFlight = false;
        }
    }

    updateShipHpBars() {
        if (this.playerShip && Number.isFinite(this.playerHp?.current) && Number.isFinite(this.playerHp?.max)) {
            this.updateShipHpBar(this.playerShip, this.playerHp.current, this.playerHp.max);
        }

        this.otherShips.forEach((shipObject) => {
            const sprite = shipObject?.sprite;
            const currentHp = shipObject?.hp?.current;
            const maxHp = shipObject?.hp?.max;
            if (sprite && Number.isFinite(currentHp) && Number.isFinite(maxHp)) {
                this.updateShipHpBar(sprite, currentHp, maxHp);
            }
        });
    }

    checkShipShipCollisions() {
        if (!this.playerShip) return;
        if (Date.now() < this.shipActionIgnoreShipCollisionUntil) return;

        let anyIntersect = false;
        this.otherShips.forEach((shipObject, otherPlayFabId) => {
            if (!shipObject?.sprite) return;
            const myAir = this.isAirDomain(this.playerShipDomain);
            const otherAir = this.isAirDomain(shipObject?.domain);
            if (myAir !== otherAir) return;
            const intersects = this.physics.world.overlap(this.playerShip, shipObject.sprite);
            if (intersects) {
                anyIntersect = true;
                if (!this.collidingShipId && !this.shipPanelSuppressed) {
                    this.collidingShipId = otherPlayFabId;
                    this.handleShipCollision(otherPlayFabId, shipObject);
                }
            }
        });

        if (this.collidingShipId) {
            const target = this.otherShips.get(this.collidingShipId);
            const stillIntersecting = target?.sprite
                ? this.physics.world.overlap(this.playerShip, target.sprite)
                : false;
            if (!stillIntersecting) {
                this.hideShipCommandMenu();
                this.collidingShipId = null;
            }
        }

        if (this.shipPanelSuppressed && !anyIntersect) {
            this.shipPanelSuppressed = false;
        }
    }

    getActiveIslandBuilding(islandData) {
        const buildings = Array.isArray(islandData?.buildings) ? islandData.buildings : [];
        return buildings.find((entry) => entry && entry.status !== 'demolished') || null;
    }

    hasActiveIslandBuilding(islandData) {
        return !!this.getActiveIslandBuilding(islandData);
    }

    getIslandCaptureState(islandData) {
        const slotLimitMap = { small: 1, medium: 2, large: 4, giant: 8 };
        const raw = islandData?.captureState || null;
        const queue = Array.isArray(raw?.queue)
            ? raw.queue
                .filter((entry) => entry && entry.playFabId)
                .map((entry) => ({
                    playFabId: entry.playFabId,
                    nation: String(entry.nation || '').toLowerCase(),
                    joinedAt: Number(entry.joinedAt) || 0
                }))
            : [];
        const slotLimit = Math.max(1, Number(raw?.slotLimit) || slotLimitMap[String(islandData?.size || 'small').toLowerCase()] || 1);
        const baseDurationMs = Math.max(60_000, Math.min(300_000, Number(raw?.baseDurationMs) || (slotLimit === 1 ? 60_000 : slotLimit === 2 ? 120_000 : slotLimit === 4 ? 180_000 : 300_000)));
        const status = String(raw?.status || '').toLowerCase();
        const activeBuilding = this.getActiveIslandBuilding(islandData);
        const breached = !activeBuilding;
        const normalizedStatus = queue.length > 0
            ? 'capturing'
            : (status === 'breached' || breached ? 'breached' : 'idle');
        const endsAt = Number(raw?.endsAt) || 0;
        return {
            status: normalizedStatus,
            queue,
            slotLimit,
            baseDurationMs,
            progressBaseMs: Math.max(0, Number(raw?.progressBaseMs) || 0),
            lastProgressAt: Number(raw?.lastProgressAt) || 0,
            endsAt,
            ownerCandidateId: raw?.ownerCandidateId || queue[0]?.playFabId || null,
            ownerCandidateNation: raw?.ownerCandidateNation || queue[0]?.nation || null,
            breached
        };
    }

    getIslandCaptureSpeedMultiplier(memberCount) {
        const count = Math.max(1, Math.floor(Number(memberCount) || 1));
        return Math.min(4, 1 + ((count - 1) * 0.5));
    }

    setIslandCaptureState(islandData, nextState) {
        if (!islandData) return;
        islandData.captureState = nextState || null;
        if (this.collidingIsland?.id === islandData.id) {
            this.collidingIsland.captureState = islandData.captureState;
        }
    }

    ensureIslandCaptureOverlay(islandData) {
        if (!islandData) return null;
        if (islandData.captureOverlay?.container?.active) {
            return islandData.captureOverlay;
        }
        const container = this.add.container(0, 0);
        container.setDepth(GAME_CONFIG.DEPTH.NAME_TEXT + 1);
        this.ignoreOnUiCamera(container);
        const panel = this.add.graphics();
        const barBg = this.add.graphics();
        const barFill = this.add.graphics();
        const label = this.add.text(0, -14, '', {
            fontSize: '11px',
            color: '#fff7c2',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        const detail = this.add.text(0, 2, '', {
            fontSize: '10px',
            color: '#d7f3ff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        container.add([panel, barBg, barFill, label, detail]);
        islandData.captureOverlay = { container, panel, barBg, barFill, label, detail };
        return islandData.captureOverlay;
    }

    updateIslandCaptureOverlays() {
        if (!this.islandObjects || this.islandObjects.size === 0) return;
        const now = Date.now();
        const myId = this.playerInfo?.playFabId || null;
        const myNation = String(this.playerInfo?.nation || '').toLowerCase();
        this.islandObjects.forEach((islandData) => {
            const state = this.getIslandCaptureState(islandData);
            const queue = Array.isArray(state.queue) ? state.queue : [];
            if (queue.length <= 0) {
                if (islandData?.id) {
                    this.islandCaptureAlertStateById.delete(islandData.id);
                }
                if (islandData.captureOverlay?.container) {
                    islandData.captureOverlay.container.setVisible(false);
                }
                return;
            }
            const overlay = this.ensureIslandCaptureOverlay(islandData);
            if (!overlay) return;
            const width = 92;
            const barWidth = 72;
            const totalMs = Math.max(
                Number(state.baseDurationMs) || 0,
                Math.max(0, Number(state.progressBaseMs) || 0) + Math.max(0, Number(state.endsAt) - now) * this.getIslandCaptureSpeedMultiplier(queue.length)
            );
            const remainingMs = Math.max(0, Number(state.endsAt) - now);
            const progressRatio = totalMs > 0 ? Phaser.Math.Clamp(1 - (remainingMs / totalMs), 0, 1) : 1;
            const leader = queue[0] || null;
            const leaderName = leader?.playFabId === this.playerInfo?.playFabId
                ? 'あなた'
                : String(leader?.playFabId || '').slice(0, 6);
            const leaderNation = String(leader?.nation || '').toLowerCase();
            const ownerNation = String(islandData?.nation || islandData?.Nation || '').toLowerCase();
            const isMyQueue = !!leader && (leader.playFabId === myId || (!!myNation && leaderNation === myNation));
            const isOwnerHolding = !!ownerNation && !!leaderNation && ownerNation === leaderNation;
            const isEnemyWarning = !isMyQueue;
            const pulse = 0.86 + (Math.sin(now / 180) * 0.12);
            let panelColor = 0x08131f;
            let panelAlpha = 0.8;
            let barColor = 0xffd166;
            let labelColor = '#fff7c2';
            let detailColor = '#d7f3ff';
            let stateLabel = '占領中';

            if (isOwnerHolding) {
                stateLabel = isMyQueue ? '防衛中' : '敵防衛中';
            } else if (ownerNation && leaderNation && ownerNation !== leaderNation) {
                stateLabel = isMyQueue ? '制圧中' : (ownerNation === myNation ? '敵襲中' : '敵占領中');
            } else if (!isMyQueue) {
                stateLabel = '敵占領中';
            }

            if (isEnemyWarning) {
                panelColor = ownerNation === myNation ? 0x3a0d12 : 0x24110d;
                panelAlpha = ownerNation === myNation ? 0.92 : 0.86;
                barColor = ownerNation === myNation ? 0xff6b6b : 0xff9f43;
                labelColor = ownerNation === myNation ? '#ffd6d6' : '#ffe4c7';
                detailColor = ownerNation === myNation ? '#ffe7e7' : '#fff1de';
            } else if (stateLabel === '防衛中') {
                panelColor = 0x102534;
                panelAlpha = 0.84;
                barColor = 0x6dd3ff;
                labelColor = '#d8f6ff';
                detailColor = '#dff8ff';
            } else if (stateLabel === '制圧中') {
                panelColor = 0x0d2a1c;
                panelAlpha = 0.84;
                barColor = 0x63e6be;
                labelColor = '#d8ffee';
                detailColor = '#dcfff2';
            }

            overlay.container.setVisible(true);
            overlay.container.setAlpha(isEnemyWarning ? pulse : 1);
            overlay.container.setPosition(islandData.x + (islandData.width / 2), islandData.y - 18);
            overlay.panel.clear();
            overlay.panel.fillStyle(panelColor, panelAlpha);
            overlay.panel.fillRoundedRect(-(width / 2), -24, width, 34, 8);
            overlay.barBg.clear();
            overlay.barBg.fillStyle(0x000000, 0.6);
            overlay.barBg.fillRoundedRect(-(barWidth / 2), 10, barWidth, 6, 3);
            overlay.barFill.clear();
            overlay.barFill.fillStyle(barColor, 0.95);
            overlay.barFill.fillRoundedRect(-(barWidth / 2) + 1, 11, Math.max(2, (barWidth - 2) * progressRatio), 4, 2);
            overlay.label.setColor(labelColor);
            overlay.detail.setColor(detailColor);
            overlay.label.setText(`${stateLabel} ${Math.max(0, Math.ceil(remainingMs / 1000))}s`);
            overlay.detail.setText(`${queue.length}/${state.slotLimit}人 先頭:${leaderName}`);
            this.notifyIslandCaptureAlert(islandData, stateLabel, leaderName, isEnemyWarning);
        });
    }

    isPlayerInIslandCapture(islandData) {
        const myId = this.playerInfo?.playFabId;
        if (!myId) return false;
        const state = this.getIslandCaptureState(islandData);
        return state.queue.some((entry) => entry.playFabId === myId);
    }

    getCapitalNationForIsland(islandData) {
        if (!islandData) return '';
        const explicit = String(islandData.ownerNation || islandData.nation || '').toLowerCase().trim();
        if (explicit) return explicit;
        const mapKey = String(islandData.mapId || this.mapId || '').toLowerCase();
        if (mapKey === 'wands') return 'fire';
        if (mapKey === 'pentacles') return 'earth';
        if (mapKey === 'cups') return 'water';
        if (mapKey === 'swords') return 'wind';
        return '';
    }

    getCachedCapitalWarState(islandData) {
        const nation = this.getCapitalNationForIsland(islandData);
        return nation ? (this.capitalWarStateByNation.get(nation) || null) : null;
    }

    async fetchCapitalWarState(islandData, force = false) {
        const playFabId = this.playerInfo?.playFabId;
        const nation = this.getCapitalNationForIsland(islandData);
        if (!playFabId || !nation) return null;
        if (!force && this.capitalWarStateByNation.has(nation)) {
            return this.capitalWarStateByNation.get(nation) || null;
        }
        const data = await requestCapitalWarState(playFabId, nation, { isSilent: true });
        const capitalWar = data?.capitalWar || null;
        if (capitalWar) {
            this.capitalWarStateByNation.set(nation, capitalWar);
            if (islandData) islandData.capitalWarState = capitalWar;
        }
        return capitalWar;
    }

    isPlayerInCapitalCapture(islandData) {
        const myId = this.playerInfo?.playFabId;
        if (!myId) return false;
        const capitalWar = islandData?.capitalWarState || this.getCachedCapitalWarState(islandData);
        const queue = Array.isArray(capitalWar?.capitalCapture?.queue) ? capitalWar.capitalCapture.queue : [];
        return queue.some((entry) => entry.playFabId === myId);
    }

    async triggerCapitalWarAction(islandData, action, { forceRefresh = true, successMessage = '', isSilent = false } = {}) {
        const playFabId = this.playerInfo?.playFabId;
        const nation = this.getCapitalNationForIsland(islandData);
        if (!playFabId || !nation) {
            throw new Error('首都戦を処理できません');
        }
        const data = await requestCapitalWarAction(playFabId, nation, action, { isSilent });
        const capitalWar = data?.capitalWar || null;
        if (capitalWar) {
            this.capitalWarStateByNation.set(nation, capitalWar);
            if (islandData) islandData.capitalWarState = capitalWar;
        } else if (forceRefresh) {
            await this.fetchCapitalWarState(islandData, true);
        }
        if (successMessage) {
            this.showMessage(successMessage);
        }
        return capitalWar;
    }

    async leaveCapitalCaptureSilently(islandData) {
        if (!this.isPlayerInCapitalCapture(islandData)) return;
        try {
            await this.triggerCapitalWarAction(islandData, 'capture_leave', { forceRefresh: false, isSilent: true });
        } catch (error) {
            console.warn('[CapitalCapture] Failed to leave silently:', error?.message || error);
        }
    }

    clearIslandCommandTimers(includeCapture = true) {
        if (this.islandCommandRefreshTimer) {
            clearTimeout(this.islandCommandRefreshTimer);
            this.islandCommandRefreshTimer = null;
        }
        if (includeCapture && this.islandCaptureCompleteTimer) {
            clearTimeout(this.islandCaptureCompleteTimer);
            this.islandCaptureCompleteTimer = null;
        }
        if (includeCapture && this.capitalCaptureCompleteTimer) {
            clearTimeout(this.capitalCaptureCompleteTimer);
            this.capitalCaptureCompleteTimer = null;
        }
    }

    scheduleIslandCommandRefresh(islandData, delayMs = 1000) {
        this.clearIslandCommandTimers(false);
        if (!this.commandMenuOpen || !islandData || this.collidingIsland?.id !== islandData.id) return;
        const safeDelay = Math.max(250, Math.floor(Number(delayMs) || 1000));
        this.islandCommandRefreshTimer = setTimeout(() => {
            this.islandCommandRefreshTimer = null;
            const latestIsland = this.islandObjects.get(islandData.id) || islandData;
            if (!this.commandMenuOpen || this.collidingIsland?.id !== latestIsland.id) return;
            this.showIslandCommandMenu(latestIsland);
        }, safeDelay);
    }

    async postIslandCaptureAction(endpoint, islandData) {
        const playFabId = this.playerInfo?.playFabId;
        if (!playFabId || !islandData?.id) {
            throw new Error('ログイン情報が不足しています。');
        }
        const res = await fetch((window.buildApiUrl ? window.buildApiUrl(endpoint) : endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playFabId,
                islandId: islandData.id,
                mapId: islandData.mapId || this.mapId
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data?.error || `HTTP ${res.status}`);
        }
        return data || {};
    }

    async damageIslandBuildingViaApi(islandData) {
        const playFabId = this.playerInfo?.playFabId;
        if (!playFabId || !islandData?.id) {
            this.showMessage('ログインが必要です。');
            return;
        }
        try {
            const data = await this.postIslandCaptureAction('/api/damage-island-building', islandData);
            await this.reloadIslandFromFirestore(islandData.id);
            const latestIsland = this.islandObjects.get(islandData.id);
            if (latestIsland) {
                if (data.captureState) {
                    this.setIslandCaptureState(latestIsland, data.captureState);
                }
                this.collidingIsland = latestIsland;
                const storageDamageText = this.formatShipCargoOutcomeText(data.storageDamage || {});
                const storageLootedText = this.formatShipCargoOutcomeText(data.storageLooted || {});
                if (data.destroyed && storageDamageText && storageLootedText) {
                    this.showMessage(`建物を突破。敵倉庫に被害 ${storageDamageText} / 略奪 ${storageLootedText}`);
                } else if (data.destroyed && storageDamageText) {
                    this.showMessage(`建物を突破。敵倉庫にも被害 ${storageDamageText}`);
                } else {
                    this.showMessage(data.destroyed ? '建物を突破しました。上陸できます。' : '建物に砲撃を命中させた。');
                }
                this.showIslandCommandMenu(latestIsland);
            }
        } catch (error) {
            console.error('島の砲撃に失敗しました:', error);
            this.showError(error?.message || '島の砲撃に失敗しました。');
        }
    }

    async startIslandCaptureFlow(islandData, mode = 'start', options = {}) {
        const endpoint = mode === 'join'
            ? '/api/join-island-capture'
            : mode === 'cancel'
                ? '/api/cancel-island-capture'
                : '/api/start-island-capture';
        const silent = !!options?.silent;
        try {
            const data = await this.postIslandCaptureAction(endpoint, islandData);
            const latestIsland = this.islandObjects.get(islandData.id) || islandData;
            this.setIslandCaptureState(latestIsland, data.captureState || null);
            if (!silent || this.collidingIsland?.id === latestIsland.id) {
                this.collidingIsland = latestIsland;
            }
            if (!silent && mode === 'join') {
                this.showMessage('占領に参加しました。');
            } else if (!silent && mode === 'cancel') {
                this.showMessage('上陸を中断しました。');
            } else if (!silent) {
                this.showMessage('上陸を開始しました。');
            }
            if (!silent) {
                this.showIslandCommandMenu(latestIsland);
            }
        } catch (error) {
            console.error('[IslandCapture] Failed:', error);
            if (!silent) {
                this.showError(error?.message || '島の占領操作に失敗しました。');
            }
        }
    }

    async completeIslandCaptureFlow(islandData) {
        try {
            const data = await this.postIslandCaptureAction('/api/complete-island-capture', islandData);
            const latestIsland = this.islandObjects.get(islandData.id) || islandData;
            latestIsland.ownerId = data.ownerId || this.playerInfo.playFabId;
            latestIsland.ownerNation = data.ownerNation || this.playerInfo.nation || null;
            latestIsland.captureState = null;
            if (data.mapOccupationNation !== undefined) {
                this.mapOccupationNation = data.mapOccupationNation || null;
                this.updateAreaControlState();
            }
            await this.reloadIslandFromFirestore(islandData.id);
            const reloadedIsland = this.islandObjects.get(islandData.id) || latestIsland;
            this.collidingIsland = reloadedIsland;
            this.showMessage(`${reloadedIsland.name || '島'}を占領しました。`);
            this.showIslandCommandMenu(reloadedIsland);
        } catch (error) {
            console.error('[CompleteIslandCapture] Failed:', error);
            this.showError(error?.message || '島の占領完了に失敗しました。');
        }
    }

    async claimIsland(islandData) {
        if (!this.playerInfo.playFabId || islandData.ownerId === this.playerInfo.playFabId) {
            return;
        }

        console.log(`島「${islandData.name}」を占領します...`);

        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/claim-island') : '/api/claim-island'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playFabId: this.playerInfo.playFabId,
                    islandId: islandData.id,
                    mapId: this.mapId
                })
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const result = await res.json();
            islandData.ownerId = result.ownerId || this.playerInfo.playFabId;
            islandData.ownerNation = result.ownerNation || this.playerInfo.nation || null;
            if (result.mapOccupationNation !== undefined) {
                this.mapOccupationNation = result.mapOccupationNation || null;
                this.updateAreaControlState();
            }
            if (islandData.nameText) {
                const newColor = this.getNationColor(this.playerInfo.nation);
                islandData.nameText.setFill(`#${newColor.toString(16).padStart(6, '0')}`);
            }
            if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                const name = islandData.name || '島';
                window.showRpgMessage(window.rpgSay ? window.rpgSay.islandClaimed(name) : `${name}を占領した！`);
            }
            this.showMessage(`${islandData.name}を占領しました。`);
        } catch (error) {
            console.error('島の占領に失敗しました:', error);
            this.showError('島の占領に失敗しました。');
        }
    }

    /**
     *
     *
     */
    async showCapitalCommandMenu(islandData, refs) {
        const { panel, title, statusEl, actionBtn, tarotBtn, attackBtn, closeBtn } = refs;
        const myPlayFabId = this.playerInfo?.playFabId;
        const playerNation = String(this.playerInfo?.nation || '').toLowerCase();
        const capitalNation = this.getCapitalNationForIsland(islandData);
        let capitalWar = this.getCachedCapitalWarState(islandData);
        try {
            capitalWar = await this.fetchCapitalWarState(islandData, true) || capitalWar;
        } catch (error) {
            console.warn('[CapitalWar] Failed to load state:', error?.message || error);
        }
        const capture = capitalWar?.capitalCapture || {};
        const queue = Array.isArray(capture.queue) ? capture.queue : [];
        const leader = queue[0] || null;
        const leaderNation = String(leader?.nation || '').toLowerCase();
        const isOwnNation = !!playerNation && !!capitalNation && playerNation === capitalNation;
        const isCaptureMember = !!myPlayFabId && queue.some((entry) => entry.playFabId === myPlayFabId);
        const isCaptureLeader = !!leader && leader.playFabId === myPlayFabId;
        const hasAllyCapture = !!leader && !!playerNation && leaderNation === playerNation;
        const hasEnemyCapture = !!leader && !!playerNation && leaderNation && leaderNation !== playerNation;
        const captureRemainingMs = Math.max(0, Number(capture.remainingMs) || 0);
        const captureRemainingSeconds = Math.max(0, Math.ceil(captureRemainingMs / 1000));
        const wallEntry = (Array.isArray(capitalWar?.capitalStatus) ? capitalWar.capitalStatus : []).find((entry) => entry.part === 'walls') || null;
        const wallText = wallEntry
            ? (wallEntry.exact && wallEntry.value != null ? `城壁 ${wallEntry.value}%` : `城壁 ${wallEntry.band?.label || '-'}`)
            : '城壁 -';
        const statusParts = [wallText];
        if (capture.raidUnlocked) {
            statusParts.push('国庫襲撃可能');
        } else if (capture.raidCooldownActive) {
            statusParts.push(`再襲撃防衛中 ${Math.max(1, Math.ceil((Number(capture.raidCooldownRemainingMs) || 0) / 60000))}分`);
        } else if (capture.breached) {
            statusParts.push('上陸可能');
        }
        if (!isOwnNation && !capture.intelGranted) {
            statusParts.push('偵察で詳細表示');
        }
        if (queue.length > 0) {
            statusParts.push(`制圧 ${queue.length}/${Math.max(1, Number(capture.slotLimit) || 1)}`);
            if (captureRemainingSeconds > 0) {
                statusParts.push(`残り${captureRemainingSeconds}秒`);
            } else {
                statusParts.push('制圧完了可能');
            }
        }
        statusEl.style.display = 'block';
        statusEl.textContent = statusParts.join(' / ');
        title.textContent = `${islandData.name} 首都`;

        let buttonText = '工作';
        let buttonClass = 'warning';
        let onClick = async () => {
            await this.triggerCapitalWarAction(islandData, 'sabotage', { successMessage: '工作隊を送り込みました。' });
            await this.showIslandCommandMenu(islandData);
        };

        let tarotVisible = false;
        let tarotText = '偵察';
        let tarotClass = 'info';
        let tarotOnClick = async () => {
            await this.triggerCapitalWarAction(islandData, 'recon', { successMessage: '首都の偵察に成功しました。' });
            await this.showIslandCommandMenu(islandData);
        };

        let attackVisible = false;
        let attackText = capture.breached ? '攻城' : '艦砲射撃';
        let attackClass = 'danger';
        let attackOnClick = async () => {
            await this.triggerCapitalWarAction(islandData, capture.breached ? 'siege' : 'ship_attack', {
                successMessage: capture.breached ? '首都へ攻城を行いました。' : '首都へ艦砲射撃を行いました。'
            });
            await this.showIslandCommandMenu(islandData);
        };

        if (!myPlayFabId) {
            buttonText = 'ログインが必要';
            buttonClass = 'disabled';
            onClick = () => this.showMessage('ログインしてください。');
        } else if (isOwnNation) {
            buttonText = '首都を修理';
            buttonClass = 'info';
            onClick = async () => {
                await this.triggerCapitalWarAction(islandData, 'repair', { successMessage: '首都設備を修理しました。' });
                await this.showIslandCommandMenu(islandData);
            };
            tarotVisible = true;
            tarotText = '首都メニュー';
            tarotClass = 'info';
            tarotOnClick = async () => {
                await this.openBuildingMenuForIsland(islandData);
            };
        } else {
            tarotVisible = true;
            attackVisible = true;
            if (capture.raidUnlocked) {
                buttonText = '国庫襲撃は王のみ';
                buttonClass = 'disabled';
                onClick = () => this.showMessage('国庫襲撃は王ページから実行します。');
                attackVisible = false;
            } else if (hasEnemyCapture && leader) {
                buttonText = '防衛戦休止中';
                buttonClass = 'disabled';
                onClick = () => this.showMessage('白兵戦は現在休止中です。');
            } else if (isCaptureMember) {
                if (isCaptureLeader && captureRemainingMs <= 0) {
                    buttonText = '首都制圧を完了';
                    buttonClass = 'warning';
                    onClick = async () => {
                        await this.triggerCapitalWarAction(islandData, 'capture_complete', { successMessage: '首都制圧を完了しました。' });
                        await this.showIslandCommandMenu(islandData);
                    };
                } else {
                    buttonText = '首都から撤退';
                    buttonClass = 'danger';
                    onClick = async () => {
                        await this.triggerCapitalWarAction(islandData, 'capture_leave', { successMessage: '首都制圧から離脱しました。' });
                        await this.showIslandCommandMenu(islandData);
                    };
                }
            } else if (hasAllyCapture) {
                if (queue.length < (Number(capture.slotLimit) || 1)) {
                    buttonText = '制圧に参加';
                    buttonClass = 'warning';
                    onClick = async () => {
                        await this.triggerCapitalWarAction(islandData, 'capture_join', { successMessage: '首都制圧に参加しました。' });
                        await this.showIslandCommandMenu(islandData);
                    };
                } else {
                    buttonText = '制圧枠が満員';
                    buttonClass = 'disabled';
                    onClick = () => this.showMessage('これ以上は首都制圧に参加できません。');
                }
            } else if (capture.breached) {
                buttonText = '首都に乗り込む';
                buttonClass = 'warning';
                onClick = async () => {
                    await this.triggerCapitalWarAction(islandData, 'capture_start', { successMessage: '首都へ上陸しました。' });
                    await this.showIslandCommandMenu(islandData);
                };
            }
        }

        if (queue.length > 0 && captureRemainingMs > 0 && !capture.raidUnlocked) {
            if (isCaptureLeader) {
                this.capitalCaptureCompleteTimer = setTimeout(() => {
                    this.capitalCaptureCompleteTimer = null;
                    const latestIsland = this.islandObjects.get(islandData.id) || islandData;
                    if (!latestIsland || !this.isPlayerInCapitalCapture(latestIsland)) return;
                    void this.triggerCapitalWarAction(latestIsland, 'capture_complete', { successMessage: '首都制圧を完了しました。' })
                        .then(() => this.showIslandCommandMenu(latestIsland));
                }, captureRemainingMs + 160);
            } else {
                this.scheduleIslandCommandRefresh(islandData, Math.min(1000, captureRemainingMs + 120));
            }
        }

        actionBtn.textContent = buttonText;
        actionBtn.className = `island-command-btn ${buttonClass}`;
        if (tarotBtn) {
            tarotBtn.textContent = tarotText;
            tarotBtn.className = `island-command-btn ${tarotClass}`;
            tarotBtn.style.display = tarotVisible ? 'block' : 'none';
        }
        attackBtn.textContent = attackText;
        attackBtn.className = `island-command-btn ${attackClass}`;
        attackBtn.style.display = attackVisible ? 'block' : 'none';

        const newActionBtn = actionBtn.cloneNode(true);
        actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
        const newTarotBtn = tarotBtn ? tarotBtn.cloneNode(true) : null;
        if (tarotBtn && newTarotBtn) {
            tarotBtn.parentNode.replaceChild(newTarotBtn, tarotBtn);
        }
        const newAttackBtn = attackBtn.cloneNode(true);
        attackBtn.parentNode.replaceChild(newAttackBtn, attackBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newActionBtn.addEventListener('click', () => {
            void onClick();
        });
        if (newTarotBtn && tarotVisible) {
            newTarotBtn.addEventListener('click', () => {
                void tarotOnClick();
            });
        } else if (newTarotBtn) {
            newTarotBtn.style.display = 'none';
        }
        if (attackVisible) {
            newAttackBtn.addEventListener('click', () => {
                void attackOnClick();
            });
        } else {
            newAttackBtn.style.display = 'none';
        }
        bindModalClose(newCloseBtn, () => {
            this.hideIslandCommandMenu();
        });

        setTimeout(() => {
            panel.classList.add('active');
        }, 10);
        this.commandMenuOpen = true;
    }

    async showIslandCommandMenu(islandData) {
        const panel = document.getElementById('islandCommandPanel');
        const title = document.getElementById('islandCommandTitle');
        const statusEl = document.getElementById('islandCommandStatus');
        const actionBtn = document.getElementById('islandCommandAction');
        const tarotBtn = document.getElementById('islandCommandTarot');
        const attackBtn = document.getElementById('islandCommandAttack');
        const closeBtn = document.getElementById('islandCommandClose');

        if (!panel || !title || !statusEl || !actionBtn || !attackBtn || !closeBtn) {
            console.error('[showIslandCommandMenu] HTMLパネルが見つかりません');
            return;
        }

        this.wireIslandCommandPullToClose();
        this.clearIslandCommandTimers(true);

        title.textContent = islandData.name;
        const isCapitalIsland = String(islandData.occupationStatus || '').toLowerCase() === 'capital';
        if (isCapitalIsland) {
            await this.showCapitalCommandMenu(islandData, { panel, title, statusEl, actionBtn, tarotBtn, attackBtn, closeBtn });
            return;
        }

        const myPlayFabId = this.playerInfo?.playFabId;
        const isOwner = !!myPlayFabId && islandData.ownerId === myPlayFabId;
        const isInOwnedArea = this.isIslandInOwnedArea(islandData);

        const resourceBiomes = ['volcanic', 'rocky', 'mushroom', 'lake', 'forest', 'sacred'];
        const biomeId = normalizeBiomeId(islandData?.biome);
        const isResourceIsland = resourceBiomes.includes(String(biomeId || ''));
        const hasBuilding = Array.isArray(islandData.buildings)
            ? islandData.buildings.some(b => b && b.status !== 'demolished')
            : false;
        const playerNation = String(this.playerInfo?.nation || '').toLowerCase();
        const occupationNation = String(this.mapOccupationNation || '').toLowerCase();
        const mapNation = (() => {
            if (occupationNation) return occupationNation;
            const mapKey = String(islandData.mapId || this.mapId || '').toLowerCase();
            switch (mapKey) {
                case 'wands':
                    return 'fire';
                case 'pentacles':
                    return 'earth';
                case 'swords':
                    return 'wind';
                case 'cups':
                    return 'water';
                default:
                    return '';
            }
        })();
        const islandNation = String(islandData.ownerNation || islandData.nation || mapNation || biomeId || '').toLowerCase();
        const isOwnNation = !!playerNation && !!islandNation && playerNation === islandNation;
        const isUnoccupied = !islandData.ownerId;
        const canBuildToOccupy = !isOwner && isInOwnedArea && isUnoccupied && isOwnNation && !isResourceIsland && !hasBuilding;
        const autoAttackConfig = this.getIslandAutoAttackConfig(islandData);
        const canAutoAttack = !!myPlayFabId && !!autoAttackConfig && (isOwner || isOwnNation);
        const canPlayTarot = !!myPlayFabId && isOwner;
        const menuLabel = hasBuilding ? '施設メニュー' : (isResourceIsland ? '採取メニュー' : '建設メニュー');
        const captureState = this.getIslandCaptureState(islandData);
        const captureQueue = captureState.queue;
        const captureLeader = captureQueue[0] || null;
        const captureLeaderNation = String(captureLeader?.nation || '').toLowerCase();
        const isCaptureMember = !!myPlayFabId && captureQueue.some((entry) => entry.playFabId === myPlayFabId);
        const isCaptureLeader = !!myPlayFabId && captureLeader?.playFabId === myPlayFabId;
        const captureRemainingMs = captureQueue.length > 0 && captureState.endsAt > 0
            ? Math.max(0, captureState.endsAt - Date.now())
            : 0;
        const captureRemainingSeconds = Math.max(0, Math.ceil(captureRemainingMs / 1000));
        const hasAllyCapture = !!captureLeader && !!playerNation && !!captureLeaderNation && captureLeaderNation === playerNation;
        const hasEnemyCapture = !!captureLeader && !!playerNation && !!captureLeaderNation && captureLeaderNation !== playerNation;
        const isEnemyOwned = !!islandData.ownerId && !isOwner && !isOwnNation;
        const activeBuilding = this.getActiveIslandBuilding(islandData);
        const buildingMaxHp = Number(activeBuilding?.maxHp) || 0;
        const buildingCurrentHp = Number.isFinite(Number(activeBuilding?.currentHp))
            ? Math.max(0, Number(activeBuilding.currentHp))
            : buildingMaxHp;

        const statusParts = [];
        if (activeBuilding) {
            statusParts.push(`建物HP ${buildingCurrentHp}/${buildingMaxHp}`);
        } else if (isEnemyOwned || captureState.status === 'breached' || captureQueue.length > 0) {
            statusParts.push('突破済み');
        }
        if (captureQueue.length > 0) {
            const leaderLabel = isCaptureLeader
                ? 'あなた'
                : (captureLeaderNation ? `${captureLeaderNation}先頭` : `先頭 ${String(captureLeader?.playFabId || '').slice(0, 6)}`);
            if (captureRemainingSeconds > 0) {
                statusParts.push(`占領中 残り${captureRemainingSeconds}秒`);
            } else {
                statusParts.push('占領完了可能');
            }
            statusParts.push(`参加 ${captureQueue.length}/${captureState.slotLimit}`);
            statusParts.push(`先頭: ${leaderLabel}`);
        } else if (!activeBuilding && isEnemyOwned) {
            statusParts.push(`上陸可能 ${captureQueue.length}/${captureState.slotLimit}`);
        }
        if (statusParts.length > 0) {
            statusEl.style.display = 'block';
            statusEl.textContent = statusParts.join(' / ');
        } else {
            statusEl.style.display = 'none';
            statusEl.textContent = '';
        }

        let buttonText = `${menuLabel}を開く`;
        let buttonClass = 'info';
        let onClick = async () => {
            await this.openBuildingMenuForIsland(islandData);
        };

        if (!myPlayFabId) {
            buttonText = 'ログインが必要です';
            buttonClass = 'disabled';
            onClick = () => this.showMessage('ログインしてください。');
        } else if (isCapitalIsland && isOwnNation) {
            buttonText = '首都メニューを開く';
            buttonClass = 'info';
            onClick = async () => {
                await this.openBuildingMenuForIsland(islandData);
            };
        } else if (isEnemyOwned) {
            if (activeBuilding) {
                buttonText = '建物を砲撃';
                buttonClass = 'danger';
                onClick = async () => {
                    await this.damageIslandBuildingViaApi(islandData);
                };
            } else if (hasEnemyCapture && captureLeader) {
                buttonText = '防衛戦休止中';
                buttonClass = 'disabled';
                onClick = () => this.showMessage('白兵戦は現在休止中です。');
            } else if (hasEnemyCapture) {
                buttonText = '敵が防衛中';
                buttonClass = 'disabled';
                onClick = () => this.showMessage('敵と交戦中です。');
            } else if (isCaptureMember) {
                if (isCaptureLeader && captureRemainingMs <= 0) {
                    buttonText = '占領を完了';
                    buttonClass = 'warning';
                    onClick = async () => {
                        await this.completeIslandCaptureFlow(islandData);
                    };
                } else {
                    buttonText = '上陸をやめる';
                    buttonClass = 'danger';
                    onClick = async () => {
                        await this.startIslandCaptureFlow(islandData, 'cancel');
                    };
                }
            } else if (hasAllyCapture) {
                if (captureQueue.length < captureState.slotLimit) {
                    buttonText = '占領に参加';
                    buttonClass = 'warning';
                    onClick = async () => {
                        await this.startIslandCaptureFlow(islandData, 'join');
                    };
                } else {
                    buttonText = '上陸枠が満員';
                    buttonClass = 'disabled';
                    onClick = () => this.showMessage('この島はこれ以上上陸できません。');
                }
            } else {
                buttonText = '上陸して占領開始';
                buttonClass = 'warning';
                onClick = async () => {
                    await this.startIslandCaptureFlow(islandData, 'start');
                };
            }
        } else if (!isOwner && !isInOwnedArea) {
            buttonText = '占領範囲外';
            buttonClass = 'disabled';
            onClick = () => this.showMessage('このエリアは占領されていません。');
        } else if (!isOwner) {
            if (isResourceIsland) {
                buttonText = `${menuLabel}を開く`;
                buttonClass = 'info';
                onClick = async () => {
                    await this.openBuildingMenuForIsland(islandData);
                };
            } else if (canBuildToOccupy) {
                buttonText = '建築開始で占領する';
                buttonClass = 'warning';
                onClick = async () => {
                    await this.openBuildingMenuForIsland(islandData);
                };
            } else {
                buttonText = '占領不可';
                buttonClass = 'disabled';
                onClick = () => this.showMessage('この島は建築して占領できません。');
            }
        }

        if (captureQueue.length > 0 && captureRemainingMs > 0) {
            if (isCaptureLeader) {
                this.islandCaptureCompleteTimer = setTimeout(() => {
                    this.islandCaptureCompleteTimer = null;
                    const latestIsland = this.islandObjects.get(islandData.id) || islandData;
                    if (!latestIsland || !this.isPlayerInIslandCapture(latestIsland)) return;
                    void this.completeIslandCaptureFlow(latestIsland);
                }, captureRemainingMs + 160);
            } else {
                this.scheduleIslandCommandRefresh(islandData, Math.min(1000, captureRemainingMs + 120));
            }
        }

        actionBtn.textContent = buttonText;
        actionBtn.className = 'island-command-btn ' + buttonClass;

        const remainingCooldownMs = this.getIslandAttackCooldownRemaining(islandData?.id, autoAttackConfig);
        const cooldownSeconds = Math.max(1, Math.ceil(remainingCooldownMs / 1000));
        const attackOnClick = () => {
            if (remainingCooldownMs > 0) {
                this.showMessage(`攻撃準備まで残り${cooldownSeconds}秒`);
                return;
            }
            void this.triggerIslandAutoAttack(islandData, autoAttackConfig);
        };
        attackBtn.textContent = remainingCooldownMs > 0 ? `攻撃準備 (${cooldownSeconds}秒)` : '攻撃準備';
        attackBtn.className = 'island-command-btn danger';
        attackBtn.style.display = canAutoAttack ? 'block' : 'none';
        if (tarotBtn) {
            tarotBtn.textContent = 'タロットポーカー';
            tarotBtn.className = 'island-command-btn info';
            tarotBtn.style.display = canPlayTarot ? 'block' : 'none';
        }

        const newActionBtn = actionBtn.cloneNode(true);
        actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
        const newTarotBtn = tarotBtn ? tarotBtn.cloneNode(true) : null;
        if (tarotBtn && newTarotBtn) {
            tarotBtn.parentNode.replaceChild(newTarotBtn, tarotBtn);
        }
        const newAttackBtn = attackBtn.cloneNode(true);
        attackBtn.parentNode.replaceChild(newAttackBtn, attackBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newActionBtn.addEventListener('click', () => {
            void onClick();
        });

        if (newTarotBtn && canPlayTarot) {
            newTarotBtn.addEventListener('click', () => {
                this.hideIslandCommandMenu();
                if (typeof window !== 'undefined' && typeof window.showTab === 'function') {
                    window.showTab('tarot');
                } else {
                    this.showMessage('タロットポーカーを開けません。');
                }
            });
        } else if (newTarotBtn) {
            newTarotBtn.style.display = 'none';
        }

        if (canAutoAttack) {
            newAttackBtn.addEventListener('click', attackOnClick);
        } else {
            newAttackBtn.style.display = 'none';
        }

        bindModalClose(newCloseBtn, () => {
            this.hideIslandCommandMenu();
        });

        setTimeout(() => {
            panel.classList.add('active');
        }, 10);

        this.commandMenuOpen = true;
    }

    async openBuildingMenuForIsland(islandData) {
        if (!window.Island || !window.Island.getIslandDetails || !window.Island.showBuildingMenu) {
            this.showMessage('メニューを開けません。');
            return;
        }

        const islandDetails = await window.Island.getIslandDetails(islandData.id);
        if (!islandDetails) {
            this.showMessage('島の詳細情報の取得に失敗しました。');
            return;
        }

        window.Island.showBuildingMenu(islandDetails, this.playerInfo.playFabId);
        this.hideIslandCommandMenu();
    }

    /**
     *
     */
    hideIslandCommandMenu() {
        const panel = document.getElementById('islandCommandPanel');
        this.clearIslandCommandTimers(false);
        if (panel) {
            panel.classList.remove('active');
        }
        this.commandMenuOpen = false;
        const dockBuffer = this.isAirDomain(this.playerShipDomain) ? 0 : this.TILE_SIZE * 0.4;
        this.collidingIsland = this.getCurrentIslandUnderPlayer(dockBuffer);
    }

    wireIslandCommandPullToClose() {
        const panel = document.getElementById('islandCommandPanel');
        if (!panel || panel.dataset.pullToCloseInstalled) return;
        panel.dataset.pullToCloseInstalled = '1';

        let pulling = false;
        let startY = 0;
        let lastPull = 0;
        const closeThreshold = 70;
        const maxPull = 110;

        const closePanel = () => {
            if (this.boardingTargetId) {
                this.hideShipCommandMenu();
            } else {
                this.hideIslandCommandMenu();
            }
        };

        const onStart = (event) => {
            if (!panel.classList.contains('active')) return;
            const touch = event.touches[0];
            if (!touch) return;
            pulling = true;
            startY = touch.clientY;
            lastPull = 0;
            panel.style.transition = 'none';
        };

        const onMove = (event) => {
            if (!pulling) return;
            const touch = event.touches[0];
            if (!touch) return;
            const delta = touch.clientY - startY;
            if (delta <= 0) return;
            event.preventDefault();
            lastPull = Math.min(delta, maxPull);
            panel.style.transform = `translateY(${lastPull}px)`;
        };

        const onEnd = () => {
            if (!pulling) return;
            pulling = false;
            panel.style.transition = '';
            panel.style.transform = '';
            if (lastPull >= closeThreshold) {
                closePanel();
            }
            lastPull = 0;
        };

        panel.addEventListener('touchstart', onStart, { passive: true });
        panel.addEventListener('touchmove', onMove, { passive: false });
        panel.addEventListener('touchend', onEnd, { passive: true });
        panel.addEventListener('touchcancel', onEnd, { passive: true });
    }
    
    hideCommandMenu() {
        this.hideIslandCommandMenu();
        this.shipPanelSuppressed = true;
        this.hideShipCommandMenu();
    }

    /**
     *
     *
     */
    async abandonIsland(islandData) {
        console.log(`島「${islandData.name}」を放棄します...`);

        const db = getFirestore();
        const islandRef = doc(db, this.getWorldMapCollectionName(), islandData.id);

        try {
            await updateDoc(islandRef, {
                ownerId: null,
                ownerNation: null
            });
            console.log('島の放棄に成功');
            islandData.ownerId = null;
            islandData.ownerNation = null;
            if (islandData.nameText) {
                const newColor = this.getNationColor(null);
                islandData.nameText.setFill(`#${newColor.toString(16).padStart(6, '0')}`);
            }
            if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                const name = islandData.name || '島';
                window.showRpgMessage(window.rpgSay ? window.rpgSay.islandAbandoned(name) : `${name}を手放した。`);
            }
            this.showMessage(`${islandData.name}を放棄しました。`);
        } catch (error) {
            console.error('島の放棄に失敗しました:', error);
            this.showError('島の放棄に失敗しました。');
        }
    }

    /**
     *
     *
     */
    async attackIsland(islandData) {
        console.log(`島「${islandData.name}」への攻撃を開始します...`);
        this.showMessage(`${islandData.name}への攻撃を開始しました。`);
    }

    update() {
        this.checkMapEdgeTransition();
        this.updateAreaControlState();
        this.drawFogOfWar();
        this.updateNavigationHud();
        this.updatePositionHud();
        this.updateMinimapPlayerMarker();
        this.refreshShipSubscriptions();
        this.interpolateOtherShips();
        this.updateShipShadows();
        this.updateShipHpBars();
        this.updateIslandCaptureOverlays();
        const now = Date.now();
        if (!this.lastMinimapOverlayDrawAt || now - this.lastMinimapOverlayDrawAt >= 180) {
            this.drawOwnedAreasOnMinimap();
            this.lastMinimapOverlayDrawAt = now;
        }
        this.pruneOtherShips();
        this.checkShipShipCollisions();
        this.checkAirObstacleCollisions();
        this.checkAirIslandProximity();
        this.clearCollidingIslandWhenFar();
        this.updateShipActionMines();
        this.updateShipActionEffects();
        this.updateShipActionUi();
        this.updateShipSideCannonUi();
        this.updateShipNormalAttackUi();
        this.updateCreateIslandUi();
        this.updateGhostShip(this.game?.loop?.delta || 0);
    }

    checkMapEdgeTransition() {
        if (!this.playerShip || !this.mapId) return;
        if (this.mapTransitionCooldownUntil && Date.now() < this.mapTransitionCooldownUntil) return;
        if (this.mapTransitionPromptOpen) return;
        const margin = Math.max(12, Math.floor(this.TILE_SIZE * 2));
        const maxX = this.mapPixelSize - margin;
        const maxY = this.mapPixelSize - margin;
        const hitNorth = this.playerShip.y <= margin;
        const hitSouth = this.playerShip.y >= maxY;
        const hitWest = this.playerShip.x <= margin;
        const hitEast = this.playerShip.x >= maxX;
        const isAtEdge = hitNorth || hitSouth || hitWest || hitEast;
        if (!isAtEdge) {
            this.mapTransitionRequireLeave = false;
            return;
        }
        if (this.mapTransitionRequireLeave) return;
        const options = [];
        const pushOption = (direction, label, mapDelta) => {
            const neighbor = this.getAdjacentMapByOffset(mapDelta.r, mapDelta.c);
            if (!neighbor?.mapId) return;
            const entrySideByDir = {
                north: 'south',
                south: 'north',
                west: 'east',
                east: 'west',
                northwest: 'southeast',
                northeast: 'southwest',
                southwest: 'northeast',
                southeast: 'northwest'
            };
            const entrySide = entrySideByDir[direction] || 'south';
            options.push({
                direction,
                label: label ? `${label}（${neighbor.mapLabel || neighbor.mapId}）` : neighbor.mapLabel || neighbor.mapId,
                mapId: neighbor.mapId,
                mapLabel: neighbor.mapLabel || neighbor.mapId,
                entrySide
            });
        };
        if (hitNorth) pushOption('north', '北へ移動', { r: -1, c: 0 });
        if (hitSouth) pushOption('south', '南へ移動', { r: 1, c: 0 });
        if (hitWest) pushOption('west', '西へ移動', { r: 0, c: -1 });
        if (hitEast) pushOption('east', '東へ移動', { r: 0, c: 1 });
        if (hitNorth && hitWest) pushOption('northwest', '北西へ移動', { r: -1, c: -1 });
        if (hitNorth && hitEast) pushOption('northeast', '北東へ移動', { r: -1, c: 1 });
        if (hitSouth && hitWest) pushOption('southwest', '南西へ移動', { r: 1, c: -1 });
        if (hitSouth && hitEast) pushOption('southeast', '南東へ移動', { r: 1, c: 1 });
        if (options.length === 0) {
            this.mapTransitionRequireLeave = true;
            this.mapTransitionCooldownUntil = Date.now() + 2000;
            this.showMessage('この方向には海域がありません。');
            return;
        }
        this.mapTransitionPromptOpen = true;
        if (this.shipMoving) {
            this.shipMoving = false;
            this.playerShip.body.setVelocity(0, 0);
            if (this.shipTween) this.shipTween.stop();
            if (this.shipArrivalTimer) this.shipArrivalTimer.remove();
            this.stopShipAnimation();
            this.updateMyShipStoppedPosition();
        }
        const onSelect = (selected) => {
            this.mapTransitionPromptOpen = false;
            this.mapTransitionCooldownUntil = Date.now() + 2000;
            if (!selected) {
                this.mapTransitionRequireLeave = true;
                return;
            }
            this.mapTransitionRequireLeave = false;
            if (typeof window !== 'undefined' && typeof window.showTab === 'function') {
                window.showTab('map', this.playerInfo || window.__phaserPlayerInfo || null, {
                    skipMapSelect: true,
                    mapId: selected.mapId,
                    mapLabel: selected.mapLabel || selected.mapId,
                    entrySide: selected.entrySide
                });
            }
        };
        if (typeof window !== 'undefined' && typeof window.showMapTransitionModal === 'function') {
            window.showMapTransitionModal(options, onSelect);
        } else {
            onSelect(options[0]);
        }
    }

    getWorldMapTransitionCells() {
        if (typeof document !== 'undefined') {
            const grid = document.getElementById('worldMapGrid') || document.querySelector('.map-loading-overlay .world-map-modal-grid');
            if (grid) {
                const domCells = Array.from(grid.querySelectorAll('.world-map-modal-cell'));
                if (domCells.length >= 25) {
                    return domCells.map((cell, index) => ({
                        mapId: String(cell.dataset.mapId || '').trim(),
                        mapLabel: String(cell.dataset.mapLabel || '').trim(),
                        letter: String(cell.dataset.letter || '').trim().toUpperCase(),
                        index
                    }));
                }
            }
        }
        const layoutFromWindow = (typeof window !== 'undefined' && Array.isArray(window.__worldMapLayoutCache) && window.__worldMapLayoutCache.length === WORLD_MAP_FALLBACK_LAYOUT.length)
            ? window.__worldMapLayoutCache
            : WORLD_MAP_FALLBACK_LAYOUT;
        const layout = layoutFromWindow.slice(0, 25);
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, 21);
        let letterCursor = 0;
        return layout.map((rawMapId, index) => {
            const mapId = String(rawMapId || '').trim();
            const row = Math.floor(index / 5);
            const col = index % 5;
            const isCorner = (row === 0 && col === 0)
                || (row === 0 && col === 4)
                || (row === 4 && col === 0)
                || (row === 4 && col === 4);
            const letter = (!isCorner && letterCursor < letters.length) ? letters[letterCursor++] : '';
            const mapLabel = WORLD_MAP_LABEL_BY_ID[mapId] || mapId;
            return { mapId, mapLabel, letter, index };
        });
    }

    getAdjacentMapByOffset(rowDelta, colDelta) {
        const cells = this.getWorldMapTransitionCells();
        if (!Array.isArray(cells) || cells.length < 25) return null;
        const mapIdRaw = String(this.mapId || '').trim();
        const mapId = WORLD_MAP_ID_ALIAS[mapIdRaw] || mapIdRaw;
        const mapLabel = String(window.__currentMapLabel || '').trim();
        let index = -1;

        const emptyCellIdMatch = mapId.match(/^empty_cell_(\d{1,2})$/);
        if (emptyCellIdMatch) {
            const parsedIndex = Number(emptyCellIdMatch[1]);
            if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < cells.length) {
                index = parsedIndex;
            }
        }

        if (index < 0) {
            index = cells.findIndex((cell) => String(cell.mapId || '') === mapId);
        }

        if (index < 0 && mapLabel) {
            const seaLabelMatch = mapLabel.match(/^未開拓海域\s+([A-Z])$/);
            if (seaLabelMatch) {
                const letter = seaLabelMatch[1].toUpperCase();
                index = cells.findIndex((cell) => String(cell.letter || '').toUpperCase() === letter);
            }
        }

        if (index < 0 && mapLabel) {
            index = cells.findIndex((cell) => String(cell.mapLabel || '') === mapLabel);
        }
        if (index < 0) return null;

        const row = Math.floor(index / 5);
        const col = index % 5;
        const nextRow = row + rowDelta;
        const nextCol = col + colDelta;
        if (nextRow < 0 || nextRow > 4 || nextCol < 0 || nextCol > 4) return null;
        const nextIndex = nextRow * 5 + nextCol;
        const nextCell = cells[nextIndex];
        if (!nextCell) return null;

        const nextMapId = String(nextCell.mapId || '').trim();
        if (!nextMapId) return null;

        if (nextMapId === EMPTY_MAP_ID) {
            const letter = String(nextCell.letter || '').trim().toUpperCase();
            const seaLabel = letter ? `未開拓海域 ${letter}` : `未開拓海域 ${nextIndex + 1}`;
            return {
                mapId: `empty_cell_${nextIndex}`,
                mapLabel: seaLabel
            };
        }

        return {
            mapId: nextMapId,
            mapLabel: nextCell.mapLabel || nextMapId
        };
    }

    clearCollidingIslandWhenFar() {
        if (!this.collidingIsland || !this.playerShip) return;

        const distance = Phaser.Math.Distance.Between(
            this.playerShip.x,
            this.playerShip.y,
            this.collidingIsland.x + this.collidingIsland.width / 2,
            this.collidingIsland.y + this.collidingIsland.height / 2
        );
        const clearDistance = Math.max(this.collidingIsland.width, this.collidingIsland.height) / 2 + 50;
        if (distance > clearDistance) {
            if (this.isPlayerInIslandCapture(this.collidingIsland)) {
                this.clearIslandCommandTimers(true);
                void this.startIslandCaptureFlow(this.collidingIsland, 'cancel', { silent: true });
            }
            void this.leaveCapitalCaptureSilently(this.collidingIsland);
            if (this.commandMenuOpen) {
                this.hideIslandCommandMenu();
            } else {
                this.collidingIsland = null;
            }
        }
    }

    checkAirIslandProximity() {
        if (!this.playerShip || !this.isAirDomain(this.playerShipDomain)) return;
        if (!this.islandObjects || this.islandObjects.size === 0) return;

        const currentIsland = this.getCurrentIslandUnderPlayer();
        if (currentIsland) {
            this.collidingIsland = currentIsland;
            return;
        }

        if (this.collidingIsland) {
            if (this.isPlayerInIslandCapture(this.collidingIsland)) {
                this.clearIslandCommandTimers(true);
                void this.startIslandCaptureFlow(this.collidingIsland, 'cancel', { silent: true });
            }
            void this.leaveCapitalCaptureSilently(this.collidingIsland);
            if (this.commandMenuOpen) {
                this.hideIslandCommandMenu();
            } else {
                this.collidingIsland = null;
            }
        }
    }

    checkAirObstacleCollisions() {
        if (!this.playerShip || !this.isAirDomain(this.playerShipDomain)) return;
        if (!this.obstacleObjects || this.obstacleObjects.size === 0) return;

        this.obstacleObjects.forEach((entry) => {
            const collider = entry?.collider;
            const logicH = Number(entry?.logicH) || 0;
            if (!collider || logicH <= 2) return;
            const intersects = this.physics.world.overlap(this.playerShip, collider);
            if (!intersects) return;
            if (this.shipMoving) {
                this.shipMoving = false;
                this.playerShip.body.setVelocity(0, 0);
                if (this.shipTween) this.shipTween.stop();
                if (this.shipArrivalTimer) this.shipArrivalTimer.remove();
                this.stopShipAnimation();
                this.updateMyShipStoppedPosition();
            }
        });
    }

    /**
     *
     */
    updateMinimapPlayerMarker() {
        if (!this.minimapPlayerMarker || !this.minimapConfig || !this.playerShip) return;
        const x = this.minimapConfig.x + (this.playerShip.x * this.minimapConfig.scale);
        const y = this.minimapConfig.y + (this.playerShip.y * this.minimapConfig.scale);
        const size = 4;

        this.minimapPlayerMarker.clear();
        const boostActive = Date.now() < this.shipActionMinimapBoostUntil;
        this.minimapPlayerMarker.lineStyle(2, boostActive ? 0x6ee7ff : 0xffffff, 1);
        this.minimapPlayerMarker.strokeRect(x - size / 2, y - size / 2, size, size);
        if (boostActive) {
            this.minimapPlayerMarker.lineStyle(1, 0x6ee7ff, 0.8);
            this.minimapPlayerMarker.strokeRect(x - size, y - size, size * 2, size * 2);
        }
    }

    applyMinimapStorm(durationMs) {
        if (!this.minimapConfig || !this.time) return;
        const until = Date.now() + Math.max(0, Number(durationMs) || 0);
        if (until <= Date.now()) return;
        this.minimapStormUntil = Math.max(this.minimapStormUntil, until);
        if (!this.minimapStormOverlay) {
            this.minimapStormOverlay = this.add.graphics();
            this.minimapStormOverlay.setScrollFactor(0);
            this.minimapStormOverlay.setDepth(GAME_CONFIG.DEPTH.MINIMAP_MARKER + 1);
            if (this.cameras?.main) this.cameras.main.ignore(this.minimapStormOverlay);
        }
        const redraw = () => {
            if (!this.minimapStormOverlay || !this.minimapConfig) return;
            const { x, y, size } = this.minimapConfig;
            this.minimapStormOverlay.clear();
            this.minimapStormOverlay.fillStyle(0x222222, 0.35);
            this.minimapStormOverlay.fillRect(x, y, size, size);
            for (let i = 0; i < 80; i += 1) {
                const px = x + Phaser.Math.Between(0, Math.floor(size));
                const py = y + Phaser.Math.Between(0, Math.floor(size));
                const alpha = Phaser.Math.FloatBetween(0.15, 0.6);
                this.minimapStormOverlay.fillStyle(0xcccccc, alpha);
                this.minimapStormOverlay.fillRect(px, py, 1, 1);
            }
        };
        redraw();
        if (this.minimapStormTimer) {
            this.minimapStormTimer.remove(false);
        }
        this.minimapStormTimer = this.time.addEvent({
            delay: 220,
            loop: true,
            callback: () => {
                if (Date.now() >= this.minimapStormUntil) {
                    if (this.minimapStormOverlay) {
                        this.minimapStormOverlay.clear();
                    }
                    this.minimapStormTimer?.remove(false);
                    this.minimapStormTimer = null;
                    return;
                }
                redraw();
            }
        });
    }

    drawFogOfWar() {
        if (!this.fogGraphics) return;

        this.fogGraphics.clear();

        const cam = this.cameras.main;
        const screenWidth = this.scale?.width || cam.width;
        const screenHeight = this.scale?.height || cam.height;
        const centerX = screenWidth / 2;
        const centerY = screenHeight / 2;
        const visionPx = screenWidth / 2;

        const fogColor = this.hasEnemyInView() ? 0x550000 : 0x000000;
        this.fogGraphics.fillStyle(fogColor, GAME_CONFIG.FOG_ALPHA);
        this.fogGraphics.fillRect(0, 0, screenWidth, Math.max(0, centerY - visionPx));

        this.fogGraphics.fillRect(0, centerY + visionPx, screenWidth, screenHeight - (centerY + visionPx));

        this.fogGraphics.fillRect(0, Math.max(0, centerY - visionPx),
                                   Math.max(0, centerX - visionPx),
                                   visionPx * 2);

        this.fogGraphics.fillRect(centerX + visionPx,
                                   Math.max(0, centerY - visionPx),
                                   screenWidth - (centerX + visionPx),
                                   visionPx * 2);

        const steps = GAME_CONFIG.FOG_STEPS;
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const nextAngle = ((i + 1) / steps) * Math.PI * 2;

            const x1 = centerX + Math.cos(angle) * visionPx;
            const y1 = centerY + Math.sin(angle) * visionPx;
            const x2 = centerX + Math.cos(nextAngle) * visionPx;
            const y2 = centerY + Math.sin(nextAngle) * visionPx;

            const outerX1 = centerX + Math.cos(angle) * Math.max(screenWidth, screenHeight);
            const outerY1 = centerY + Math.sin(angle) * Math.max(screenWidth, screenHeight);
            const outerX2 = centerX + Math.cos(nextAngle) * Math.max(screenWidth, screenHeight);
            const outerY2 = centerY + Math.sin(nextAngle) * Math.max(screenWidth, screenHeight);

            this.fogGraphics.fillTriangle(x1, y1, x2, y2, outerX1, outerY1);
            this.fogGraphics.fillTriangle(x2, y2, outerX2, outerY2, outerX1, outerY1);
        }
    }


    /**
     *
     */
    async initializeFirestore() {
        if (window.firestore) {
            this.firestore = window.firestore;
        } else {
            try {
                this.firestore = getFirestore();
            } catch (error) {
                console.warn('[Firestore] Firestore instance not available.', error);
                return;
            }
        }

        console.log('[Firestore] Firestore initialized successfully');

        if (!this.playerInfo || !this.playerInfo.playFabId) {
            console.warn('[Firestore] PlayerInfo not available. Cannot sync ships.');
            return;
        }

        await this.loadMyGuildId();
        await this.loadMapOccupation();

        await this.restoreOrCreateMyShipPosition();

        this.subscribeToOtherShips();
        this.subscribeToShipActionEvents();
        this.subscribeToShipBattleEvents();
        await this.refreshConstructingIslandsOnce();
        this.subscribeToConstructingIslands();
        this.subscribeToDemolishedIslands();
    }

    async refreshConstructingIslandsOnce() {
        try {
            const mapId = this.mapId || (typeof window !== 'undefined' ? window.__currentMapId : null) || '';
            const suffix = mapId ? `?mapId=${encodeURIComponent(mapId)}` : '';
            const url = (typeof window !== 'undefined' && window.buildApiUrl)
                ? window.buildApiUrl(`/api/get-constructing-islands${suffix}`)
                : `/api/get-constructing-islands${suffix}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('[Construction] Refresh failed:', res.status, res.statusText);
                return;
            }
            await res.json();
        } catch (error) {
            console.warn('[Construction] Failed to refresh constructing islands once:', error);
        }
    }

    async loadMyGuildId() {
        if (typeof window !== 'undefined' && window.currentGuildId) return;
        if (!this.playerInfo?.playFabId) return;
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/get-guild-info') : '/api/get-guild-info'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playFabId: this.playerInfo.playFabId })
            });
            if (!res.ok) return;
            const data = await res.json();
            if (typeof window !== 'undefined') {
                window.currentGuildId = data?.guild?.guildId || null;
            }
        } catch (error) {
            console.warn('[Guild] Failed to load guild info:', error);
        }
    }

    /**
     *
     */
    async subscribeToOtherShips() {
        await this.refreshShipSubscriptions(true);
    }

    /**
     *
     * @param {number} targetX - 逶ｮ讓儿蠎ｧ讓・
     * @param {number} targetY - 逶ｮ讓兀蠎ｧ讓・
     */
    async updateMyShipPosition(targetX, targetY) {
        if (!this.firestore || !this.playerInfo || !this.playerInfo.playFabId) {
            return;
        }

        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        try {
            const currentX = this.playerShip.x;
            const currentY = this.playerShip.y;
            const distance = Phaser.Math.Distance.Between(currentX, currentY, targetX, targetY);
            const speed = this.getEffectiveShipSpeed();
            const duration = (distance / speed) * 1000; // ミリ秒
            const arrivalTime = Date.now() + duration;
            const geoPoint = this.worldToLatLng({ x: currentX, y: currentY });
            const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);

            const shipRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
            await setDoc(shipRef, {
                playFabId: this.playerInfo.playFabId,
                displayName: window.myLineProfile?.displayName || 'Unknown',
                race: this.playerInfo.race || 'human',
                mapId: this.mapId || null,
                appearance: { color: this.normalizeShipColorKey(window.myAvatarBaseInfo?.AvatarColor) },
                guildId: this.getMyGuildId(),
                lastAnimKey: this.playerShip?.lastAnimKey || 'ship_down',
                crewCapacity: Number(this.playerShipAssetData?.Stats?.CrewCapacity) || null,
                ridingShipId: RIDE_SYSTEM_ENABLED ? (this.ridingShipId || null) : null,
                ridingOwnerId: RIDE_SYSTEM_ENABLED ? (this.ridingOwnerId || null) : null,
                ridingSince: RIDE_SYSTEM_ENABLED ? (this.ridingSince || null) : null,
                currentX: currentX,
                currentY: currentY,
                targetX: targetX,
                targetY: targetY,
                geohash: geohash,
                arrivalTime: arrivalTime,
                speed: speed,
                shipVisionRange: this.shipVisionRange,
                // Server-side ships schema compatibility (so other clients can render even if they expect position/movement).
                position: { x: currentX, y: currentY },
                movement: {
                    isMoving: true,
                    departureTime: Date.now(),
                    arrivalTime: arrivalTime,
                    departurePos: { x: currentX, y: currentY },
                    destinationPos: { x: targetX, y: targetY }
                },
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log('[Firestore] Ship position updated:', { currentX, currentY, targetX, targetY, arrivalTime });
        } catch (error) {
            console.error('[Firestore] Error updating ship position:', error);
        }
    }

    /**
     *
     *
     *
     */
    async updateMyShipStoppedPosition() {
        if (!this.firestore || !this.playerInfo || !this.playerInfo.playFabId || !this.playerShip) {
            return;
        }

        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        try {
            const currentX = this.playerShip.x;
            const currentY = this.playerShip.y;
            const geoPoint = this.worldToLatLng({ x: currentX, y: currentY });
            const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);

            const shipRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
            await setDoc(shipRef, {
                playFabId: this.playerInfo.playFabId,
                displayName: window.myLineProfile?.displayName || 'Unknown',
                race: this.playerInfo.race || 'human',
                mapId: this.mapId || null,
                appearance: { color: this.normalizeShipColorKey(window.myAvatarBaseInfo?.AvatarColor) },
                guildId: this.getMyGuildId(),
                lastAnimKey: this.playerShip?.lastAnimKey || 'ship_down',
                crewCapacity: Number(this.playerShipAssetData?.Stats?.CrewCapacity) || null,
                ridingShipId: RIDE_SYSTEM_ENABLED ? (this.ridingShipId || null) : null,
                ridingOwnerId: RIDE_SYSTEM_ENABLED ? (this.ridingOwnerId || null) : null,
                ridingSince: RIDE_SYSTEM_ENABLED ? (this.ridingSince || null) : null,
                currentX: currentX,
                currentY: currentY,
                targetX: currentX,
                targetY: currentY,
                geohash: geohash,
                arrivalTime: Date.now(),
                speed: this.shipSpeed,
                shipVisionRange: this.shipVisionRange,
                position: { x: currentX, y: currentY },
                movement: {
                    isMoving: false,
                    departureTime: null,
                    arrivalTime: null,
                    departurePos: null,
                    destinationPos: null
                },
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('[Firestore] Error updating stopped ship position:', error);
        }
    }

    async restoreOrCreateMyShipPosition() {
        if (!this.firestore || !this.playerInfo?.playFabId || !this.playerShip) {
            return;
        }

        const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');

        try {
            const shipRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
            const snapshot = await getDoc(shipRef);

            if (snapshot.exists()) {
                const data = snapshot.data() || {};
                const storedVision = Number(data?.shipVisionRange);
                if (Number.isFinite(storedVision) && storedVision > 0) {
                    this.shipVisionRange = storedVision;
                    this.baseShipVisionRange = storedVision;
                }
                const ridingShipId = RIDE_SYSTEM_ENABLED ? String(data?.ridingShipId || '').trim() : '';
                const ridingOwnerId = RIDE_SYSTEM_ENABLED ? String(data?.ridingOwnerId || '').trim() : '';
                this.ridingShipId = ridingShipId || null;
                this.ridingOwnerId = ridingOwnerId || null;
                this.ridingSince = RIDE_SYSTEM_ENABLED ? (data?.ridingSince || null) : null;
                this.canMove = !this.ridingShipId;
                this.updateRideLeaveUi();
                this.shipRepairUntil = Number(data?.repairUntil) || 0;

                const activeShipId = data.shipId;
                let shipId = data.shipId;
                let assetDataResolved = null;

                if (!shipId) {
                    try {
                        const ownedShips = await Ship.getPlayerShips(this.playerInfo.playFabId);
                        const first = Array.isArray(ownedShips) && ownedShips.length > 0 ? ownedShips[0] : null;
                        shipId = first?.shipId;
                        assetDataResolved = first?.assetData || null;
                        if (shipId) {
                            await setDoc(shipRef, { shipId }, { merge: true });
                        }
                    } catch (e) {
                        console.warn('[WorldMapScene] Failed to resolve shipId from owned ships:', e);
                    }
                }

                if (shipId && !assetDataResolved) {
                    try {
                        assetDataResolved = await Ship.getShipAsset(this.playerInfo.playFabId, shipId, true);
                    } catch (e) {
                        console.error("Failed to get ship asset on init", e);
                    }
                }
                if (assetDataResolved?.Domain) {
                    this.playerShipDomain = String(assetDataResolved.Domain).toLowerCase();
                }
                if (assetDataResolved) {
                    this.setPlayerShipAssetData(assetDataResolved);
                }
                if (assetDataResolved?.Stats) {
                    const currentHp = Number(assetDataResolved.Stats.CurrentHP);
                    const maxHp = Number(assetDataResolved.Stats.MaxHP);
                    if (Number.isFinite(currentHp) && Number.isFinite(maxHp)) {
                        this.playerHp = { current: currentHp, max: maxHp };
                    }
                }

                const myColor = data?.appearance?.color || window.myAvatarBaseInfo?.AvatarColor;
                const sheetKey = this.getShipSpriteSheetKey(myColor);
                if (this.playerShip.texture?.key !== sheetKey) {
                    this.playerShip.setTexture(sheetKey);
                }

                const isDestroyed = Number(assetDataResolved?.Stats?.CurrentHP) <= 0;
                const respawnTargetId = activeShipId || shipId;
                if (isDestroyed && respawnTargetId) {
                    await this.respawnPlayerShipIfNeeded(respawnTargetId);
                }
                const baseFrameResolved = isDestroyed ? 0 : Number(assetDataResolved?.baseFrame);
                if (Number.isFinite(baseFrameResolved) && assetDataResolved?.ItemId) {
                    const shipTypeKey = `${assetDataResolved.ItemId}__${sheetKey}__bf${baseFrameResolved}`;
                    this.generateShipAnims(baseFrameResolved, shipTypeKey);
                    this.playerShip.shipTypeKey = shipTypeKey;
                    this.playerShip.lastAnimKey = 'ship_down';
                    const idleFrame = this.shipAnims?.[shipTypeKey]?.idleFrames?.ship_down;
                    if (idleFrame !== undefined) this.playerShip.setFrame(idleFrame);

                    shipId = null;
                }
                if (shipId) {
                    try {
                        const assetData = await Ship.getShipAsset(this.playerInfo.playFabId, shipId, true);
                        const baseFrame = Number(assetData?.baseFrame);
                        const isDestroyed = Number(assetData?.Stats?.CurrentHP) <= 0;
                        const respawnTargetId = activeShipId || shipId;
                        if (isDestroyed && respawnTargetId) {
                            await this.respawnPlayerShipIfNeeded(respawnTargetId);
                        }
                        if (assetData?.Domain) {
                            this.playerShipDomain = String(assetData.Domain).toLowerCase();
                        }
                        if (assetData) {
                            this.setPlayerShipAssetData(assetData);
                        }
                        if (assetData?.Stats) {
                            const currentHp = Number(assetData.Stats.CurrentHP);
                            const maxHp = Number(assetData.Stats.MaxHP);
                            if (Number.isFinite(currentHp) && Number.isFinite(maxHp)) {
                                this.playerHp = { current: currentHp, max: maxHp };
                            }
                        }
                        if (Number.isFinite(baseFrame) && assetData?.ItemId) {
                            const color = data?.appearance?.color || window.myAvatarBaseInfo?.AvatarColor;
                            const sheetKey = this.getShipSpriteSheetKey(color);
                            if (this.playerShip.texture?.key !== sheetKey) this.playerShip.setTexture(sheetKey);
                            const shipTypeKey = `${assetData.ItemId}__${sheetKey}__bf${baseFrame}`;
                            this.generateShipAnims(baseFrame, shipTypeKey);
                            this.playerShip.shipTypeKey = shipTypeKey;
                            this.playerShip.lastAnimKey = 'ship_down'; // 初期向き
                        }
                    } catch (e) {
                        console.error("Failed to get ship asset on init", e);
                    }
                }

                let x = this.playerShip.x;
                let y = this.playerShip.y;

                if (data.movement?.isMoving && data.movement?.departurePos && data.movement?.destinationPos && typeof data.movement?.departureTime === 'number' && typeof data.movement?.arrivalTime === 'number') {
                    const now = Date.now();
                    const totalTime = data.movement.arrivalTime - data.movement.departureTime;
                    const elapsed = now - data.movement.departureTime;
                    const progress = totalTime > 0 ? Phaser.Math.Clamp(elapsed / totalTime, 0, 1) : 1;
                    x = data.movement.departurePos.x + (data.movement.destinationPos.x - data.movement.departurePos.x) * progress;
                    y = data.movement.departurePos.y + (data.movement.destinationPos.y - data.movement.departurePos.y) * progress;
                } else if (data.position && typeof data.position.x === 'number' && typeof data.position.y === 'number') {
                    x = data.position.x;
                    y = data.position.y;
                } else if (typeof data.currentX === 'number' && typeof data.currentY === 'number') {
                    x = data.currentX;
                    y = data.currentY;
                }

                const pendingPos = this.pendingMapSpawnPos;
                if (pendingPos && Number.isFinite(pendingPos.x) && Number.isFinite(pendingPos.y)) {
                    x = pendingPos.x;
                    y = pendingPos.y;
                    this.pendingMapSpawnPos = null;
                    const geoPoint = this.worldToLatLng({ x, y });
                    const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);
                    await setDoc(shipRef, {
                        mapId: this.mapId || null,
                        currentX: x,
                        currentY: y,
                        targetX: x,
                        targetY: y,
                        geohash: geohash,
                        arrivalTime: Date.now(),
                        position: { x, y },
                        movement: {
                            isMoving: false,
                            departureTime: null,
                            arrivalTime: null,
                            departurePos: null,
                            destinationPos: null
                        },
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }

                this.playerShip.x = x;
                this.playerShip.y = y;
                this.stopShipAnimation();

                if (!Number.isFinite(Number(data?.shipVisionRange))) {
                    const assetVision = Number(assetDataResolved?.Stats?.VisionRange);
                    if (Number.isFinite(assetVision) && assetVision > 0) {
                        this.shipVisionRange = assetVision;
                        this.baseShipVisionRange = assetVision;
                    }
                    await setDoc(shipRef, { shipVisionRange: this.shipVisionRange }, { merge: true });
                }
                this.updateZoomFromVisionRange();
                return;
            }

            const currentX = this.playerShip.x;
            const currentY = this.playerShip.y;
            const geoPoint = this.worldToLatLng({ x: currentX, y: currentY });
            const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);

            await setDoc(shipRef, {
                playFabId: this.playerInfo.playFabId,
                displayName: window.myLineProfile?.displayName || 'Unknown',
                race: this.playerInfo.race || 'human',
                nation: this.playerInfo.nation || this.playerInfo.Nation || null,
                mapId: this.mapId || null,
                guildId: this.getMyGuildId(),
                crewCapacity: Number(this.playerShipAssetData?.Stats?.CrewCapacity) || null,
                ridingShipId: RIDE_SYSTEM_ENABLED ? (this.ridingShipId || null) : null,
                ridingOwnerId: RIDE_SYSTEM_ENABLED ? (this.ridingOwnerId || null) : null,
                ridingSince: RIDE_SYSTEM_ENABLED ? (this.ridingSince || null) : null,
                currentX: currentX,
                currentY: currentY,
                targetX: currentX,
                targetY: currentY,
                geohash: geohash,
                arrivalTime: Date.now(),
                speed: this.shipSpeed,
                shipVisionRange: this.shipVisionRange,
                position: { x: currentX, y: currentY },
                movement: {
                    isMoving: false,
                    departureTime: null,
                    arrivalTime: null,
                    departurePos: null,
                    destinationPos: null
                },
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('[Firestore] Failed to restore/create ship position:', error);
        }
    }

    async updateOtherShip(playFabId, shipData) {
        let shipObject = this.otherShips.get(playFabId);
        const now = Date.now();
        const isPassenger = RIDE_SYSTEM_ENABLED && !!shipData?.ridingOwnerId;

        const shipId = shipData.shipId;
        const isGuildShip = !!shipData?.isGuildShip || !!shipData?.guildShip;
        let assetData = null;
        if (shipId && !isGuildShip) {
            try {
                assetData = await Ship.getShipAsset(playFabId, shipId);
            } catch (e) { console.error(`[updateOtherShip] Failed to get asset for ship ${shipId}`, e); }
        }

        const resolveWorldPos = () => {
            if (typeof shipData?.currentX === 'number' && typeof shipData?.currentY === 'number') {
                if (typeof shipData?.targetX === 'number' && typeof shipData?.targetY === 'number' && typeof shipData?.arrivalTime === 'number') {
                    const speed = typeof shipData?.speed === 'number' ? shipData.speed : this.shipSpeed;
                    const travelDuration = (Phaser.Math.Distance.Between(shipData.currentX, shipData.currentY, shipData.targetX, shipData.targetY) / speed) * 1000;
                    const departureTime = shipData.arrivalTime - travelDuration;
                    const elapsed = now - departureTime;
                    const progress = travelDuration > 0 ? Phaser.Math.Clamp(elapsed / travelDuration, 0, 1) : 1;
                    return { x: shipData.currentX + (shipData.targetX - shipData.currentX) * progress, y: shipData.currentY + (shipData.targetY - shipData.currentY) * progress };
                }
                return { x: shipData.currentX, y: shipData.currentY };
            }
            if (shipData?.movement?.isMoving && shipData?.movement?.departurePos && shipData?.movement?.destinationPos) {
                const movement = shipData.movement;
                if (typeof movement?.departureTime === 'number' && typeof movement?.arrivalTime === 'number') {
                    const totalTime = movement.arrivalTime - movement.departureTime;
                    const elapsedTime = now - movement.departureTime;
                    const progress = totalTime > 0 ? Phaser.Math.Clamp(elapsedTime / totalTime, 0, 1) : 1;
                    return { x: movement.departurePos.x + (movement.destinationPos.x - movement.departurePos.x) * progress, y: movement.departurePos.y + (movement.destinationPos.y - movement.departurePos.y) * progress };
                }
            }
            if (shipData?.position && typeof shipData.position.x === 'number' && typeof shipData.position.y === 'number') {
                return { x: shipData.position.x, y: shipData.position.y };
            }
            return { x: 0, y: 0 };
        };

        const worldPos = resolveWorldPos();
        const sheetKey = this.getShipSpriteSheetKey(shipData?.appearance?.color);
        const resolveGuildSailColor = (value) => {
            const key = String(value || '').toLowerCase().trim();
            if (key === 'white' || key === 'red' || key === 'blue' || key === 'yellow' || key === 'green') return key;
            return 'white';
        };

        if (!shipObject) {
            let sprite = null;
            let guildVisual = null;
            if (isGuildShip) {
                sprite = this.physics.add.sprite(worldPos.x, worldPos.y, 'guild_ship_sprite', 0);
                sprite.setAlpha(0);
                const sailColor = resolveGuildSailColor(shipData?.appearance?.color || shipData?.sailColor || 'white');
                guildVisual = this.createGuildShipVisual(worldPos.x, worldPos.y, sailColor);
                guildVisual.container.setDepth(GAME_CONFIG.DEPTH.SHIP);
                this.ignoreOnUiCamera(guildVisual.container);
            } else {
                sprite = this.physics.add.sprite(worldPos.x, worldPos.y, sheetKey, 1);
                sprite.setDepth(GAME_CONFIG.DEPTH.SHIP).setOrigin(0.5, 0.5).clearTint();
                this.ignoreOnUiCamera(sprite);
            }
            sprite.body.setSize(24, 24);
            sprite.body.setCollideWorldBounds(true);
            sprite.body.setAllowGravity(false);
            sprite.body.setImmovable(true);
            shipObject = {
                sprite: sprite,
                guildVisual: guildVisual,
                isGuildShip: isGuildShip,
                data: shipData,
                lastUpdate: now,
                motion: null,
                lastAnimKey: 'ship_down',
                shipTypeKey: null,
                pendingRemoval: false,
                removedAt: null
            };
            sprite.__ownerNation = shipData?.nation || shipData?.Nation || null;
            sprite.__avatarColor = shipData?.appearance?.color || null;
            this.otherShips.set(playFabId, shipObject);

            if (this.playerShip) {
                this.physics.add.collider(this.playerShip, sprite, () => {
                    if (!this.collidingShipId && !this.shipPanelSuppressed) {
                        this.collidingShipId = playFabId;
                        this.handleShipCollision(playFabId, shipObject);
                    }
                });
            }
        } else {
            shipObject.data = shipData;
            shipObject.lastUpdate = now;
            shipObject.pendingRemoval = false;
            shipObject.removedAt = null;
            if (shipObject.sprite) {
                shipObject.sprite.__ownerNation = shipData?.nation || shipData?.Nation || null;
                shipObject.sprite.__avatarColor = shipData?.appearance?.color || null;
            }
            if (!shipObject.isGuildShip && shipObject.sprite?.texture?.key !== sheetKey) {
                shipObject.sprite.setTexture(sheetKey);
            }
            if (shipObject.isGuildShip && shipObject.guildVisual) {
                const sailColor = resolveGuildSailColor(shipData?.appearance?.color || shipData?.sailColor || 'white');
                this.setGuildShipVisualColor(shipObject.guildVisual, sailColor);
            }
        }
        if (shipObject?.sprite) {
            shipObject.sprite.setVisible(!isPassenger);
            if (shipObject.sprite.body) {
                shipObject.sprite.body.enable = !isPassenger;
            }
            this.updateShipNameLabel(shipObject);
        }
        if (shipObject?.guildVisual?.container) {
            shipObject.guildVisual.container.setVisible(!isPassenger);
        }

        if (assetData?.Domain) {
            shipObject.domain = String(assetData.Domain).toLowerCase();
        } else if (shipObject.isGuildShip) {
            shipObject.domain = String(shipData?.appearance?.domain || shipData?.domain || 'sea_surface').toLowerCase();
        }
        this.applyShipDomainDepth(shipObject?.sprite, shipObject?.domain);
        this.setShipBattleVisibility(playFabId, !this.isShipInBattle(playFabId));
        if (shipObject?.sprite) {
            const passengerCount = Array.from(this.otherShips.values())
                .filter((entry) => entry?.data?.ridingOwnerId === playFabId)
                .length + (this.ridingOwnerId === playFabId ? 1 : 0);
            if (!shipObject.passengerIcons) shipObject.passengerIcons = [];
            this.updatePassengerIconsForHost(shipObject.sprite, passengerCount, shipObject.passengerIcons);
        }
        if (shipObject.isGuildShip) {
            const currentHp = Number(shipData?.currentHp);
            const maxHp = Number(shipData?.maxHp);
            if (Number.isFinite(currentHp) && Number.isFinite(maxHp)) {
                shipObject.hp = { current: currentHp, max: maxHp };
            }
        } else if (assetData) {
            const isDestroyed = Number(assetData?.Stats?.CurrentHP) <= 0;
            const baseFrame = isDestroyed ? 0 : Number(assetData?.baseFrame);
            if (assetData?.Stats) {
                const currentHp = Number(assetData.Stats.CurrentHP);
                const maxHp = Number(assetData.Stats.MaxHP);
                if (Number.isFinite(currentHp) && Number.isFinite(maxHp)) {
                    shipObject.hp = { current: currentHp, max: maxHp };
                }
            }
            if (Number.isFinite(baseFrame) && assetData?.ItemId) {
                const shipTypeKey = `${assetData.ItemId}__${sheetKey}__bf${baseFrame}`;
                this.generateShipAnims(baseFrame, shipTypeKey);
                shipObject.shipTypeKey = shipTypeKey;
            }
        } else if (!shipObject.shipTypeKey && !shipObject.isGuildShip) {
            const defaultKey = `_default__${sheetKey}__bf0`;
            if (!this.shipAnims[defaultKey]) this.generateShipAnims(0, defaultKey);
            shipObject.shipTypeKey = defaultKey;
        }

        const isClientMove = typeof shipData?.currentX === 'number' && typeof shipData?.targetX === 'number' && (shipData.currentX !== shipData.targetX || shipData.currentY !== shipData.targetY);
        const isServerMove = shipData?.movement?.isMoving && shipData.movement.departurePos && shipData.movement.destinationPos;

        const applyMotion = (startX, startY, endX, endY, speed) => {
            const durationMs = (Phaser.Math.Distance.Between(startX, startY, endX, endY) / speed) * 1000;
            const nextMotion = { startX, startY, endX, endY, durationMs: Math.max(1, durationMs), startedAt: now };
            if (!shipObject.motion || shipObject.motion.endX !== nextMotion.endX || shipObject.motion.endY !== nextMotion.endY) {
                shipObject.motion = nextMotion;
                shipObject.lastAnimKey = this.getShipAnimKey(startX, startY, endX, endY);
                shipObject.sprite.setPosition(startX, startY);
            }
        };

        if (isClientMove) {
            applyMotion(shipData.currentX, shipData.currentY, shipData.targetX, shipData.targetY, shipData.speed || this.shipSpeed);
        } else if (isServerMove) {
            applyMotion(shipData.movement.departurePos.x, shipData.movement.departurePos.y, shipData.movement.destinationPos.x, shipData.movement.destinationPos.y, shipData.speed || this.shipSpeed);
        } else {
            shipObject.motion = null;
            shipObject.sprite.setPosition(worldPos.x, worldPos.y);
        }

        if (shipObject.isGuildShip && shipObject.guildVisual) {
            const frameIndex = shipObject.motion ? 2 : 1;
            const directionKey = shipObject.lastAnimKey || 'ship_down';
            shipObject.guildVisual.container.setPosition(shipObject.sprite.x, shipObject.sprite.y);
            this.setGuildShipVisualFrame(shipObject.guildVisual, directionKey, frameIndex);
        }
        this.updateRideStatusUi();
    }

    getShipAnimKey(startX, startY, x, y) {
        const angleRad = Phaser.Math.Angle.Between(startX, startY, x, y);
        const angleDeg = Phaser.Math.RadToDeg(angleRad);

        let animKey = 'ship_down';
        if (angleDeg >= -22.5 && angleDeg < 22.5) {
            animKey = 'ship_right';
        } else if (angleDeg >= 22.5 && angleDeg < 67.5) {
            animKey = 'ship_down_right';
        } else if (angleDeg >= 67.5 && angleDeg < 112.5) {
            animKey = 'ship_down';
        } else if (angleDeg >= 112.5 && angleDeg < 157.5) {
            animKey = 'ship_down_left';
        } else if (angleDeg >= 157.5 || angleDeg < -157.5) {
            animKey = 'ship_left';
        } else if (angleDeg >= -157.5 && angleDeg < -112.5) {
            animKey = 'ship_up_left';
        } else if (angleDeg >= -112.5 && angleDeg < -67.5) {
            animKey = 'ship_up';
        } else if (angleDeg >= -67.5 && angleDeg < -22.5) {
            animKey = 'ship_up_right';
        }

        return animKey;
    }

    /**
     *
     *
     */
    removeOtherShip(playFabId) {
        if (this.ridingOwnerId && playFabId === this.ridingOwnerId) {
            this.showMessage('乗っていた船がいなくなったため自動下船しました。');
            void this.leaveRide();
        }
        const shipObject = this.otherShips.get(playFabId);
        if (shipObject) {
            this.destroyShipHpBar(shipObject?.sprite);
            this.destroyShipShadow(shipObject?.sprite);
            this.destroyShipNameLabel(shipObject?.sprite);
            if (shipObject.guildVisual?.container?.destroy) {
                shipObject.guildVisual.container.destroy(true);
            }
            shipObject.sprite.destroy();
            this.otherShips.delete(playFabId);
            console.log(`[Firestore] Removed ship sprite for player: ${playFabId}`);
        }
    }

    markOtherShipRemoved(playFabId) {
        const shipObject = this.otherShips.get(playFabId);
        if (!shipObject) return;

        if (this.playerShip && shipObject.sprite) {
            const distance = Phaser.Math.Distance.Between(
                this.playerShip.x,
                this.playerShip.y,
                shipObject.sprite.x,
                shipObject.sprite.y
            );
            const keepRange = this.getCurrentVisionRange() * 1.25;
            if (distance <= keepRange) {
                return;
            }
        }

        shipObject.pendingRemoval = true;
        shipObject.removedAt = Date.now();
    }

    pruneOtherShips() {
        if (!this.playerShip) return;

        const now = Date.now();
        const hysteresisRange = this.getCurrentVisionRange() * 1.25;
        const removeGraceMs = 5000;

        this.otherShips.forEach((shipObject, playFabId) => {
            if (!shipObject?.sprite) return;

            const distance = Phaser.Math.Distance.Between(
                this.playerShip.x,
                this.playerShip.y,
                shipObject.sprite.x,
                shipObject.sprite.y
            );

            const isFar = distance > hysteresisRange;

            if (shipObject.pendingRemoval) {
                const removedAt = shipObject.removedAt || now;
                if (now - removedAt > removeGraceMs && isFar) {
                    this.removeOtherShip(playFabId);
                }
                return;
            }
        });
    }

    worldToLatLng(point) {
        const metersPerPixel = this.metersPerTile / this.gridSize;
        const dxMeters = (point.x - this.mapPixelSize / 2) * metersPerPixel;
        const dyMeters = (this.mapPixelSize / 2 - point.y) * metersPerPixel;

        const lat = dyMeters / 110574;
        const lng = dxMeters / 111320;
        return { lat, lng };
    }

    teardownShipGeoSubscriptions() {
        if (this.shipsUnsubscribe) {
            this.shipsUnsubscribe();
            this.shipsUnsubscribe = null;
        }
        this.shipGeoUnsubscribes.forEach(unsub => typeof unsub === 'function' && unsub());
        this.shipGeoUnsubscribes = [];
    }

    async refreshShipSubscriptions(force = false) {
        if (!this.firestore || !this.playerShip) return;
        if (typeof document !== 'undefined' && document.hidden) return;

        const now = Date.now();
        if (!force && now - this.lastShipQueryUpdate < GAME_CONFIG.SHIP_QUERY_UPDATE_INTERVAL) return;

        const center = { x: this.playerShip.x, y: this.playerShip.y };
        if (!force && this.lastShipQueryCenter) {
            const delta = Phaser.Math.Distance.Between(center.x, center.y, this.lastShipQueryCenter.x, this.lastShipQueryCenter.y);
            if (delta < this.getCurrentVisionRange() * GAME_CONFIG.SHIP_QUERY_REFRESH_THRESHOLD) {
                return;
            }
        }

        this.lastShipQueryCenter = center;
        this.lastShipQueryUpdate = now;
        this.teardownShipGeoSubscriptions();

        try {
            const { collection, onSnapshot, query, orderBy, startAt, endAt, where } = await import('firebase/firestore');
            const radiusTiles = this.getCurrentVisionRange() / this.gridSize;
            const radiusMeters = radiusTiles * this.metersPerTile;
            const centerGeo = this.worldToLatLng(center);
            const bounds = geohashQueryBounds([centerGeo.lat, centerGeo.lng], radiusMeters);
            const mapId = this.mapId || null;

            bounds.forEach((b) => {
                const constraints = [
                    collection(this.firestore, 'ships'),
                    orderBy('geohash'),
                    startAt(b[0]),
                    endAt(b[1])
                ];
                if (mapId) {
                    constraints.splice(1, 0, where('mapId', '==', mapId));
                }
                const q = query(...constraints);

                const unsub = onSnapshot(q, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        const shipData = change.doc.data();
                        const docId = change.doc.id;
                        const key = shipData?.playFabId ?? docId;

                        if (key === this.playerInfo?.playFabId) {
                            return;
                        }

                        if (change.type === 'removed') {
                            this.markOtherShipRemoved(key);
                        } else {
                            this.updateOtherShip(key, shipData);
                        }
                    });
                }, (error) => {
                    console.error('[Firestore] Error subscribing to ships:', error);
                });

                this.shipGeoUnsubscribes.push(unsub);
            });
        } catch (error) {
            console.error('[Firestore] Error setting up geohash ship subscription:', error);
        }
    }

    /**
     *
     */
    interpolateOtherShips() {
        const now = Date.now();

        this.otherShips.forEach((shipObject) => {
            const { data, sprite } = shipObject;
            const refreshNameLabel = () => this.updateShipNameLabel(shipObject);

            if (shipObject.motion) {
                const motion = shipObject.motion;
                const elapsed = now - motion.startedAt;
                const progress = motion.durationMs > 0 ? Phaser.Math.Clamp(elapsed / motion.durationMs, 0, 1) : 1;
                sprite.x = motion.startX + (motion.endX - motion.startX) * progress;
                sprite.y = motion.startY + (motion.endY - motion.startY) * progress;

                const animKey = shipObject.lastAnimKey || this.getShipAnimKey(motion.startX, motion.startY, motion.endX, motion.endY);
                shipObject.lastAnimKey = animKey;
                const shipTypeKey = shipObject.shipTypeKey;
                if (shipTypeKey) {
                    const fullAnimKey = animKey + shipTypeKey;
                    if (this.anims.exists(fullAnimKey)) {
                        sprite.anims.play(fullAnimKey, true);
                    }
                }

                if (progress >= 1) {
                    shipObject.motion = null;
                    sprite.anims.stop();
                    const shipTypeKey = shipObject.shipTypeKey;
                    if (shipTypeKey && this.shipAnims?.[shipTypeKey]) {
                        const idleFrame = this.shipAnims[shipTypeKey].idleFrames?.[shipObject.lastAnimKey];
                        if (idleFrame !== undefined) sprite.setFrame(idleFrame);
                    }
                }
                refreshNameLabel();
                return;
            }

            // Client schema
            if (
                typeof data?.currentX === 'number' &&
                typeof data?.currentY === 'number' &&
                typeof data?.targetX === 'number' &&
                typeof data?.targetY === 'number' &&
                typeof data?.arrivalTime === 'number'
            ) {
                if (now >= data.arrivalTime) {
                    sprite.x = data.targetX;
                    sprite.y = data.targetY;
                    if (sprite.body) sprite.body.setVelocity(0, 0);
                    refreshNameLabel();
                    return;
                }

                const speed = typeof data?.speed === 'number' ? data.speed : this.shipSpeed;
                const travelDuration = (Phaser.Math.Distance.Between(data.currentX, data.currentY, data.targetX, data.targetY) / speed) * 1000;
                const departureTime = data.arrivalTime - travelDuration;
                const elapsed = now - departureTime;
                const progress = travelDuration > 0 ? Phaser.Math.Clamp(elapsed / travelDuration, 0, 1) : 1;

                sprite.x = data.currentX + (data.targetX - data.currentX) * progress;
                sprite.y = data.currentY + (data.targetY - data.currentY) * progress;
                refreshNameLabel();
                return;
            }

            // Server schema
            const movement = data?.movement;
            if (
                movement?.isMoving &&
                movement?.departurePos &&
                movement?.destinationPos &&
                typeof movement?.departureTime === 'number' &&
                typeof movement?.arrivalTime === 'number'
            ) {
                if (now >= movement.arrivalTime) {
                    sprite.x = movement.destinationPos.x;
                    sprite.y = movement.destinationPos.y;
                    if (sprite.body) sprite.body.setVelocity(0, 0);
                    refreshNameLabel();
                    return;
                }

                const totalTime = movement.arrivalTime - movement.departureTime;
                const elapsedTime = now - movement.departureTime;
                const progress = totalTime > 0 ? Phaser.Math.Clamp(elapsedTime / totalTime, 0, 1) : 1;

                sprite.x = movement.departurePos.x + (movement.destinationPos.x - movement.departurePos.x) * progress;
                sprite.y = movement.departurePos.y + (movement.destinationPos.y - movement.departurePos.y) * progress;
                refreshNameLabel();
                return;
            }

            if (data?.position && typeof data.position.x === 'number' && typeof data.position.y === 'number') {
                sprite.x = data.position.x;
                sprite.y = data.position.y;
            }

            if (sprite.anims.isPlaying) {
                sprite.anims.stop();
            }
            const shipTypeKey = shipObject.shipTypeKey;
            if (shipTypeKey && this.shipAnims?.[shipTypeKey]) {
                const idleFrame = this.shipAnims[shipTypeKey].idleFrames?.[shipObject.lastAnimKey];
                if (idleFrame !== undefined) sprite.setFrame(idleFrame);
            }
            refreshNameLabel();
        });
    }

    /**
     *
     */
    async subscribeToConstructingIslands() {
        if (!this.firestore) return;

        const { collection, onSnapshot, query, where } = await import('firebase/firestore');

        if (this.constructionUnsubscribe) {
            this.constructionUnsubscribe();
        }

        try {
            const constructionQuery = query(
                collection(this.firestore, this.getWorldMapCollectionName()),
                where('constructionStatus', '==', 'constructing')
            );

            this.constructionUnsubscribe = onSnapshot(constructionQuery, (snapshot) => {
                const constructingIslands = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.displayConstructingIslands(constructingIslands);
            }, (error) => {
                console.error('[Construction] Failed to subscribe constructing islands:', error);
            });
        } catch (error) {
            console.error('[Construction] Failed to set up subscription:', error);
        }
    }

    /**
     *
     *
     *
     */
    clearSpriteArray(spriteArray) {
        if (spriteArray && Array.isArray(spriteArray)) {
            spriteArray.forEach(sprite => {
                if (sprite && sprite.destroy) {
                    sprite.destroy();
                }
            });
        }
        return [];
    }

    /**
     *
     */
    displayConstructingIslands(constructingIslands) {
        this.constructionSprites = this.clearSpriteArray(this.constructionSprites);
        const previousIds = new Set(this.lastConstructingIslandIds || []);
        const currentIds = new Set();

        constructingIslands.forEach((island) => {
            if (island?.id) currentIds.add(island.id);
        });

        if (previousIds.size > 0) {
            previousIds.forEach((id) => {
                if (!currentIds.has(id)) {
                    this.reloadIslandFromFirestore(id);
                }
            });
        }
        this.lastConstructingIslandIds = currentIds;

        if (constructingIslands.length === 0) {
            if (window.Island && window.Island.playConstructionSound) {
                window.Island.playConstructionSound(false);
            }
            return;
        }

        constructingIslands.forEach(island => {
            const islandObj = this.islandObjects.get(island.id);
            if (!islandObj) return;

            const x = islandObj.x + islandObj.width / 2;
            const y = islandObj.y + islandObj.height / 2;

            const hammer = this.add.text(x, y - 20, '🔨', { fontSize: '28px' });
            hammer.setOrigin(0.5);
            hammer.setDepth(GAME_CONFIG.DEPTH.CONSTRUCTION);

            this.tweens.add({
                targets: hammer,
                y: y - 12,
                angle: -20,
                duration: 220,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const particles = this.add.particles(x, y, 'map_tiles', {
                frame: 0,
                speed: { min: -20, max: 20 },
                angle: { min: 0, max: 360 },
                scale: { start: 0.1, end: 0 },
                lifespan: GAME_CONFIG.PARTICLE_LIFESPAN,
                frequency: GAME_CONFIG.PARTICLE_FREQUENCY,
                quantity: 2,
                alpha: 0.5
            });
            particles.setDepth(GAME_CONFIG.DEPTH.CONSTRUCTION);
            this.ignoreOnUiCamera(particles);

            this.constructionSprites.push(hammer, particles);
        });

        if (constructingIslands.length > 0) {
            if (window.Island && window.Island.playConstructionSound) {
                window.Island.playConstructionSound(true);
            }
        }
    }

    /**
     *
     */
    async subscribeToDemolishedIslands() {
        if (!this.firestore) return;

        const { collection, onSnapshot, query, where } = await import('firebase/firestore');

        if (this.demolishedUnsubscribe) {
            this.demolishedUnsubscribe();
        }

        try {
            const demolishedQuery = query(
                collection(this.firestore, 'islands'),
                where('occupationStatus', '==', 'demolished')
            );

            this.demolishedUnsubscribe = onSnapshot(demolishedQuery, (snapshot) => {
                const demolishedIslands = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (demolishedIslands && demolishedIslands.length > 0) {
                    if (window.Island && window.Island.displayDemolishedIslandsOnMap) {
                        window.Island.displayDemolishedIslandsOnMap(this, demolishedIslands);
                    }
                } else {
                    this.demolishedSprites = this.clearSpriteArray(this.demolishedSprites);
                }
            }, (error) => {
                console.error('[DemolishedDisplay] Failed to subscribe demolished islands:', error);
            });
        } catch (error) {
            console.error('[DemolishedDisplay] Failed to set up subscription:', error);
        }
    }

    /**
     *
     */
    shutdown() {
        this.teardownShipGeoSubscriptions();
        console.log('[Firestore] Unsubscribed from ships collection');
        this.stopDockedMpRecoveryTimer();

        if (this.shipSideCannonChargeTimer) {
            this.shipSideCannonChargeTimer.remove(false);
            this.shipSideCannonChargeTimer = null;
        }
        if (this.hitStopTimer) {
            this.hitStopTimer.remove(false);
            this.hitStopTimer = null;
        }
        if (this.hitStopActive) {
            try {
                this.physics?.world?.resume?.();
                this.tweens?.resumeAll?.();
            } catch (error) {}
            this.hitStopActive = false;
        }
        if (this.webAudioCtx && this.webAudioCtx.state !== 'closed') {
            this.webAudioCtx.close().catch(() => {});
        }
        this.webAudioCtx = null;

        if (this.onActiveShipChanged && typeof window !== 'undefined') {
            window.removeEventListener('ship:active-changed', this.onActiveShipChanged);
            this.onActiveShipChanged = null;
        }
        if (this.onShipCombatResourceWindowFocus && typeof window !== 'undefined') {
            window.removeEventListener('focus', this.onShipCombatResourceWindowFocus);
            this.onShipCombatResourceWindowFocus = null;
        }
        if (this.onShipCombatResourceVisibilityChange && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.onShipCombatResourceVisibilityChange);
            this.onShipCombatResourceVisibilityChange = null;
        }
        if (this.onMapTabVisible && typeof window !== 'undefined') {
            window.removeEventListener('tab:map-visible', this.onMapTabVisible);
            this.onMapTabVisible = null;
        }

        this.otherShips.forEach((shipObject) => {
            this.destroyShipHpBar(shipObject?.sprite);
            this.destroyShipShadow(shipObject?.sprite);
            this.destroyShipNameLabel(shipObject?.sprite);
            shipObject.sprite.destroy();
        });
        this.otherShips.clear();

        this.destroyShipHpBar(this.playerShip);
        this.destroyShipShadow(this.playerShip);

        // 島オブジェクトのスプライトを破棄
        this.islandObjects.forEach((islandData) => {
            if (islandData.sprites) {
                islandData.sprites.forEach(sprite => sprite?.destroy?.());
            }
            if (islandData.buildingSprites) {
                islandData.buildingSprites.forEach(sprite => sprite?.destroy?.());
            }
            islandData.nameText?.destroy?.();
            islandData.interactiveZone?.destroy?.();
        });
        this.islandObjects.clear();

        if (this.constructionUnsubscribe) {
            this.constructionUnsubscribe();
            this.constructionUnsubscribe = null;
        }
        this.constructionSprites = this.clearSpriteArray(this.constructionSprites);

        if (this.demolishedUnsubscribe) {
            this.demolishedUnsubscribe();
            this.demolishedUnsubscribe = null;
        }
        this.demolishedSprites = this.clearSpriteArray(this.demolishedSprites);

        if (this.shipActionEventsUnsubscribe) {
            this.shipActionEventsUnsubscribe();
            this.shipActionEventsUnsubscribe = null;
        }
        if (this.shipActionEventsSeen) {
            this.shipActionEventsSeen.clear();
        }
    }
}

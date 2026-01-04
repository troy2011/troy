import * as Phaser from 'phaser';
import { RACE_COLORS } from 'config';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import * as Ship from './js/ship.js';

// ========================================
// 螳壽焚螳夂ｾｩ
// ========================================

const GAME_CONFIG = {
    GRID_SIZE: 32,
    MAP_TILE_SIZE: 100,
    METERS_PER_TILE: 100,

    SHIP_VISION_RANGE: 300,
    SHIP_SPEED: 100,
    SHIP_MOVE_COOLDOWN: 500,
    SHIP_ACTION_COOLDOWN_MS: 5 * 60 * 1000,
    SHIP_ACTION_DURATION_MS: 3000,

    // UI險ｭ螳・
    MESSAGE_DISPLAY_DURATION: 2000,
    MINIMAP_SIZE: 100,
    MINIMAP_PADDING: 0,

    // Firestore譖ｴ譁ｰ鬆ｻ蠎ｦ
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

const BUILDING_META_DEFAULT = { nationTileOffset: false };
const AREA_GRID_SIZE = 20;
const AREA_CAPTURE_MS = 5 * 60 * 1000;
const OUTSIDE_VISION_MULTIPLIER = 0.25;

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

        this.shipVisionRange = GAME_CONFIG.SHIP_VISION_RANGE;
        this.baseShipVisionRange = GAME_CONFIG.SHIP_VISION_RANGE;
        this.shipSpeed = GAME_CONFIG.SHIP_SPEED;
        this.shipBaseSpeed = GAME_CONFIG.SHIP_SPEED;

        this.playerShipItemId = null;
        this.playerShipClass = null;
        this.shipActionCooldownUntil = 0;
        this.shipActionSpeedBoostUntil = 0;
        this.shipActionInvisibleUntil = 0;
        this.shipActionUiLastUpdate = 0;
        this.shipActionActive = false;
        this.shipActionButton = null;
        this.shipActionStatus = null;
        this.navTargetId = null;
        this.navTargetLabel = null;

        this.canMove = true;
        this.moveCooldown = GAME_CONFIG.SHIP_MOVE_COOLDOWN;
        this.shipMoving = false;
        this.shipTargetX = 0;
        this.shipTargetY = 0;
        this.shipTargetIsland = null;
        this.shipArrivalTimer = null;
        this.collidingIsland = null;
        this.commandMenuOpen = false;
        this.collidingShipId = null;
        this.shipPanelSuppressed = false;
        this.guildAreas = new Set();
        this.areaCaptureKey = null;
        this.areaCaptureStartAt = null;
        this.lastAreaCheckAt = 0;
        this.isInOwnedArea = true;

        // Firestore髢｢騾｣
        this.firestore = null;
        this.otherShips = new Map();
        this.shipsUnsubscribe = null;
        this.shipGeoUnsubscribes = [];
        this.lastShipQueryCenter = null;
        this.lastShipQueryUpdate = 0;

        this.shipCollisionRadius = 20;
        this.lastRamDamageAt = new Map(); // playFabId -> timestamp
        this.boardingButton = null;
        this.boardingTargetId = null;
        this.boardingVisible = false;

        this.constructionSprites = [];
        this.constructionUnsubscribe = null;
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
        this.load.spritesheet('guild_ship_sprite', 'Sprites/Ships/guildShips.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('map_tiles', 'Sprites/Buildings/buildings.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('building_tiles', 'Sprites/Buildings/buildings.png', { frameWidth: 32, frameHeight: 32 });
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

        if (this.demolishedUnsubscribe) {
            this.demolishedUnsubscribe();
            this.demolishedUnsubscribe = null;
        }

        // 他の船のスプライトを破棄
        if (this.otherShips && this.otherShips.size > 0) {
            this.otherShips.forEach((shipObject) => {
                this.destroyShipHpBar(shipObject?.sprite);
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

    setMapReady(ready) {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('tabContentMap');
        if (!container) return;
        if (ready) {
            container.classList.add('map-ready');
        } else {
            container.classList.remove('map-ready');
        }
    }

    async create() {
        this.setMapReady(false);
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
                document.getElementById('mapChatArea')
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
            if (typeof document !== 'undefined' && document.querySelector('.building-bottom-sheet.active')) return;
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

        // 荳・0-2 蟾ｦ荳・3-5 / 蟾ｦ:32-34 蜿ｳ荳・35-37 / 蜿ｳ:64-66 蟾ｦ荳・67-69 / 荳・96-98 蜿ｳ荳・99-101
        this.shipSpriteBaseFrame = 0; // 蟾ｦ荳翫・繝ｼ繝医・髢句ｧ九ヵ繝ｬ繝ｼ繝・亥ｷｦ荳翫・繝ｼ繝・0・・
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
        this.cameras.main.startFollow(this.playerShip, true, 0.1, 0.1);
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

        this.scale.on('resize', () => {
            this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height);
            if (this.uiCamera) this.uiCamera.setSize(this.scale.width, this.scale.height);
            this.updateZoomFromVisionRange();
            if (this.positionText) this.positionText.setPosition(12, this.scale.height - 10);
        });

        if (typeof window !== 'undefined') {
            this.onActiveShipChanged = async (event) => {
                const shipId = event?.detail?.shipId;
                if (!shipId || !this.playerInfo?.playFabId) return;
                try {
                    const assetData = await Ship.getShipAsset(this.playerInfo.playFabId, shipId, true);
                    if (assetData) {
                        this.setPlayerShipAssetData(assetData);
                        if (assetData.Domain) {
                            this.playerShipDomain = String(assetData.Domain).toLowerCase();
                        }
                        const color = window.myAvatarBaseInfo?.AvatarColor;
                        const sheetKey = this.getShipSpriteSheetKey(color);
                        if (this.playerShip?.texture?.key !== sheetKey) {
                            this.playerShip.setTexture(sheetKey);
                        }
                        if (assetData?.Domain) {
            shipObject.domain = String(assetData.Domain).toLowerCase();
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

                    this.createIsland({
                        id: docSnapshot.id,
                        x: data.coordinate.x * this.gridSize,
                        y: data.coordinate.y * this.gridSize,
                        name: data.name || '名称未設定',
                        size: data.size || 'small',
                        ownerNation: data.ownerNation || data.ownerRace,
                        ownerId: data.ownerId,
                        biome: data.biome,
                        biomeFrame: data.biomeFrame,
                        buildingSlots: data.buildingSlots,
                        buildings: data.buildings || []
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

        this.setMapReady(true);
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

        // 繝溘ル繝槭ャ繝励・閭梧勹・亥承荳翫↓驟咲ｽｮ・・
        const minimapX = (this.scale?.width || this.cameras.main.width) - minimapSize - minimapPadding;
        const minimapY = minimapPadding;

        this.minimapGraphics = this.add.graphics();
        this.minimapGraphics.setScrollFactor(0);
        this.minimapGraphics.setDepth(GAME_CONFIG.DEPTH.MINIMAP_BG);
        if (this.cameras?.main) this.cameras.main.ignore(this.minimapGraphics);

        this.minimapGraphics.fillStyle(0x000000, 0.7);
        this.minimapGraphics.fillRect(minimapX, minimapY, minimapSize, minimapSize);

        // 繝溘ル繝槭ャ繝励・譫邱・
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
        const gridCells = Math.max(1, Math.floor(this.mapTileSize / AREA_GRID_SIZE));
        const cellPx = minimapSize / gridCells;

        this.minimapTexture.clear();

        const graphics = this.add.graphics();
        Object.entries(NATION_BOUNDS).forEach(([nation, bounds]) => {
            const color = NATION_COLORS[nation] ?? 0xffffff;
            graphics.fillStyle(color, 0.25);
            const gxStart = Math.floor(bounds.minX / AREA_GRID_SIZE);
            const gxEnd = Math.floor(bounds.maxX / AREA_GRID_SIZE);
            const gyStart = Math.floor(bounds.minY / AREA_GRID_SIZE);
            const gyEnd = Math.floor(bounds.maxY / AREA_GRID_SIZE);
            for (let gx = gxStart; gx <= gxEnd; gx++) {
                for (let gy = gyStart; gy <= gyEnd; gy++) {
                    graphics.fillRect(gx * cellPx, gy * cellPx, cellPx, cellPx);
                }
            }
        });

        if (this.guildAreas && this.guildAreas.size > 0) {
            const guildColor = NATION_COLORS[this.getNationKey()] ?? 0xffffff;
            graphics.fillStyle(guildColor, 0.45);
            this.guildAreas.forEach((key) => {
                const parts = String(key).split(',');
                const gx = Number(parts[0]);
                const gy = Number(parts[1]);
                if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
                graphics.fillRect(gx * cellPx, gy * cellPx, cellPx, cellPx);
            });
        }

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
        const zoom = screenWidth / (visionRange * 2);
        cam.setZoom(zoom);
    }

    getEffectiveVisionRange() {
        const base = Number.isFinite(Number(this.baseShipVisionRange))
            ? Number(this.baseShipVisionRange)
            : Number(this.shipVisionRange);
        if (this.isInOwnedArea) return base;
        return Math.max(50, Math.floor(base * OUTSIDE_VISION_MULTIPLIER));
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

    getAreaCellFromWorld(x, y) {
        const tileX = Math.max(0, Math.min(this.mapTileSize - 1, Math.floor(x / this.gridSize)));
        const tileY = Math.max(0, Math.min(this.mapTileSize - 1, Math.floor(y / this.gridSize)));
        const gx = Math.floor(tileX / AREA_GRID_SIZE);
        const gy = Math.floor(tileY / AREA_GRID_SIZE);
        const key = `${gx},${gy}`;
        return { gx, gy, key, tileX, tileY };
    }

    isTileInNationArea(tileX, tileY) {
        const nation = this.getNationKey();
        if (!nation) return false;
        const bounds = NATION_BOUNDS[nation];
        if (!bounds) return false;
        return tileX >= bounds.minX && tileX <= bounds.maxX && tileY >= bounds.minY && tileY <= bounds.maxY;
    }

    isCellOwned(cell) {
        if (!cell) return false;
        if (this.isTileInNationArea(cell.tileX, cell.tileY)) return true;
        return this.guildAreas.has(cell.key);
    }

    isIslandInOwnedArea(islandData) {
        if (!islandData) return false;
        const cx = islandData.x + (islandData.width || 0) / 2;
        const cy = islandData.y + (islandData.height || 0) / 2;
        const cell = this.getAreaCellFromWorld(cx, cy);
        return this.isCellOwned(cell);
    }

    async loadGuildAreas() {
        const guildId = this.getMyGuildId();
        if (!guildId) return;
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/get-guild-areas') : '/api/get-guild-areas'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guildId })
            });
            if (!res.ok) return;
            const data = await res.json();
            const areas = Array.isArray(data?.areas) ? data.areas : [];
            this.guildAreas = new Set(areas.map((entry) => `${entry.gx},${entry.gy}`));
            this.drawOwnedAreasOnMinimap();
        } catch (error) {
            console.warn('[Area] Failed to load guild areas:', error);
        }
    }

    async updateAreaControlState() {
        if (!this.playerShip) return;
        const now = Date.now();
        if (now - this.lastAreaCheckAt < 500) return;
        this.lastAreaCheckAt = now;

        const cell = this.getAreaCellFromWorld(this.playerShip.x, this.playerShip.y);
        const owned = this.isCellOwned(cell);
        if (owned !== this.isInOwnedArea) {
            this.isInOwnedArea = owned;
            this.updateZoomFromVisionRange();
        }

        if (this.playerShipDomain !== 'guild') return;
        if (!this.getMyGuildId()) return;
        if (this.guildAreas.has(cell.key)) {
            this.areaCaptureKey = null;
            this.areaCaptureStartAt = null;
            return;
        }

        if (this.areaCaptureKey !== cell.key) {
            this.areaCaptureKey = cell.key;
            this.areaCaptureStartAt = now;
            return;
        }
        if (!this.areaCaptureStartAt) {
            this.areaCaptureStartAt = now;
            return;
        }
        if (now - this.areaCaptureStartAt < AREA_CAPTURE_MS) return;

        try {
            const [gx, gy] = cell.key.split(',').map(Number);
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/capture-guild-area') : '/api/capture-guild-area'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guildId: this.getMyGuildId(), gx, gy })
            });
            if (res.ok) {
                this.guildAreas.add(cell.key);
                this.isInOwnedArea = true;
                this.updateZoomFromVisionRange();
                this.drawOwnedAreasOnMinimap();
            }
        } catch (error) {
            console.warn('[Area] Capture failed:', error);
        } finally {
            this.areaCaptureStartAt = null;
        }
    }

    createIsland(data) {
        const layoutData = ISLAND_LAYOUTS[data.size] || ISLAND_LAYOUTS.small;
        const layout = layoutData.tiles;
        const islandWidth = layoutData.width * this.TILE_SIZE;
        const islandHeight = layoutData.height * this.TILE_SIZE;

        const islandSprites = [];
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
                        islandSprites.push(tile);
                        islandPhysicsGroup.add(tile);
                    } else {
                        const tile = this.add.sprite(tileX, tileY, 'map_tiles', tileIndex).setOrigin(0, 0);
                        tile.setDepth(GAME_CONFIG.DEPTH.ISLAND);
                        islandSprites.push(tile);
                    }
                }
            }
        }

        if (data.biomeFrame !== null && data.biomeFrame !== undefined) {
            const biomeFrame = Number(data.biomeFrame);
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
            const activeBuildings = data.buildings.filter(b => b && b.status !== 'demolished');
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
                const nationOffset = (buildingMeta?.nationTileOffset === true)
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

            if (this.collidingIsland && this.collidingIsland.id === islandData.id) {
                this.showIslandCommandMenu(islandData);
            } else {
                this.moveShipTo(data.x + islandWidth / 2, data.y + islandHeight / 2, islandData);
            }
        });

        const islandData = {
            id: data.id,
            x: data.x,
            y: data.y,
            width: islandWidth,
            height: islandHeight,
            name: data.name,
            type: data.type,
            ownerNation: ownerNation,
            ownerId: data.ownerId,
            sprites: islandSprites,
            buildingSprites: buildingSprites,
            nameText: nameText,
            interactiveZone: interactiveZone,
            physicsGroup: islandPhysicsGroup
        };

        if (this.playerShip) {
            this.physics.add.collider(this.playerShip, islandPhysicsGroup, () => {
                if (this.shipMoving) {
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

                    this.collidingIsland = islandData;
                    this.showMessage(`${islandData.name}に到着しました。`);

                    this.showIslandCommandMenu(islandData);

                    this.canMove = true;
                }
            });
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

        return this.lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||    // 荳願ｾｺ
               this.lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom) || // 蜿ｳ霎ｺ
               this.lineIntersectsLine(x1, y1, x2, y2, left, bottom, right, bottom) || // 荳玖ｾｺ
               this.lineIntersectsLine(x1, y1, x2, y2, left, top, left, bottom);      // 蟾ｦ霎ｺ
    }

    /**
     *
     * @param {number} x1, y1, x2, y2 - 邱壼・1
     * @param {number} x3, y3, x4, y4 - 邱壼・2
     *
     */
    lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));
        if (denom === 0) return false; // 蟷ｳ陦・

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

    moveShipTo(x, y, targetIsland) {
        console.log('[moveShipTo] Called with x:', x, 'y:', y, 'targetIsland:', targetIsland);
        this.hideBoardingButton();

        const startX = this.playerShip.x;
        const startY = this.playerShip.y;

        if (this.shipMoving || !this.canMove) {
            this.showMessage(this.shipMoving ? '移動中です。' : (!this.canMove ? '移動クールダウン中です。' : '遠すぎて移動できません。'));
            return;
        }

        this.hideIslandCommandMenu();

        const distance = Phaser.Math.Distance.Between(startX, startY, x, y);
        const speed = this.getEffectiveShipSpeed();
        const duration = (distance / speed) * 1000;
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

    onShipArrived() {
        this.shipMoving = false;
        this.playerShip.body.setVelocity(0, 0);

        this.stopShipAnimation();
        this.updateMyShipStoppedPosition();

        if (this.shipTargetIsland) {
            this.claimIsland(this.shipTargetIsland);
        }

        if (this.hasEnemyInView()) {
            this.time.delayedCall(this.moveCooldown, () => {
                this.canMove = true;
            });
        } else {
            this.canMove = true;
        }
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

    // 荳・0..2 / 蟾ｦ:21..23 / 蜿ｳ:42..44 / 荳・63..65
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
        button.addEventListener('click', () => this.triggerShipAction());
        this.updateShipActionUi(true);
    }

    setPlayerShipAssetData(assetData) {
        const itemId = String(assetData?.ItemId || '').trim();
        this.playerShipItemId = itemId || null;
        this.playerShipClass = this.getShipClassFromItemId(itemId);
        const baseSpeed = Number(assetData?.Stats?.Speed);
        if (Number.isFinite(baseSpeed) && baseSpeed > 0) {
            this.shipBaseSpeed = baseSpeed;
            this.shipSpeed = baseSpeed;
        }
        this.updateShipActionUi(true);
    }

    getShipClassFromItemId(itemId) {
        const key = String(itemId || '').toLowerCase();
        if (key.includes('explorer')) return 'explorer';
        if (key.includes('merchant')) return 'merchant';
        if (key.includes('defender')) return 'defender';
        if (key.includes('fighter')) return 'fighter';
        return null;
    }

    getShipActionType() {
        const itemId = String(this.playerShipItemId || '').toLowerCase();
        const shipClass = this.playerShipClass;
        if (shipClass === 'explorer') return { type: 'explorer', label: 'Explorer' };
        if (shipClass === 'merchant') return { type: 'merchant', label: 'Merchant' };
        if (shipClass === 'defender') return { type: 'defender', label: 'Defender' };
        if (shipClass === 'fighter') {
            if (itemId.includes('ship_elf_fighter')) return { type: 'fighter', subtype: 'elf', label: 'Elf Fighter' };
            if (itemId.includes('ship_orc_fighter')) return { type: 'fighter', subtype: 'orc', label: 'Orc Fighter' };
            if (itemId.includes('ship_goblin_fighter')) return { type: 'fighter', subtype: 'goblin', label: 'Goblin Fighter' };
            if (itemId.includes('ship_human_fighter')) return { type: 'fighter', subtype: 'human', label: 'Human Fighter' };
            return { type: 'fighter', subtype: 'generic', label: 'Fighter' };
        }
        return { type: 'none', label: 'None' };
    }

    getEffectiveShipSpeed() {
        const now = Date.now();
        const boostActive = now < this.shipActionSpeedBoostUntil;
        const multiplier = boostActive ? 1.5 : 1;
        return Math.max(1, this.shipBaseSpeed * multiplier);
    }

    updateShipActionUi(force = false) {
        if (!this.shipActionButton || !this.shipActionStatus) return;
        const now = Date.now();
        if (!force && now - this.shipActionUiLastUpdate < 250) return;
        this.shipActionUiLastUpdate = now;

        const actionInfo = this.getShipActionType();
        const cooldownRemaining = Math.max(0, this.shipActionCooldownUntil - now);
        const canUse = cooldownRemaining <= 0 && actionInfo.type !== 'none';

        this.shipActionButton.disabled = !canUse;
        this.shipActionButton.textContent = actionInfo.type === 'none' ? 'No Action' : 'Action';

        if (actionInfo.type === 'none') {
            this.shipActionStatus.textContent = '';
            return;
        }

        if (cooldownRemaining > 0) {
            const seconds = Math.ceil(cooldownRemaining / 1000);
            this.shipActionStatus.textContent = `Cooldown ${seconds}s`;
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
            this.shipSpeed = this.shipBaseSpeed;
        } else {
            this.shipSpeed = this.getEffectiveShipSpeed();
        }
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

    triggerShipAction() {
        if (!this.playerShip || !this.playerInfo?.playFabId) {
            this.showMessage('アクションを使用できません。');
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

        if (actionInfo.type === 'explorer') {
            this.shipActionSpeedBoostUntil = now + GAME_CONFIG.SHIP_ACTION_DURATION_MS;
            this.showMessage('速度上昇!');
        } else if (actionInfo.type === 'merchant') {
            this.shipActionInvisibleUntil = now + GAME_CONFIG.SHIP_ACTION_DURATION_MS;
            this.setPlayerShipInvisible(true);
            this.showMessage('姿を消しました');
        } else if (actionInfo.type === 'defender') {
            this.applyDefenderAction();
        } else if (actionInfo.type === 'fighter') {
            this.applyFighterAction(actionInfo.subtype || 'generic');
        }

        this.shipActionCooldownUntil = now + GAME_CONFIG.SHIP_ACTION_COOLDOWN_MS;
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
        const facing = this.getPlayerFacingVector();
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

    async applyShipActionDamage(targets, damage) {
        if (!targets.length) {
            this.showMessage('対象がいません');
            return;
        }
        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ship-action-damage') : '/api/ship-action-damage'), {
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
                this.showMessage('攻撃に失敗しました');
            } else {
                this.showMessage(`命中 ${data?.hits || targets.length}`);
            }
        } catch (e) {
            console.warn('[ShipAction] Damage request failed:', e);
            this.showMessage('攻撃に失敗しました');
        }
    }

    applyFighterAction(subtype) {
        const tile = this.TILE_SIZE;
        let range = tile * 5;
        let angle = 50;
        let damage = 300;
        if (subtype === 'human') {
            range = tile * 4;
            angle = 60;
            damage = 300;
        } else if (subtype === 'orc') {
            range = tile * 8;
            angle = 30;
            damage = 450;
        } else if (subtype === 'goblin') {
            range = tile * 3;
            angle = 40;
            damage = 600;
        } else if (subtype === 'elf') {
            const radius = tile * 4;
            const targets = [];
            this.otherShips.forEach((shipObject, otherId) => {
                const sprite = shipObject?.sprite;
                if (!sprite) return;
                const dist = Phaser.Math.Distance.Between(this.playerShip.x, this.playerShip.y, sprite.x, sprite.y);
                if (dist <= radius) {
                    targets.push({ playFabId: otherId, distance: dist });
                }
            });
            this.applyShipActionDamage(targets, 350);
            return;
        }
        const targets = this.getTargetsInCone(range, angle);
        this.applyShipActionDamage(targets, damage);
    }

    async applyDefenderAction() {
        if (!this.playerShip || !this.firestore) return;
        const facing = this.getPlayerFacingVector();
        const range = this.TILE_SIZE * 5;
        let closest = null;

        this.islandObjects.forEach((islandData) => {
            const centerX = islandData.x + islandData.width / 2;
            const centerY = islandData.y + islandData.height / 2;
            const dx = centerX - this.playerShip.x;
            const dy = centerY - this.playerShip.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range || dist <= 0) return;
            const dot = (dx / dist) * facing.x + (dy / dist) * facing.y;
            if (dot < 0.5) return;
            if (!closest || dist < closest.distance) {
                closest = { id: islandData.id, distance: dist };
            }
        });

        if (!closest) {
            this.showMessage('対象の島がありません');
            return;
        }

        const { doc, getDoc, updateDoc } = await import('firebase/firestore');
        const islandRef = doc(this.firestore, this.getWorldMapCollectionName(), closest.id);
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

        const damage = 600;
        const b = buildings[idx];
        const maxHp = Number(b.maxHp) || 0;
        const current = Number.isFinite(Number(b.currentHp)) ? Number(b.currentHp) : maxHp;
        const next = Math.max(0, current - damage);
        buildings[idx] = { ...b, currentHp: next };
        await updateDoc(islandRef, { buildings });
        await this.reloadIslandFromFirestore(closest.id);
        this.showMessage('建物に大ダメージ');
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
            buildings: data.buildings || []
        });
    }

    removeIslandById(islandId) {
        const islandData = this.islandObjects.get(islandId);
        if (!islandData) return;
        islandData.sprites?.forEach(sprite => sprite?.destroy?.());
        islandData.buildingSprites?.forEach(sprite => sprite?.destroy?.());
        islandData.nameText?.destroy?.();
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
        if (!islandId || !this.islandObjects) return;
        const islandData = this.islandObjects.get(islandId);
        if (!islandData) return;
        this.navTargetId = islandId;
        this.navTargetLabel = islandData.name || 'NAV';
        this.updateNavigationHud();
    }

    updateNavigationHud() {
        const hud = document.getElementById('mapNavHud');
        if (hud) hud.style.display = 'none';
        if (!this.navTargetId || !this.playerShip || !this.islandObjects) {
            if (this.navArrow) this.navArrow.setVisible(false);
            if (this.navDistanceText) this.navDistanceText.setVisible(false);
            return;
        }
        const islandData = this.islandObjects.get(this.navTargetId);
        if (!islandData) {
            if (this.navArrow) this.navArrow.setVisible(false);
            if (this.navDistanceText) this.navDistanceText.setVisible(false);
            return;
        }
        const targetX = islandData.x + islandData.width / 2;
        const targetY = islandData.y + islandData.height / 2;
        const dx = targetX - this.playerShip.x;
        const dy = targetY - this.playerShip.y;
        const withinX = this.playerShip.x >= islandData.x && this.playerShip.x <= islandData.x + islandData.width;
        const withinY = this.playerShip.y >= islandData.y && this.playerShip.y <= islandData.y + islandData.height;
        if (withinX && withinY) {
            this.navTargetId = null;
            this.navTargetLabel = null;
            if (this.navArrow) this.navArrow.setVisible(false);
            if (this.navDistanceText) this.navDistanceText.setVisible(false);
            return;
        }
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distTiles = Math.max(0, Math.round(distPx / this.TILE_SIZE));

        const angleRad = Math.atan2(dy, dx);
        const unitX = distPx > 0 ? dx / distPx : 0;
        const unitY = distPx > 0 ? dy / distPx : 0;
        const radius = 30;
        if (this.navArrow) {
            this.navArrow.setPosition(this.playerShip.x + unitX * radius, this.playerShip.y + unitY * radius);
            this.navArrow.setRotation(angleRad + Math.PI / 2);
            this.navArrow.setVisible(true);
        }
        if (this.navDistanceText) {
            this.navDistanceText.setPosition(this.playerShip.x, this.playerShip.y - 26);
            this.navDistanceText.setText(`距離 ${distTiles}`);
            this.navDistanceText.setVisible(true);
        }
    }

    updatePositionHud() {
        if (!this.positionText || !this.playerShip) return;
        const tileX = Math.floor(this.playerShip.x / this.TILE_SIZE);
        const tileY = Math.floor(this.playerShip.y / this.TILE_SIZE);
        this.positionText.setText(`x:${tileX} y:${tileY}`);
    }

    showBoardingButton(targetPlayFabId, displayName = '') {
        this.showShipCommandMenu(targetPlayFabId, displayName);
    }

    hideBoardingButton() {
        this.hideShipCommandMenu();
    }

    showShipCommandMenu(targetPlayFabId, displayName = '') {
        const panel = document.getElementById('islandCommandPanel');
        const title = document.getElementById('islandCommandTitle');
        const actionBtn = document.getElementById('islandCommandAction');
        const closeBtn = document.getElementById('islandCommandClose');

        if (!panel || !title || !actionBtn || !closeBtn) {
            console.error('[showShipCommandMenu] HTMLパネルが見つかりません');
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
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newActionBtn.addEventListener('click', onClick);
        newActionBtn.addEventListener('pointerdown', () => console.log('[Boarding] pointerdown'));
        newActionBtn.addEventListener('pointerup', () => console.log('[Boarding] pointerup'));
        newCloseBtn.addEventListener('click', () => {
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

    async ramShipDamage(otherPlayFabId) {
        const myId = this.playerInfo?.playFabId;
        if (!myId || !otherPlayFabId) return;

        if (String(myId) > String(otherPlayFabId)) return;

        const now = Date.now();
        const lastAt = this.lastRamDamageAt.get(otherPlayFabId) || 0;
        if (now - lastAt < 5000) return;
        this.lastRamDamageAt.set(otherPlayFabId, now);

        try {
            const res = await fetch((window.buildApiUrl ? window.buildApiUrl('/api/ram-ship') : '/api/ram-ship'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attackerId: myId, defenderId: otherPlayFabId, damage: 5 })
            });
            const data = await res.json();
            if (!res.ok) {
                console.warn('[ShipCollision] ram-ship failed:', data);
            } else if (data && typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                const attackerRespawned = data.attacker?.playFabId === myId && data.attacker?.respawned;
                const defenderRespawned = data.defender?.playFabId === myId && data.defender?.respawned;
                if (attackerRespawned || defenderRespawned) {
                    const msg = window.rpgSay?.shipSunk ? window.rpgSay.shipSunk() : 'ふねが沈んだ…';
                    window.showRpgMessage(msg);
                    const revive = window.rpgSay?.shipRespawned ? window.rpgSay.shipRespawned() : 'ふねが復活した！';
                    setTimeout(() => window.showRpgMessage(revive), 1200);
                }
            }
        } catch (error) {
            console.warn('[ShipCollision] ram-ship request error:', error);
        }
    }

    handleShipCollision(otherPlayFabId, shipObject) {
        if (!this.playerShip || !shipObject?.sprite) return;

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

        this.ramShipDamage(otherPlayFabId);

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(50);
        }

        this.showBoardingButton(otherPlayFabId, shipObject.data?.displayName || '');
        this.showMessage('接近しました。乗り込み可能です。');
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

        let anyIntersect = false;
        this.otherShips.forEach((shipObject, otherPlayFabId) => {
            if (!shipObject?.sprite) return;
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

    async claimIsland(islandData) {
        if (!this.playerInfo.playFabId || islandData.ownerId === this.playerInfo.playFabId) {
            return;
        }

        console.log(`島「${islandData.name}」を占領します...`);

        const db = getFirestore();
        const islandRef = doc(db, this.getWorldMapCollectionName(), islandData.id);

        try {
            await updateDoc(islandRef, {
                ownerId: this.playerInfo.playFabId,
                ownerNation: this.playerInfo.nation || null
            });
            console.log('所有権の更新に成功');
            islandData.ownerId = this.playerInfo.playFabId;
            islandData.ownerNation = this.playerInfo.nation || null;
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
    showIslandCommandMenu(islandData) {
        const panel = document.getElementById('islandCommandPanel');
        const title = document.getElementById('islandCommandTitle');
        const actionBtn = document.getElementById('islandCommandAction');
        const closeBtn = document.getElementById('islandCommandClose');

        if (!panel || !title || !actionBtn || !closeBtn) {
            console.error('[showIslandCommandMenu] HTMLパネルが見つかりません');
            return;
        }

        title.textContent = islandData.name;

        const myPlayFabId = this.playerInfo?.playFabId;
        const isOwner = !!myPlayFabId && islandData.ownerId === myPlayFabId;
        const isInOwnedArea = this.isIslandInOwnedArea(islandData);

        const resourceBiomes = ['volcanic', 'rocky', 'mushroom', 'lake', 'forest', 'sacred'];
        const isResourceIsland = resourceBiomes.includes(String(islandData?.biome || '').toLowerCase());
        const menuLabel = isResourceIsland ? '採取メニュー' : '建設メニュー';

        let buttonText = `${menuLabel}を開く`;
        let buttonClass = 'info';
        let onClick = async () => {
            await this.openBuildingMenuForIsland(islandData);
        };

        if (!myPlayFabId) {
            buttonText = 'ログインが必要です';
            buttonClass = 'disabled';
            onClick = () => this.showMessage('ログインしてください。');
        } else if (!isOwner && !isInOwnedArea) {
            buttonText = '占領範囲外';
            buttonClass = 'disabled';
            onClick = () => this.showMessage('このエリアは占領されていません。');
        } else if (!isOwner) {
            buttonText = `占領して${menuLabel}を開く`;
            buttonClass = 'warning';
            onClick = async () => {
                await this.claimIsland(islandData);
                await this.openBuildingMenuForIsland(islandData);
            };
        }

        actionBtn.textContent = buttonText;
        actionBtn.className = 'island-command-btn ' + buttonClass;

        const newActionBtn = actionBtn.cloneNode(true);
        actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newActionBtn.addEventListener('click', () => {
            void onClick();
        });

        newCloseBtn.addEventListener('click', () => {
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
        if (panel) {
            panel.classList.remove('active');
        }
        this.commandMenuOpen = false;
        this.collidingIsland = null;
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
        this.updateAreaControlState();
        this.drawFogOfWar();
        this.updateNavigationHud();
        this.updatePositionHud();
        this.updateMinimapPlayerMarker();
        this.refreshShipSubscriptions();
        this.interpolateOtherShips();
        this.updateShipShadows();
        this.updateShipHpBars();
        this.pruneOtherShips();
        this.checkShipShipCollisions();
        this.clearCollidingIslandWhenFar();
        this.updateShipActionEffects();
        this.updateShipActionUi();
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
            this.collidingIsland = null;
        }
    }

    /**
     *
     */
    updateMinimapPlayerMarker() {
        if (!this.minimapPlayerMarker || !this.minimapConfig || !this.playerShip) return;
        const minimapSize = this.minimapConfig.size;
        const gridCells = Math.max(1, Math.floor(this.mapTileSize / AREA_GRID_SIZE));
        const cellPx = minimapSize / gridCells;

        const cell = this.getAreaCellFromWorld(this.playerShip.x, this.playerShip.y);
        const x = this.minimapConfig.x + cell.gx * cellPx;
        const y = this.minimapConfig.y + cell.gy * cellPx;

        this.minimapPlayerMarker.clear();
        this.minimapPlayerMarker.lineStyle(2, 0xffffff, 1);
        this.minimapPlayerMarker.strokeRect(x, y, cellPx, cellPx);
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
        await this.loadGuildAreas();

        await this.restoreOrCreateMyShipPosition();

        this.subscribeToOtherShips();
        this.subscribeToConstructingIslands();
        this.subscribeToDemolishedIslands();
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
            const duration = (distance / speed) * 1000; // 繝溘Μ遘・
            const arrivalTime = Date.now() + duration;
            const geoPoint = this.worldToLatLng({ x: currentX, y: currentY });
            const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);

            const shipRef = doc(this.firestore, 'ships', this.playerInfo.playFabId);
            await setDoc(shipRef, {
                playFabId: this.playerInfo.playFabId,
                displayName: window.myLineProfile?.displayName || 'Unknown',
                race: this.playerInfo.race || 'human',
                appearance: { color: this.normalizeShipColorKey(window.myAvatarBaseInfo?.AvatarColor) },
                guildId: this.getMyGuildId(),
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
                appearance: { color: this.normalizeShipColorKey(window.myAvatarBaseInfo?.AvatarColor) },
                guildId: this.getMyGuildId(),
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
                if (isDestroyed && activeShipId) {
                    await this.respawnPlayerShipIfNeeded(activeShipId);
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
                        if (isDestroyed && activeShipId) {
                            await this.respawnPlayerShipIfNeeded(activeShipId);
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
                            this.playerShip.lastAnimKey = 'ship_down'; // 蛻晄悄譁ｹ蜷・
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
                guildId: this.getMyGuildId(),
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

        const shipId = shipData.shipId;
        let assetData = null;
        if (shipId) {
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

        if (!shipObject) {
            const sprite = this.physics.add.sprite(worldPos.x, worldPos.y, sheetKey, 1);
            sprite.setDepth(GAME_CONFIG.DEPTH.SHIP).setOrigin(0.5, 0.5).clearTint();
            this.ignoreOnUiCamera(sprite);
            sprite.body.setSize(24, 24);
            sprite.body.setCollideWorldBounds(true);
            sprite.body.setAllowGravity(false);
            sprite.body.setImmovable(true);
                    shipObject = {
                        sprite: sprite, data: shipData, lastUpdate: now, motion: null, lastAnimKey: 'ship_down',
                        shipTypeKey: null, pendingRemoval: false, removedAt: null
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
            if (shipObject.sprite?.texture?.key !== sheetKey) {
                shipObject.sprite.setTexture(sheetKey);
            }
        }

        if (assetData?.Domain) {
            shipObject.domain = String(assetData.Domain).toLowerCase();
        }
        if (assetData) {
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
        } else if (!shipObject.shipTypeKey) {
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
        const shipObject = this.otherShips.get(playFabId);
        if (shipObject) {
            this.destroyShipHpBar(shipObject?.sprite);
            this.destroyShipShadow(shipObject?.sprite);
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
            const keepRange = this.shipVisionRange * 1.25;
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
        const hysteresisRange = this.shipVisionRange * 1.25;
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
            if (delta < this.shipVisionRange * GAME_CONFIG.SHIP_QUERY_REFRESH_THRESHOLD) {
                return;
            }
        }

        this.lastShipQueryCenter = center;
        this.lastShipQueryUpdate = now;
        this.teardownShipGeoSubscriptions();

        try {
            const { collection, onSnapshot, query, orderBy, startAt, endAt } = await import('firebase/firestore');
            const radiusTiles = this.shipVisionRange / this.gridSize;
            const radiusMeters = radiusTiles * this.metersPerTile;
            const centerGeo = this.worldToLatLng(center);
            const bounds = geohashQueryBounds([centerGeo.lat, centerGeo.lng], radiusMeters);

            bounds.forEach((b) => {
                const q = query(
                    collection(this.firestore, 'ships'),
                    orderBy('geohash'),
                    startAt(b[0]),
                    endAt(b[1])
                );

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
                    return;
                }

                const speed = typeof data?.speed === 'number' ? data.speed : this.shipSpeed;
                const travelDuration = (Phaser.Math.Distance.Between(data.currentX, data.currentY, data.targetX, data.targetY) / speed) * 1000;
                const departureTime = data.arrivalTime - travelDuration;
                const elapsed = now - departureTime;
                const progress = travelDuration > 0 ? Phaser.Math.Clamp(elapsed / travelDuration, 0, 1) : 1;

                sprite.x = data.currentX + (data.targetX - data.currentX) * progress;
                sprite.y = data.currentY + (data.targetY - data.currentY) * progress;
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
                    return;
                }

                const totalTime = movement.arrivalTime - movement.departureTime;
                const elapsedTime = now - movement.departureTime;
                const progress = totalTime > 0 ? Phaser.Math.Clamp(elapsedTime / totalTime, 0, 1) : 1;

                sprite.x = movement.departurePos.x + (movement.destinationPos.x - movement.departurePos.x) * progress;
                sprite.y = movement.departurePos.y + (movement.destinationPos.y - movement.departurePos.y) * progress;
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

            const scaffolding = this.add.text(x, y - 20, '🏗️', { fontSize: '32px' });
            scaffolding.setOrigin(0.5);
            scaffolding.setDepth(GAME_CONFIG.DEPTH.CONSTRUCTION);

            this.tweens.add({
                targets: scaffolding,
                y: y - 24,
                duration: GAME_CONFIG.CONSTRUCTION_BOUNCE_DURATION,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const crane = this.add.text(x + 20, y - 30, '🏗️', { fontSize: '24px' });
            crane.setOrigin(0.5);
            crane.setDepth(GAME_CONFIG.DEPTH.CONSTRUCTION);

            this.tweens.add({
                targets: crane,
                angle: 10,
                duration: GAME_CONFIG.CONSTRUCTION_CRANE_ROTATION,
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

            this.constructionSprites.push(scaffolding, crane, particles);
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

        if (this.onActiveShipChanged && typeof window !== 'undefined') {
            window.removeEventListener('ship:active-changed', this.onActiveShipChanged);
            this.onActiveShipChanged = null;
        }

        this.otherShips.forEach((shipObject) => {
            this.destroyShipHpBar(shipObject?.sprite);
            this.destroyShipShadow(shipObject?.sprite);
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
    }
}

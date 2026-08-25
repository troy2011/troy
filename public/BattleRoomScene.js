// public/BattleRoomScene.js
// バトルルームシーン（Phaser）
//  建物アルカナ回収 → アルカナモード → シンボル攻撃 / 建物発動による妨害

import * as Phaser from 'phaser';
import { getFirestore } from 'firebase/firestore';
import {
    createBattleRoom,
    joinBattleRoom,
    getActiveBattleRoom
} from './js/playfabClient.js?v=20260825-playfab-read-coalescing-v1';
import { BattleRoomClient } from './js/battleRoomClient.js';
import {
    getCachedSkillData, setCachedSkillData, mergeWithLocalCt,
    isSelfOnlySkill, isSkillReady, setSkillCooldown, getSkillRemainingSec
} from './js/shipSkillClient.js';

// ── 定数 ─────────────────────────────────────────────────────
const BW = 1000;
const BH = 1000;
const S  = 0.8;           // 論理→描画スケール（1000px → 800px表示）
const CW = BW * S;        // 800
const CH = BH * S;        // 800

const HUD_TOP_H     = 28;
const HUD_BOT_H     = 90;
const PLAY_Y_START  = HUD_TOP_H;
const PLAY_Y_END    = CH - HUD_BOT_H;

const SHIP_R       = 14;
const NPC_R        = 11;
const HP_BAR_W     = 28;
const HP_BAR_H     = 4;

const SYMBOL_HP_MAX  = 3000;
const ARCANA_COST    = 200;   // サーバー・クライアントと統一

// 移動・戦闘定数
const PLAYER_SPEED           = 160;   // px/秒（論理座標）
const BUILDING_INTERACT_RANGE = 120;  // 建物操作可能距離（論理px）
const PLAYER_ATTACK_RANGE    = 90;    // 対人攻撃可能距離（論理px）
const PLAYER_HP_DEFAULT      = 300;

// 建物の論理座標（ルームデータの x/y を優先、なければフォールバック）
function buildingLogicalPos(buildingState, index) {
    if (buildingState?.x !== undefined) return { x: buildingState.x, y: buildingState.y };
    const col = index % 2;
    const row = Math.floor(index / 2);
    return { x: 200 + col * 600, y: 150 + row * 200 };
}

// シンボル論理座標（1000pxマップ中央）
const SYM_LX = 500;
const SYM_LY = 500;

// スポーン
const ATK_SPAWN_LX = 80;
const DEF_SPAWN_LX = 920;
const SPAWN_LY     = 500;

// カラー
const C_ATK      = 0xff4444;
const C_DEF      = 0x4488ff;
const C_BLDG_DEF = 0x4488cc;   // 守備側保持
const C_BLDG_ATK = 0xff8844;   // 攻撃側占領済み
const C_ACTIVE   = 0xffcc00;   // 自動発火中
const C_SYM      = 0xddbbff;

// 建物エフェクト → building_tiles フレーム番号マッピング
// buildings.png の実際のレイアウトに合わせて調整可能
const BUILDING_FRAME_MAP = {
    cannon:        1,
    heavy_cannon:  1,
    minimap:       2,
    fog:           3,
    barrier:       4,
    slow:          5,
    repair_ship:   6,
    ship_repair:   6,
    regen:         7,
    arcana_boost:  8,
    hp_heal:       9,
    area_heal:     9,
};

const EFFECT_LABELS = {
    // 守備系
    fog: '霧', barrier: '盾', slow: '減速', drain: '奪取',
    regen: '蓄積↑', bind: '拘束', curse: '呪詛',
    minimap: '索敵', cannon: '砲撃', heavy_cannon: '重砲',
    repair_ship: '修船', slow: '減速',
    arcana_boost: '蓄積↑', atk_up: '攻撃↑', def_up: '防御↑',
    boarding_up: '乗り込み↑',
    hp_heal: 'HP回復', arcana_instant: 'アルカナ↑', hp_regen: 'HP継続回復',
    ship_repair: '船修理', shield_1hit: '盾1発', area_heal: '範囲回復',
    // シンボルスキル
    random: 'ランダム', evasion: '回避', power: '攻撃↑',
    arcana_boost_plus: '全員蓄積↑', charm: '魅了', heavy_armor: '重装甲',
    fortress: '要塞', insight: '洞察', gamble: 'ギャンブル',
    judgement: '封印', death_mark: '死刻印', full_heal: '全回復',
    tower_strike: '塔撃', regen_plus: '蓄積++', deep_fog: '深霧',
    inspiration: '覚醒', respawn_call: '蘇生', world_shield: '世界盾',
};

// ── シーン ────────────────────────────────────────────────────
export default class BattleRoomScene extends Phaser.Scene {
    constructor() {
        super('BattleRoomScene');
        this._client      = null;
        this._roomData    = null;
        this._myPlayFabId = null;
        this._mySide      = null;
        this._territoryId = null;

        // Phaser オブジェクト
        this._playerSprites   = {};   // 他プレイヤー { [playFabId]: { sprite, ring, label } }
        this._npcSprites      = {};
        this._buildingObjs    = {};
        this._symbolObj       = null;
        this._arcanaBarObj    = null;
        this._actionButtons   = {};
        this._statusText      = null;
        this._timerText       = null;
        this._activeEffectObjs = [];
        this._objectiveText = null;
        this._modePromptText = null;
        this._symbolPulseTween = null;
        this._resultOverlay = null;
        this._lastArcanaMode = false;

        // 自分の船
        this._myShip        = null;   // Phaser.GameObjects.Sprite
        this._myShipHpBar   = null;   // Graphics
        this._myShipLabel   = null;   // Text
        this._moveTween     = null;
        this._playerX       = 0;      // 論理座標
        this._playerY       = 0;
        this._myHp          = PLAYER_HP_DEFAULT;
        this._myMaxHp       = PLAYER_HP_DEFAULT;
        this._isAlive       = true;
        this._respawnAt     = null;
        this._respawnText   = null;

        // 攻撃ボタン（近接時のみ表示）
        this._attackBtn          = null;   // { bg, lbl, targetId }
        this._attackCooldownUntil = 0;    // クライアント側CT（ms）
        this._respawnTimer        = null;

        // update()スロットリング
        this._proximityLastMs = 0;

        // 他プレイヤースプライトのtween管理（衝突防止）
        this._playerTweens = {};

        this._symbolHp     = SYMBOL_HP_MAX;
        this._myArcana     = 0;
        this._myArcanaMode = false;
        this._timerInterval = null;
        this._buildingIds   = [];

        // スキルパネル
        this._skillData      = [];
        this._skillPanelOpen = false;
        this._skillPanelObjs = null;
        this._skillCtTimer   = null;

        // エフェクト状態
        this._mySpeedMult       = 1.0;
        this._mySlowUntil       = 0;
        this._myStunnedUntil    = 0;
        this._myStealthUntil    = 0;
        this._myDriftUntil      = 0;
        this._myInvincibleUntil = 0;
        this._myConfusedUntil   = 0;
        this._myHealBlockUntil  = 0;
        this._mySkillSealUntil  = 0;
        this._myArmorBreakUntil = 0;
        this._myAtkDownUntil    = 0;
        this._myDriftInterval   = null;
        this._myDotInterval     = null;
        this._myCurrentDot      = null;
        this._myRegenInterval   = null;
        this._lastShipSkillSpecialAt = 0;
        this._sanctuaryHealBoostUntil = 0;
        this._sanctuaryHealBoost = 0;

        // 大アルカナパッシブ
        this._arcanaPassives        = [];   // { effect, value, ... }[]
        this._arcanaSpeedBoost      = 0;    // move_speed_boost の加算値（1.0 が基準）
        this._arcanaPassiveTimers   = [];   // periodic_heal 等の setInterval ID
    }

    // ── init ────────────────────────────────────────────────
    init(data) {
        this._myPlayFabId = data.playFabId;
        this._territoryId = data.territoryId;
        this._mySide      = data.side || 'attacker';
        this._myNation    = data.nation || null;
        this._roomData    = data.roomData || null;
    }

    preload() {
        // WorldMapScene が先行している場合はキャッシュ済み。未ロードなら安全に読み込む。
        if (!this.textures.exists('ship_sprite_red')) {
            this.load.spritesheet('ship_sprite_red',   'Sprites/Ships/ships_red.png',   { frameWidth: 32, frameHeight: 32 });
            this.load.spritesheet('ship_sprite_blue',  'Sprites/Ships/ships_blue.png',  { frameWidth: 32, frameHeight: 32 });
            this.load.spritesheet('ship_sprite_black', 'Sprites/Ships/ships_black.png', { frameWidth: 32, frameHeight: 32 });
        }
        if (!this.textures.exists('building_tiles')) {
            this.load.spritesheet('building_tiles', 'Sprites/Buildings/buildings.png', { frameWidth: 32, frameHeight: 32 });
        }
    }

    // ── create ──────────────────────────────────────────────
    create() {
        const spawnX = this._mySide === 'attacker' ? ATK_SPAWN_LX : DEF_SPAWN_LX;
        this._playerX = spawnX;
        this._playerY = SPAWN_LY;

        this._buildBackground();
        this._buildHudTop();
        this._buildSymbol();
        this._buildHudBottom();
        this._buildMyShip(spawnX, SPAWN_LY);

        if (this._roomData) {
            this._buildBuildingsFromRoom(this._roomData);
            this._updateSymbolHp(this._roomData.symbolHp ?? SYMBOL_HP_MAX);
        }

        const firestore = getFirestore();
        this._client = new BattleRoomClient({
            firestore,
            playFabId:          this._myPlayFabId,
            onStateChange:      (room)  => this._handleRoomState(room),
            onEvent:            (ev)    => this._handleEvent(ev),
            onNpcUpdate:        (npcs)  => this._renderNpcs(npcs),
            onPositionsUpdate:  (poses) => this._onPositionsUpdate(poses),
        });

        if (this._roomData?.roomId) {
            this._client.subscribe(this._roomData.roomId);
        }

        // 船スキル初期化（非同期）
        this._initShipSkills();
        // 大アルカナパッシブ取得（非同期）
        this._loadArcanaPassives();
        // ships/{myId} で被弾エフェクトを受信
        this._client.subscribeShipEffects(this._myPlayFabId, (d) => this._applyIncomingEffect(d));
    }

    // ── 自分の船を生成 ───────────────────────────────────────
    _buildMyShip(lx, ly) {
        const key = this._mySide === 'attacker' ? 'ship_sprite_red' : 'ship_sprite_blue';
        const cx  = lx * S;
        const cy  = ly * S;

        this._myShip = this.add.sprite(cx, cy, key, 1).setScale(1.8).setDepth(10);

        // 白リング（自分識別）
        const ring = this.add.graphics().setDepth(10);
        ring.lineStyle(2, 0xffffff, 0.9);
        ring.strokeCircle(0, 0, 30);
        ring.setPosition(cx, cy);
        this._myShipRing = ring;

        // 名前ラベル
        this._myShipLabel = this.add.text(cx, cy - 36, 'YOU', {
            fontSize: '8px', color: '#ffffff', fontFamily: 'monospace'
        }).setOrigin(0.5).setDepth(10);

        // HPバー
        this._myShipHpBar = this.add.graphics().setDepth(10);
        this._drawMyHpBar();
    }

    _drawMyHpBar() {
        const g   = this._myShipHpBar;
        if (!g || !this._myShip) return;
        const cx  = this._myShip.x;
        const cy  = this._myShip.y;
        const bw  = 40;
        const bh  = 5;
        g.clear();
        g.fillStyle(0x222222, 0.85);
        g.fillRect(cx - bw / 2, cy + 22, bw, bh);
        const pct = Math.max(0, this._myHp / this._myMaxHp);
        const col = pct > 0.5 ? 0x44dd44 : (pct > 0.25 ? 0xffaa22 : 0xff3333);
        g.fillStyle(col, 1);
        g.fillRect(cx - bw / 2, cy + 22, bw * pct, bh);
    }

    _moveMyShipGraphicsTo(cx, cy) {
        if (this._myShipRing)  this._myShipRing.setPosition(cx, cy);
        if (this._myShipLabel) this._myShipLabel.setPosition(cx, cy - 36);
        this._drawMyHpBar();
    }

    // ── 背景 ────────────────────────────────────────────────
    _buildBackground() {
        const g = this.add.graphics();
        g.fillStyle(0x0d2035);
        g.fillRect(0, HUD_TOP_H, CW, PLAY_Y_END - PLAY_Y_START);

        // 海面タップ → 自分の船を移動
        const bg = this.add.rectangle(CW / 2, HUD_TOP_H + (PLAY_Y_END - HUD_TOP_H) / 2,
            CW, PLAY_Y_END - HUD_TOP_H, 0x000000, 0).setInteractive();
        bg.on('pointerup', (pointer) => {
            if (!this._isAlive) return;
            const lx = Math.max(0, Math.min(BW, pointer.x / S));
            const ly = Math.max(0, Math.min(BH, pointer.y / S));
            this._movePlayerTo(lx, ly);
        });

        // グリッド
        g.lineStyle(1, 0x1a3a5c, 0.5);
        for (let x = 0; x <= CW; x += 80) g.lineBetween(x, HUD_TOP_H, x, PLAY_Y_END);
        for (let y = HUD_TOP_H; y <= PLAY_Y_END; y += 80) g.lineBetween(0, y, CW, y);

        // 中央ライン
        g.lineStyle(1, 0x334466, 0.8);
        g.lineBetween(CW / 2, HUD_TOP_H, CW / 2, PLAY_Y_END);

        // スポーンゾーン
        g.fillStyle(C_ATK, 0.08);
        g.fillRect(0, HUD_TOP_H, 160, PLAY_Y_END - PLAY_Y_START);
        g.fillStyle(C_DEF, 0.08);
        g.fillRect(CW - 160, HUD_TOP_H, 160, PLAY_Y_END - PLAY_Y_START);

        // スポーンラベル
        this.add.text(40, HUD_TOP_H + 12, '攻撃', {
            fontSize: '9px', color: '#ff8888', fontFamily: 'monospace'
        }).setOrigin(0.5);
        this.add.text(CW - 40, HUD_TOP_H + 12, '防衛', {
            fontSize: '9px', color: '#88aaff', fontFamily: 'monospace'
        }).setOrigin(0.5);
    }

    // ── HUD 上部 ────────────────────────────────────────────
    _buildHudTop() {
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.7);
        g.fillRect(0, 0, CW, HUD_TOP_H);

        this._statusText = this.add.text(CW / 2, HUD_TOP_H / 2, '待機中...', {
            fontSize: '11px', color: '#ffffff', fontFamily: 'monospace'
        }).setOrigin(0.5);

        this._timerText = this.add.text(CW - 6, HUD_TOP_H / 2, '10:00', {
            fontSize: '11px', color: '#ffdd88', fontFamily: 'monospace'
        }).setOrigin(1, 0.5);

        const btn = this.add.text(6, HUD_TOP_H / 2, '← 退出', {
            fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
            backgroundColor: '#333333', padding: { x: 4, y: 2 }
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        btn.on('pointerup', () => this._leaveRoom());

        this._objectiveText = this.add.text(CW / 2, HUD_TOP_H + 8, '', {
            fontSize: '10px',
            color: '#ddeeff',
            fontFamily: 'monospace',
            backgroundColor: '#00000088',
            padding: { x: 8, y: 3 },
            align: 'center'
        }).setOrigin(0.5, 0).setDepth(20);
    }

    // ── シンボル ────────────────────────────────────────────
    _buildSymbol() {
        const cx = SYM_LX * S;
        const cy = SYM_LY * S;
        const r  = 28;

        const g = this.add.graphics();
        this._drawSymbolGfx(g, cx, cy, r, SYMBOL_HP_MAX, SYMBOL_HP_MAX);

        // HP バー背景 / フィル
        const barW = 80;
        const barH = 7;
        const bx = cx - barW / 2;
        const by = cy + r + 8;

        const hpBarBg = this.add.graphics();
        hpBarBg.fillStyle(0x222222, 0.9);
        hpBarBg.fillRect(bx, by, barW, barH);

        const hpBar = this.add.graphics();
        hpBar.fillStyle(C_SYM, 1);
        hpBar.fillRect(bx, by, barW, barH);

        const hpText = this.add.text(cx, by + barH + 3, `HP ${SYMBOL_HP_MAX}`, {
            fontSize: '9px', color: '#ddbbff', fontFamily: 'monospace'
        }).setOrigin(0.5, 0);

        const promptText = this.add.text(cx, cy - r - 34, '', {
            fontSize: '10px',
            color: '#ffdd66',
            fontFamily: 'monospace',
            backgroundColor: '#2a1600cc',
            padding: { x: 6, y: 3 },
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(18).setAlpha(0);

        this._symbolObj = { g, hpBar, hpBarBg, hpText, cx, cy, r, bx, by, barW, barH };
        this._modePromptText = promptText;
    }

    _drawSymbolGfx(g, cx, cy, r, hp, maxHp) {
        g.clear();
        const pct = hp / maxHp;
        const col = pct > 0.5 ? C_SYM : (pct > 0.25 ? 0xffaa44 : 0xff4444);
        const pts = 5;
        const points = [];
        for (let i = 0; i < pts; i++) {
            const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
            points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        g.fillStyle(col, 0.25 + 0.4 * pct);
        g.fillPoints(points, true);
        g.lineStyle(2, col, 0.9);
        g.strokePoints(points, true);
        // 中心クロス
        g.lineStyle(1, col, 0.5);
        g.lineBetween(cx - r * 0.3, cy, cx + r * 0.3, cy);
        g.lineBetween(cx, cy - r * 0.3, cx, cy + r * 0.3);
    }

    _updateSymbolHp(hp) {
        this._symbolHp = hp;
        const o = this._symbolObj;
        if (!o) return;
        this._drawSymbolGfx(o.g, o.cx, o.cy, o.r, hp, SYMBOL_HP_MAX);
        const pct = Math.max(0, hp / SYMBOL_HP_MAX);
        o.hpBar.clear();
        o.hpBar.fillStyle(pct > 0.5 ? C_SYM : (pct > 0.25 ? 0xffaa44 : 0xff4444), 1);
        o.hpBar.fillRect(o.bx, o.by, o.barW * pct, o.barH);
        o.hpText.setText(`HP ${hp}`);
    }

    // ── 建物 ────────────────────────────────────────────────
    _buildBuildingsFromRoom(room) {
        const buildings = room.buildings || {};
        this._buildingIds = Object.keys(buildings);
        this._buildingIds.forEach((id, i) => {
            this._createBuildingObj(id, buildings[id], i);
        });
    }

    _createBuildingObj(id, bldg, index) {
        const lp = buildingLogicalPos(bldg, index);
        const cx = lp.x * S;
        const cy = lp.y * S;

        // building_tiles スプライト（32×32を2.2倍表示）
        const frame = BUILDING_FRAME_MAP[bldg.effect] ?? 0;
        const sprite = this.add.sprite(cx, cy, 'building_tiles', frame).setScale(2.2);
        sprite.setTint(bldg.controller === 'attacker' ? C_BLDG_ATK : C_BLDG_DEF);

        // HP バー（スプライト上に重ねる Graphics）
        const hpBarG = this.add.graphics();
        this._drawBuildingHpBar(hpBarG, cx, cy, bldg);

        const nameText = this.add.text(cx, cy - 38, bldg.name || id, {
            fontSize: '8px', color: '#ccddee', fontFamily: 'monospace'
        }).setOrigin(0.5, 1);

        const eff = EFFECT_LABELS[bldg.effect] || bldg.effect || '';
        const effectText = this.add.text(cx, cy + 22, eff, {
            fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5, 0);

        // タップ判定（スプライトの2倍サイズ弱で当たり判定）
        const hitArea = this.add.rectangle(cx, cy, 72, 72, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        hitArea.on('pointerup', () => this._onBuildingTap(id));

        this._buildingObjs[id] = { sprite, hpBarG, nameText, effectText, hitArea, cx, cy, index };
    }

    _drawBuildingHpBar(g, cx, cy, bldg) {
        g.clear();
        const maxHp = bldg.maxHp || 200;
        const curHp = bldg.currentHp ?? maxHp;
        const pct   = Math.max(0, curHp / maxHp);
        const barW  = 50;
        const barH  = 4;
        const barX  = cx - barW / 2;
        const barY  = cy - 42;
        g.fillStyle(0x222222, 0.85);
        g.fillRect(barX, barY, barW, barH);
        const col = pct > 0.5 ? 0x44dd44 : (pct > 0.25 ? 0xffaa22 : 0xff3333);
        g.fillStyle(col, 1);
        g.fillRect(barX, barY, barW * pct, barH);
    }

    _refreshBuildings(room) {
        const buildings = room.buildings || {};
        const activeEffects = room.activeEffects || [];
        const now = Date.now();

        this._buildingIds.forEach((id) => {
            const bldg = buildings[id];
            if (!bldg) return;
            const obj = this._buildingObjs[id];
            if (!obj) return;

            const captured     = bldg.controller === 'attacker';
            const isAutoFiring = activeEffects.some(
                (e) => e.buildingId === id && e.endsAt > now && e.autoFired
            );

            obj.sprite.setTint(isAutoFiring ? C_ACTIVE : (captured ? C_BLDG_ATK : C_BLDG_DEF));
            obj.sprite.setAlpha(isAutoFiring ? 1 : 0.92);
            this._drawBuildingHpBar(obj.hpBarG, obj.cx, obj.cy, bldg);
        });
    }

    // ── HUD 下部（アルカナバー + アクションボタン）──────────
    _buildHudBottom() {
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.75);
        bg.fillRect(0, PLAY_Y_END, CW, HUD_BOT_H);

        // アルカナバーラベル
        this.add.text(8, PLAY_Y_END + 8, 'ARCANA', {
            fontSize: '9px', color: '#aabbcc', fontFamily: 'monospace'
        });

        // アルカナバー背景 / フィル
        const barX  = 60;
        const barY  = PLAY_Y_END + 6;
        const barW  = 200;
        const barH  = 14;
        const barBg = this.add.graphics();
        barBg.fillStyle(0x223344, 1);
        barBg.fillRect(barX, barY, barW, barH);

        const barFill = this.add.graphics();
        barFill.fillStyle(0x9966ff, 1);

        const modeText = this.add.text(barX + barW + 6, barY + barH / 2, '', {
            fontSize: '10px', color: '#ffcc00', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 2
        }).setOrigin(0, 0.5);

        const label = this.add.text(barX + barW / 2, barY + barH / 2, `0 / ${ARCANA_COST}`, {
            fontSize: '9px', color: '#cccccc', fontFamily: 'monospace'
        }).setOrigin(0.5);

        this._arcanaBarObj = { barBg, barFill, modeText, label, barX, barY, barW, barH };

        // アクションボタン生成
        this._buildActionButtons();
    }

    _buildActionButtons() {
        const btnY = PLAY_Y_END + 38;
        const btnH = 34;

        // 建物説明テキスト（タップで攻撃/回収することを伝える）
        this.add.text(CW * 0.18, btnY, '建物をタップ\n→攻撃 / 回収', {
            fontSize: '9px', color: '#aabbcc', fontFamily: 'monospace', align: 'center'
        }).setOrigin(0.5);

        // シンボル攻撃ボタン（攻撃側のみ、アルカナMAX時に有効）
        this._makeButton('strike', CW * 0.5, btnY, 130, btnH, '⚡ シンボル攻撃', 0x551111, () => {
            this._doStrike();
        });

        // スキルパネルトグルボタン
        const skillBtn = this.add.text(CW - 8, PLAY_Y_END + 22, '🃏スキル', {
            fontSize: '10px', color: '#aaccff', fontFamily: 'monospace',
            backgroundColor: '#112233', padding: { x: 5, y: 3 }
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true }).setDepth(15);
        skillBtn.on('pointerup', () => this._toggleSkillPanel());

        this._refreshActionButtons();
    }

    _makeButton(key, cx, cy, w, h, label, color, onTap) {
        const bg = this.add.graphics();
        bg.fillStyle(color, 0.9);
        bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
        bg.lineStyle(1, 0xffffff, 0.3);
        bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);

        const lbl = this.add.text(cx, cy, label, {
            fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 1
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        lbl.on('pointerup', onTap);

        this._actionButtons[key] = { bg, lbl };
    }

    _refreshActionButtons() {
        const isAtk  = this._mySide === 'attacker';
        const inMode = this._myArcana >= ARCANA_COST;

        const strikeBtn = this._actionButtons['strike'];
        if (strikeBtn) {
            strikeBtn.bg.setAlpha(isAtk ? (inMode ? 1 : 0.3) : 0);
            strikeBtn.lbl.setAlpha(isAtk ? (inMode ? 1 : 0.3) : 0);
            strikeBtn.lbl.setStyle({ color: inMode ? '#ffff88' : '#888888' });
        }
        this._setSymbolReadyPulse(isAtk && inMode);
    }

    _setObjectiveHint(room) {
        if (!this._objectiveText) return;
        if (!room || room.status !== 'active') {
            this._objectiveText.setText('');
            this._objectiveText.setAlpha(0);
            return;
        }
        let text = '';
        if (this._mySide === 'attacker') {
            if (this._myArcana >= ARCANA_COST) {
                text = 'シンボルへ接近して「シンボル攻撃」';
            } else {
                const captured = Object.values(room.buildings || {}).filter((b) => b.controller === 'attacker').length;
                text = captured > 0
                    ? '占領済み建物でアルカナ回収 → シンボル攻撃'
                    : '建物を占領してアルカナ源を作る';
            }
        } else {
            const remainingMs = Math.max(0, Number(room.expiresAt || 0) - Date.now());
            const minutes = Math.ceil(remainingMs / 60000);
            text = `建物とシンボルを守る 残り約${minutes}分`;
        }
        this._objectiveText.setText(text);
        this._objectiveText.setAlpha(1);
    }

    _showArcanaReady() {
        const sx = this._myShip?.x ?? CW / 2;
        const sy = this._myShip?.y ?? PLAY_Y_END / 2;
        this._flashScreen(0xffcc00, 0.22);
        this._showSkillEffect('⚡', sx, sy, { count: 5, flash: false, big: true });
        this._showToast('アルカナモード！ シンボルを叩け', '#ffdd66');
        this._showActionLine(sx, sy, SYM_LX * S, SYM_LY * S, 0xffcc00, 'TARGET');
    }

    _setSymbolReadyPulse(enabled) {
        const o = this._symbolObj;
        if (!o || !this._modePromptText) return;
        this._modePromptText.setText(enabled ? '攻撃可能' : '');
        this._modePromptText.setAlpha(enabled ? 1 : 0);
        if (enabled && !this._symbolPulseTween) {
            this._symbolPulseTween = this.tweens.add({
                targets: [o.g, o.hpText, this._modePromptText],
                scaleX: 1.08,
                scaleY: 1.08,
                alpha: 0.72,
                duration: 520,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else if (!enabled && this._symbolPulseTween) {
            this._symbolPulseTween.stop();
            this._symbolPulseTween = null;
            [o.g, o.hpText, this._modePromptText].forEach((target) => {
                target.setScale?.(1);
                if (target === this._modePromptText) target.setAlpha(0);
                else target.setAlpha?.(1);
            });
        }
    }

    // ── アクション ──────────────────────────────────────────
    async _doStrike() {
        if (this._myArcana < ARCANA_COST) return;
        // シンボルへの距離チェック（120px以内）
        const distToSymbol = Math.hypot(this._playerX - SYM_LX, this._playerY - SYM_LY);
        if (distToSymbol > BUILDING_INTERACT_RANGE) {
            this._showToast('シンボルに近づいてください', '#ffaa44');
            return;
        }
        const res = await this._client?.tryStrikeSymbol();
        if (res?.damage) this._showDamageText(res.damage, SYM_LX * S, SYM_LY * S);
        if (res?.error)  this._showToast(res.error, '#ff8888');
    }

    // 建物タップ: 攻撃側 → 守備中なら攻撃、占領済みならアルカナ回収
    async _onBuildingTap(buildingId) {
        if (this._mySide !== 'attacker') return;
        if (!this._isAlive) return;
        const bldg = this._roomData?.buildings?.[buildingId];
        if (!bldg) return;

        // 距離チェック（x/y 未定義の場合フォールバック座標を参照）
        const bldgIndex = this._buildingIds.indexOf(buildingId);
        const lp   = buildingLogicalPos(bldg, bldgIndex);
        const dist = Math.hypot(this._playerX - lp.x, this._playerY - lp.y);
        if (dist > BUILDING_INTERACT_RANGE) {
            this._showToast('建物に近づいてください', '#ffaa44');
            return;
        }

        if (bldg.controller === 'attacker') {
            // 占領済み → アルカナ回収
            const res = await this._client?.tryCollectArcana(buildingId);
            if (res?.arcanaGain) this._showToast(`アルカナ +${res.arcanaGain}`);
            else if (res?.error) this._showToast(res.error, '#ff8888');
        } else {
            // 守備側保持 → 攻撃（50ダメージ）
            const res = await this._client?.tryDamageBuilding(buildingId, 50);
            if (res?.captured) {
                this._showToast(`${bldg.name} 占領！`, '#ffaa44');
            } else if (res?.newHp !== undefined) {
                this._showDamageText(50, bldg.x ? bldg.x * S : 0, bldg.y ? bldg.y * S : 0);
            }
            if (res?.error) this._showToast(res.error, '#ff8888');
        }
    }

    // ── アルカナバー更新 ────────────────────────────────────
    _updateArcanaBar(charge, inMode) {
        const wasInMode = this._lastArcanaMode;
        this._myArcana     = charge;
        this._myArcanaMode = inMode;
        this._lastArcanaMode = !!inMode;
        const o = this._arcanaBarObj;
        if (!o) return;

        const pct = Math.min(1, charge / ARCANA_COST);
        o.barFill.clear();
        const col = inMode ? 0xffcc00 : 0x9966ff;
        o.barFill.fillStyle(col, 1);
        o.barFill.fillRect(o.barX, o.barY, o.barW * pct, o.barH);

        o.label.setText(`${charge} / ${ARCANA_COST}`);
        o.modeText.setText(inMode ? '⚡MODE!' : '');
        if (inMode && !wasInMode && this._mySide === 'attacker') {
            this._showArcanaReady();
        }

        this._refreshActionButtons();
    }

    // ── ルーム状態ハンドラ ──────────────────────────────────
    _handleRoomState(room) {
        this._roomData = room;

        // 建物が未生成なら生成
        if (this._buildingIds.length === 0 && room.buildings) {
            this._buildBuildingsFromRoom(room);
        }

        // シンボル HP
        if (room.symbolHp !== undefined) {
            this._updateSymbolHp(room.symbolHp);
        }

        // 建物の活性状態
        this._refreshBuildings(room);

        // 自分のアルカナ状態 + HP + リスポーン
        const me = this._client?.getMyArcanaState();
        if (me) {
            this._updateArcanaBar(me.arcanaCharge ?? 0, me.arcanaMode ?? false);
            this._handleRespawnState(me);
        }
        this._setObjectiveHint(room);

        // プレイヤースプライト
        const all = [
            ...(room.attackers || []).map((p) => ({ ...p, side: 'attacker' })),
            ...(room.defenders || []).map((p) => ({ ...p, side: 'defender' }))
        ];
        this._renderPlayers(all);

        // ステータス + タイマー
        if (room.status === 'active') {
            const sideLabel = this._mySide === 'attacker' ? '⚔攻撃側' : '🛡守備側';
            this._statusText?.setText(`${sideLabel} | ${room.territoryName || ''}`);
            this._startTimer(room.createdAt);
        } else if (room.status === 'resolved') {
            const winner = room.winner === 'attacker' ? '攻撃側の勝利' : '防衛側の勝利';
            this._statusText?.setText(`終了 — ${winner}`);
            this._stopTimer();
            this._showResultOverlay(room);
        } else {
            this._statusText?.setText('準備中...');
        }
    }

    // ── プレイヤースプライト ────────────────────────────────
    _renderPlayers(players) {
        const seen = new Set();
        players.forEach((p, i) => {
            if (p.playFabId === this._myPlayFabId) return; // 自分は _myShip で管理
            seen.add(p.playFabId);
            const lx = p.side === 'attacker' ? ATK_SPAWN_LX : DEF_SPAWN_LX;
            const ly = SPAWN_LY + (i - (players.length / 2)) * 60;
            const cx = lx * S;
            const cy = ly * S;

            if (!this._playerSprites[p.playFabId]) {
                this._playerSprites[p.playFabId] = this._makePlayerSprite(cx, cy, p.side, p.displayName, false);
            }
        });
        Object.keys(this._playerSprites).forEach((id) => {
            if (!seen.has(id)) {
                const s = this._playerSprites[id];
                s?.sprite?.destroy(); s?.ring?.destroy(); s?.label?.destroy();
                delete this._playerSprites[id];
            }
        });
    }

    _makePlayerSprite(cx, cy, side, name, isMe) {
        const key = side === 'attacker' ? 'ship_sprite_red' : 'ship_sprite_blue';
        const sprite = this.add.sprite(cx, cy, key, 1).setScale(isMe ? 1.6 : 1.2);

        // 自分は白リングを追加
        const ring = this.add.graphics();
        if (isMe) {
            ring.lineStyle(2, 0xffffff, 0.85);
            ring.strokeCircle(cx, cy, 28);
        }

        const label = this.add.text(cx, cy - 30, name || '', {
            fontSize: '8px', color: isMe ? '#ffffff' : '#aaaaaa', fontFamily: 'monospace'
        }).setOrigin(0.5);

        return { sprite, ring, label, cx, cy };
    }

    // ── NPC スプライト ──────────────────────────────────────
    _renderNpcs(npcStates) {
        const seen = new Set();
        Object.values(npcStates).forEach((npc) => {
            seen.add(npc.id);
            if (!npc.alive) {
                if (this._npcSprites[npc.id]) {
                    this._npcSprites[npc.id].sprite?.destroy();
                    this._npcSprites[npc.id].hpBarG?.destroy();
                    delete this._npcSprites[npc.id];
                }
                return;
            }

            const key = npc.side === 'attacker' ? 'ship_sprite_red' : 'ship_sprite_blue';
            const nx = npc.x * S;
            const ny = npc.y * S;

            if (!this._npcSprites[npc.id]) {
                const sprite = this.add.sprite(nx, ny, key, 1).setScale(0.9).setAlpha(0.85);
                const hpBarG = this.add.graphics();
                this._npcSprites[npc.id] = { sprite, hpBarG };
            }

            const { sprite, hpBarG } = this._npcSprites[npc.id];
            sprite.setPosition(nx, ny);

            // アルカナモード中は黄金色に
            const inMode = npc.arcanaCharge >= ARCANA_COST;
            sprite.setTint(inMode ? 0xffcc00 : 0xffffff);

            // HP バー
            const hpRatio = Math.max(0, npc.hp / npc.maxHp);
            const color = npc.side === 'attacker' ? C_ATK : C_DEF;
            hpBarG.clear();
            hpBarG.fillStyle(0x222222, 0.7);
            hpBarG.fillRect(nx - HP_BAR_W / 2, ny + 18, HP_BAR_W, HP_BAR_H);
            hpBarG.fillStyle(color, 1);
            hpBarG.fillRect(nx - HP_BAR_W / 2, ny + 18, HP_BAR_W * hpRatio, HP_BAR_H);
        });

        Object.keys(this._npcSprites).forEach((id) => {
            if (!seen.has(id)) {
                this._npcSprites[id]?.sprite?.destroy();
                this._npcSprites[id]?.hpBarG?.destroy();
                delete this._npcSprites[id];
            }
        });
    }

    // ── イベントハンドラ ────────────────────────────────────
    _handleEvent(ev) {
        if (ev.type === 'arcana_collected') {
            this._showToast(`アルカナ +${ev.arcanaGain ?? '?'}`, '#aaffaa');
        }
        if (ev.type === 'building_damaged') {
            const obj = this._buildingObjs[ev.buildingId];
            if (obj) {
                this._showActionLine(this._myShip?.x ?? obj.cx, this._myShip?.y ?? obj.cy, obj.cx, obj.cy, 0xff8844);
            }
            if (ev.captured) {
                const bldg = this._roomData?.buildings?.[ev.buildingId];
                this._showToast(`${bldg?.name || ev.buildingId} 占領！`, '#ffaa44');
                if (obj) this._showSkillEffect('旗', obj.cx, obj.cy, { count: 2, flash: true, flashColor: 0xffaa44 });
            }
        }
        if (ev.type === 'auto_fire') {
            const eff = EFFECT_LABELS[ev.effect] || ev.effect;
            this._showToast(`【自動】${eff} 発動！`, '#88ccff');
            const obj = this._buildingObjs[ev.buildingId];
            if (obj) {
                const tx = this._mySide === 'attacker' ? (this._myShip?.x ?? CW / 2) : SYM_LX * S;
                const ty = this._mySide === 'attacker' ? (this._myShip?.y ?? PLAY_Y_END / 2) : SYM_LY * S;
                this._showActionLine(obj.cx, obj.cy, tx, ty, 0x88ccff, eff);
                this._showSkillEffect('✦', obj.cx, obj.cy, { count: 3, flash: true, flashColor: 0x88ccff });
            }
        }
        if (ev.type === 'symbol_struck') {
            this._showDamageText(ev.damage, SYM_LX * S, SYM_LY * S);
            this._shakeSymbol();
            this._showActionLine(this._myShip?.x ?? CW / 2, this._myShip?.y ?? PLAY_Y_END / 2, SYM_LX * S, SYM_LY * S, 0xffcc00, 'HIT');
        }
        if (ev.type === 'player_killed') {
            if (ev.killerPlayFabId === this._myPlayFabId) {
                this._showToast(`キル！ アルカナ +${ev.transferred}`, '#ffcc00');
            } else if (ev.killedPlayFabId === this._myPlayFabId) {
                this._showToast('撃沈... リスポーン待機', '#ff6666');
            }
        }
        if (ev.type === 'battle_resolved') {
            const winner = ev.winner === 'attacker' ? '攻撃側の勝利！' : '防衛側の勝利！';
            this._showToast(winner, ev.winner === 'attacker' ? '#ff8888' : '#88aaff');
        }
        if (ev.type === 'player_joined') {
            this._showToast(`${ev.displayName || '誰か'} が参戦！`);
        }
    }

    _showDamageText(damage, x, y) {
        const raw = String(damage);
        const isHeal = raw.startsWith('+');
        const t = this.add.text(x, y - 10, isHeal ? raw : `-${damage}`, {
            fontSize: '18px', color: isHeal ? '#44ff88' : '#ff4444', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);
        this.tweens.add({ targets: t, y: y - 55, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
    }

    // ── スキルヒットエフェクト ─────────────────────────────────────
    // emoji  : 表示する絵文字文字列
    // x, y   : 発生座標（描画座標系）
    // opts   : { count=1, flash=false, flashColor=0xffffff,
    //           rotate=false, slow=false, big=false }
    _showSkillEffect(emoji, x, y, {
        count = 1, flash = false, flashColor = 0xffffff,
        rotate = false, slow = false, big = false
    } = {}) {
        const fontSize  = big ? '28px' : '20px';
        const baseScale = big ? 1.8 : 1.4;
        const dur       = slow ? 1600 : 800;

        for (let i = 0; i < count; i++) {
            const delay  = i * 75;
            const angle  = count > 1
                ? (i / count) * Math.PI * 2 - Math.PI / 2
                : -Math.PI / 2;
            const spread = count > 1 ? 28 + Math.random() * 18 : 0;
            const destX  = x + Math.cos(angle) * spread + (Math.random() - 0.5) * 10;
            const destY  = y + Math.sin(angle) * spread - (slow ? 25 : 55);

            const t = this.add.text(x, y, emoji, {
                fontSize, fontFamily: 'Arial'
            }).setOrigin(0.5).setDepth(50).setScale(baseScale);

            // 1個目だけスケールパンチ（ドン）
            if (i === 0) {
                this.tweens.add({
                    targets: t,
                    scaleX: baseScale * 1.4, scaleY: baseScale * 1.4,
                    duration: 70, yoyo: true, ease: 'Sine.easeOut'
                });
            }

            // 浮き上がり＋フェード
            this.tweens.add({
                targets: t,
                x: destX, y: destY,
                scaleX: 0.5, scaleY: 0.5,
                alpha: 0,
                angle: rotate ? (i % 2 === 0 ? 270 : -270) : 0,
                duration: dur,
                delay,
                ease: slow ? 'Sine.easeOut' : 'Cubic.easeOut',
                onComplete: () => t.destroy()
            });
        }

        if (flash) this._flashScreen(flashColor);
    }

    _showActionLine(fromX, fromY, toX, toY, color = 0xffffff, label = '') {
        const line = this.add.graphics().setDepth(45);
        line.lineStyle(3, color, 0.9);
        line.beginPath();
        line.moveTo(fromX, fromY);
        line.lineTo(toX, toY);
        line.strokePath();

        const dx = toX - fromX;
        const dy = toY - fromY;
        const angle = Math.atan2(dy, dx);
        const arrowX = toX - Math.cos(angle) * 14;
        const arrowY = toY - Math.sin(angle) * 14;
        line.fillStyle(color, 0.95);
        line.fillTriangle(
            toX, toY,
            arrowX + Math.cos(angle + Math.PI / 2) * 6, arrowY + Math.sin(angle + Math.PI / 2) * 6,
            arrowX + Math.cos(angle - Math.PI / 2) * 6, arrowY + Math.sin(angle - Math.PI / 2) * 6
        );

        let text = null;
        if (label) {
            text = this.add.text((fromX + toX) / 2, (fromY + toY) / 2 - 12, label, {
                fontSize: '10px',
                color: '#ffffff',
                fontFamily: 'monospace',
                backgroundColor: '#00000099',
                padding: { x: 4, y: 2 },
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setDepth(46);
        }

        this.tweens.add({
            targets: text ? [line, text] : line,
            alpha: 0,
            duration: 850,
            ease: 'Sine.easeOut',
            onComplete: () => {
                line.destroy();
                text?.destroy();
            }
        });
    }

    // 画面全体を一瞬光らせる
    _flashScreen(color = 0xffffff, alpha = 0.28) {
        const rect = this.add.rectangle(CW / 2, CH / 2, CW, CH, color, alpha).setDepth(60);
        this.tweens.add({
            targets: rect, alpha: 0, duration: 220,
            ease: 'Linear', onComplete: () => rect.destroy()
        });
    }

    _shakeSymbol() {
        const o = this._symbolObj;
        if (!o) return;
        this.tweens.add({
            targets: [o.g, o.hpBar, o.hpBarBg, o.hpText],
            x: '+=6', duration: 60, yoyo: true, repeat: 3
        });
    }

    _showToast(msg, color = '#ffffff') {
        const t = this.add.text(CW / 2, PLAY_Y_END - 20, msg, {
            fontSize: '11px', color, fontFamily: 'monospace',
            backgroundColor: '#00000099', padding: { x: 8, y: 4 }
        }).setOrigin(0.5);
        this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 700, onComplete: () => t.destroy() });
    }

    _showResultOverlay(room) {
        if (this._resultOverlay || !room) return;
        this._setSymbolReadyPulse(false);
        const attackerWon = room.winner === 'attacker';
        const myWon = (attackerWon && this._mySide === 'attacker') || (!attackerWon && this._mySide === 'defender');
        const symbolHp = Math.max(0, Math.floor(Number(room.symbolHp ?? 0)));
        const maxHp = Math.max(1, Number(room.symbolHpMax || SYMBOL_HP_MAX));
        const damage = Math.max(0, maxHp - symbolHp);
        const captured = Object.values(room.buildings || {}).filter((b) => b.controller === 'attacker').length;
        const total = Object.keys(room.buildings || {}).length;

        const shade = this.add.rectangle(CW / 2, CH / 2, CW, CH, 0x000000, 0.68).setDepth(80);
        const panel = this.add.rectangle(CW / 2, CH / 2, 360, 210, 0x101827, 0.96).setDepth(81);
        panel.setStrokeStyle(2, attackerWon ? 0xff7777 : 0x88aaff, 0.9);

        const title = this.add.text(CW / 2, CH / 2 - 76, myWon ? '勝利' : '敗北', {
            fontSize: '28px',
            color: myWon ? '#ffdd66' : '#cbd5e1',
            fontFamily: 'monospace',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(82);

        const sub = this.add.text(CW / 2, CH / 2 - 42, attackerWon ? '攻撃側が領海を制圧' : '防衛側が守り切った', {
            fontSize: '13px',
            color: attackerWon ? '#ff9999' : '#99bbff',
            fontFamily: 'monospace'
        }).setOrigin(0.5).setDepth(82);

        const stats = this.add.text(CW / 2, CH / 2 + 4,
            `シンボル被害 ${damage} / ${maxHp}\n占領建物 ${captured} / ${total}\n報酬と領海状況はバトルタブで確認`,
            {
                fontSize: '12px',
                color: '#e5e7eb',
                fontFamily: 'monospace',
                align: 'center',
                lineSpacing: 6
            }
        ).setOrigin(0.5).setDepth(82);

        const btn = this.add.text(CW / 2, CH / 2 + 78, '閉じる', {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: 'monospace',
            backgroundColor: '#334155',
            padding: { x: 22, y: 7 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(83);

        const objs = [shade, panel, title, sub, stats, btn];
        btn.on('pointerup', () => {
            objs.forEach((obj) => obj.destroy());
            this._resultOverlay = null;
        });
        this._resultOverlay = objs;
        this._flashScreen(myWon ? 0xffcc00 : 0x88aaff, 0.16);
    }

    // ── タイマー ────────────────────────────────────────────
    _startTimer(createdAt) {
        if (this._timerInterval) return;
        this._timerInterval = setInterval(() => {
            const elapsed   = Date.now() - createdAt;
            const remaining = Math.max(0, 10 * 60 * 1000 - elapsed);
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            this._timerText?.setText(`${m}:${String(s).padStart(2, '0')}`);
            if (remaining === 0) this._stopTimer();
        }, 1000);
    }

    _stopTimer() {
        if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
    }

    // ── update ループ ────────────────────────────────────────
    update() {
        if (!this._myShip) return;
        this._playerX = this._myShip.x / S;
        this._playerY = this._myShip.y / S;
        if (!this._isAlive) return;

        // 近接UI更新は100ms毎に抑制
        const now = Date.now();
        if (now - this._proximityLastMs < 100) return;
        this._proximityLastMs = now;

        // スロー期限切れ
        if (now >= this._mySlowUntil && this._mySpeedMult !== 1.0 && now >= this._myStunnedUntil) {
            this._mySpeedMult = 1.0;
        }
        // ステルス期限切れ
        if (this._myStealthUntil && now >= this._myStealthUntil) {
            this._myShip?.setAlpha(1.0);
            this._myStealthUntil = 0;
        }

        this._updateProximityUI();
    }

    // ── タップ移動 ───────────────────────────────────────────
    _movePlayerTo(lx, ly) {
        if (!this._myShip) return;
        const now = Date.now();
        if (now < this._myStunnedUntil || now < this._myDriftUntil) {
            this._showToast('行動不能！', '#ffaaff');
            return;
        }
        const tx = lx * S;
        const ty = ly * S;
        const dist = Phaser.Math.Distance.Between(this._myShip.x, this._myShip.y, tx, ty);
        if (dist < 5) return;

        if (this._moveTween) { this._moveTween.stop(); this._moveTween = null; }

        const effectiveSpeed = PLAYER_SPEED * (this._mySpeedMult || 1.0);
        const duration = (dist / (effectiveSpeed * S)) * 1000;

        this._moveTween = this.tweens.add({
            targets: this._myShip,
            x: tx, y: ty,
            duration,
            ease: 'Linear',
            onUpdate: () => this._moveMyShipGraphicsTo(this._myShip.x, this._myShip.y),
            onComplete: () => { this._moveTween = null; },
        });

        // タップ時に目的地を1回だけ送信
        // 受信側が同じ速度でtweenするため見た目はスムーズに一致する
        this._client?.updateMyPosition(lx, ly);
    }

    // ── 近接UI更新（建物ハイライト・攻撃ボタン） ──────────
    _updateProximityUI() {
        const buildings = this._roomData?.buildings || {};

        // 建物ハイライト
        this._buildingIds.forEach((id, idx) => {
            const bldg = buildings[id];
            const obj  = this._buildingObjs[id];
            if (!bldg || !obj) return;
            // x/y が未定義の場合はフォールバック座標を使う
            const lp = buildingLogicalPos(bldg, idx);
            const d  = Math.hypot(this._playerX - lp.x, this._playerY - lp.y);
            const inRange = d <= BUILDING_INTERACT_RANGE;
            obj.sprite.setAlpha(inRange ? 1.0 : 0.55);
        });

        // 近くの敵プレイヤーを検索して攻撃ボタン更新
        const nearestEnemy = this._findNearestEnemy();
        this._refreshAttackButton(nearestEnemy);
    }

    _findNearestEnemy() {
        const room = this._roomData;
        if (!room || !this._mySide) return null;

        const enemies = this._mySide === 'attacker'
            ? (room.defenders || []).filter((p) => !p.isNpc && p.alive !== false)
            : (room.attackers || []).filter((p) => !p.isNpc && p.alive !== false);

        let nearest = null;
        let nearestDist = PLAYER_ATTACK_RANGE;

        enemies.forEach((p) => {
            const pos = this._client?.otherPositions?.[p.playFabId];
            if (!pos) return;
            const d = Math.hypot(this._playerX - pos.x, this._playerY - pos.y);
            if (d < nearestDist) { nearestDist = d; nearest = p; }
        });

        return nearest;
    }

    _refreshAttackButton(enemy) {
        const show = !!enemy && this._isAlive;

        if (!show) {
            if (this._attackBtn) {
                this._attackBtn.bg.setAlpha(0);
                this._attackBtn.lbl.setAlpha(0);
            }
            return;
        }

        if (!this._attackBtn) {
            const btnY = PLAY_Y_END + 55;
            const bg = this.add.graphics().setDepth(20);
            const lbl = this.add.text(CW * 0.72, btnY, '⚔ 攻撃', {
                fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
                stroke: '#000000', strokeThickness: 1,
            }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(20);
            lbl.on('pointerup', () => {
                if (this._attackBtn?.targetId) this._doAttackPlayer(this._attackBtn.targetId);
            });
            this._attackBtn = { bg, lbl, targetId: null };
        }

        const onCt  = Date.now() < this._attackCooldownUntil;
        const remain = onCt ? Math.ceil((this._attackCooldownUntil - Date.now()) / 1000) : 0;
        const btnY  = PLAY_Y_END + 55;
        const color = onCt ? 0x555555 : 0xaa2222;

        this._attackBtn.bg.clear();
        this._attackBtn.bg.fillStyle(color, 0.95);
        this._attackBtn.bg.fillRoundedRect(CW * 0.72 - 55, btnY - 17, 110, 34, 6);
        this._attackBtn.bg.lineStyle(1, onCt ? 0x888888 : 0xff8888, 0.5);
        this._attackBtn.bg.strokeRoundedRect(CW * 0.72 - 55, btnY - 17, 110, 34, 6);

        this._attackBtn.targetId = enemy.playFabId;
        this._attackBtn.bg.setAlpha(1);
        this._attackBtn.lbl.setAlpha(1);
        this._attackBtn.lbl.setText(onCt
            ? `CT ${remain}秒`
            : `⚔ ${enemy.displayName || '敵'} を攻撃`);
        this._attackBtn.lbl.setStyle({ color: onCt ? '#888888' : '#ffffff' });
    }

    async _doAttackPlayer(targetId) {
        if (Date.now() < this._attackCooldownUntil) return;
        const res = await this._client?.tryAttackPlayer(targetId);
        if (!res) return;
        if (res.error) { this._showToast(res.error, '#ff8888'); return; }
        // クライアント側CT開始（サーバーと同じ5秒）
        this._attackCooldownUntil = Date.now() + 5000;
        // 命中エフェクト（敵スプライト位置 or 自分位置）
        const hitSprite = this._playerSprites[targetId]?.sprite;
        const hx = hitSprite?.x ?? CW / 2;
        const hy = hitSprite?.y ?? PLAY_Y_END / 2;
        if (res.killed) {
            this._showSkillEffect('💥', hx, hy, { count: 4, flash: true, flashColor: 0xff4400, big: true });
            this._showToast(`撃沈！ アルカナ +${res.transferred}`, '#ffcc00');
            // 死神パッシブ: キル後に次スキルのCTを即リセット
            if (this._hasPassive('on_kill_ct_reset')) {
                this._skillData.forEach((sk) => setSkillCooldown(sk.cardItemId, 0));
                this._refreshSkillSlots();
                this._showSkillEffect('💀✨', this._myShip?.x ?? 400, this._myShip?.y ?? 400, {});
            }
        } else {
            this._showSkillEffect('⚔️', hx, hy, { count: 2, flash: true });
        }
        this._showToast(`攻撃！ ${res.damage}ダメージ`, '#ffcc66');
    }

    // ── 他プレイヤーの位置変化ハンドラ ──────────────────────
    _onPositionsUpdate(poses) {
        Object.entries(poses).forEach(([pid, pos]) => {
            const obj = this._playerSprites[pid];
            if (!obj) return;
            const tx = pos.x * S;
            const ty = pos.y * S;

            // 前のtweenを停止してから新しいtweenを開始（二重走行防止）
            if (this._playerTweens[pid]) {
                this._playerTweens[pid].stop();
                this._playerTweens[pid] = null;
            }

            // 距離÷速度でduration計算 → 送信側の動きと自然に一致
            const dist2 = Phaser.Math.Distance.Between(obj.sprite.x, obj.sprite.y, tx, ty);
            const duration = Math.max(80, (dist2 / (PLAYER_SPEED * S)) * 1000);

            this._playerTweens[pid] = this.tweens.add({
                targets: obj.sprite,
                x: tx, y: ty,
                duration,
                ease: 'Linear',
                onUpdate: () => {
                    obj.ring?.setPosition(obj.sprite.x, obj.sprite.y);
                    obj.label?.setPosition(obj.sprite.x, obj.sprite.y - 30);
                },
                onComplete: () => { this._playerTweens[pid] = null; },
            });
        });
    }

    // ── HP更新 ──────────────────────────────────────────────
    _updateMyHp(current, max) {
        this._myHp    = current;
        this._myMaxHp = max || this._myMaxHp;
        this._drawMyHpBar();
    }

    // ── リスポーン処理 ───────────────────────────────────────
    _handleRespawnState(player) {
        if (player.alive !== false) {
            // 生存中
            if (!this._isAlive) {
                // リスポーン復活
                this._isAlive = true;
                this._respawnText?.destroy(); this._respawnText = null;
                const spawnX = this._mySide === 'attacker' ? ATK_SPAWN_LX : DEF_SPAWN_LX;
                const cx = spawnX * S;
                const cy = SPAWN_LY * S;
                this._myShip?.setPosition(cx, cy).setAlpha(1);
                this._moveMyShipGraphicsTo(cx, cy);
                this._playerX = spawnX;
                this._playerY = SPAWN_LY;
            }
            this._updateMyHp(player.currentPlayerHp ?? player.playerHp ?? PLAYER_HP_DEFAULT, player.playerHp ?? PLAYER_HP_DEFAULT);
            return;
        }

        // 撃沈中
        this._isAlive   = false;
        this._respawnAt = player.respawnAt || null;
        this._myShip?.setAlpha(0.2);
        this._updateMyHp(0, this._myMaxHp);

        // リスポーンカウントダウン
        if (!this._respawnText) {
            this._respawnText = this.add.text(CW / 2, PLAY_Y_END / 2, '', {
                fontSize: '20px', color: '#ff6666', fontFamily: 'monospace',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(50);
        }

        const tick = () => {
            if (!this._respawnAt || this._isAlive) return;
            const remain = Math.max(0, Math.ceil((this._respawnAt - Date.now()) / 1000));
            if (this._respawnText) this._respawnText.setText(`撃沈... ${remain}秒後にリスポーン`);
            if (remain <= 0) {
                this._client?.tryRespawn();
            }
        };
        tick();
        if (!this._respawnTimer) {
            this._respawnTimer = this.time.addEvent({ delay: 1000, repeat: 12, callback: tick });
        }
    }

    // ── 大アルカナパッシブ ────────────────────────────────────
    async _loadArcanaPassives() {
        if (!this._myNation) return;
        try {
            const res = await fetch(`/api/weekly-contest/passives/${this._myNation}`);
            if (!res.ok) return;
            const { passives } = await res.json();
            if (Array.isArray(passives)) this._applyArcanaPassives(passives);
        } catch { /* パッシブなしでバトル続行 */ }
    }

    _applyArcanaPassives(passives) {
        this._arcanaPassives = passives;

        for (const p of passives) {
            switch (p.effect) {
                case 'move_speed_boost':
                    this._arcanaSpeedBoost = p.value || 0;
                    break;
                case 'opening_stun':
                    // バトル開始時に敵1名をスタン → 少し遅延して発動
                    this.time.delayedCall(500, () => this._triggerOpeningStun(p.duration || 2000));
                    break;
                case 'periodic_heal': {
                    const interval = p.interval || 30000;
                    const healPct  = p.value || 0.05;
                    const id = setInterval(() => {
                        if (!this._isAlive || Date.now() < this._myHealBlockUntil) return;
                        const heal = Math.floor(this._myMaxHp * healPct);
                        this._updateMyHp(Math.min(this._myMaxHp, this._myHp + heal), this._myMaxHp);
                        const sx = this._myShip?.x ?? 400;
                        const sy = this._myShip?.y ?? 400;
                        this._showSkillEffect('⭐', sx, sy, { slow: true });
                    }, interval);
                    this._arcanaPassiveTimers.push(id);
                    break;
                }
                case 'random_buff_on_start':
                    this.time.delayedCall(800, () => this._triggerRandomBuff());
                    break;
            }
        }

        // 速度反映（デバフがない状態）
        if (this._arcanaSpeedBoost > 0 && this._mySpeedMult >= 1.0) {
            this._mySpeedMult = 1.0 + this._arcanaSpeedBoost;
        }
    }

    _hasPassive(effect) {
        return this._arcanaPassives.some((p) => p.effect === effect);
    }

    _getPassiveValue(effect, fallback = 0) {
        const p = this._arcanaPassives.find((pp) => pp.effect === effect);
        return p ? (p.value ?? fallback) : fallback;
    }

    // 開幕スタン（塔パッシブ）
    _triggerOpeningStun(durationMs) {
        const enemies = this._getEnemyIds();
        if (!enemies.length) return;
        const targetId = enemies[Math.floor(Math.random() * enemies.length)];
        const spr = this._playerSprites[targetId];
        if (spr) this._showSkillEffect('⚡', spr.sprite.x, spr.sprite.y, { flash: true, flashColor: 0xffffaa });
        // 自国バトルルームへの通知は今後の課題 - クライアント側では視覚エフェクトのみ
    }

    // ランダムバフ（愚者パッシブ）
    _triggerRandomBuff() {
        const buffs = ['speed', 'atk', 'heal'];
        const pick  = buffs[Math.floor(Math.random() * buffs.length)];
        const sx    = this._myShip?.x ?? 400;
        const sy    = this._myShip?.y ?? 400;
        switch (pick) {
            case 'speed':
                this._mySpeedMult = Math.max(this._mySpeedMult, 1.3);
                this._mySlowUntil = Date.now() + 10000;
                this._showSkillEffect('🃏💨', sx, sy, { flash: true });
                break;
            case 'atk':
                // 攻撃バフはフラグで管理
                this._myFoolAtkBoost   = true;
                this._myFoolAtkExpires = Date.now() + 10000;
                this._showSkillEffect('🃏⚔️', sx, sy, { flash: true });
                break;
            case 'heal':
                this._updateMyHp(Math.min(this._myMaxHp, this._myHp + Math.floor(this._myMaxHp * 0.1)), this._myMaxHp);
                this._showSkillEffect('🃏💚', sx, sy, { flash: true });
                break;
        }
    }

    // ── 船スキル初期化 ────────────────────────────────────────
    async _initShipSkills() {
        let skills = getCachedSkillData();
        if (!skills) {
            try {
                const res = await fetch('/api/ship-skill-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playFabId: this._myPlayFabId })
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.skills) && data.skills.length) {
                    setCachedSkillData(data.skills);
                    skills = data.skills;
                }
            } catch { return; }
        }
        if (skills?.length) {
            this._skillData = mergeWithLocalCt(skills);
            this._buildSkillPanel();
        }
    }

    // ── スキルパネルUI ────────────────────────────────────────
    _buildSkillPanel() {
        if (!this._skillData.length) return;
        const NUM     = Math.min(5, this._skillData.length);
        const PANEL_H = 78;
        const panelY  = PLAY_Y_END - PANEL_H - 4;
        const SLOT_W  = Math.floor((CW - 20 - (NUM - 1) * 6) / NUM);
        const SLOT_H  = 62;

        const panelBg = this.add.graphics().setDepth(30);
        panelBg.fillStyle(0x000000, 0.92);
        panelBg.fillRect(0, panelY, CW, PANEL_H);
        panelBg.lineStyle(1, 0x334455, 0.9);
        panelBg.strokeRect(0, panelY, CW, PANEL_H);

        const closeBtn = this.add.text(CW - 6, panelY + 4, '✕', {
            fontSize: '11px', color: '#aaaaaa', fontFamily: 'monospace',
            backgroundColor: '#00000088', padding: { x: 3, y: 1 }
        }).setOrigin(1, 0).setDepth(32).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerup', () => this._toggleSkillPanel());

        const slotObjs = this._skillData.slice(0, NUM).map((skill, i) => {
            const sx = 10 + i * (SLOT_W + 6);
            const sy = panelY + 8;
            return this._buildSkillSlot(sx, sy, SLOT_W, SLOT_H, skill);
        });

        this._skillPanelObjs = { panelBg, closeBtn, slotObjs };
        this._setSkillPanelVisible(false);
        this._startSkillCtTimer();
    }

    _buildSkillSlot(sx, sy, w, h, skill) {
        const isReady = isSkillReady(skill.cardItemId);
        const remain  = getSkillRemainingSec(skill.cardItemId);
        const bgCol   = isReady ? 0x112233 : 0x0a0f14;
        const bdCol   = isReady ? 0x88ccff : 0x334455;

        const bg = this.add.graphics().setDepth(31);
        this._drawSkillSlotBg(bg, sx, sy, w, h, bgCol, bdCol);

        const ELEM_COLOR = { fire: '#ff8866', water: '#88ccff', wind: '#aaffaa', earth: '#ddbb88' };
        const nameTxt = this.add.text(sx + w / 2, sy + 6, skill.skillName || '?', {
            fontSize: '8px', color: isReady ? '#ddeeee' : '#556677', fontFamily: 'monospace'
        }).setOrigin(0.5, 0).setDepth(32);
        const elemTxt = this.add.text(sx + w / 2, sy + 22, skill.element || '', {
            fontSize: '8px', color: ELEM_COLOR[skill.element] || '#aaaaaa', fontFamily: 'monospace'
        }).setOrigin(0.5, 0).setDepth(32);
        const ctTxt = this.add.text(sx + w / 2, sy + h - 16, isReady ? 'READY' : `CT ${remain}s`, {
            fontSize: '8px', color: isReady ? '#44ff88' : '#888888', fontFamily: 'monospace'
        }).setOrigin(0.5, 0).setDepth(32);

        const hit = this.add.rectangle(sx + w / 2, sy + h / 2, w, h, 0, 0)
            .setInteractive({ useHandCursor: true }).setDepth(33);
        hit.on('pointerup', () => { if (this._isAlive) this._onSkillTap(skill); });

        return { bg, nameTxt, elemTxt, ctTxt, hit, skill, sx, sy, w, h };
    }

    _drawSkillSlotBg(g, sx, sy, w, h, fillCol, lineCol) {
        g.clear();
        g.fillStyle(fillCol, 1);
        g.fillRoundedRect(sx, sy, w, h, 4);
        g.lineStyle(2, lineCol, 1);
        g.strokeRoundedRect(sx, sy, w, h, 4);
    }

    _setSkillPanelVisible(visible) {
        const o = this._skillPanelObjs;
        if (!o) return;
        const a = visible ? 1 : 0;
        o.panelBg.setAlpha(a);
        o.closeBtn.setAlpha(a);
        if (visible) o.closeBtn.setInteractive({ useHandCursor: true });
        else         o.closeBtn.disableInteractive();
        o.slotObjs.forEach((s) => {
            s.bg.setAlpha(a); s.nameTxt.setAlpha(a); s.elemTxt.setAlpha(a); s.ctTxt.setAlpha(a);
            s.hit.setAlpha(a);
            if (visible) s.hit.setInteractive({ useHandCursor: true });
            else         s.hit.disableInteractive();
        });
        this._skillPanelOpen = visible;
    }

    _toggleSkillPanel() {
        if (!this._skillPanelObjs) return;
        if (!this._skillPanelOpen) {
            this._skillData = mergeWithLocalCt(this._skillData);
            this._setSkillPanelVisible(true);
            this._refreshSkillSlots();
        } else {
            this._setSkillPanelVisible(false);
        }
    }

    _refreshSkillSlots() {
        const o = this._skillPanelObjs;
        if (!o) return;
        o.slotObjs.forEach((s) => {
            const { skill, bg, nameTxt, ctTxt, sx, sy, w, h } = s;
            const isReady = isSkillReady(skill.cardItemId);
            const remain  = getSkillRemainingSec(skill.cardItemId);
            this._drawSkillSlotBg(bg, sx, sy, w, h, isReady ? 0x112233 : 0x0a0f14, isReady ? 0x88ccff : 0x334455);
            nameTxt.setStyle({ color: isReady ? '#ddeeee' : '#556677' });
            ctTxt.setText(isReady ? 'READY' : `CT ${remain}s`);
            ctTxt.setStyle({ color: isReady ? '#44ff88' : '#888888' });
        });
    }

    _startSkillCtTimer() {
        if (this._skillCtTimer) return;
        this._skillCtTimer = setInterval(() => { if (this._skillPanelOpen) this._refreshSkillSlots(); }, 1000);
    }

    _stopSkillCtTimer() {
        if (this._skillCtTimer) { clearInterval(this._skillCtTimer); this._skillCtTimer = null; }
    }

    // ── スキル発動 ───────────────────────────────────────────────
    async _onSkillTap(skill) {
        if (Date.now() < this._mySkillSealUntil) {
            this._showToast('スキル封印中！', '#884488'); return;
        }
        if (!isSkillReady(skill.cardItemId)) {
            this._showToast(`CT中... ${getSkillRemainingSec(skill.cardItemId)}秒`, '#888888'); return;
        }
        // 混乱中: 50%の確率で不発
        if (Date.now() < this._myConfusedUntil && Math.random() < 0.5) {
            setSkillCooldown(skill.cardItemId, Date.now() + skill.cooldownSec * 1000);
            this._showToast(`${skill.skillName} 混乱で失敗！`, '#ffaaff');
            this._refreshSkillSlots();
            return;
        }

        // CT 先行セット（楽観的）
        setSkillCooldown(skill.cardItemId, Date.now() + skill.cooldownSec * 1000);
        this._refreshSkillSlots();

        if (isSelfOnlySkill(skill)) {
            this._applyLocalEffect(skill);
            this._showToast(`${skill.skillName} 発動！`, '#aaffaa');
            return;
        }

        // 他対象スキル — 最近の敵を自動ターゲット
        const enemy   = this._findNearestEnemy();
        const context = {
            targetPlayFabId: enemy?.playFabId || null,
            allShipIds:  this._getAllPlayerIds(),
            enemyIds:    this._getEnemyIds(),
            allyIds:     this._getAllyIds(),
            casterPosition: { x: this._playerX, y: this._playerY },
        };

        const res = await this._client?.useShipSkill(skill.cardItemId, context);
        if (res?.success) {
            const tgt = enemy?.displayName || (context.targetPlayFabId ? '対象' : '全体');
            if (skill.effect?.subtype === 'summon-allies') {
                this._showSummonCast(skill, res.effect);
                this._showToast(skill.effect?.value?.sanctuary ? `${skill.skillName}！ 聖域召集` : `${skill.skillName}！ 味方を召集`, '#ffdd66');
                return;
            }
            if (skill.effect?.subtype === 'resurrection-call') {
                this._showResurrectionCast(skill, res.effect);
                this._showToast(`${skill.skillName}！ 味方を裁きの光へ`, '#d8ff88');
                return;
            }
            // 発動エフェクト（ターゲット位置 or 自分位置）
            const tgtSprite = enemy ? this._playerSprites[enemy.playFabId]?.sprite : null;
            const ex = tgtSprite?.x ?? this._myShip?.x ?? CW / 2;
            const ey = tgtSprite?.y ?? this._myShip?.y ?? PLAY_Y_END / 2;
            const isGlobal = skill.range === 'global' || skill.aoe === 'all';
            this._showSkillEffect(this._skillEmoji(skill), ex, ey, {
                count:      isGlobal ? 5 : 2,
                flash:      isGlobal,
                flashColor: 0xffffff,
                rotate:     skill.effect?.subtype === 'drift' || skill.effect?.subtype === 'confusion',
                big:        isGlobal,
            });
            this._showToast(`${skill.skillName} → ${tgt}！`, '#aaffaa');
        } else {
            setSkillCooldown(skill.cardItemId, 0);
            this._showToast(`${skill.skillName} 失敗`, '#ff8888');
            this._refreshSkillSlots();
        }
    }

    // スキルの subtype / element から代表絵文字を返す
    _skillEmoji(skill) {
        const sub = skill.effect?.subtype || skill.effectSubtype || '';
        const EMOJI = {
            stun: '⚡', slow: '🐢', 'speed-weight': '🐢',
            drift: '🌀', confusion: '💫',
            'dot-burn': '🔥', corruption: '💀',
            'skill-seal': '🔒', 'global-skill-seal': '🔒',
            'heal-block': '🚫', 'armor-break': '💥',
            berserker: '🔥', charge: '💨', fortify: '🛡️',
            blink: '✨', stealth: '👻',
            'buff-steal': '✊', 'position-swap': '🔄',
            'cone-blast': '💥', 'lightning-strike': '🌩️',
            'set-hp-50pct': '☠️', 'equalize-hp': '⚖️',
            'fate-wheel': '🎡', judgment: '⚖️',
            'summon-allies': '📯',
            'resurrection-call': '🔔',
            'reset-all-ct': '🌟', 'cooldown-bypass': '⚡',
            regen: '💚', 'emergency-heal': '💚',
            revive: '💜', 'debuff-cleanse': '✨',
            'mind-control': '🧠', taunt: '😤',
            'delayed-damage': '⏳', shield: '🛡️',
        };
        const ELEM = { fire: '🔥', water: '💧', wind: '💨', earth: '⛰️' };
        return EMOJI[sub] || ELEM[skill.element] || '✨';
    }

    // ── 自己エフェクト適用 ────────────────────────────────────────
    _applyLocalEffect(skill) {
        const subtype = skill.effect?.subtype || skill.effectSubtype;
        const value   = skill.effect?.value;
        const dur     = (skill.effect?.duration || 0) * 1000;
        const now     = Date.now();
        const sx      = this._myShip?.x ?? CW / 2;
        const sy      = this._myShip?.y ?? PLAY_Y_END / 2;

        switch (subtype) {
            case 'invincible-escape':
                this._myInvincibleUntil = now + (dur || 5000);
                this._showSkillEffect('✨', sx, sy, { count: 4, flash: true, flashColor: 0xffffaa });
                break;
            case 'stealth':
                this._myShip?.setAlpha(0.2);
                this._myStealthUntil = now + (dur || 45000);
                this._showSkillEffect('👻', sx, sy, { count: 2 });
                this._showToast('ステルス！', '#8888ff');
                break;
            case 'charge':
                this._mySpeedMult = typeof value === 'object' ? (value.speedMult || 3) : 3;
                this._mySlowUntil = now + (dur || 10000);
                this._showSkillEffect('💨', sx, sy, { count: 3, flash: true, flashColor: 0xffdd88 });
                this._showToast('チャージ！ 速度3倍', '#ffcc44');
                break;
            case 'berserker':
                this._mySpeedMult = 1.5;
                this._mySlowUntil = now + (dur || 20000);
                this._showSkillEffect('🔥', sx, sy, { count: 3, flash: true, flashColor: 0xff4400 });
                this._showToast('バーサーカー！', '#ff4444');
                break;
            case 'fortify':
                this._myStunnedUntil = now + (dur || 15000);
                this._showSkillEffect('🛡️', sx, sy, { big: true, flash: true, flashColor: 0x8888ff });
                this._showToast('要塞化！ 移動停止', '#888888');
                break;
            case 'blink':
                this._doBlinkTeleport();
                break;
            case 'regen':
                this._startRegenEffect(Number(value) || 80, dur || 20000);
                this._showSkillEffect('💚', sx, sy, { count: 2, slow: true });
                this._showToast('再生！ HP回復開始', '#44ff88');
                break;
            case 'emergency-heal': {
                const healAmt = this._boostHealAmount(Math.round(this._myMaxHp * (Number(value) || 0.4)));
                this._updateMyHp(Math.min(this._myMaxHp, this._myHp + healAmt), this._myMaxHp);
                this._showSkillEffect('💚', sx, sy, { count: 3, slow: true, flash: true, flashColor: 0x44ff88 });
                this._showToast(`緊急回復 +${healAmt}HP`, '#44ff88');
                break;
            }
            case 'debuff-cleanse':
                this._clearMyDebuffs();
                this._showSkillEffect('✨', sx, sy, { count: 5, rotate: true });
                this._showToast('デバフ全解除！', '#44ffaa');
                break;
            case 'status-immunity':
                this._myInvincibleUntil = now + (dur || 10000);
                this._showSkillEffect('🛡️', sx, sy, { count: 2 });
                this._showToast('状態異常無効！', '#aaaaff');
                break;
            case 'focus':
                this._showSkillEffect('⚡', sx, sy, { count: 2 });
                this._showToast('集中！ CT短縮', '#aaaaff');
                break;
            default:
                this._showSkillEffect(this._skillEmoji(skill), sx, sy);
                this._showToast(`${skill.skillName} 発動！`, '#aaffaa');
                break;
        }
    }

    // ── 被弾エフェクト受信（Firestore ships/{myId} から）──────────
    _applyIncomingEffect(data) {
        if (!data) return;
        const now = Date.now();

        const debuff = data.shipSkillDebuff;
        if (debuff?.expiresAt > now) {
            this._applyDebuff(debuff);
        } else if (debuff?.expiresAt && debuff.expiresAt <= now) {
            this._expireDebuff(debuff.subtype);
        }

        const dot = data.shipSkillDot;
        if (dot?.expiresAt > now) {
            if (!this._myCurrentDot || this._myCurrentDot.sourceName !== dot.sourceName) {
                this._stopDotEffect();
                this._startDotEffect(dot);
            }
        } else if (this._myDotInterval) {
            this._stopDotEffect();
        }

        const special = data.shipSkillSpecial;
        const specialAt = Number(special?.at || 0);
        if ((special?.subtype === 'summon-allies' || special?.subtype === 'resurrection-call') && specialAt > this._lastShipSkillSpecialAt && Date.now() - specialAt < 15000) {
            this._lastShipSkillSpecialAt = specialAt;
            if (special.subtype === 'summon-allies') this._applySummonSpecial(special);
            if (special.subtype === 'resurrection-call') this._applyResurrectionSpecial(special);
        }
    }

    _showSummonCast(skill, effectResult = {}) {
        const sx = this._myShip?.x ?? CW / 2;
        const sy = this._myShip?.y ?? PLAY_Y_END / 2;
        const radius = Math.max(24, Math.min(180, Number(effectResult.radius || skill.effect?.value?.radius || 80))) * S;
        const ring = this.add.graphics().setDepth(48);
        const isSanctuary = !!skill.effect?.value?.sanctuary || !!effectResult.value?.sanctuary;
        ring.lineStyle(isSanctuary ? 4 : 3, isSanctuary ? 0xd8ff88 : 0xffdd66, 0.95);
        ring.strokeCircle(sx, sy, radius);
        this._showSkillEffect(isSanctuary ? '⛪' : '📯', sx, sy, { count: 4, flash: true, flashColor: isSanctuary ? 0xd8ff88 : 0xffdd66, big: true });
        if (isSanctuary) {
            const value = skill.effect?.value || effectResult.value || {};
            this._sanctuaryHealBoost = Math.max(this._sanctuaryHealBoost, Number(value.healBoost) || 0);
            this._sanctuaryHealBoostUntil = Math.max(this._sanctuaryHealBoostUntil, Date.now() + (Number(value.sanctuaryDuration || 8) * 1000));
            this._drawSanctuaryField(sx, sy, radius);
        }
        this.tweens.add({
            targets: ring,
            scaleX: 1.25,
            scaleY: 1.25,
            alpha: 0,
            duration: 900,
            ease: 'Sine.easeOut',
            onComplete: () => ring.destroy()
        });
        (effectResult.targets || []).forEach((targetId) => {
            const obj = this._playerSprites[targetId]?.sprite;
            if (obj) this._showActionLine(obj.x, obj.y, sx, sy, 0xffdd66, 'CALL');
        });
    }

    _showResurrectionCast(skill, effectResult = {}) {
        const sx = this._myShip?.x ?? CW / 2;
        const sy = this._myShip?.y ?? PLAY_Y_END / 2;
        this._showSkillEffect('🔔', sx, sy, { count: 6, flash: true, flashColor: 0xffffdd, big: true, slow: true });
        (effectResult.targets || []).forEach((targetId) => {
            const obj = this._playerSprites[targetId]?.sprite;
            if (obj) this._showActionLine(sx, sy, obj.x, obj.y, 0xd8ff88, 'JUDGE');
        });
    }

    _applySummonSpecial(special) {
        if (!this._myShip) return;
        const value = special.value || {};
        const baseX = Math.max(0, Math.min(BW, Number(special.x) || this._playerX));
        const baseY = Math.max(0, Math.min(BH, Number(special.y) || this._playerY));
        const radius = Math.max(24, Math.min(180, Number(special.radius || value.radius || 80)));
        const seed = String(this._myPlayFabId || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
        const angle = (seed % 360) * Math.PI / 180;
        const dist = radius * (0.35 + ((seed % 7) / 14));
        const lx = Math.max(0, Math.min(BW, baseX + Math.cos(angle) * dist));
        const ly = Math.max(PLAY_Y_START / S, Math.min(PLAY_Y_END / S, baseY + Math.sin(angle) * dist));

        this._teleportMyShipTo(lx, ly);
        const isSanctuary = !!value.sanctuary;
        this._showSkillEffect(isSanctuary ? '⛪' : '📯', this._myShip.x, this._myShip.y, { count: 3, flash: true, flashColor: isSanctuary ? 0xd8ff88 : 0xffdd66 });
        this._showToast(isSanctuary ? `${special.sourceName || '聖域召集'}へ呼ばれた！` : `${special.sourceName || '召集'}で呼ばれた！`, '#ffdd66');

        if (isSanctuary) {
            this._sanctuaryHealBoost = Math.max(this._sanctuaryHealBoost, Number(value.healBoost) || 0);
            this._sanctuaryHealBoostUntil = Math.max(this._sanctuaryHealBoostUntil, Date.now() + (Number(value.sanctuaryDuration || 8) * 1000));
            this._drawSanctuaryField(this._myShip.x, this._myShip.y, radius * S);
        }

        if (value.cleanse) this._clearMyDebuffs();
        if (Number(value.healPct) > 0) {
            const healAmt = this._boostHealAmount(Math.round(this._myMaxHp * Number(value.healPct)));
            this._updateMyHp(Math.min(this._myMaxHp, this._myHp + healAmt), this._myMaxHp);
            this._showDamageText(`+${healAmt}`, this._myShip.x, this._myShip.y);
        }
        if (Number(value.shield) > 0) {
            this._showSkillEffect('🛡️', this._myShip.x, this._myShip.y, { count: 2 });
        }
        if (value.followBuff === 'status-immunity') {
            this._myInvincibleUntil = Date.now() + (Number(value.buffDuration || 5) * 1000);
        } else if (value.followBuff === 'atk-up' || value.followBuff === 'def-up') {
            this._showSkillEffect(value.followBuff === 'atk-up' ? '⚔️' : '🛡️', this._myShip.x, this._myShip.y, { count: 2 });
        }
    }

    _applyResurrectionSpecial(special) {
        const value = special.value || {};
        const reviveHp = Math.max(1, Math.round(this._myMaxHp * (Number(value.reviveHpPct) || 0.5)));
        const healAmt = this._boostHealAmount(Math.round(this._myMaxHp * (Number(value.healPct) || 0.25)));
        const sx = this._myShip?.x ?? CW / 2;
        const sy = this._myShip?.y ?? PLAY_Y_END / 2;

        if (!this._isAlive || this._myHp <= 0) {
            this._isAlive = true;
            this._respawnAt = null;
            this._respawnText?.destroy();
            this._respawnText = null;
            this._respawnTimer?.remove();
            this._respawnTimer = null;
            this._myShip?.setAlpha(1);
            this._updateMyHp(reviveHp, this._myMaxHp);
            this._showDamageText(`+${reviveHp}`, sx, sy);
            this._showSkillEffect('🔔', sx, sy, { count: 5, flash: true, flashColor: 0xffffdd, big: true });
            this._showToast(`${special.sourceName || '審判'}で蘇生！`, '#d8ff88');
            this._client?.updateMyPosition(this._playerX, this._playerY);
            return;
        }

        if (healAmt > 0) {
            this._updateMyHp(Math.min(this._myMaxHp, this._myHp + healAmt), this._myMaxHp);
            this._showDamageText(`+${healAmt}`, sx, sy);
        }
        this._showSkillEffect('🔔', sx, sy, { count: 3, flash: true, flashColor: 0xffffdd });
        this._showToast(`${special.sourceName || '審判'}の祝福`, '#d8ff88');
    }

    _boostHealAmount(baseAmount) {
        if (Date.now() <= this._sanctuaryHealBoostUntil) {
            return Math.round(baseAmount * (1 + Math.max(0, this._sanctuaryHealBoost || 0)));
        }
        return baseAmount;
    }

    _drawSanctuaryField(x, y, radius) {
        const field = this.add.graphics().setDepth(18);
        field.fillStyle(0xd8ff88, 0.08);
        field.fillCircle(x, y, radius);
        field.lineStyle(2, 0xd8ff88, 0.45);
        field.strokeCircle(x, y, radius);
        this.tweens.add({
            targets: field,
            alpha: { from: 0.9, to: 0.2 },
            scaleX: { from: 0.85, to: 1.1 },
            scaleY: { from: 0.85, to: 1.1 },
            duration: 8000,
            ease: 'Sine.easeOut',
            onComplete: () => field.destroy()
        });
    }

    _teleportMyShipTo(lx, ly) {
        const tx = lx * S;
        const ty = ly * S;
        this._moveTween?.stop();
        this._moveTween = null;
        this._myShip.setPosition(tx, ty);
        this._moveMyShipGraphicsTo(tx, ty);
        this._playerX = lx;
        this._playerY = ly;
        this._client?.updateMyPosition(lx, ly);
    }

    _applyDebuff(debuff) {
        const now       = Date.now();
        // 正義パッシブ: スタン・スロー持続-20%
        const debuffReduce = this._getPassiveValue('debuff_duration_reduce', 0);
        const rawDur    = debuff.expiresAt - now;
        const expiresAt = now + Math.round(rawDur * (1 - debuffReduce));
        const name      = debuff.sourceName || '敵';
        const sx        = this._myShip?.x ?? CW / 2;
        const sy        = this._myShip?.y ?? PLAY_Y_END / 2;

        switch (debuff.subtype) {
            case 'slow':
            case 'speed-weight':
                if (this._mySlowUntil < expiresAt) {
                    this._mySpeedMult = Math.min(1, Number(debuff.value) || 0.5);
                    this._mySlowUntil = expiresAt;
                    this._moveTween?.stop(); this._moveTween = null;
                    this._showSkillEffect('🐢', sx, sy, { slow: true });
                    this._showToast(`スロー！ [${name}]`, '#88ccff');
                }
                break;
            case 'stun':
                if (this._myStunnedUntil < expiresAt) {
                    this._myStunnedUntil = expiresAt;
                    this._moveTween?.stop(); this._moveTween = null;
                    this._showSkillEffect('⚡', sx, sy, { count: 2, flash: true, flashColor: 0xffffaa });
                    this._showToast(`スタン！ 行動不能 [${name}]`, '#ffaaff');
                }
                break;
            case 'drift':
                if (this._myDriftUntil < expiresAt) {
                    this._myDriftUntil = expiresAt;
                    this._startDriftEffect(expiresAt - now);
                    this._showSkillEffect('🌀', sx, sy, { count: 2, rotate: true });
                    this._showToast(`漂流！ 制御不能 [${name}]`, '#ffaa44');
                }
                break;
            case 'confusion':
                this._myConfusedUntil = Math.max(this._myConfusedUntil, expiresAt);
                this._showSkillEffect('💫', sx, sy, { count: 3, rotate: true });
                this._showToast(`混乱！ スキル50%失敗 [${name}]`, '#ffaaff');
                break;
            case 'armor-break':
                this._myArmorBreakUntil = Math.max(this._myArmorBreakUntil, expiresAt);
                this._showSkillEffect('💥', sx, sy, { flash: true });
                this._showToast(`装甲破砕！ [${name}]`, '#ff8844');
                break;
            case 'heal-block':
                this._myHealBlockUntil = Math.max(this._myHealBlockUntil, expiresAt);
                this._showSkillEffect('🚫', sx, sy);
                this._showToast(`回復封印！ [${name}]`, '#aa4488');
                break;
            case 'skill-seal':
                this._mySkillSealUntil = Math.max(this._mySkillSealUntil, expiresAt);
                this._showSkillEffect('🔒', sx, sy, { big: true });
                this._showToast(`スキル封印！ [${name}]`, '#884488');
                break;
            case 'atk-down':
                this._myAtkDownUntil = Math.max(this._myAtkDownUntil, expiresAt);
                this._showSkillEffect('⬇️', sx, sy, { count: 2 });
                this._showToast(`攻撃力低下！ [${name}]`, '#886688');
                break;
            case 'taunt':
                this._showSkillEffect('😤', sx, sy);
                this._showToast(`挑発！ [${name}]`, '#ff6644');
                break;
            default:
                this._showSkillEffect('💢', sx, sy);
                this._showToast(`[${name}] ${debuff.subtype}`, '#888888');
                break;
        }
    }

    _expireDebuff(subtype) {
        const now = Date.now();
        if ((subtype === 'slow' || subtype === 'speed-weight') && now >= this._mySlowUntil) {
            this._mySpeedMult = 1.0;
        }
    }

    // ── DoT（炎上・腐敗）────────────────────────────────────────
    _startDotEffect(dot) {
        this._stopDotEffect();
        this._myCurrentDot = dot;
        const isCorruption = dot.subtype === 'corruption';
        let stack = 1;

        this._myDotInterval = setInterval(() => {
            if (!this._myCurrentDot || Date.now() > this._myCurrentDot.expiresAt) {
                this._stopDotEffect(); return;
            }
            if (!this._isAlive) return;
            if (isCorruption) stack = Math.min(5, stack + 1);
            const base = Number(this._myCurrentDot.tickDamage) || 50;
            // 節制パッシブ: 受けるDoT-20%
            const dotReduceMult = 1 - this._getPassiveValue('dot_reduce', 0);
            const dmg  = Math.round(base * (isCorruption ? stack : 1) * dotReduceMult);
            const newHp = Math.max(0, this._myHp - dmg);
            this._updateMyHp(newHp, this._myMaxHp);
            const dx = this._myShip?.x ?? CW / 2;
            const dy = this._myShip?.y ?? PLAY_Y_END / 2;
            this._showDamageText(dmg, dx, dy);
            this._showSkillEffect(isCorruption ? '💀' : '🔥', dx, dy,
                { count: isCorruption ? Math.min(stack, 3) : 2 });
            if (newHp <= 0) this._stopDotEffect();
        }, 3000);
        this._showToast(`${isCorruption ? '腐敗' : '炎上'}！ [${dot.sourceName || '敵'}]`, '#ff6600');
    }

    _stopDotEffect() {
        if (this._myDotInterval) { clearInterval(this._myDotInterval); this._myDotInterval = null; }
        this._myCurrentDot = null;
    }

    // ── ドリフト（制御不能漂流）──────────────────────────────────
    _startDriftEffect(durationMs) {
        this._stopDriftEffect();
        const angle  = Math.random() * Math.PI * 2;
        const speed  = PLAYER_SPEED * 0.7;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const startMs = Date.now();

        this._myDriftInterval = setInterval(() => {
            if (!this._myShip) return;
            if (Date.now() - startMs > durationMs || Date.now() > this._myDriftUntil) {
                this._stopDriftEffect(); return;
            }
            const dt = 0.1;
            const nx = Math.max(0, Math.min(CW, this._myShip.x + vx * S * dt));
            const ny = Math.max(PLAY_Y_START, Math.min(PLAY_Y_END, this._myShip.y + vy * S * dt));
            this._myShip.setPosition(nx, ny);
            this._moveMyShipGraphicsTo(nx, ny);
        }, 100);
    }

    _stopDriftEffect() {
        if (this._myDriftInterval) { clearInterval(this._myDriftInterval); this._myDriftInterval = null; }
    }

    // ── ブリンク ─────────────────────────────────────────────────
    _doBlinkTeleport() {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 150 + Math.random() * 250;
        const nx = Math.max(30, Math.min(BW - 30, this._playerX + Math.cos(angle) * dist));
        const ny = Math.max(30, Math.min(BH - 30, this._playerY + Math.sin(angle) * dist));
        const cx = nx * S;
        const cy = Math.max(PLAY_Y_START, Math.min(PLAY_Y_END, ny * S));
        this._myShip?.setPosition(cx, cy);
        this._moveMyShipGraphicsTo(cx, cy);
        this._playerX = nx;
        this._playerY = ny;
        this._client?.updateMyPosition(nx, ny);
        this._showSkillEffect('✨', cx, cy, { count: 5, rotate: true });
        this._showToast('ワープ！', '#aaaaff');
    }

    // ── 再生（Regen）────────────────────────────────────────────
    _startRegenEffect(tickHeal, durationMs) {
        if (this._myRegenInterval) { clearInterval(this._myRegenInterval); }
        const endMs = Date.now() + durationMs;
        this._myRegenInterval = setInterval(() => {
            if (Date.now() > endMs || !this._isAlive) {
                clearInterval(this._myRegenInterval); this._myRegenInterval = null; return;
            }
            if (Date.now() < this._myHealBlockUntil) return;
            const boostedHeal = this._boostHealAmount(tickHeal);
            this._updateMyHp(Math.min(this._myMaxHp, this._myHp + boostedHeal), this._myMaxHp);
        }, 4000);
    }

    // ── デバフクリア ─────────────────────────────────────────────
    _clearMyDebuffs() {
        this._mySpeedMult       = 1.0;
        this._mySlowUntil       = 0;
        this._myStunnedUntil    = 0;
        this._myDriftUntil      = 0;
        this._myConfusedUntil   = 0;
        this._myHealBlockUntil  = 0;
        this._mySkillSealUntil  = 0;
        this._myArmorBreakUntil = 0;
        this._myAtkDownUntil    = 0;
        this._stopDriftEffect();
        this._stopDotEffect();
    }

    // ── ヘルパー（スキル用ターゲット収集）────────────────────────
    _getAllPlayerIds() {
        const r = this._roomData;
        if (!r) return [];
        return [
            ...(r.attackers || []).map((p) => p.playFabId),
            ...(r.defenders || []).map((p) => p.playFabId)
        ].filter(Boolean);
    }

    _getEnemyIds() {
        const r = this._roomData;
        if (!r || !this._mySide) return [];
        const list = this._mySide === 'attacker' ? (r.defenders || []) : (r.attackers || []);
        return list.filter((p) => !p.isNpc).map((p) => p.playFabId).filter(Boolean);
    }

    _getAllyIds() {
        const r = this._roomData;
        if (!r || !this._mySide) return [];
        const list = this._mySide === 'attacker' ? (r.attackers || []) : (r.defenders || []);
        return list.map((p) => p.playFabId).filter(Boolean);
    }

    // ── 退出 ────────────────────────────────────────────────
    _leaveRoom() {
        this._stopTimer();
        this._setSymbolReadyPulse(false);
        this._client?.unsubscribe();
        this.scene.start('WorldMapScene');
    }

    // ── Phaser shutdown ─────────────────────────────────────
    shutdown() {
        this._stopTimer();
        this._stopSkillCtTimer();
        this._stopDotEffect();
        this._stopDriftEffect();
        if (this._myRegenInterval) { clearInterval(this._myRegenInterval); this._myRegenInterval = null; }
        this._arcanaPassiveTimers.forEach((id) => clearInterval(id));
        this._arcanaPassiveTimers = [];
        this._client?.unsubscribeShipEffects?.();
        this._client?.unsubscribe();
        this._moveTween?.stop();
        this._setSymbolReadyPulse(false);
        this._resultOverlay?.forEach((obj) => obj?.destroy?.());
        this._resultOverlay = null;
        this._respawnTimer?.remove();
        Object.values(this._playerTweens).forEach((t) => t?.stop());
    }
}

// ── ヘルパー：入室 / 作成 → BattleRoomScene 起動 ─────────────
export async function enterBattleRoom(scene, { playFabId, territoryId, nation = null, mode = 'join' }) {
    let roomData = null;
    let side     = 'attacker';

    if (mode === 'create') {
        const res = await createBattleRoom(playFabId, territoryId);
        if (!res?.room) throw new Error(res?.error || 'ルーム作成失敗');
        roomData = res.room;
        side = 'attacker';
    } else {
        const res = await getActiveBattleRoom(territoryId);
        if (res?.room) {
            const joinRes = await joinBattleRoom(playFabId, res.room.roomId);
            if (!joinRes?.room) throw new Error(joinRes?.error || '参戦失敗');
            roomData = joinRes.room;
            side = joinRes.side || 'defender';
        } else {
            throw new Error('アクティブなルームがありません');
        }
    }

    scene.scene.start('BattleRoomScene', { playFabId, territoryId, side, roomData, nation });
}

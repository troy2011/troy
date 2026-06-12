// =====================================================================
// 海戦フェーズ プロトタイプ（コマンド式タイムライン海戦）
// ホームタブの「略奪に出る」から起動し、接舷成立時のみ既存の
// 白兵戦（startBattleWithOpponent）へ引き継ぐ。
// 白兵戦システム・船の進化システムは実装済みの前提（スタブ呼び出しのみ）。
// =====================================================================
(() => {
'use strict';

const TICK_MS = 500;          // 1カウント＝0.5秒
const TIMELINE_MAX = 6;       // タイムライン軸 0〜6
const INITIAL_DISTANCE = 3;
const ESCAPE_DISTANCE = 6;    // 距離6以上で逃亡勝利
const STUN_COUNTS = 3;        // 操舵不能カウント
const RUDDER_COOLDOWN = 10;   // おもかじ使用後クールダウン
const MAX_HP = 100;

const EVADE_RATE = { front: 0.3, side: 0, back: 0.6 };
const SIDE_DAMAGE_MULTIPLIER = 1.5;

const FACING_LABEL = { front: '前向き', side: '横向き', back: '後ろ向き' };
const SHIP_FORM_LABEL = {
    boat: 'ボート',
    common: 'ボート',
    explorer: '探索船',
    defender: '防衛船',
    fighter: '戦闘船',
    merchant: '商船',
    guild: '旗艦'
};
const SHIP_FORM_MODIFIER = {
    boat: { hp: 0, attack: 0, defense: 0, speed: 0, cargo: 0 },
    common: { hp: 0, attack: 0, defense: 0, speed: 0, cargo: 0 },
    explorer: { hp: 4, attack: 0, defense: 0, speed: 1, cargo: 0 },
    defender: { hp: 10, attack: 0, defense: 2, speed: 0, cargo: 0 },
    fighter: { hp: 6, attack: 2, defense: 0, speed: 0, cargo: 0 },
    merchant: { hp: 5, attack: 0, defense: 0, speed: 0, cargo: 2 },
    guild: { hp: 12, attack: 2, defense: 2, speed: 0, cargo: 1 }
};
const PLUNDER_LIMITS = {
    victory: { chips: 30, cargo: 2, exploration: 1 },
    cargoRaid: { chips: 12, cargo: 1, exploration: 1 }
};
const REPAIR_RISK = { chips: 20, cooldownMinutes: 5 };
const COMMAND_TYPE_LABEL = {
    cannon: '砲撃',
    move: '操船',
    ram: '突撃',
    rudder: '操舵',
    loot: '略奪',
    boarding: '接舷'
};

const ENEMY_PLANS = [
    { name: '突撃型', ramBias: 0.75, advanceBias: 0.72, broadsideBias: 0.42, caution: 0.28 },
    { name: '砲撃型', ramBias: 0.35, advanceBias: 0.46, broadsideBias: 0.82, caution: 0.38 },
    { name: '攪乱型', ramBias: 0.48, advanceBias: 0.55, broadsideBias: 0.55, caution: 0.58 }
];

// ---------------------------------------------------------------------
// コマンド定義
// ---------------------------------------------------------------------
const COMMANDS = {
    bowCannon: {
        id: 'bowCannon', label: '船首砲', lag: 3, type: 'cannon',
        desc: '中ダメージ。衝角チャージ中の相手を弱体化',
        resolve(b, self, foe) {
            fireCannon(b, self, foe, { damage: 12, name: '船首砲' });
            if (foe.command && foe.command.def.id === 'ram' && !foe.command.ramWeakened) {
                foe.command.ramWeakened = true;
                log(b, `${self.label}の船首砲が${foe.label}の衝角チャージを弱体化！（威力半減）`);
            }
        }
    },
    broadside: {
        id: 'broadside', label: '舷側砲', lag: 6, type: 'cannon',
        desc: '超大ダメージ必中。ただし横向きで危険',
        resolve(b, self, foe) {
            fireCannon(b, self, foe, { damage: 30, sureHit: true, name: '舷側砲' });
        }
    },
    sternCannon: {
        id: 'sternCannon', label: '船尾砲', lag: 3, type: 'cannon',
        desc: '安全寄りの小ダメージ。命中時に相手を遅延',
        resolve(b, self, foe) {
            const hit = fireCannon(b, self, foe, { damage: 6, name: '船尾砲' });
            if (hit && foe.command) {
                foe.command.lagRemaining += 1;
                log(b, `${foe.label}のコマンドが1カウント遅延した！`);
            }
        }
    },
    advance: {
        id: 'advance', label: '前進', lag: 2, type: 'move',
        desc: '距離を1縮める',
        resolve(b, self) {
            b.distance = Math.max(0, b.distance - 1);
            log(b, `${self.label}が前進した（距離 ${b.distance}）`);
            if (b.distance === 0) enterPhaseB(b);
        }
    },
    flee: {
        id: 'flee', label: '前進（逃走）', lag: 3, type: 'move',
        desc: '距離を1広げる。距離6で逃亡勝利',
        resolve(b, self) {
            b.distance += 1;
            log(b, `${self.label}が逃走した（距離 ${b.distance}）`);
            if (b.distance >= ESCAPE_DISTANCE) {
                finishBattle(b, self.isPlayer ? 'escape' : 'enemyEscaped');
            }
        }
    },
    ram: {
        id: 'ram', label: '衝角', lag: 5, type: 'ram',
        desc: '距離1限定。特大ダメージ＋操舵不能。船首砲に弱い',
        isAvailable(b) { return b.distance === 1; },
        resolve(b, self, foe) {
            if (b.distance !== 1) {
                log(b, `${self.label}の衝角は距離が合わず失敗した…`);
                return;
            }
            const power = self.command && self.command.ramWeakened ? 20 : 40;
            const hit = fireCannon(b, self, foe, { damage: power, name: '衝角', isRam: true });
            if (hit) {
                self.hp = Math.max(0, self.hp - 8);
                log(b, `${self.label}も衝突の反動で8ダメージ`);
                applyStun(b, foe);
                if (checkKnockout(b)) return;
                b.distance = 0;
                enterPhaseB(b);
            }
        }
    },
    rudderToSide: {
        id: 'rudderToSide', label: 'おもかじ（横）', lag: 4, type: 'rudder', facingAfter: 'side',
        desc: '選択直後のみ100%回避。完了後に横向き'
    },
    rudderToFront: {
        id: 'rudderToFront', label: 'おもかじ（前）', lag: 4, type: 'rudder', facingAfter: 'front',
        desc: '選択直後のみ100%回避。完了後に前向き'
    },
    rudderToBack: {
        id: 'rudderToBack', label: 'おもかじ（後）', lag: 4, type: 'rudder', facingAfter: 'back',
        desc: '選択直後のみ100%回避。完了後に後ろ向き'
    },
    zeroBroadside: {
        id: 'zeroBroadside', label: '舷側砲（ゼロ距離）', lag: 3, type: 'cannon',
        desc: '必中・大ダメージ',
        resolve(b, self, foe) {
            fireCannon(b, self, foe, { damage: 22, sureHit: true, name: 'ゼロ距離舷側砲' });
        }
    },
    retreat: {
        id: 'retreat', label: '後退', lag: 4, type: 'move',
        desc: '重なり状態から離脱して距離1へ',
        resolve(b, self) {
            if (b.distance !== 0) return;
            b.distance = 1;
            log(b, `${self.label}が後退し、並走状態から離脱した（距離 1）`);
            updateLayout(b);
        }
    },
    cargoRaid: {
        id: 'cargoRaid', label: '船倉略奪', lag: 2, type: 'loot',
        desc: '少量だけ奪って撤退。相手スタン中か大破寸前で狙える',
        isAvailable(b, self, foe) { return b.distance === 0 && (foe.stun > 0 || foe.hp <= foe.maxHp * 0.35); },
        resolve(b, self) {
            log(b, `${self.label}が船倉を素早く荒らして離脱した！`);
            finishBattle(b, self.isPlayer ? 'cargoRaid' : 'enemyCargoRaid');
        }
    },
    boarding: {
        id: 'boarding', label: '接舷', lag: 1, type: 'boarding',
        desc: '相手が操舵不能のときのみ。白兵戦へ移行',
        isAvailable(b, self, foe) { return foe.stun > 0; }
        // 選択した瞬間に処理するため resolve なし（selectCommand 内で即時処理）
    }
};

// 向きごとの選択可能コマンド（フェーズA）
const PHASE_A_COMMANDS = {
    front: ['bowCannon', 'rudderToSide', 'advance', 'ram'],
    side: ['broadside', 'rudderToFront', 'rudderToBack'],
    back: ['sternCannon', 'rudderToSide', 'flee']
};
const PHASE_B_COMMANDS = ['zeroBroadside', 'retreat', 'cargoRaid', 'boarding'];

// ---------------------------------------------------------------------
// 戦闘状態
// ---------------------------------------------------------------------
let battle = null;

function clampNumber(value, min, max, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeShipForm(shipProfile = {}) {
    const raw = String(
        shipProfile.form
        || shipProfile.shipClass
        || shipProfile.class
        || shipProfile.Class
        || shipProfile.itemId
        || ''
    ).toLowerCase();
    if (raw.includes('guild')) return 'guild';
    if (raw.includes('merchant')) return 'merchant';
    if (raw.includes('fighter')) return 'fighter';
    if (raw.includes('defender')) return 'defender';
    if (raw.includes('explorer')) return 'explorer';
    if (raw.includes('common')) return 'common';
    return 'boat';
}

function getStatValue(stats = {}, keys = []) {
    const source = asObject(stats);
    for (const key of keys) {
        const value = Number(source[key] ?? source[key.toUpperCase()] ?? source[key.toLowerCase()]);
        if (Number.isFinite(value)) return value;
    }
    return 0;
}

function readCargoMap(profile = {}, shipProfile = {}) {
    const candidates = [
        profile.cargoResources,
        profile.cargo,
        profile.shipCargo,
        profile.resourceCargo,
        shipProfile.cargoResources,
        shipProfile.cargo,
        shipProfile.ResourceCargo,
        shipProfile.resourceCargo
    ];
    const found = candidates.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    return found ? { ...found } : {};
}

function summarizeCargo(cargoMap = {}, fallbackBonus = 0) {
    const entries = Object.entries(cargoMap)
        .map(([id, amount]) => ({ id: String(id), amount: Math.max(0, Math.floor(Number(amount) || 0)) }))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (!entries.length) {
        return {
            total: Math.max(0, fallbackBonus),
            text: fallbackBonus > 0 ? `積載余力 +${fallbackBonus}` : '空',
            topItem: null
        };
    }
    const top = entries[0];
    return {
        total,
        text: `${top.id} x${top.amount}${entries.length > 1 ? ` ほか${entries.length - 1}種` : ''}`,
        topItem: top
    };
}

function normalizeShipProfile(profile = {}, explicitShipProfile = {}) {
    const publicProfile = asObject(profile);
    const shipProfile = {
        ...asObject(publicProfile.playerShip),
        ...asObject(explicitShipProfile)
    };
    const form = normalizeShipForm(shipProfile);
    const modifier = SHIP_FORM_MODIFIER[form] || SHIP_FORM_MODIFIER.boat;
    const stats = asObject(publicProfile.stats);
    const level = clampNumber(publicProfile.level ?? stats.level ?? stats.PlayerLevel, 1, 99, 1);
    const shipLevel = clampNumber(shipProfile.level ?? shipProfile.Level, 1, 10, 1);
    const hpBonus = modifier.hp + Math.min(8, Math.floor(level / 10) * 2) + Math.min(4, Math.floor(shipLevel / 3));
    const attackStat = getStatValue(stats, ['str', 'STR', 'attack', 'ATK']);
    const defenseStat = getStatValue(stats, ['def', 'DEF', 'defense']);
    const speedStat = getStatValue(stats, ['agi', 'AGI', 'speed']);
    const cargo = summarizeCargo(readCargoMap(publicProfile, shipProfile), modifier.cargo);
    const label = String(shipProfile.name || shipProfile.DisplayName || SHIP_FORM_LABEL[form] || '船').slice(0, 16);
    return {
        form,
        formLabel: SHIP_FORM_LABEL[form] || '船',
        name: label,
        level,
        shipLevel,
        hpBonus: clampNumber(hpBonus, 0, 18, 0),
        attackBonus: clampNumber(modifier.attack + Math.floor(attackStat / 8), 0, 5, 0),
        defenseBonus: clampNumber(modifier.defense + Math.floor(defenseStat / 8), 0, 5, 0),
        speed: clampNumber(modifier.speed + Math.floor(speedStat / 12), 0, 2, 0),
        cargoTotal: cargo.total,
        cargoText: cargo.text,
        topCargo: cargo.topItem,
        profile
    };
}

function createShip(label, isPlayer, profile = {}, shipProfile = {}) {
    const spec = normalizeShipProfile(profile, shipProfile);
    const maxHp = MAX_HP + spec.hpBonus;
    return {
        label,
        isPlayer,
        hp: maxHp,
        maxHp,
        shipForm: spec.form,
        shipType: spec.formLabel,
        shipName: spec.name,
        shipLevel: spec.shipLevel,
        playerLevel: spec.level,
        attackBonus: spec.attackBonus,
        defenseBonus: spec.defenseBonus,
        speed: spec.speed,
        cargoTotal: spec.cargoTotal,
        cargoText: spec.cargoText,
        topCargo: spec.topCargo,
        facing: 'front',
        stun: 0,
        rudderCooldown: 0,
        command: null // { def, lagRemaining, ramWeakened }
    };
}

function hashString(value) {
    return String(value || '').split('').reduce((hash, ch) => (
        ((hash << 5) - hash + ch.charCodeAt(0)) >>> 0
    ), 0);
}

function createEnemyPlan(options = {}) {
    const seed = options.opponentId || options.opponentName || 'enemy';
    return ENEMY_PLANS[hashString(seed) % ENEMY_PLANS.length];
}

function cloneCommand(command) {
    const commandId = command?.def?.id || command?.id;
    if (!commandId) return null;
    const def = COMMANDS[commandId];
    if (!def) return null;
    return {
        def,
        lagRemaining: Math.max(0, Number(command.lagRemaining) || 0),
        lagTotal: Math.max(1, Number(command.lagTotal || command.lag || def.lag) || def.lag),
        ramWeakened: Boolean(command.ramWeakened)
    };
}

function cloneShipState(source, fallbackLabel, isPlayer) {
    const ship = createShip(source?.label || fallbackLabel, isPlayer);
    ship.hp = Math.max(0, Number(source?.hp ?? ship.hp) || 0);
    ship.maxHp = Math.max(1, Number(source?.maxHp ?? ship.maxHp) || 1);
    ship.shipForm = String(source?.shipForm || ship.shipForm || 'boat');
    ship.shipType = String(source?.shipType || ship.shipType || SHIP_FORM_LABEL[ship.shipForm] || '船');
    ship.shipName = String(source?.shipName || ship.shipName || ship.shipType || '船');
    ship.shipLevel = Math.max(1, Number(source?.shipLevel || ship.shipLevel || 1) || 1);
    ship.playerLevel = Math.max(1, Number(source?.playerLevel || ship.playerLevel || 1) || 1);
    ship.attackBonus = clampNumber(source?.attackBonus, 0, 5, ship.attackBonus || 0);
    ship.defenseBonus = clampNumber(source?.defenseBonus, 0, 5, ship.defenseBonus || 0);
    ship.speed = clampNumber(source?.speed, 0, 2, ship.speed || 0);
    ship.cargoTotal = Math.max(0, Number(source?.cargoTotal || ship.cargoTotal || 0) || 0);
    ship.cargoText = String(source?.cargoText || ship.cargoText || '空');
    ship.topCargo = source?.topCargo || ship.topCargo || null;
    ship.facing = FACING_LABEL[source?.facing] ? source.facing : ship.facing;
    ship.stun = Math.max(0, Number(source?.stun) || 0);
    ship.rudderCooldown = Math.max(0, Number(source?.rudderCooldown) || 0);
    ship.command = cloneCommand(source?.command);
    return ship;
}

function serializeShipState(ship) {
    return {
        label: ship.label,
        hp: ship.hp,
        maxHp: ship.maxHp,
        shipForm: ship.shipForm,
        shipType: ship.shipType,
        shipName: ship.shipName,
        shipLevel: ship.shipLevel,
        playerLevel: ship.playerLevel,
        attackBonus: ship.attackBonus,
        defenseBonus: ship.defenseBonus,
        speed: ship.speed,
        cargoTotal: ship.cargoTotal,
        cargoText: ship.cargoText,
        topCargo: ship.topCargo || null,
        facing: ship.facing,
        stun: ship.stun,
        rudderCooldown: ship.rudderCooldown,
        command: ship.command ? {
            id: ship.command.def.id,
            lagRemaining: ship.command.lagRemaining,
            lagTotal: ship.command.lagTotal || ship.command.def.lag,
            ramWeakened: Boolean(ship.command.ramWeakened)
        } : null
    };
}

function serializeBattleState(b) {
    if (!b) return null;
    return {
        count: b.count,
        distance: b.distance,
        player: serializeShipState(b.player),
        enemy: serializeShipState(b.enemy),
        enemyPlan: b.enemyPlan?.name || '',
        reward: b.reward || null,
        rewardResult: b.rewardResult || null,
        logs: Array.isArray(b.logs) ? b.logs.slice(0, 30) : [],
        finished: Boolean(b.finished),
        outcome: b.outcome || null
    };
}

function resolveEnemyPlanByName(name) {
    return ENEMY_PLANS.find((plan) => plan.name === name) || ENEMY_PLANS[0];
}

function transformSnapshotForPerspective(snapshot, perspective = 'player') {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (perspective !== 'enemy') return snapshot;
    const outcomeMap = {
        victory: 'defeat',
        defeat: 'victory',
        escape: 'enemyEscaped',
        enemyEscaped: 'escape',
        boarding: 'boarded',
        boarded: 'boarding',
        cargoRaid: 'enemyCargoRaid',
        enemyCargoRaid: 'cargoRaid'
    };
    return {
        ...snapshot,
        player: snapshot.enemy,
        enemy: snapshot.player,
        outcome: outcomeMap[snapshot.outcome] || snapshot.outcome,
        reward: null,
        rewardResult: null,
        logs: Array.isArray(snapshot.logs) ? snapshot.logs : []
    };
}

function notifyStateChanged(b) {
    if (!b || typeof b.options.onStateChange !== 'function') return;
    b.options.onStateChange(serializeBattleState(b));
}

function log(b, message) {
    b.logs.unshift(message);
    if (b.logs.length > 30) b.logs.length = 30;
    const el = document.getElementById('navalBattleLog');
    if (el) el.innerHTML = b.logs.map((m) => `<div>${escapeHtml(m)}</div>`).join('');
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// ---------------------------------------------------------------------
// 戦闘処理
// ---------------------------------------------------------------------
function hasEvadeWindow(ship) {
    // おもかじ選択直後（最初の1カウント）のみ無敵
    const lagTotal = ship.command?.lagTotal || ship.command?.def?.lag || 0;
    return Boolean(
        ship.command &&
        ship.command.def.type === 'rudder' &&
        ship.command.lagRemaining >= lagTotal - 1
    );
}

function getCommandLag(ship, def) {
    let lag = Number(def?.lag || 1);
    if (ship?.speed > 0 && (def?.type === 'move' || def?.type === 'rudder')) {
        lag -= 1;
    }
    if (ship?.speed >= 2 && def?.id === 'sternCannon') {
        lag -= 1;
    }
    return Math.max(1, lag);
}

// 命中判定＋ダメージ適用。命中したら true
function fireCannon(b, attacker, defender, { damage, sureHit = false, name, isRam = false }) {
    if (hasEvadeWindow(defender)) {
        log(b, `${defender.label}は${attacker.label}の${name}を緊急回避！（無敵）`);
        return false;
    }
    if (!sureHit) {
        const evade = EVADE_RATE[defender.facing] || 0;
        if (Math.random() < evade) {
            log(b, `${attacker.label}の${name}は外れた（${FACING_LABEL[defender.facing]}回避）`);
            return false;
        }
    }
    let dealt = damage;
    dealt += Number(attacker.attackBonus || 0);
    if (defender.facing === 'side') dealt = Math.round(dealt * SIDE_DAMAGE_MULTIPLIER);
    dealt = Math.max(1, dealt - Number(defender.defenseBonus || 0));
    defender.hp = Math.max(0, defender.hp - dealt);
    log(b, `${attacker.label}の${name}が命中！ ${defender.label}に${dealt}ダメージ`);
    // 条件①：横向き/後ろ向きで大砲を被弾 → 操舵不能
    if (!isRam && (defender.facing === 'side' || defender.facing === 'back')) {
        applyStun(b, defender);
    }
    checkKnockout(b);
    return true;
}

function applyStun(b, ship) {
    ship.stun = Math.max(ship.stun, STUN_COUNTS);
    if (ship.command) {
        log(b, `${ship.label}の「${ship.command.def.label}」は操舵不能で停止した`);
    }
    log(b, `${ship.label}は操舵不能になった！（${STUN_COUNTS}カウント）`);
}

function checkKnockout(b) {
    if (b.finished) return true;
    if (b.enemy.hp <= 0) { finishBattle(b, 'victory'); return true; }
    if (b.player.hp <= 0) { finishBattle(b, 'defeat'); return true; }
    return false;
}

function enterPhaseB(b) {
    if (b.finished) return;
    b.distance = 0;
    // 重なり状態：強制的に横並び（横向き同士）。進行中コマンドは仕切り直し
    [b.player, b.enemy].forEach((ship) => {
        ship.facing = 'side';
        if (ship.command) ship.command = null;
    });
    log(b, '両船が重なった！ 並走状態（距離0）に移行');
    updateLayout(b);
}

function availableCommands(b, self, foe) {
    if (b.distance === 0) return PHASE_B_COMMANDS.map((id) => COMMANDS[id]);
    return (PHASE_A_COMMANDS[self.facing] || []).map((id) => COMMANDS[id]);
}

function canSelect(b, self, foe, def) {
    if (b.finished || self.stun > 0 || self.command) return false;
    if (def.type === 'rudder' && self.rudderCooldown > 0) return false;
    if (typeof def.isAvailable === 'function' && !def.isAvailable(b, self, foe)) return false;
    return true;
}

function selectCommand(b, self, foe, def) {
    if (!canSelect(b, self, foe, def)) return false;
    // 接舷は選択した瞬間に成立
    if (def.id === 'boarding') {
        log(b, `${self.label}が接舷した！ 白兵戦へ移行する`);
        if (self.isPlayer) {
            finishBattle(b, 'boarding');
        } else {
            finishBattle(b, 'boarded');
        }
        return true;
    }
    const lag = getCommandLag(self, def);
    self.command = { def, lagRemaining: lag, lagTotal: lag, ramWeakened: false };
    log(b, `${self.label}が「${def.label}」を選択（ラグ ${lag}）`);
    render(b);
    notifyStateChanged(b);
    return true;
}

function completeCommand(b, self, foe) {
    const command = self.command;
    if (!command) return;
    self.command = null;
    const def = command.def;
    if (def.type === 'rudder') {
        self.facing = def.facingAfter;
        self.rudderCooldown = RUDDER_COOLDOWN;
        log(b, `${self.label}はおもかじを切って${FACING_LABEL[self.facing]}になった`);
        return;
    }
    // resolve 内で self.command を参照できるよう一時的に戻す（衝角の弱体化判定）
    self.command = command;
    if (typeof def.resolve === 'function') def.resolve(b, self, foe);
    if (self.command === command) self.command = null;
}

// ---------------------------------------------------------------------
// 簡易AI（距離・向き・HPでコマンドを自動選択）
// ---------------------------------------------------------------------
function aiSelect(b) {
    const self = b.enemy;
    const foe = b.player;
    if (b.finished || self.stun > 0 || self.command) return;

    const lowHp = self.hp <= self.maxHp * 0.3;
    const plan = b.enemyPlan || ENEMY_PLANS[0];
    const pick = (id) => selectCommand(b, self, foe, COMMANDS[id]);

    if (b.distance === 0) {
        if (foe.stun > 0 && canSelect(b, self, foe, COMMANDS.boarding)) { pick('boarding'); return; }
        if (canSelect(b, self, foe, COMMANDS.cargoRaid) && (lowHp || Math.random() < 0.35)) { pick('cargoRaid'); return; }
        if (lowHp && Math.random() < plan.caution) { pick('retreat'); return; }
        pick('zeroBroadside');
        return;
    }

    if (self.facing === 'side') {
        // 横向きは危険：HPが減っていれば向きを変える、それ以外は舷側砲
        if (lowHp && canSelect(b, self, foe, COMMANDS.rudderToBack) && Math.random() < plan.caution) { pick('rudderToBack'); return; }
        if (canSelect(b, self, foe, COMMANDS.broadside) && Math.random() < plan.broadsideBias) { pick('broadside'); return; }
        if (canSelect(b, self, foe, COMMANDS.rudderToFront)) { pick('rudderToFront'); return; }
        if (canSelect(b, self, foe, COMMANDS.broadside)) { pick('broadside'); return; }
        return;
    }

    if (self.facing === 'back') {
        if (lowHp) { pick('flee'); return; }
        if (Math.random() < 0.5) { pick('sternCannon'); return; }
        if (canSelect(b, self, foe, COMMANDS.rudderToSide)) { pick('rudderToSide'); return; }
        pick('sternCannon');
        return;
    }

    // 前向き
    if (lowHp && canSelect(b, self, foe, COMMANDS.rudderToSide) && Math.random() < plan.caution) { pick('rudderToSide'); return; }
    if (b.distance === 1 && Math.random() < plan.ramBias) { pick('ram'); return; }
    if (b.distance > 1 && Math.random() < plan.advanceBias) { pick('advance'); return; }
    pick('bowCannon');
}

// ---------------------------------------------------------------------
// メインループ（1カウント）
// ---------------------------------------------------------------------
function tick(b) {
    if (b.finished) return;
    b.count += 1;

    [b.player, b.enemy].forEach((self) => {
        const foe = self.isPlayer ? b.enemy : b.player;
        if (b.finished) return;
        if (self.stun > 0) {
            // 操舵不能：タイムライン進行停止
            self.stun -= 1;
            if (self.stun === 0) log(b, `${self.label}の操舵が回復した`);
            return;
        }
        if (self.rudderCooldown > 0) self.rudderCooldown -= 1;
        if (self.command) {
            self.command.lagRemaining -= 1;
            if (self.command.lagRemaining <= 0) completeCommand(b, self, foe);
        }
    });

    if (!b.finished && !b.options.disableAi) aiSelect(b);
    render(b);
    notifyStateChanged(b);
}

function normalizeExplorationCandidates(profile = {}) {
    const source = asObject(profile);
    const candidates = [
        source.explorationCandidates,
        source.explorationRewards,
        source.reports,
        source.destinations,
        source.playerShip?.explorationCandidates
    ].find(Array.isArray) || [];
    return candidates
        .map((entry) => String(entry?.name || entry?.destinationName || entry?.label || entry?.id || entry || '').trim())
        .filter(Boolean)
        .slice(0, 3);
}

function resolveChipPool(profile = {}) {
    const source = asObject(profile);
    const value = Number(
        source.chips
        ?? source.chip
        ?? source.points
        ?? source.balance
        ?? source.troyChips
        ?? 0
    );
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function createRewardModel(options = {}, playerShip, enemyShip) {
    const opponentProfile = asObject(options.opponentProfile || options.rewardProfile);
    const chipPool = resolveChipPool(opponentProfile);
    const explorationCandidates = normalizeExplorationCandidates(opponentProfile);
    return {
        chipPool,
        targetShip: enemyShip?.shipType || '船',
        targetCargoText: enemyShip?.cargoText || '空',
        targetCargoTotal: Math.max(0, Number(enemyShip?.cargoTotal || 0) || 0),
        topCargo: enemyShip?.topCargo || null,
        explorationCandidates,
        limits: PLUNDER_LIMITS,
        risk: REPAIR_RISK,
        note: '実資産の移動はサーバー検証API接続後に確定'
    };
}

function estimateChipReward(model, limit) {
    if (model.chipPool > 0) {
        return Math.min(limit.chips, Math.max(1, Math.floor(model.chipPool * 0.08)));
    }
    return limit.chips;
}

function estimateCargoReward(model, limit) {
    const top = model.topCargo;
    if (top?.id && top.amount > 0) {
        return {
            id: top.id,
            amount: Math.min(limit.cargo, Math.max(1, Math.floor(top.amount * 0.25)))
        };
    }
    if (model.targetCargoTotal > 0) {
        return { id: '貨物', amount: Math.min(limit.cargo, Math.max(1, Math.floor(model.targetCargoTotal * 0.2))) };
    }
    return { id: '貨物候補', amount: limit.cargo };
}

function resolveOutcomeReward(b, outcome) {
    const model = b.reward || createRewardModel(b.options, b.player, b.enemy);
    if (outcome === 'victory' || outcome === 'cargoRaid') {
        const limit = PLUNDER_LIMITS[outcome === 'victory' ? 'victory' : 'cargoRaid'];
        const cargo = estimateCargoReward(model, limit);
        const exploration = model.explorationCandidates.slice(0, limit.exploration);
        return {
            outcome,
            label: outcome === 'victory' ? '撃沈勝利' : '船倉略奪撤退',
            chips: estimateChipReward(model, limit),
            cargo,
            exploration,
            capped: true,
            note: '店内ゲーム用に少量上限で計算'
        };
    }
    if (outcome === 'defeat' || outcome === 'boarded' || outcome === 'enemyCargoRaid') {
        return {
            outcome,
            label: outcome === 'enemyCargoRaid' ? '略奪された' : '敗北リスク',
            repairChips: REPAIR_RISK.chips,
            cooldownMinutes: REPAIR_RISK.cooldownMinutes,
            note: '修理費/クールダウン候補'
        };
    }
    if (outcome === 'escape' || outcome === 'enemyEscaped') {
        return {
            outcome,
            label: outcome === 'escape' ? '逃走成功' : '相手逃走',
            chips: 0,
            cargo: null,
            note: '戦利品なし。損失も最小'
        };
    }
    return {
        outcome,
        label: '白兵戦へ移行',
        note: '接舷後の勝敗は白兵戦側で判定'
    };
}

function formatRewardResult(result) {
    if (!result) return '';
    if (result.outcome === 'victory' || result.outcome === 'cargoRaid') {
        const cargo = result.cargo ? `${result.cargo.id} x${result.cargo.amount}` : '貨物なし';
        const exploration = result.exploration?.length ? ` / ${result.exploration.join('、')}` : '';
        return `戦利品候補: チップ${result.chips} / ${cargo}${exploration}。${result.note}`;
    }
    if (result.repairChips) {
        return `リスク: 修理費チップ${result.repairChips}、クールダウン${result.cooldownMinutes}分。${result.note}`;
    }
    return result.note || '';
}

// ---------------------------------------------------------------------
// 終了処理
// ---------------------------------------------------------------------
const OUTCOME_TEXT = {
    victory: { title: '撃沈勝利！', body: '敵船を沈黙させ、船倉を確保した。' },
    defeat: { title: '敗北…', body: '自船が大破した。修理と再出撃準備が必要。' },
    escape: { title: '逃走成功！', body: '敵から逃げ切った。戦利品はないが損失も最小。' },
    enemyEscaped: { title: '敵に逃げられた', body: '相手は海域から離脱した。' },
    cargoRaid: { title: '船倉略奪成功！', body: '少量だけ奪い、深追いせず撤退した。' },
    enemyCargoRaid: { title: '船倉を荒らされた', body: '相手が少量を奪って撤退した。' },
    boarding: { title: '接舷成功！', body: '白兵戦へ移行する！' },
    boarded: { title: '接舷された！', body: '敵が乗り込んでくる！ 白兵戦へ移行する！' }
};

function showBattleResultOverlay(b) {
    if (!b || b.outcome === 'boarding' || b.outcome === 'boarded') return;
    const text = OUTCOME_TEXT[b.outcome] || { title: '海戦終了', body: '' };
    const overlay = document.getElementById('navalBattleResult');
    if (overlay) {
        overlay.querySelector('.naval-result-title').textContent = text.title;
        overlay.querySelector('.naval-result-body').textContent = [text.body, formatRewardResult(b.rewardResult)].filter(Boolean).join('\n');
        overlay.hidden = false;
    }
}

function finishBattle(b, outcome) {
    if (b.finished) return;
    b.finished = true;
    b.outcome = outcome;
    b.rewardResult = resolveOutcomeReward(b, outcome);
    if (b.timer) { clearInterval(b.timer); b.timer = null; }
    render(b);
    notifyStateChanged(b);

    if (outcome === 'boarding' || outcome === 'boarded') {
        // 接舷は結果画面を挟まず即座に白兵戦スタブへ
        closeNavalBattle();
        startMeleeCombat();
        return;
    }

    showBattleResultOverlay(b);
}

function handleResultClose() {
    const b = battle;
    closeNavalBattle();
    if (!b) return;
    const callbacks = {
        victory: b.options.onVictory,
        defeat: b.options.onDefeat,
        escape: b.options.onEscape,
        enemyEscaped: b.options.onEnemyEscaped,
        cargoRaid: b.options.onCargoRaid,
        enemyCargoRaid: b.options.onEnemyCargoRaid
    };
    const cb = callbacks[b.outcome];
    if (typeof cb === 'function') cb(b.options.opponentId, b.rewardResult);
}

function getTacticalMessage(b) {
    if (!b || b.finished) return '';
    if (b.distance === 0 && canSelect(b, b.player, b.enemy, COMMANDS.cargoRaid)) {
        return '略奪撤退好機：船倉を少量だけ奪って戦闘を切り上げられる。';
    }
    if (b.distance === 0 && b.enemy.stun > 0) {
        return '接舷好機：相手の操舵が止まっている。';
    }
    if (b.distance === 0 && b.player.stun > 0) {
        return '接舷危険：こちらの操舵が止まっている。';
    }
    if (b.enemy.command?.def.id === 'ram') {
        return '衝角警戒：敵が突進準備中。船首砲で威力を落とせる。';
    }
    if (b.player.facing === 'side') {
        return '横腹危険：被弾すると大ダメージになりやすい。';
    }
    if (b.player.facing === 'back') {
        return '後ろ向き：安全だが攻撃力は低い。船尾砲で相手を遅らせられる。';
    }
    if (b.enemy.facing === 'side') {
        return '砲撃好機：相手が横腹を見せている。';
    }
    if (b.distance === 1 && b.player.facing === 'front') {
        return '接近好機：衝角から接舷に持ち込める距離。';
    }
    if (b.enemy.command) {
        return `敵行動：${b.enemy.command.def.label}まであと${b.enemy.command.lagRemaining}カウント。`;
    }
    return `敵戦法：${b.enemyPlan?.name || '標準型'}。距離と向きで攻め方が変わる。`;
}

// 白兵戦システムは実装済みの前提：スタブ呼び出しで処理を終える
function startMeleeCombat() {
    console.log('[NavalBattle] startMeleeCombat() — 白兵戦システムへ移行（スタブ）');
    const b = battle;
    if (b && typeof b.options.onBoarding === 'function') {
        b.options.onBoarding(b.options.opponentId);
    }
}

function closeNavalBattle() {
    if (battle && battle.timer) { clearInterval(battle.timer); battle.timer = null; }
    const modal = document.getElementById('navalBattleModal');
    if (modal) modal.classList.remove('is-open');
    document.body.classList.remove('naval-battle-lock');
}

// ---------------------------------------------------------------------
// UI 構築
// ---------------------------------------------------------------------
const NAVAL_CSS = `
#navalBattleModal { position: fixed; inset: 0; z-index: 6000; display: none; align-items: center; justify-content: center; background: rgba(4, 12, 18, 0.86); padding: 12px; }
#navalBattleModal.is-open { display: flex; }
body.naval-battle-lock { overflow: hidden; }
.naval-shell { width: min(720px, 100%); max-height: min(96vh, 920px); overflow-y: auto; background: linear-gradient(180deg, #13241f 0%, #07141b 100%); border: 1px solid #58706c; border-radius: 10px; padding: 14px; color: #edf7f4; font-size: 13px; box-shadow: 0 22px 60px rgba(0,0,0,0.42); }
.naval-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.naval-title-block { min-width: 0; }
.naval-head h3 { margin: 0; font-size: 17px; letter-spacing: 0; }
.naval-subtitle { margin-top: 2px; color: #a9c6bf; font-size: 11px; }
.naval-close { width: 34px; height: 34px; display: grid; place-items: center; background: #152724; border: 1px solid #4a6661; border-radius: 8px; color: #d7e7e2; font-size: 20px; cursor: pointer; padding: 0; flex: 0 0 auto; }
.naval-close:hover { background: #203631; }

.naval-timeline { position: relative; height: 64px; background: #0b1a20; border: 1px solid #335751; border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
.naval-timeline-axis { position: absolute; inset: 0; display: flex; }
.naval-timeline-axis span { flex: 1; border-left: 1px dashed rgba(108, 145, 137, 0.42); color: #6f918a; font-size: 10px; padding: 3px 0 0 4px; }
.naval-timeline-lane-label { position: absolute; left: 8px; color: #789d95; font-size: 10px; z-index: 1; }
.naval-timeline-lane-label.is-player { top: 24px; }
.naval-timeline-lane-label.is-enemy { bottom: 8px; }
.naval-timeline-marker { position: absolute; left: 0; transform: translateX(-50%); transition: left ${TICK_MS}ms linear; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.24); max-width: 44%; overflow: hidden; text-overflow: ellipsis; }
.naval-timeline-marker.is-player { top: 20px; background: #1f7a69; color: #f3fffb; }
.naval-timeline-marker.is-enemy { bottom: 5px; background: #a93f42; color: #fff5f2; }
.naval-timeline-marker.is-idle { opacity: 0.35; }

.naval-battle-grid { display: grid; grid-template-columns: minmax(300px, 1.06fr) minmax(280px, 0.94fr); gap: 10px; align-items: stretch; margin-bottom: 10px; }
.naval-sea { position: relative; min-height: 244px; border-radius: 8px; border: 1px solid #365d58; background: linear-gradient(180deg, #18413d 0%, #0f3239 54%, #081a22 100%); overflow: hidden; }
.naval-sea::before { content: ""; position: absolute; inset: 34px 0 0; background: repeating-linear-gradient(172deg, rgba(179, 221, 211, 0.14) 0 1px, transparent 1px 22px); opacity: 0.45; pointer-events: none; }
.naval-sea::after { content: ""; position: absolute; left: 12%; right: 12%; top: 50%; border-top: 1px dashed rgba(244, 211, 126, 0.42); pointer-events: none; }
.naval-distance-label { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); min-width: 96px; text-align: center; color: #ffe5a3; background: rgba(9, 26, 31, 0.72); border: 1px solid rgba(244, 211, 126, 0.36); border-radius: 999px; font-size: 12px; font-weight: 700; padding: 3px 10px; z-index: 1; }
.naval-ship { position: absolute; width: 96px; text-align: center; transition: left 400ms ease, top 400ms ease, transform 400ms ease; }
.naval-ship .naval-ship-glyph { width: 58px; height: 58px; display: inline-grid; place-items: center; background: rgba(5, 15, 18, 0.56); border: 1px solid rgba(226, 244, 239, 0.18); border-radius: 8px; font-size: 38px; line-height: 1; transition: transform 400ms ease; filter: drop-shadow(0 5px 5px rgba(0,0,0,0.42)); }
.naval-ship .naval-ship-name { font-size: 11px; color: #edf8f4; margin-top: 4px; text-shadow: 0 1px 2px #000; overflow-wrap: anywhere; }
.naval-ship .naval-ship-facing { font-size: 10px; color: #a9c9c1; }
.naval-ship.is-stunned .naval-ship-glyph { animation: navalShake 0.4s infinite; filter: grayscale(0.6) drop-shadow(0 4px 4px rgba(0,0,0,0.5)); }
@keyframes navalShake { 0%,100% { transform: var(--naval-rot) translateX(0); } 25% { transform: var(--naval-rot) translateX(-3px); } 75% { transform: var(--naval-rot) translateX(3px); } }
/* 距離0：2.5D風の並走レイアウト（奥に敵、手前に自分） */
.naval-sea.is-overlap { background: linear-gradient(180deg, #204b3f 0%, #15373a 55%, #081a22 100%); }
.naval-sea.is-overlap .naval-ship.is-enemy { transform: scale(0.75); z-index: 1; }
.naval-sea.is-overlap .naval-ship.is-player { transform: scale(1.1); z-index: 2; }

.naval-status { display: grid; grid-template-columns: 1fr; gap: 8px; }
.naval-status-card { background: #0b1a20; border: 1px solid #335751; border-radius: 8px; padding: 9px; min-width: 0; }
.naval-status-card h4 { margin: 0 0 6px; font-size: 12px; overflow-wrap: anywhere; }
.naval-status-card.is-player h4 { color: #7ee3cf; }
.naval-status-card.is-enemy h4 { color: #ffaaa0; }
.naval-hp-bar { height: 9px; background: #1d2d2b; border-radius: 999px; overflow: hidden; margin: 4px 0 7px; }
.naval-hp-fill { height: 100%; background: linear-gradient(90deg, #50d6a5, #1fae83); transition: width 300ms ease; }
.naval-hp-fill.is-low { background: linear-gradient(90deg, #f87171, #dc2626); }
.naval-status-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: #b8cec8; padding: 1px 0; }
.naval-status-row b { color: #fff; text-align: right; overflow-wrap: anywhere; }
.naval-stun-badge { color: #fbbf24; font-weight: bold; }

.naval-win-routes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.naval-route { border: 1px solid #345b54; border-radius: 8px; background: #0d1d20; padding: 7px; min-width: 0; }
.naval-route strong { display: block; color: #f4d37e; font-size: 12px; overflow-wrap: anywhere; }
.naval-route span { display: block; margin-top: 2px; color: #a9c6bf; font-size: 10px; line-height: 1.25; overflow-wrap: anywhere; }
.naval-route.is-ready { border-color: #d7b35c; background: #211d11; }
.naval-route.is-danger { border-color: #9c4648; background: #231416; }
.naval-route.is-done { border-color: #51b893; background: #10261e; }
.naval-loot-panel, .naval-intel { border-radius: 8px; font-size: 12px; line-height: 1.45; padding: 8px 10px; margin-bottom: 8px; overflow-wrap: anywhere; }
.naval-loot-panel { background: #151f1a; border: 1px solid #5e7045; color: #efe5bd; }
.naval-intel { background: #13211f; border: 1px solid #3f6a62; color: #dcefe9; }
.naval-commands { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-bottom: 8px; }
.naval-command-btn { min-width: 0; min-height: 76px; background: #12231f; border: 1px solid #3f6a62; color: #edf7f4; border-radius: 8px; padding: 9px; cursor: pointer; text-align: left; display: grid; gap: 4px; align-content: start; }
.naval-command-btn:disabled { opacity: 0.42; cursor: default; filter: grayscale(0.25); }
.naval-command-btn:not(:disabled):hover { background: #19352e; border-color: #7ccbb9; }
.naval-command-btn b { display: block; font-size: 13px; line-height: 1.25; overflow-wrap: anywhere; }
.naval-command-btn small { display: block; font-size: 10px; color: #b5d2ca; line-height: 1.35; overflow-wrap: anywhere; }
.naval-command-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: #f4d37e; font-size: 10px; font-weight: 700; }
.naval-command-kind { color: #0b1816; background: #f4d37e; border-radius: 999px; padding: 2px 7px; }
.naval-command-btn.is-cannon { border-color: #577a89; }
.naval-command-btn.is-ram { border-color: #a95d4d; }
.naval-command-btn.is-rudder { border-color: #4f9b88; }
.naval-command-btn.is-move { border-color: #8b9161; }
.naval-command-btn.is-loot { border-color: #c0a150; }
.naval-command-btn.is-boarding { border-color: #b76d76; }
.naval-command-note { font-size: 11px; color: #f4d37e; min-height: 16px; margin-bottom: 6px; overflow-wrap: anywhere; }

#navalBattleLog { height: 92px; overflow-y: auto; background: #07141b; border: 1px solid #2f534d; border-radius: 8px; padding: 7px 9px; font-size: 11px; line-height: 1.5; color: #b8cec8; }

#navalBattleResult { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(4, 9, 18, 0.82); border-radius: 12px; z-index: 3; }
#navalBattleResult[hidden] { display: none; }
.naval-result-card { width: min(420px, 92%); background: #11211f; border: 2px solid #6b8060; border-radius: 10px; padding: 20px 24px; text-align: center; box-shadow: 0 18px 46px rgba(0,0,0,0.35); }
.naval-result-title { font-size: 18px; margin: 0 0 8px; }
.naval-result-body { font-size: 13px; color: #c8ded8; margin: 0 0 14px; white-space: pre-line; line-height: 1.55; }
.naval-result-close { background: #1f7a69; color: #fff; border: none; border-radius: 8px; padding: 8px 24px; cursor: pointer; }
.naval-result-close:hover { background: #26947f; }

@media (max-width: 640px) {
    #navalBattleModal { padding: 6px; align-items: stretch; }
    .naval-shell { width: 100%; max-height: 100%; border-radius: 8px; padding: 10px; }
    .naval-battle-grid { display: block; margin-bottom: 10px; }
    .naval-sea { min-height: 168px; margin-bottom: 10px; }
    .naval-win-routes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .naval-commands { grid-template-columns: 1fr; }
    .naval-command-btn { min-height: 64px; }
    .naval-timeline-marker { max-width: 50%; }
}
`;

function ensureModal() {
    let modal = document.getElementById('navalBattleModal');
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'navalBattleStyle';
    style.textContent = NAVAL_CSS;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'navalBattleModal';
    modal.innerHTML = `
        <div class="naval-shell" role="dialog" aria-modal="true" aria-labelledby="navalBattleTitle" style="position: relative;">
            <div class="naval-head">
                <div class="naval-title-block">
                    <h3 id="navalBattleTitle">略奪海戦</h3>
                    <div class="naval-subtitle">QR相手とのリアルタイムPvP</div>
                </div>
                <button type="button" class="naval-close" aria-label="海戦をやめる" data-naval-close>×</button>
            </div>
            <div class="naval-timeline" id="navalTimeline">
                <div class="naval-timeline-axis">${
                    Array.from({ length: TIMELINE_MAX + 1 }, (_, i) => `<span>${i}</span>`).join('')
                }</div>
                <div class="naval-timeline-lane-label is-player">自分</div>
                <div class="naval-timeline-lane-label is-enemy">相手</div>
                <div class="naval-timeline-marker is-player" id="navalMarkerPlayer">待機中</div>
                <div class="naval-timeline-marker is-enemy" id="navalMarkerEnemy">待機中</div>
            </div>
            <div class="naval-battle-grid">
                <div class="naval-sea" id="navalSea">
                    <div class="naval-distance-label" id="navalDistanceLabel"></div>
                    <div class="naval-ship is-enemy" id="navalShipEnemy">
                        <span class="naval-ship-glyph">🏴‍☠️</span>
                        <div class="naval-ship-name" id="navalShipEnemyName"></div>
                        <div class="naval-ship-facing" id="navalShipEnemyFacing"></div>
                    </div>
                    <div class="naval-ship is-player" id="navalShipPlayer">
                        <span class="naval-ship-glyph">⛵</span>
                        <div class="naval-ship-name">自分の船</div>
                        <div class="naval-ship-facing" id="navalShipPlayerFacing"></div>
                    </div>
                </div>
                <div class="naval-status">
                    <div class="naval-status-card is-player">
                        <h4>自分の船</h4>
                        <div class="naval-hp-bar"><div class="naval-hp-fill" id="navalHpPlayer"></div></div>
                        <div class="naval-status-row"><span>HP</span><b id="navalHpPlayerText"></b></div>
                        <div class="naval-status-row"><span>船型</span><b id="navalTypePlayer"></b></div>
                        <div class="naval-status-row"><span>補正</span><b id="navalSpecPlayer"></b></div>
                        <div class="naval-status-row"><span>向き</span><b id="navalFacingPlayer"></b></div>
                        <div class="naval-status-row"><span>おもかじCD</span><b id="navalRudderPlayer"></b></div>
                        <div class="naval-status-row"><span>操舵不能</span><b id="navalStunPlayer"></b></div>
                        <div class="naval-status-row"><span>船倉</span><b id="navalCargoPlayer"></b></div>
                    </div>
                    <div class="naval-status-card is-enemy">
                        <h4 id="navalEnemyTitle">敵船</h4>
                        <div class="naval-hp-bar"><div class="naval-hp-fill" id="navalHpEnemy"></div></div>
                        <div class="naval-status-row"><span>HP</span><b id="navalHpEnemyText"></b></div>
                        <div class="naval-status-row"><span>船型</span><b id="navalTypeEnemy"></b></div>
                        <div class="naval-status-row"><span>補正</span><b id="navalSpecEnemy"></b></div>
                        <div class="naval-status-row"><span>戦法</span><b id="navalEnemyPlan"></b></div>
                        <div class="naval-status-row"><span>向き</span><b id="navalFacingEnemy"></b></div>
                        <div class="naval-status-row"><span>おもかじCD</span><b id="navalRudderEnemy"></b></div>
                        <div class="naval-status-row"><span>操舵不能</span><b id="navalStunEnemy"></b></div>
                        <div class="naval-status-row"><span>船倉</span><b id="navalCargoEnemy"></b></div>
                    </div>
                </div>
            </div>
            <div class="naval-win-routes" id="navalWinRoutes"></div>
            <div class="naval-loot-panel" id="navalLootPanel"></div>
            <div class="naval-intel" id="navalIntel"></div>
            <div class="naval-command-note" id="navalCommandNote"></div>
            <div class="naval-commands" id="navalCommands"></div>
            <div id="navalBattleLog"></div>
            <div id="navalBattleResult" hidden>
                <div class="naval-result-card">
                    <h3 class="naval-result-title"></h3>
                    <p class="naval-result-body"></p>
                    <button type="button" class="naval-result-close">閉じる</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('[data-naval-close]').addEventListener('click', () => {
        // 戦闘放棄＝敗北扱いにはせず、単に海戦を中断する
        closeNavalBattle();
    });
    modal.querySelector('.naval-result-close').addEventListener('click', handleResultClose);
    return modal;
}

// ---------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------
const FACING_ROTATION_PLAYER = { front: 'rotate(-90deg)', side: 'rotate(0deg)', back: 'rotate(90deg)' };
const FACING_ROTATION_ENEMY = { front: 'rotate(90deg) scaleX(-1)', side: 'scaleX(-1)', back: 'rotate(-90deg) scaleX(-1)' };

function renderMarker(el, ship) {
    if (!el) return;
    if (ship.stun > 0) {
        el.textContent = `操舵不能 ${ship.stun}`;
        el.classList.remove('is-idle');
        el.style.left = '50%';
        return;
    }
    if (!ship.command) {
        el.textContent = '待機中';
        el.classList.add('is-idle');
        el.style.left = '8%';
        return;
    }
    el.classList.remove('is-idle');
    el.textContent = `${ship.command.def.label} ${ship.command.lagRemaining}`;
    const ratio = Math.min(1, Math.max(0, ship.command.lagRemaining / TIMELINE_MAX));
    el.style.left = `${8 + ratio * 84}%`;
}

function renderShipPositions(b) {
    const sea = document.getElementById('navalSea');
    const playerEl = document.getElementById('navalShipPlayer');
    const enemyEl = document.getElementById('navalShipEnemy');
    if (!sea || !playerEl || !enemyEl) return;

    const isOverlap = b.distance === 0;
    sea.classList.toggle('is-overlap', isOverlap);

    const playerGlyph = playerEl.querySelector('.naval-ship-glyph');
    const enemyGlyph = enemyEl.querySelector('.naval-ship-glyph');

    if (isOverlap) {
        // 2.5D風：奥（上）に敵、手前（下）に自分、横並び
        enemyEl.style.left = 'calc(50% - 48px)';
        enemyEl.style.top = '26px';
        playerEl.style.left = 'calc(50% - 48px)';
        playerEl.style.top = '86px';
        playerGlyph.style.setProperty('--naval-rot', 'rotate(0deg)');
        enemyGlyph.style.setProperty('--naval-rot', 'scaleX(-1)');
        playerGlyph.style.transform = 'rotate(0deg)';
        enemyGlyph.style.transform = 'scaleX(-1)';
    } else {
        // 距離1〜5：左に敵、右に自分。距離に応じて間隔を変える
        const spread = Math.min(5, Math.max(1, b.distance));
        const offset = 6 + (5 - spread) * 7; // 距離が縮むほど中央へ寄る
        enemyEl.style.left = `${offset}%`;
        enemyEl.style.top = '54px';
        playerEl.style.left = `calc(${100 - offset}% - 96px)`;
        playerEl.style.top = '54px';
        playerGlyph.style.setProperty('--naval-rot', FACING_ROTATION_PLAYER[b.player.facing]);
        enemyGlyph.style.setProperty('--naval-rot', FACING_ROTATION_ENEMY[b.enemy.facing]);
        playerGlyph.style.transform = FACING_ROTATION_PLAYER[b.player.facing];
        enemyGlyph.style.transform = FACING_ROTATION_ENEMY[b.enemy.facing];
    }
    playerEl.classList.toggle('is-stunned', b.player.stun > 0);
    enemyEl.classList.toggle('is-stunned', b.enemy.stun > 0);

    const label = document.getElementById('navalDistanceLabel');
    if (label) {
        label.textContent = isOverlap
            ? '⚓ 重なり状態（距離0）— 並走中'
            : `距離 ${b.distance}`;
    }
}

function renderStatus(b) {
    const cards = [
        { ship: b.player, hp: 'navalHpPlayer', hpText: 'navalHpPlayerText', type: 'navalTypePlayer', spec: 'navalSpecPlayer', cargo: 'navalCargoPlayer', facing: 'navalFacingPlayer', rudder: 'navalRudderPlayer', stun: 'navalStunPlayer', shipFacing: 'navalShipPlayerFacing' },
        { ship: b.enemy, hp: 'navalHpEnemy', hpText: 'navalHpEnemyText', type: 'navalTypeEnemy', spec: 'navalSpecEnemy', cargo: 'navalCargoEnemy', facing: 'navalFacingEnemy', rudder: 'navalRudderEnemy', stun: 'navalStunEnemy', shipFacing: 'navalShipEnemyFacing' }
    ];
    cards.forEach(({ ship, hp, hpText, type, spec, cargo, facing, rudder, stun, shipFacing }) => {
        const fill = document.getElementById(hp);
        if (fill) {
            const ratio = ship.hp / ship.maxHp;
            fill.style.width = `${Math.max(0, ratio * 100)}%`;
            fill.classList.toggle('is-low', ratio <= 0.3);
        }
        const hpEl = document.getElementById(hpText);
        if (hpEl) hpEl.textContent = `${ship.hp} / ${ship.maxHp}`;
        const typeEl = document.getElementById(type);
        if (typeEl) typeEl.textContent = `${ship.shipName || ship.shipType || '船'} / ${ship.shipType || '船'} Lv${ship.shipLevel || 1}`;
        const specEl = document.getElementById(spec);
        if (specEl) specEl.textContent = `攻+${ship.attackBonus || 0} 防+${ship.defenseBonus || 0} 速+${ship.speed || 0}`;
        const cargoEl = document.getElementById(cargo);
        if (cargoEl) cargoEl.textContent = ship.cargoText || '空';
        const facingEl = document.getElementById(facing);
        if (facingEl) facingEl.textContent = b.distance === 0 ? '横並び' : FACING_LABEL[ship.facing];
        const rudderEl = document.getElementById(rudder);
        if (rudderEl) rudderEl.textContent = ship.rudderCooldown > 0 ? `残り${ship.rudderCooldown}` : 'OK';
        const stunEl = document.getElementById(stun);
        if (stunEl) {
            stunEl.textContent = ship.stun > 0 ? `残り${ship.stun}カウント` : '-';
            stunEl.classList.toggle('naval-stun-badge', ship.stun > 0);
        }
        const shipFacingEl = document.getElementById(shipFacing);
        if (shipFacingEl) shipFacingEl.textContent = b.distance === 0 ? '横並び' : FACING_LABEL[ship.facing];
    });
    const enemyPlan = document.getElementById('navalEnemyPlan');
    if (enemyPlan) enemyPlan.textContent = b.enemyPlan?.name || '標準型';
    const intel = document.getElementById('navalIntel');
    if (intel) intel.textContent = getTacticalMessage(b);
    const loot = document.getElementById('navalLootPanel');
    if (loot) {
        const model = b.reward || createRewardModel(b.options, b.player, b.enemy);
        const victory = PLUNDER_LIMITS.victory;
        const raid = PLUNDER_LIMITS.cargoRaid;
        loot.textContent = `戦利品上限: 撃沈 チップ${victory.chips}/貨物${victory.cargo}、略奪撤退 チップ${raid.chips}/貨物${raid.cargo}。対象船倉: ${model.targetCargoText}。敗北時: 修理費候補チップ${model.risk.chips}/CD${model.risk.cooldownMinutes}分。`;
    }
}

function renderWinRoutes(b) {
    const container = document.getElementById('navalWinRoutes');
    if (!container) return;
    const enemyLow = b.enemy.hp <= b.enemy.maxHp * 0.35;
    const boardingReady = b.distance === 0 && b.enemy.stun > 0;
    const cargoReady = canSelect(b, b.player, b.enemy, COMMANDS.cargoRaid);
    const escapeReady = b.player.facing === 'back' && b.distance >= 4;
    const playerBoardingRisk = b.distance === 0 && b.player.stun > 0;
    const routes = [
        {
            key: 'sink',
            title: '撃沈',
            text: `敵HP ${b.enemy.hp}/${b.enemy.maxHp}`,
            state: b.outcome === 'victory' ? 'done' : enemyLow ? 'ready' : ''
        },
        {
            key: 'boarding',
            title: '接舷',
            text: boardingReady ? '白兵戦へ移行可能' : '相手スタンが必要',
            state: b.outcome === 'boarding' ? 'done' : playerBoardingRisk ? 'danger' : boardingReady ? 'ready' : ''
        },
        {
            key: 'escape',
            title: '逃走',
            text: `距離 ${b.distance}/${ESCAPE_DISTANCE}`,
            state: b.outcome === 'escape' ? 'done' : escapeReady ? 'ready' : ''
        },
        {
            key: 'cargo',
            title: '略奪撤退',
            text: cargoReady ? '船倉を少量確保' : '距離0で隙を作る',
            state: b.outcome === 'cargoRaid' ? 'done' : cargoReady ? 'ready' : ''
        }
    ];
    container.innerHTML = routes.map((route) => `
        <div class="naval-route ${route.state ? `is-${route.state}` : ''}" data-route="${escapeHtml(route.key)}">
            <strong>${escapeHtml(route.title)}</strong>
            <span>${escapeHtml(route.text)}</span>
        </div>
    `).join('');
}

function renderCommands(b) {
    const container = document.getElementById('navalCommands');
    const note = document.getElementById('navalCommandNote');
    if (!container) return;
    container.innerHTML = '';

    const self = b.player;
    const foe = b.enemy;
    availableCommands(b, self, foe).forEach((def) => {
        const lag = getCommandLag(self, def);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `naval-command-btn is-${def.type}`;
        button.dataset.navalCommand = def.id;
        button.innerHTML = `
            <span class="naval-command-meta">
                <span class="naval-command-kind">${escapeHtml(COMMAND_TYPE_LABEL[def.type] || '行動')}</span>
                <span>ラグ ${lag}</span>
            </span>
            <b>${escapeHtml(def.label)}</b>
            <small>${escapeHtml(def.desc)}</small>
        `;
        button.disabled = !canSelect(b, self, foe, def);
        button.setAttribute('aria-label', `${def.label} ラグ${lag}`);
        button.addEventListener('click', () => {
            if (typeof b.options.onCommandSelect === 'function') {
                const handled = b.options.onCommandSelect(def.id, {
                    command: def,
                    canSelect: canSelect(b, self, foe, def),
                    state: serializeBattleState(b)
                });
                if (handled !== false) return;
            }
            selectCommand(b, self, foe, def);
        });
        container.appendChild(button);
    });

    if (note) {
        if (b.finished) note.textContent = '';
        else if (self.stun > 0) note.textContent = `操舵不能！ あと${self.stun}カウント動けない`;
        else if (self.command) note.textContent = `「${self.command.def.label}」実行中（あと${self.command.lagRemaining}カウント）`;
        else note.textContent = 'コマンドを選択してください';
    }
}

function render(b) {
    renderMarker(document.getElementById('navalMarkerPlayer'), b.player);
    renderMarker(document.getElementById('navalMarkerEnemy'), b.enemy);
    renderShipPositions(b);
    renderStatus(b);
    renderWinRoutes(b);
    renderCommands(b);
}

function updateLayout(b) {
    renderShipPositions(b);
}

// ---------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------
function startNavalBattle(options = {}) {
    const modal = ensureModal();

    if (battle && battle.timer) clearInterval(battle.timer);

    const enemyPlan = options.enemyPlan
        ? resolveEnemyPlanByName(options.enemyPlan)
        : createEnemyPlan(options);
    battle = {
        options,
        count: 0,
        distance: INITIAL_DISTANCE,
        enemyPlan,
        player: createShip(
            options.playerName ? `${options.playerName}の船` : '自分の船',
            true,
            options.playerProfile,
            options.playerShipProfile
        ),
        enemy: createShip(
            options.opponentName ? `${options.opponentName}の船` : '敵船',
            false,
            options.opponentProfile,
            options.opponentShipProfile
        ),
        logs: [],
        finished: false,
        outcome: null,
        reward: null,
        rewardResult: null,
        timer: null
    };
    battle.reward = createRewardModel(options, battle.player, battle.enemy);

    const enemyTitle = document.getElementById('navalEnemyTitle');
    if (enemyTitle) enemyTitle.textContent = battle.enemy.label;
    const enemyName = document.getElementById('navalShipEnemyName');
    if (enemyName) enemyName.textContent = battle.enemy.label;
    const result = document.getElementById('navalBattleResult');
    if (result) result.hidden = true;
    const logEl = document.getElementById('navalBattleLog');
    if (logEl) logEl.innerHTML = '';

    log(battle, `${battle.enemy.label}と接敵！ 海戦開始（距離 ${INITIAL_DISTANCE} / ${battle.enemyPlan.name}）`);
    modal.classList.add('is-open');
    document.body.classList.add('naval-battle-lock');
    render(battle);

    if (!options.disableTimer) {
        battle.timer = setInterval(() => tick(battle), TICK_MS);
    }
    return battle;
}

function applyNavalBattleSnapshot(snapshot, perspective = 'player') {
    if (!battle) return null;
    const next = transformSnapshotForPerspective(snapshot, perspective);
    if (!next) return null;
    battle.count = Math.max(0, Number(next.count) || 0);
    battle.distance = Math.max(0, Math.min(ESCAPE_DISTANCE, Number(next.distance ?? INITIAL_DISTANCE) || 0));
    battle.player = cloneShipState(next.player, '自分の船', true);
    battle.enemy = cloneShipState(next.enemy, '敵船', false);
    battle.enemyPlan = resolveEnemyPlanByName(next.enemyPlan);
    battle.reward = next.reward || createRewardModel(battle.options, battle.player, battle.enemy);
    battle.rewardResult = next.rewardResult || null;
    battle.logs = Array.isArray(next.logs) ? next.logs.slice(0, 30) : [];
    battle.finished = Boolean(next.finished);
    battle.outcome = next.outcome || null;
    if (battle.finished) {
        battle.rewardResult = resolveOutcomeReward(battle, battle.outcome);
    }

    const enemyTitle = document.getElementById('navalEnemyTitle');
    if (enemyTitle) enemyTitle.textContent = battle.enemy.label;
    const enemyName = document.getElementById('navalShipEnemyName');
    if (enemyName) enemyName.textContent = battle.enemy.label;
    const logEl = document.getElementById('navalBattleLog');
    if (logEl) logEl.innerHTML = battle.logs.map((m) => `<div>${escapeHtml(m)}</div>`).join('');
    render(battle);
    if (battle.finished) showBattleResultOverlay(battle);
    return battle;
}

function applyNavalBattleCommand(commandId, side = 'player') {
    if (!battle || battle.finished) return false;
    const def = COMMANDS[commandId];
    if (!def) return false;
    const self = side === 'enemy' ? battle.enemy : battle.player;
    const foe = side === 'enemy' ? battle.player : battle.enemy;
    return selectCommand(battle, self, foe, def);
}

function stepNavalBattle() {
    if (!battle || battle.finished) return false;
    tick(battle);
    return true;
}

window.startNavalBattle = startNavalBattle;
if (typeof window.startMeleeCombat !== 'function') {
    window.startMeleeCombat = startMeleeCombat;
}

// テスト・デバッグ用フック
window.__navalBattleDebug = {
    getState: () => battle,
    serialize: () => serializeBattleState(battle),
    applySnapshot: applyNavalBattleSnapshot,
    applyCommand: applyNavalBattleCommand,
    step: stepNavalBattle,
    mutate: (fn) => {
        if (!battle || typeof fn !== 'function') return null;
        fn(battle);
        render(battle);
        notifyStateChanged(battle);
        return battle;
    },
    forceBoarding: () => { if (battle && !battle.finished) finishBattle(battle, 'boarding'); },
    forceOutcome: (outcome) => { if (battle && !battle.finished) finishBattle(battle, outcome); }
};
})();

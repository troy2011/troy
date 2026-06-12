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
        desc: '中ダメージ。衝角チャージ中の相手の威力を半減',
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
        desc: '超大ダメージ（必中）',
        resolve(b, self, foe) {
            fireCannon(b, self, foe, { damage: 30, sureHit: true, name: '舷側砲' });
        }
    },
    sternCannon: {
        id: 'sternCannon', label: '船尾砲', lag: 3, type: 'cannon',
        desc: '小ダメージ。命中時、相手のコマンドを1カウント遅延',
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
        desc: '距離1限定。特大ダメージ＋相手を操舵不能。チャージ中はアーマー',
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
const PHASE_B_COMMANDS = ['zeroBroadside', 'retreat', 'boarding'];

// ---------------------------------------------------------------------
// 戦闘状態
// ---------------------------------------------------------------------
let battle = null;

function createShip(label, isPlayer) {
    return {
        label,
        isPlayer,
        hp: MAX_HP,
        maxHp: MAX_HP,
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
        ramWeakened: Boolean(command.ramWeakened)
    };
}

function cloneShipState(source, fallbackLabel, isPlayer) {
    const ship = createShip(source?.label || fallbackLabel, isPlayer);
    ship.hp = Math.max(0, Number(source?.hp ?? ship.hp) || 0);
    ship.maxHp = Math.max(1, Number(source?.maxHp ?? ship.maxHp) || 1);
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
        facing: ship.facing,
        stun: ship.stun,
        rudderCooldown: ship.rudderCooldown,
        command: ship.command ? {
            id: ship.command.def.id,
            lagRemaining: ship.command.lagRemaining,
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
    return {
        ...snapshot,
        player: snapshot.enemy,
        enemy: snapshot.player,
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
    return Boolean(
        ship.command &&
        ship.command.def.type === 'rudder' &&
        ship.command.lagRemaining >= ship.command.def.lag - 1
    );
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
    if (defender.facing === 'side') dealt = Math.round(dealt * SIDE_DAMAGE_MULTIPLIER);
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
    self.command = { def, lagRemaining: def.lag, ramWeakened: false };
    log(b, `${self.label}が「${def.label}」を選択（ラグ ${def.lag}）`);
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

// ---------------------------------------------------------------------
// 終了処理
// ---------------------------------------------------------------------
const OUTCOME_TEXT = {
    victory: { title: '略奪勝利！', body: '敵船を沈黙させた。（略奪勝利スタブ）' },
    defeat: { title: '敗北…', body: '自船が大破した。（敗北スタブ）' },
    escape: { title: '逃走成功！', body: '敵から逃げ切った。（逃走勝利スタブ）' },
    enemyEscaped: { title: '敵に逃げられた', body: '相手は海域から離脱した。' },
    boarding: { title: '接舷成功！', body: '白兵戦へ移行する！' },
    boarded: { title: '接舷された！', body: '敵が乗り込んでくる！ 白兵戦へ移行する！' }
};

function finishBattle(b, outcome) {
    if (b.finished) return;
    b.finished = true;
    b.outcome = outcome;
    if (b.timer) { clearInterval(b.timer); b.timer = null; }
    render(b);
    notifyStateChanged(b);

    if (outcome === 'boarding' || outcome === 'boarded') {
        // 接舷は結果画面を挟まず即座に白兵戦スタブへ
        closeNavalBattle();
        startMeleeCombat();
        return;
    }

    const text = OUTCOME_TEXT[outcome] || { title: '海戦終了', body: '' };
    const overlay = document.getElementById('navalBattleResult');
    if (overlay) {
        overlay.querySelector('.naval-result-title').textContent = text.title;
        overlay.querySelector('.naval-result-body').textContent = text.body;
        overlay.hidden = false;
    }
}

function handleResultClose() {
    const b = battle;
    closeNavalBattle();
    if (!b) return;
    const callbacks = {
        victory: b.options.onVictory,
        defeat: b.options.onDefeat,
        escape: b.options.onEscape,
        enemyEscaped: b.options.onEnemyEscaped
    };
    const cb = callbacks[b.outcome];
    if (typeof cb === 'function') cb(b.options.opponentId);
}

function getTacticalMessage(b) {
    if (!b || b.finished) return '';
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
#navalBattleModal { position: fixed; inset: 0; z-index: 6000; display: none; align-items: center; justify-content: center; background: rgba(6, 12, 24, 0.85); }
#navalBattleModal.is-open { display: flex; }
body.naval-battle-lock { overflow: hidden; }
.naval-shell { width: min(560px, 96vw); max-height: 96vh; overflow-y: auto; background: linear-gradient(180deg, #11243c 0%, #0a1626 100%); border: 2px solid #3b577c; border-radius: 12px; padding: 12px; color: #e8f0fa; font-size: 13px; }
.naval-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.naval-head h3 { margin: 0; font-size: 16px; }
.naval-close { background: transparent; border: none; color: #9fb4ce; font-size: 20px; cursor: pointer; padding: 0 6px; }

.naval-timeline { position: relative; height: 56px; background: #0d1c30; border: 1px solid #2c4566; border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
.naval-timeline-axis { position: absolute; inset: 0; display: flex; }
.naval-timeline-axis span { flex: 1; border-left: 1px dashed #25405f; color: #5d7894; font-size: 10px; padding: 2px 0 0 3px; }
.naval-timeline-marker { position: absolute; left: 0; transform: translateX(-50%); transition: left ${TICK_MS}ms linear; padding: 1px 6px; border-radius: 9px; font-size: 11px; white-space: nowrap; }
.naval-timeline-marker.is-player { top: 6px; background: #1d4ed8; }
.naval-timeline-marker.is-enemy { bottom: 6px; background: #b91c1c; }
.naval-timeline-marker.is-idle { opacity: 0.35; }

.naval-sea { position: relative; height: 170px; border-radius: 8px; border: 1px solid #2c4566; background: linear-gradient(180deg, #14334f 0%, #0d2740 55%, #0a1d31 100%); margin-bottom: 10px; overflow: hidden; }
.naval-distance-label { position: absolute; top: 6px; left: 0; right: 0; text-align: center; color: #9fc3e8; font-size: 12px; }
.naval-ship { position: absolute; width: 96px; text-align: center; transition: left 400ms ease, top 400ms ease, transform 400ms ease; }
.naval-ship .naval-ship-glyph { font-size: 40px; line-height: 1; display: inline-block; transition: transform 400ms ease; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.5)); }
.naval-ship .naval-ship-name { font-size: 11px; color: #cfe3f7; margin-top: 2px; text-shadow: 0 1px 2px #000; }
.naval-ship .naval-ship-facing { font-size: 10px; color: #8fb7dd; }
.naval-ship.is-stunned .naval-ship-glyph { animation: navalShake 0.4s infinite; filter: grayscale(0.6) drop-shadow(0 4px 4px rgba(0,0,0,0.5)); }
@keyframes navalShake { 0%,100% { transform: var(--naval-rot) translateX(0); } 25% { transform: var(--naval-rot) translateX(-3px); } 75% { transform: var(--naval-rot) translateX(3px); } }
/* 距離0：2.5D風の並走レイアウト（奥に敵、手前に自分） */
.naval-sea.is-overlap { background: linear-gradient(180deg, #1a3c5c 0%, #102c47 55%, #0a1d31 100%); }
.naval-sea.is-overlap .naval-ship.is-enemy { transform: scale(0.75); z-index: 1; }
.naval-sea.is-overlap .naval-ship.is-player { transform: scale(1.1); z-index: 2; }

.naval-status { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.naval-status-card { background: #0d1c30; border: 1px solid #2c4566; border-radius: 8px; padding: 8px; }
.naval-status-card h4 { margin: 0 0 4px; font-size: 12px; }
.naval-status-card.is-player h4 { color: #7fb3ff; }
.naval-status-card.is-enemy h4 { color: #ff9b8a; }
.naval-hp-bar { height: 8px; background: #1c2f49; border-radius: 4px; overflow: hidden; margin: 3px 0 6px; }
.naval-hp-fill { height: 100%; background: linear-gradient(90deg, #34d399, #10b981); transition: width 300ms ease; }
.naval-hp-fill.is-low { background: linear-gradient(90deg, #f87171, #dc2626); }
.naval-status-row { display: flex; justify-content: space-between; font-size: 11px; color: #b9cde4; }
.naval-status-row b { color: #fff; }
.naval-stun-badge { color: #fbbf24; font-weight: bold; }

.naval-intel { background: #17253a; border: 1px solid #3f6491; border-radius: 8px; color: #d9e8f7; font-size: 12px; line-height: 1.45; padding: 7px 9px; margin-bottom: 8px; }
.naval-commands { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.naval-command-btn { flex: 1 1 calc(50% - 6px); min-width: 140px; background: #1b3a5e; border: 1px solid #3f6491; color: #e8f0fa; border-radius: 8px; padding: 8px 6px; cursor: pointer; text-align: left; }
.naval-command-btn:disabled { opacity: 0.35; cursor: default; }
.naval-command-btn:not(:disabled):hover { background: #245081; }
.naval-command-btn b { display: block; font-size: 13px; }
.naval-command-btn small { display: block; font-size: 10px; color: #9fc3e8; margin-top: 2px; }
.naval-command-note { font-size: 11px; color: #fbbf24; min-height: 16px; margin-bottom: 6px; }

#navalBattleLog { height: 84px; overflow-y: auto; background: #0a1626; border: 1px solid #2c4566; border-radius: 8px; padding: 6px 8px; font-size: 11px; line-height: 1.5; color: #b9cde4; }

#navalBattleResult { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(4, 9, 18, 0.82); border-radius: 12px; z-index: 3; }
#navalBattleResult[hidden] { display: none; }
.naval-result-card { background: #11243c; border: 2px solid #3b577c; border-radius: 12px; padding: 20px 28px; text-align: center; }
.naval-result-title { font-size: 18px; margin: 0 0 8px; }
.naval-result-body { font-size: 13px; color: #b9cde4; margin: 0 0 14px; }
.naval-result-close { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 8px 24px; cursor: pointer; }
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
                <h3 id="navalBattleTitle">海戦</h3>
                <button type="button" class="naval-close" aria-label="海戦をやめる" data-naval-close>×</button>
            </div>
            <div class="naval-timeline" id="navalTimeline">
                <div class="naval-timeline-axis">${
                    Array.from({ length: TIMELINE_MAX + 1 }, (_, i) => `<span>${i}</span>`).join('')
                }</div>
                <div class="naval-timeline-marker is-player" id="navalMarkerPlayer">待機中</div>
                <div class="naval-timeline-marker is-enemy" id="navalMarkerEnemy">待機中</div>
            </div>
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
                    <div class="naval-status-row"><span>向き</span><b id="navalFacingPlayer"></b></div>
                    <div class="naval-status-row"><span>おもかじCD</span><b id="navalRudderPlayer"></b></div>
                    <div class="naval-status-row"><span>操舵不能</span><b id="navalStunPlayer"></b></div>
                </div>
                <div class="naval-status-card is-enemy">
                    <h4 id="navalEnemyTitle">敵船</h4>
                    <div class="naval-hp-bar"><div class="naval-hp-fill" id="navalHpEnemy"></div></div>
                    <div class="naval-status-row"><span>HP</span><b id="navalHpEnemyText"></b></div>
                    <div class="naval-status-row"><span>戦法</span><b id="navalEnemyPlan"></b></div>
                    <div class="naval-status-row"><span>向き</span><b id="navalFacingEnemy"></b></div>
                    <div class="naval-status-row"><span>おもかじCD</span><b id="navalRudderEnemy"></b></div>
                    <div class="naval-status-row"><span>操舵不能</span><b id="navalStunEnemy"></b></div>
                </div>
            </div>
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
        { ship: b.player, hp: 'navalHpPlayer', hpText: 'navalHpPlayerText', facing: 'navalFacingPlayer', rudder: 'navalRudderPlayer', stun: 'navalStunPlayer', shipFacing: 'navalShipPlayerFacing' },
        { ship: b.enemy, hp: 'navalHpEnemy', hpText: 'navalHpEnemyText', facing: 'navalFacingEnemy', rudder: 'navalRudderEnemy', stun: 'navalStunEnemy', shipFacing: 'navalShipEnemyFacing' }
    ];
    cards.forEach(({ ship, hp, hpText, facing, rudder, stun, shipFacing }) => {
        const fill = document.getElementById(hp);
        if (fill) {
            const ratio = ship.hp / ship.maxHp;
            fill.style.width = `${Math.max(0, ratio * 100)}%`;
            fill.classList.toggle('is-low', ratio <= 0.3);
        }
        const hpEl = document.getElementById(hpText);
        if (hpEl) hpEl.textContent = `${ship.hp} / ${ship.maxHp}`;
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
}

function renderCommands(b) {
    const container = document.getElementById('navalCommands');
    const note = document.getElementById('navalCommandNote');
    if (!container) return;
    container.innerHTML = '';

    const self = b.player;
    const foe = b.enemy;
    availableCommands(b, self, foe).forEach((def) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'naval-command-btn';
        button.dataset.navalCommand = def.id;
        button.innerHTML = `<b>${escapeHtml(def.label)}（ラグ ${def.lag}）</b><small>${escapeHtml(def.desc)}</small>`;
        button.disabled = !canSelect(b, self, foe, def);
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
        player: createShip(options.playerName ? `${options.playerName}の船` : '自分の船', true),
        enemy: createShip(options.opponentName ? `${options.opponentName}の船` : '敵船', false),
        logs: [],
        finished: false,
        outcome: null,
        timer: null
    };

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
    battle.logs = Array.isArray(next.logs) ? next.logs.slice(0, 30) : [];
    battle.finished = Boolean(next.finished);
    battle.outcome = next.outcome || null;

    const enemyTitle = document.getElementById('navalEnemyTitle');
    if (enemyTitle) enemyTitle.textContent = battle.enemy.label;
    const enemyName = document.getElementById('navalShipEnemyName');
    if (enemyName) enemyName.textContent = battle.enemy.label;
    const logEl = document.getElementById('navalBattleLog');
    if (logEl) logEl.innerHTML = battle.logs.map((m) => `<div>${escapeHtml(m)}</div>`).join('');
    render(battle);
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

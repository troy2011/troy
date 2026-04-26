// server/tarotShipSkills.js
// 船デッキスキルデータ定義
// 小アルカナ56枚（逆位置）+ 大アルカナ22枚
//
// パラメータ構成:
//   name        : スキル名（tarotSkillNames.js と一致）
//   element     : 'fire' | 'water' | 'wind' | 'earth'  ← スートで決まる
//   role        : 'attack' | 'heal' | 'interfere' | 'defend'  ← スートで決まる
//   activationType: 'active' | 'triggered'
//   triggerCondition: null または 条件文字列（triggered のみ）
//   castTime    : 秒（float）
//   cooldown    : 秒（int）
//   range       : 'self' | 'near' | 'medium' | 'far' | 'global'
//   aoe         : 'single' | 'cone' | 'area' | 'all'
//   effect      : { type, subtype, value, duration, target, ... }
//   description : 日本語説明
//
// スート ↔ 属性・ロール対応:
//   wand     → fire  / attack
//   sword    → wind  / interfere
//   cup      → water / heal
//   pentacle → earth / defend

// ────────────────────────────────────────────────────────────
// WAND 逆位置（火・攻撃）
// ────────────────────────────────────────────────────────────
const WAND_REVERSED = {
    1: {
        name: '空転', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 25, range: 'near', aoe: 'single',
        effect: { type: 'debuff', subtype: 'stun', value: 1, duration: 3, target: 'enemy-ship' },
        description: '敵船を3秒間行動不能にする'
    },
    2: {
        name: '焦燥', element: 'fire', role: 'attack',
        activationType: 'triggered', triggerCondition: 'on-hp-below-50pct',
        castTime: 0, cooldown: 40, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'atk-up', value: 1.5, duration: 15, target: 'self' },
        description: 'HP50%以下になったとき自動発動。攻撃力を15秒間1.5倍に強化する'
    },
    3: {
        name: '停滞', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 35, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'cooldown-increase', value: 10, duration: 20, target: 'enemy-ship' },
        description: '敵のスキルクールタイムを20秒間10秒延長する'
    },
    4: {
        name: '遅延', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 30, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'slow', value: 0.5, duration: 10, target: 'enemy-ship' },
        description: '敵船の移動速度を50%低下させる（10秒間）'
    },
    5: {
        name: '強襲号令', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 70, range: 'near', aoe: 'area',
        effect: { type: 'special', subtype: 'summon-allies', value: { maxTargets: 2, radius: 70, followBuff: 'atk-up', buffValue: 1.25, buffDuration: 8 }, duration: 8, target: 'all-allies' },
        description: '近くの味方を最大2人、自船の周囲へ呼び寄せる。召集された味方は8秒間攻撃力1.25倍'
    },
    6: {
        name: '慢心', element: 'fire', role: 'attack',
        activationType: 'triggered', triggerCondition: 'on-dealt-damage',
        castTime: 0, cooldown: 30, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'shield', value: 200, duration: 8, target: 'self' },
        description: '与ダメージ発生時に自動発動。200のシールドを8秒間展開'
    },
    7: {
        name: '疲弊', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 45, range: 'near', aoe: 'single',
        effect: { type: 'damage', subtype: 'mutual', value: 0.3, duration: 0, target: 'both' },
        description: '自分と敵の両方に最大HPの30%のダメージを与える'
    },
    8: {
        name: '混乱', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 28, range: 'medium', aoe: 'single',
        effect: { type: 'damage', subtype: 'dot-burn', value: 50, duration: 12, target: 'enemy-ship' },
        description: '敵船に炎上DoTを付与。12秒間3秒毎に50ダメージ'
    },
    9: {
        name: '疑心', element: 'fire', role: 'attack',
        activationType: 'triggered', triggerCondition: 'on-received-damage',
        castTime: 0, cooldown: 35, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'def-up', value: 1.4, duration: 10, target: 'self' },
        description: '被ダメージ時に自動発動。防御力を10秒間1.4倍に強化'
    },
    10: {
        name: '崩壊', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 50, range: 'medium', aoe: 'cone',
        effect: { type: 'damage', subtype: 'cone-blast', value: 350, duration: 0, target: 'enemy-area' },
        description: '前方扇形範囲に350の爆発ダメージを与える'
    },
    11: {
        name: '軽率', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 40, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'position-swap', value: 1, duration: 0, target: 'enemy-ship' },
        description: '敵船と自船の位置を強制入れ替えする'
    },
    12: {
        name: '暴走', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 0.5, cooldown: 55, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'berserker', value: { atkMult: 2.0, defMult: 0.5 }, duration: 20, target: 'self' },
        description: '攻撃力2倍・防御力半減のバーサーカー状態になる（20秒間）'
    },
    13: {
        name: '嫉妬', element: 'fire', role: 'attack',
        activationType: 'triggered', triggerCondition: 'on-enemy-buffed',
        castTime: 0, cooldown: 45, range: 'near', aoe: 'single',
        effect: { type: 'special', subtype: 'buff-steal', value: 1, duration: 0, target: 'enemy-ship' },
        description: '敵にバフが付いたとき自動発動。バフを1つ奪い取る'
    },
    14: {
        name: '独裁', element: 'fire', role: 'attack',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 90, range: 'global', aoe: 'all',
        effect: { type: 'debuff', subtype: 'global-cooldown-increase', value: 15, duration: 30, target: 'all-enemies' },
        description: 'マップ上の全敵船のクールタイムを30秒間15秒延長する'
    }
};

// ────────────────────────────────────────────────────────────
// SWORD 逆位置（風・妨害）
// ────────────────────────────────────────────────────────────
const SWORD_REVERSED = {
    1: {
        name: '混迷', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 35, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'confusion', value: 1, duration: 8, target: 'enemy-ship' },
        description: '敵船を8秒間混乱させ、スキル発動を50%の確率で失敗させる'
    },
    2: {
        name: '欺瞞', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 40, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'decoy', value: 1, duration: 12, target: 'self' },
        description: '偽のシールド表示を敵に見せる囮を12秒間展開する'
    },
    3: {
        name: '解放', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 30, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'debuff-cleanse', value: 1, duration: 0, target: 'self' },
        description: '自船の全デバフを即時除去する'
    },
    4: {
        name: '焦慮', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 38, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'cast-time-increase', value: 2.0, duration: 15, target: 'enemy-ship' },
        description: '敵のスキル詠唱時間を15秒間2倍に増加する'
    },
    5: {
        name: '和解', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 50, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'truce', value: 1, duration: 20, target: 'enemy-ship' },
        description: '指定敵船との間に20秒間の停戦協定を強制成立させる'
    },
    6: {
        name: '未練', element: 'wind', role: 'interfere',
        activationType: 'triggered', triggerCondition: 'on-enemy-skill-use',
        castTime: 0, cooldown: 45, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'skill-interrupt', value: 1, duration: 0, target: 'enemy-ship' },
        description: '敵スキル詠唱開始時に自動発動。詠唱を中断させる（CT: 45秒）'
    },
    7: {
        name: '暴露', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 35, range: 'far', aoe: 'single',
        effect: { type: 'special', subtype: 'reveal-stealth', value: 1, duration: 30, target: 'enemy-ship' },
        description: '敵船のステルス・偽装を解除し、30秒間位置を暴露する'
    },
    8: {
        name: '退避路', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 0.5, cooldown: 65, range: 'medium', aoe: 'area',
        effect: { type: 'special', subtype: 'summon-allies', value: { maxTargets: 1, radius: 90, cleanse: true, followBuff: 'status-immunity', buffDuration: 5 }, duration: 5, target: 'all-allies' },
        description: '味方1人を自船の周囲へ退避させ、デバフを解除して5秒間状態異常を無効化する'
    },
    9: {
        name: '覚醒', element: 'wind', role: 'interfere',
        activationType: 'triggered', triggerCondition: 'on-stun-or-sleep',
        castTime: 0, cooldown: 60, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'status-immunity', value: 1, duration: 10, target: 'self' },
        description: '拘束・スタン系デバフを受けた瞬間に自動発動。10秒間状態異常無効'
    },
    10: {
        name: '復活', element: 'wind', role: 'interfere',
        activationType: 'triggered', triggerCondition: 'on-hp-zero',
        castTime: 0, cooldown: 180, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'revive', value: 0.3, duration: 0, target: 'self' },
        description: 'HP0になった瞬間に自動発動。HP30%で復活する（CT: 180秒）'
    },
    11: {
        name: '欺き', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 40, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'skill-seal', value: 1, duration: 12, target: 'enemy-ship' },
        description: '敵の特定スキル1つを12秒間封印する'
    },
    12: {
        name: '暴言', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 30, range: 'near', aoe: 'area',
        effect: { type: 'debuff', subtype: 'taunt', value: 1, duration: 8, target: 'enemy-area' },
        description: '近距離の敵船全てを8秒間挑発し、自船への攻撃に引き付ける'
    },
    13: {
        name: '冷酷', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 55, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'heal-block', value: 1, duration: 20, target: 'enemy-ship' },
        description: '敵船の回復スキルを20秒間完全に無効化する'
    },
    14: {
        name: '専制', element: 'wind', role: 'interfere',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 90, range: 'global', aoe: 'all',
        effect: { type: 'debuff', subtype: 'global-skill-seal', value: 1, duration: 10, target: 'all-enemies' },
        description: 'マップ上の全敵船のスキルを10秒間封印する'
    }
};

// ────────────────────────────────────────────────────────────
// CUP 逆位置（水・回復）
// ────────────────────────────────────────────────────────────
const CUP_REVERSED = {
    1: {
        name: '枯渇', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 40, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'heal-drain', value: 0.5, duration: 15, target: 'enemy-ship' },
        description: '敵の回復効果を15秒間50%減少させる'
    },
    2: {
        name: '救難信号', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 60, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'summon-allies', value: { maxTargets: 1, radius: 60, healPct: 0.25 }, duration: 0, target: 'all-allies' },
        description: '味方1人を自船の近くへ呼び寄せ、最大HPの25%を即時回復する'
    },
    3: {
        name: '放縦', element: 'water', role: 'heal',
        activationType: 'triggered', triggerCondition: 'on-ally-heal',
        castTime: 0, cooldown: 30, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'over-heal-damage', value: 100, duration: 0, target: 'caster' },
        description: '味方への過回復が発生した際に自動発動。余剰回復量が自船へのダメージになる'
    },
    4: {
        name: '再起', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 50, range: 'self', aoe: 'single',
        effect: { type: 'heal', subtype: 'regen', value: 80, duration: 20, target: 'self' },
        description: '20秒間4秒毎にHP80を回復する再生効果を付与する'
    },
    5: {
        name: '希望', element: 'water', role: 'heal',
        activationType: 'triggered', triggerCondition: 'on-hp-below-30pct',
        castTime: 0, cooldown: 60, range: 'self', aoe: 'single',
        effect: { type: 'heal', subtype: 'emergency-heal', value: 0.4, duration: 0, target: 'self' },
        description: 'HP30%以下で自動発動。最大HPの40%を即時回復する'
    },
    6: {
        name: '執着', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 55, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'target-mark', value: 1, duration: 20, target: 'enemy-ship' },
        description: '敵に呪縛の印を刻み、20秒間与えた回復の50%をダメージとして還元する'
    },
    7: {
        name: '意志', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 40, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'focus', value: { castTimeReduce: 0.5, ctReduce: 0.8 }, duration: 15, target: 'self' },
        description: '詠唱時間を15秒間半減し、クールタイム倍率を0.8倍にする'
    },
    8: {
        name: '漂流', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 35, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'drift', value: 1, duration: 10, target: 'enemy-ship' },
        description: '敵船を10秒間制御不能状態にし、ランダム方向に漂流させる'
    },
    9: {
        name: '過信', element: 'water', role: 'heal',
        activationType: 'triggered', triggerCondition: 'on-full-hp',
        castTime: 0, cooldown: 45, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'overheal-shield', value: 300, duration: 20, target: 'self' },
        description: 'HP満タン時に自動発動。余剰分を300シールドに変換する'
    },
    10: {
        name: '幻滅', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 50, range: 'far', aoe: 'single',
        effect: { type: 'debuff', subtype: 'buff-nullify', value: 1, duration: 0, target: 'enemy-ship' },
        description: '敵船の現在の全バフを即時除去する'
    },
    11: {
        name: '幻惑', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 35, range: 'medium', aoe: 'area',
        effect: { type: 'debuff', subtype: 'illusion', value: 1, duration: 12, target: 'enemy-area' },
        description: '範囲内の敵船に幻覚を見せ、12秒間命中率を60%に低下させる'
    },
    12: {
        name: '詐欺', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 60, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'fake-hp-display', value: 1, duration: 20, target: 'self' },
        description: '敵の表示する自船HPを偽の値に変える（20秒間）'
    },
    13: {
        name: '操作', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 90, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'mind-control', value: 1, duration: 8, target: 'enemy-ship' },
        description: '敵船を8秒間操作し、別の敵に対して攻撃させる'
    },
    14: {
        name: '不誠実', element: 'water', role: 'heal',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 70, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'contract-betray', value: 0.5, duration: 30, target: 'enemy-ship' },
        description: '敵との停戦・同盟を強制破棄し、受けたダメージを50%増加させる（30秒間）'
    }
};

// ────────────────────────────────────────────────────────────
// PENTACLE 逆位置（地・防御）
// ────────────────────────────────────────────────────────────
const PENTACLE_REVERSED = {
    1: {
        name: '損失', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 45, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'resource-drain', value: 0.2, duration: 0, target: 'enemy-ship' },
        description: '敵船の所持資源（金・木・食料）を20%奪う'
    },
    2: {
        name: '過負荷', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 40, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'speed-weight', value: 0.4, duration: 20, target: 'enemy-ship' },
        description: '敵船に過負荷を与え、移動速度を40%低下させる（20秒間）'
    },
    3: {
        name: '粗雑', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 35, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'armor-break', value: 0.35, duration: 15, target: 'enemy-ship' },
        description: '敵船の装甲を35%破壊し、受ダメージを増加させる（15秒間）'
    },
    4: {
        name: '執着', element: 'earth', role: 'defend',
        activationType: 'triggered', triggerCondition: 'on-resource-consumed',
        castTime: 0, cooldown: 30, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'resource-recovery', value: 0.5, duration: 0, target: 'self' },
        description: '資源消費時に自動発動。消費量の50%を回収する（CT: 30秒）'
    },
    5: {
        name: '援助', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 60, range: 'near', aoe: 'single',
        effect: { type: 'special', subtype: 'summon-allies', value: { maxTargets: 1, radius: 55, shield: 250 }, duration: 10, target: 'all-allies' },
        description: '味方1人を自船の近くへ呼び寄せ、10秒間250シールドを付与する'
    },
    6: {
        name: '負債', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 55, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'delayed-damage', value: 500, duration: 30, target: 'enemy-ship' },
        description: '30秒後に500の遅延ダメージを与える呪いを付与する'
    },
    7: {
        name: '焦燥', element: 'earth', role: 'defend',
        activationType: 'triggered', triggerCondition: 'on-ct-ready',
        castTime: 0, cooldown: 25, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'atk-up-on-ready', value: 1.3, duration: 8, target: 'self' },
        description: 'スキルCTが0になった時に自動発動。8秒間攻撃力1.3倍'
    },
    8: {
        name: '怠惰', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 40, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'skill-delay', value: 5, duration: 0, target: 'enemy-ship' },
        description: '敵の全スキルのCTを即時5秒増加させる'
    },
    9: {
        name: '浪費', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 50, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'resource-waste', value: 0.3, duration: 15, target: 'enemy-ship' },
        description: 'スキル発動コストを15秒間1.3倍に増加させる'
    },
    10: {
        name: '崩壊', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 80, range: 'far', aoe: 'area',
        effect: { type: 'special', subtype: 'terrain-collapse', value: 300, duration: 20, target: 'area' },
        description: '遠距離の範囲地形を崩壊させ、移動に300の地形ダメージを付与（20秒間）'
    },
    11: {
        name: '怠慢', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 35, range: 'medium', aoe: 'single',
        effect: { type: 'debuff', subtype: 'atk-down', value: 0.6, duration: 15, target: 'enemy-ship' },
        description: '敵の攻撃力を15秒間40%低下させる'
    },
    12: {
        name: '停滞', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 45, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'fortify', value: { defMult: 2.0, speedMult: 0 }, duration: 15, target: 'self' },
        description: '15秒間移動を停止し防御力を2倍にする要塞化状態になる'
    },
    13: {
        name: '物欲', element: 'earth', role: 'defend',
        activationType: 'triggered', triggerCondition: 'on-kill',
        castTime: 0, cooldown: 20, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'loot-bonus', value: 2.0, duration: 0, target: 'self' },
        description: '撃沈時に自動発動。獲得資源を2倍にする'
    },
    14: {
        name: '腐敗', element: 'earth', role: 'defend',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 70, range: 'medium', aoe: 'area',
        effect: { type: 'debuff', subtype: 'corruption', value: { dotValue: 30, stackMax: 5 }, duration: 30, target: 'enemy-area' },
        description: '範囲内の敵に腐敗を付与。スキル使用毎にスタック（最大5）し毎秒30×スタックのダメージ'
    }
};

// ────────────────────────────────────────────────────────────
// 大アルカナ（完全別カテゴリ・ゲーム変革級）
// ────────────────────────────────────────────────────────────
const MAJOR_ARCANA_SKILLS = {
    0: {
        name: '愚者', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 0, cooldown: 60, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'random-chaos', value: 1, duration: 0, target: 'all' },
        description: 'ランダム効果を全ユニットに適用。バフ・デバフ・移動・ダメージ等がランダムで発生'
    },
    1: {
        name: '魔術師', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 0, cooldown: 45, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'cooldown-bypass', value: 1, duration: 30, target: 'self' },
        description: '次に使用するスキルのCTを無視して即時発動できる（30秒以内）'
    },
    2: {
        name: '女教皇', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 90, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'intel-reveal', value: 1, duration: 60, target: 'global' },
        description: 'マップ上の全船（敵味方）のHP・スキルCT・位置を60秒間可視化する'
    },
    3: {
        name: '女帝', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 80, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'resource-surge', value: 2.0, duration: 60, target: 'all-allies' },
        description: '全味方船の資源生産量を60秒間2倍にする'
    },
    4: {
        name: '皇帝', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 90, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'command-aura', value: { atkMult: 1.3, defMult: 1.3 }, duration: 30, target: 'all-allies' },
        description: '全味方船の攻撃力・防御力を30秒間1.3倍にする皇帝の威光を発動'
    },
    5: {
        name: '法王', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 130, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'summon-allies', value: { maxTargets: 99, radius: 110, sanctuary: true, healBoost: 0.35, enemyAtkDown: 0.25, sanctuaryDuration: 8 }, duration: 8, target: 'all-allies' },
        description: '聖域召集: 味方を使用者の位置へ呼び、8秒間その場を聖域化。聖域内では味方の回復量増加、敵の攻撃低下'
    },
    6: {
        name: '恋人', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 100, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'alliance-force', value: 1, duration: 60, target: 'enemy-ship' },
        description: '敵船との強制同盟を60秒間結び、互いに攻撃不能にするが連携行動が可能になる'
    },
    7: {
        name: '戦車', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 0.5, cooldown: 60, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'charge', value: { speedMult: 3.0, atkMult: 2.0, duration: 10 }, duration: 10, target: 'self' },
        description: '10秒間移動速度3倍・攻撃力2倍の突進状態になる。衝突すると即時大ダメージ'
    },
    8: {
        name: '力', element: 'none', role: 'special',
        activationType: 'triggered', triggerCondition: 'on-hp-below-20pct',
        castTime: 0, cooldown: 90, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'last-stand', value: { atkMult: 3.0, immuneToKill: 30 }, duration: 30, target: 'self' },
        description: 'HP20%以下で自動発動。30秒間攻撃力3倍・撃沈無効化状態になる'
    },
    9: {
        name: '隠者', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 70, range: 'self', aoe: 'single',
        effect: { type: 'buff', subtype: 'stealth', value: 1, duration: 45, target: 'self' },
        description: '45秒間完全ステルス状態になる。攻撃するまで発見されない'
    },
    10: {
        name: '運命の輪', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 1.0, cooldown: 90, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'fate-wheel', value: 1, duration: 0, target: 'all' },
        description: '全ユニットのHPをランダムに入れ替える（自分も含む）'
    },
    11: {
        name: '正義', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 80, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'equalize-hp', value: 0.5, duration: 0, target: 'all' },
        description: 'マップ全ユニットのHPを平均値に統一する（死亡ユニットは対象外）'
    },
    12: {
        name: '吊るされた男', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 90, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'sacrifice-power', value: { hpCost: 0.5, atkMult: 4.0 }, duration: 20, target: 'self' },
        description: '最大HPを50%犠牲にして、20秒間攻撃力を4倍にする'
    },
    13: {
        name: '死神', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 120, range: 'medium', aoe: 'area',
        effect: { type: 'special', subtype: 'set-hp-50pct', value: 0.5, duration: 0, target: 'enemy-area' },
        description: '中距離範囲の全敵船のHPを50%に設定する（即死ではない）'
    },
    14: {
        name: '節制', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.5, cooldown: 70, range: 'self', aoe: 'single',
        effect: { type: 'special', subtype: 'skill-copy', value: 1, duration: 60, target: 'self' },
        description: '直前に敵が使用したスキルをコピーし、60秒間1回だけ使用できる'
    },
    15: {
        name: '悪魔', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 150, range: 'medium', aoe: 'single',
        effect: { type: 'special', subtype: 'temptation-contract', value: { enemyAtkMult: 2.0, enemyDefMult: 0.3, duration: 30 }, duration: 30, target: 'enemy-ship' },
        description: '悪魔の契約を迫り、敵の攻撃力2倍・防御力70%減で30秒間過ごさせる'
    },
    16: {
        name: '塔', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 120, range: 'medium', aoe: 'area',
        effect: { type: 'damage', subtype: 'lightning-strike', value: 999, duration: 0, target: 'enemy-area' },
        description: '範囲内の敵船全てに999の雷撃ダメージを与える（自船にも100ダメージ）'
    },
    17: {
        name: '星', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 80, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'global-heal-beacon', value: 0.3, duration: 0, target: 'all-allies' },
        description: '全味方船のHPを30%回復し、全デバフを除去する'
    },
    18: {
        name: '月', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 2.0, cooldown: 90, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'fog-of-war', value: 1, duration: 60, target: 'global' },
        description: 'マップ全体に60秒間の霧を発生させ、全ての視界情報を遮断する'
    },
    19: {
        name: '太陽', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 1.5, cooldown: 100, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'full-reveal-heal', value: { healPct: 0.5, revealDuration: 120 }, duration: 120, target: 'all-allies' },
        description: '全味方船のHP50%回復・ステルス解除・視界全開。霧も消去する（120秒間）'
    },
    20: {
        name: '審判', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 3.0, cooldown: 150, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'resurrection-call', value: { reviveHpPct: 0.5, healPct: 0.25, maxTargets: 99 }, duration: 0, target: 'all-allies' },
        description: '戦闘不能の味方をHP50%で蘇生し、生存中の味方はHP25%回復する'
    },
    21: {
        name: '世界', element: 'none', role: 'special',
        activationType: 'active', triggerCondition: null,
        castTime: 5.0, cooldown: 300, range: 'global', aoe: 'all',
        effect: { type: 'special', subtype: 'reset-all-ct', value: 0, duration: 0, target: 'all-allies' },
        description: '全味方船の全スキルCTを0にリセットする。CT: 300秒（最強の切り札）'
    }
};

// ────────────────────────────────────────────────────────────
// 検索関数
// ────────────────────────────────────────────────────────────

const SUIT_MAP = {
    wand: WAND_REVERSED,
    wands: WAND_REVERSED,
    sword: SWORD_REVERSED,
    swords: SWORD_REVERSED,
    cup: CUP_REVERSED,
    cups: CUP_REVERSED,
    pentacle: PENTACLE_REVERSED,
    pentacles: PENTACLE_REVERSED
};

/**
 * 小アルカナ（逆位置）の船スキルデータを取得する
 * @param {string} suit - 'wand' | 'sword' | 'cup' | 'pentacle'（複数形も可）
 * @param {number} rank - 1-14
 * @returns {object|null}
 */
function getMinorShipSkill(suit, rank) {
    const suitData = SUIT_MAP[String(suit).toLowerCase()];
    if (!suitData) return null;
    return suitData[Number(rank)] || null;
}

/**
 * 大アルカナの船スキルデータを取得する
 * @param {number} arcanaNumber - 0-21
 * @returns {object|null}
 */
function getMajorShipSkill(arcanaNumber) {
    return MAJOR_ARCANA_SKILLS[Number(arcanaNumber)] || null;
}

/**
 * カードオブジェクトから船スキルデータを取得する汎用関数
 * @param {object} card - { isArcana, number, suit }
 * @returns {object|null}
 */
function getShipSkillByCard(card) {
    if (!card) return null;
    if (card.isArcana) {
        return getMajorShipSkill(card.number);
    }
    return getMinorShipSkill(card.suit, card.number);
}

module.exports = {
    WAND_REVERSED,
    SWORD_REVERSED,
    CUP_REVERSED,
    PENTACLE_REVERSED,
    MAJOR_ARCANA_SKILLS,
    getMinorShipSkill,
    getMajorShipSkill,
    getShipSkillByCard
};

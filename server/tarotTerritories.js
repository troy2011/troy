// server/tarotTerritories.js
// 領海定義 v2.0 — 大アルカナシンボル建物 + 軍事/経済/補助レベルシステム

// ── 通常建物マスタ ────────────────────────────────────────────
// arcanaRate: /秒  arcanaMax: 蓄積上限  maxHp: 建物HP
// effect: 防衛側自動発動効果タイプ
const BUILDING_DEFS = {
    // 軍事 Lv1〜5
    watchtower:   { id: 'watchtower',   name: '見張り台',   category: 'military', arcanaRate: 5,  arcanaMax: 70,  maxHp: 200, effect: 'minimap' },
    coastal_gun:  { id: 'coastal_gun',  name: '沿岸砲台',   category: 'military', arcanaRate: 5,  arcanaMax: 80,  maxHp: 300, effect: 'cannon' },
    dragon_gate:  { id: 'dragon_gate',  name: '竜撃砲門',   category: 'military', arcanaRate: 4,  arcanaMax: 90,  maxHp: 350, effect: 'heavy_cannon' },
    shipyard:     { id: 'shipyard',     name: '造船所',     category: 'military', arcanaRate: 4,  arcanaMax: 80,  maxHp: 400, effect: 'repair_ship' },
    emtower:      { id: 'emtower',      name: '電磁塔',     category: 'military', arcanaRate: 4,  arcanaMax: 90,  maxHp: 450, effect: 'slow' },
    // 経済 Lv1〜4
    farm:         { id: 'farm',         name: '農園',       category: 'economy',  arcanaRate: 4,  arcanaMax: 60,  maxHp: 200, effect: 'arcana_boost' },
    weapon_shop:  { id: 'weapon_shop',  name: '武器屋',     category: 'economy',  arcanaRate: 3,  arcanaMax: 70,  maxHp: 250, effect: 'atk_up' },
    armor_shop:   { id: 'armor_shop',   name: '防具屋',     category: 'economy',  arcanaRate: 3,  arcanaMax: 70,  maxHp: 300, effect: 'def_up' },
    tool_shop:    { id: 'tool_shop',    name: '道具屋',     category: 'economy',  arcanaRate: 3,  arcanaMax: 65,  maxHp: 280, effect: 'boarding_up' },
    // 補助 Lv1〜6
    inn:          { id: 'inn',          name: '宿屋',       category: 'support',  arcanaRate: 8,  arcanaMax: 90,  maxHp: 150, effect: 'hp_heal' },
    tavern:       { id: 'tavern',       name: '酒場',       category: 'support',  arcanaRate: 6,  arcanaMax: 80,  maxHp: 150, effect: 'arcana_instant' },
    onsen:        { id: 'onsen',        name: '温泉',       category: 'support',  arcanaRate: 8,  arcanaMax: 100, maxHp: 200, effect: 'hp_regen' },
    repair_dock:  { id: 'repair_dock',  name: '修理ドック', category: 'support',  arcanaRate: 7,  arcanaMax: 100, maxHp: 300, effect: 'ship_repair' },
    shrine:       { id: 'shrine',       name: '神殿',       category: 'support',  arcanaRate: 10, arcanaMax: 120, maxHp: 350, effect: 'shield_1hit' },
    goddess:      { id: 'goddess',      name: '女神像',     category: 'support',  arcanaRate: 10, arcanaMax: 120, maxHp: 400, effect: 'area_heal' },
};

// ── レベル→建物マッピング ──────────────────────────────────────
// 各レベルに「そのレベルで新たに追加される」建物ID
const LEVEL_BUILDINGS = {
    military: {
        1: ['watchtower'],
        2: ['coastal_gun'],
        3: ['dragon_gate'],
        4: ['shipyard'],
        5: ['emtower'],
    },
    economy: {
        1: ['farm'],
        2: ['weapon_shop'],
        3: ['armor_shop'],
        4: ['tool_shop'],
    },
    support: {
        1: ['inn'],
        2: ['tavern'],
        3: ['onsen'],
        4: ['repair_dock'],
        5: ['shrine'],
        6: ['goddess'],
    },
};

// レベルアップコスト（ゴールド）— Lv(n) → Lv(n+1) のコスト
const LEVEL_UP_COSTS = {
    1: 1000,
    2: 3000,
    3: 6000,
    4: 10000,
    5: 15000,
};

// ── 大アルカナシンボル建物マスタ ───────────────────────────────
// 各領海の中央に固定配置。arcanaRate/arcanaMax はシンボル固有。
const ARCANA_SYMBOL_DEFS = {
    fool:          { id: 'fool',          name: '海賊酒場',   arcana: '愚者',       arcanaRate: 2, arcanaMax: 200, maxHp: 3000, effect: 'random' },
    magician:      { id: 'magician',      name: '魔法学校',   arcana: '魔術師',     arcanaRate: 3, arcanaMax: 180, maxHp: 3000, effect: 'arcana_boost' },
    high_priestess:{ id: 'high_priestess',name: '聖泉宮殿',   arcana: '女教皇',     arcanaRate: 3, arcanaMax: 200, maxHp: 3000, effect: 'evasion' },
    empress:       { id: 'empress',       name: '温室庭園',   arcana: '女帝',       arcanaRate: 2, arcanaMax: 220, maxHp: 3000, effect: 'barrier' },
    emperor:       { id: 'emperor',       name: '訓練所',     arcana: '皇帝',       arcanaRate: 3, arcanaMax: 180, maxHp: 3000, effect: 'power' },
    hierophant:    { id: 'hierophant',    name: '魔法研究所', arcana: '法王',       arcanaRate: 2, arcanaMax: 200, maxHp: 3000, effect: 'arcana_boost_plus' },
    lovers:        { id: 'lovers',        name: '恋人の宮殿', arcana: '恋人',       arcanaRate: 3, arcanaMax: 180, maxHp: 3000, effect: 'charm' },
    chariot:       { id: 'chariot',       name: '戦車工廠',   arcana: '戦車',       arcanaRate: 3, arcanaMax: 190, maxHp: 3000, effect: 'heavy_armor' },
    strength:      { id: 'strength',      name: '城塞',       arcana: '力',         arcanaRate: 2, arcanaMax: 250, maxHp: 3500, effect: 'fortress' },
    hermit:        { id: 'hermit',        name: '隠者の館',   arcana: '隠者',       arcanaRate: 3, arcanaMax: 170, maxHp: 3000, effect: 'insight' },
    wheel:         { id: 'wheel',         name: '地下カジノ', arcana: '運命の輪',   arcanaRate: 4, arcanaMax: 160, maxHp: 3000, effect: 'gamble' },
    justice:       { id: 'justice',       name: '裁判所',     arcana: '正義',       arcanaRate: 3, arcanaMax: 190, maxHp: 3000, effect: 'judgement' },
    hanged_man:    { id: 'hanged_man',    name: '供物台',     arcana: '吊られた男', arcanaRate: 2, arcanaMax: 200, maxHp: 3000, effect: 'bind' },
    death:         { id: 'death',         name: '納骨堂',     arcana: '死',         arcanaRate: 2, arcanaMax: 250, maxHp: 3500, effect: 'death_mark' },
    temperance:    { id: 'temperance',    name: '癒しの泉',   arcana: '節制',       arcanaRate: 4, arcanaMax: 150, maxHp: 3000, effect: 'full_heal' },
    devil:         { id: 'devil',         name: '黒市',       arcana: '悪魔',       arcanaRate: 3, arcanaMax: 180, maxHp: 3000, effect: 'drain' },
    tower:         { id: 'tower',         name: '裁きの塔',   arcana: '塔',         arcanaRate: 2, arcanaMax: 200, maxHp: 3500, effect: 'tower_strike' },
    star:          { id: 'star',          name: '天文台',     arcana: '星',         arcanaRate: 3, arcanaMax: 180, maxHp: 3000, effect: 'regen_plus' },
    moon:          { id: 'moon',          name: '氷霧の社',   arcana: '月',         arcanaRate: 2, arcanaMax: 220, maxHp: 3000, effect: 'deep_fog' },
    sun:           { id: 'sun',           name: '太陽神殿',   arcana: '太陽',       arcanaRate: 3, arcanaMax: 200, maxHp: 3500, effect: 'inspiration' },
    judgement:     { id: 'judgement',     name: '鐘楼',       arcana: '審判',       arcanaRate: 3, arcanaMax: 180, maxHp: 3000, effect: 'respawn_call' },
    world:         { id: 'world',         name: '世界樹',     arcana: '世界',       arcanaRate: 2, arcanaMax: 300, maxHp: 4000, effect: 'world_shield' },
};

// ── 首都シンボル定義 ─────────────────────────────────────────
const CAPITAL_SYMBOLS = {
    wands:     { id: 'capital_wands',     name: '炎の王宮',   arcana: 'capital', arcanaRate: 2, arcanaMax: 300, maxHp: 9999, effect: 'fortress' },
    swords:    { id: 'capital_swords',    name: '嵐の王宮',   arcana: 'capital', arcanaRate: 2, arcanaMax: 300, maxHp: 9999, effect: 'fortress' },
    cups:      { id: 'capital_cups',      name: '深淵の王宮', arcana: 'capital', arcanaRate: 2, arcanaMax: 300, maxHp: 9999, effect: 'fortress' },
    pentacles: { id: 'capital_pentacles', name: '大地の王宮', arcana: 'capital', arcanaRate: 2, arcanaMax: 300, maxHp: 9999, effect: 'fortress' },
};

// ── 領海定義 ─────────────────────────────────────────────────
// capitals: 各国の首都海域（占領不可）
// arcana territories: 大アルカナ22枚（占領可）
const TERRITORIES = {
    // ─ 首都海域 ─
    wands: {
        id: 'wands', name: '炎の王都（ワンド）', element: 'fire', symbol: '🔥',
        isCapital: true, ownerNation: 'fire',
        symbolDef: CAPITAL_SYMBOLS.wands,
        defaultLevels: { military: 3, economy: 2, support: 2 },
    },
    swords: {
        id: 'swords', name: '嵐の王都（ソード）', element: 'wind', symbol: '🌀',
        isCapital: true, ownerNation: 'wind',
        symbolDef: CAPITAL_SYMBOLS.swords,
        defaultLevels: { military: 3, economy: 2, support: 2 },
    },
    cups: {
        id: 'cups', name: '深淵の王都（カップ）', element: 'water', symbol: '🌙',
        isCapital: true, ownerNation: 'water',
        symbolDef: CAPITAL_SYMBOLS.cups,
        defaultLevels: { military: 3, economy: 2, support: 2 },
    },
    pentacles: {
        id: 'pentacles', name: '大地の王都（ペンタクル）', element: 'earth', symbol: '🌍',
        isCapital: true, ownerNation: 'earth',
        symbolDef: CAPITAL_SYMBOLS.pentacles,
        defaultLevels: { military: 3, economy: 2, support: 2 },
    },

    // ─ 大アルカナ海域（0〜21） ─
    t_fool:           { id: 't_fool',           name: '愚者の海',     element: 'neutral', symbol: '🃏', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.fool,           defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_magician:       { id: 't_magician',       name: '魔術師の海',   element: 'neutral', symbol: '✨', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.magician,       defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_high_priestess: { id: 't_high_priestess', name: '女教皇の海',   element: 'neutral', symbol: '🌊', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.high_priestess, defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_empress:        { id: 't_empress',        name: '女帝の海',     element: 'neutral', symbol: '🌿', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.empress,        defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_emperor:        { id: 't_emperor',        name: '皇帝の海',     element: 'neutral', symbol: '👑', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.emperor,        defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_hierophant:     { id: 't_hierophant',     name: '法王の海',     element: 'neutral', symbol: '🔱', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.hierophant,     defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_lovers:         { id: 't_lovers',         name: '恋人の海',     element: 'neutral', symbol: '💞', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.lovers,         defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_chariot:        { id: 't_chariot',        name: '戦車の海',     element: 'neutral', symbol: '⚔️', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.chariot,        defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_strength:       { id: 't_strength',       name: '力の海',       element: 'neutral', symbol: '🦁', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.strength,       defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_hermit:         { id: 't_hermit',         name: '隠者の海',     element: 'neutral', symbol: '🕯️', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.hermit,         defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_wheel:          { id: 't_wheel',          name: '運命の海',     element: 'neutral', symbol: '🎡', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.wheel,          defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_justice:        { id: 't_justice',        name: '正義の海',     element: 'neutral', symbol: '⚖️', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.justice,        defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_hanged_man:     { id: 't_hanged_man',     name: '吊られた男の海', element: 'neutral', symbol: '🧿', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.hanged_man,   defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_death:          { id: 't_death',          name: '死の海',       element: 'neutral', symbol: '💀', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.death,          defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_temperance:     { id: 't_temperance',     name: '節制の海',     element: 'neutral', symbol: '🌈', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.temperance,     defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_devil:          { id: 't_devil',          name: '悪魔の海',     element: 'neutral', symbol: '😈', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.devil,          defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_tower:          { id: 't_tower',          name: '塔の海',       element: 'neutral', symbol: '🗼', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.tower,          defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_star:           { id: 't_star',           name: '星の海',       element: 'neutral', symbol: '⭐', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.star,           defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_moon:           { id: 't_moon',           name: '月の海',       element: 'neutral', symbol: '🌙', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.moon,           defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_sun:            { id: 't_sun',            name: '太陽の海',     element: 'neutral', symbol: '☀️', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.sun,            defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_judgement:      { id: 't_judgement',      name: '審判の海',     element: 'neutral', symbol: '🔔', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.judgement,      defaultLevels: { military: 1, economy: 1, support: 1 } },
    t_world:          { id: 't_world',          name: '世界の海',     element: 'neutral', symbol: '🌐', isCapital: false, symbolDef: ARCANA_SYMBOL_DEFS.world,          defaultLevels: { military: 1, economy: 1, support: 1 } },
};

// ── ルックアップ ─────────────────────────────────────────────
function getTerritory(territoryId) {
    return TERRITORIES[String(territoryId || '')] || null;
}

function getTerritoryIds() {
    return Object.keys(TERRITORIES);
}

function getBuildingDef(buildingId) {
    return BUILDING_DEFS[buildingId] || null;
}

function getArcanaSymbolDef(arcanaId) {
    return ARCANA_SYMBOL_DEFS[arcanaId] || null;
}

/**
 * 指定レベルセットで存在する通常建物のIDリストを返す
 * levels = { military: n, economy: n, support: n }
 */
function getBuildingIdsForLevels(levels) {
    const ids = [];
    for (const category of ['military', 'economy', 'support']) {
        const lv = Math.max(0, Math.min(levels[category] || 0, 6));
        for (let i = 1; i <= lv; i++) {
            const additions = LEVEL_BUILDINGS[category]?.[i] || [];
            ids.push(...additions);
        }
    }
    return ids;
}

/**
 * 指定レベルセットの建物定義リストを返す（バトルルーム生成用）
 */
function getBuildingDefsForLevels(levels) {
    return getBuildingIdsForLevels(levels).map((id) => BUILDING_DEFS[id]).filter(Boolean);
}

/**
 * レベルアップコスト（ゴールド）を返す
 * currentLevel → currentLevel+1
 */
function getLevelUpCost(currentLevel) {
    return LEVEL_UP_COSTS[currentLevel] ?? null;
}

// ── 大アルカナパッシブ定義 ────────────────────────────────────
// effect: BattleRoomScene が読み取るエフェクト識別子
// value:  数値パラメータ（倍率 or 固定値）
// BattleRoomScene 側で applyArcanaPassives(nationPassives) として一括適用
const ARCANA_PASSIVES = {
    fool: {
        index: 0, name: '愚者', group: 'wild',
        effect: 'random_buff_on_start',
        description: 'バトル開始時、ランダムなバフを1つ受け取る',
    },
    magician: {
        index: 1, name: '魔術師', group: 'atk',
        effect: 'arcana_charge_rate', value: 0.15,
        description: 'アルカナチャージ速度+15%',
    },
    high_priestess: {
        index: 2, name: '女教皇', group: 'info',
        effect: 'prophecy_advance',
        description: '掲示板で次々回の争奪領海まで先読み可',
    },
    empress: {
        index: 3, name: '女帝', group: 'def',
        effect: 'heal_skill_boost', value: 0.25,
        description: '回復系スキル効果+25%',
    },
    emperor: {
        index: 4, name: '皇帝', group: 'def',
        effect: 'shield_skill_boost', value: 0.20,
        description: 'シールド系スキル耐久値+20%',
    },
    hierophant: {
        index: 5, name: '法王', group: 'info',
        effect: 'team_hp_visible',
        description: '味方全員のHP%が国家画面で常時確認できる',
    },
    lovers: {
        index: 6, name: '恋人', group: 'card',
        effect: 'team_ct_reduction', value: 0.10,
        description: '同国の味方とチームバトル時、スキルCT-10%',
    },
    chariot: {
        index: 7, name: '戦車', group: 'mobility',
        effect: 'move_speed_boost', value: 0.12,
        description: '移動速度+12%',
    },
    strength: {
        index: 8, name: '力', group: 'atk',
        effect: 'low_hp_atk_boost', value: 0.30, threshold: 0.30,
        description: 'HP30%以下で攻撃力+30%',
    },
    hermit: {
        index: 9, name: '隠者', group: 'mobility',
        effect: 'stealth_skill_boost', value: 0.30, soloBonusValue: 0.05,
        description: 'ステルス系スキル持続+30%。ソロバトル時にスキル効果+5%',
    },
    wheel: {
        index: 10, name: '運命の輪', group: 'wild',
        effect: 'skill_ct_reset_chance', value: 0.05,
        description: 'スキル発動時5%でCTが即リセット',
    },
    justice: {
        index: 11, name: '正義', group: 'def',
        effect: 'debuff_duration_reduce', value: 0.20,
        description: 'スロー・スタンの持続時間-20%',
    },
    hanged_man: {
        index: 12, name: '吊られた男', group: 'wild',
        effect: 'underdog_boost', value: 0.15,
        description: '自国の支配領海数が全国家平均以下の時、全ステータス+15%',
    },
    death: {
        index: 13, name: '死神', group: 'atk',
        effect: 'on_kill_ct_reset',
        description: 'キル後、次のスキルのCTを即リセット',
    },
    temperance: {
        index: 14, name: '節制', group: 'def',
        effect: 'dot_reduce', value: 0.20, healBoostValue: 0.10,
        description: '受けるDoT効果-20%。回復スキル効果も+10%',
    },
    devil: {
        index: 15, name: '悪魔', group: 'atk',
        effect: 'dot_boost', value: 0.25,
        description: '毒・DoT系スキル効果値+25%',
    },
    tower: {
        index: 16, name: '塔', group: 'atk',
        effect: 'opening_stun', duration: 2000,
        description: 'バトル開始時、ランダムな敵1名を2秒スタン',
    },
    star: {
        index: 17, name: '星', group: 'def',
        effect: 'periodic_heal', value: 0.05, interval: 30000,
        description: 'バトル中30秒ごとにHP+5%自動回復',
    },
    moon: {
        index: 18, name: '月', group: 'info',
        effect: 'stealth_effect_boost', value: 0.30,
        description: '霧・迷彩系スキル効果+30%。敵ミニマップへの自軍表示が遅延',
    },
    sun: {
        index: 19, name: '太陽', group: 'card',
        effect: 'victory_xp_boost', value: 0.20,
        description: 'バトル勝利時の経験値（カード強化素材）+20%',
    },
    judgement: {
        index: 20, name: '審判', group: 'card',
        effect: 'revive_chance_boost', value: 0.20,
        description: '復活系スキルの発動確率+20%',
    },
    world: {
        index: 21, name: '世界', group: 'wild',
        effect: 'all_skill_boost', value: 0.05,
        description: '全スキル効果+5%',
    },
};

// 領海IDからパッシブ定義を取得する（t_fool → ARCANA_PASSIVES.fool）
function getArcanaPassive(territoryId) {
    const key = String(territoryId || '').replace(/^t_/, '');
    return ARCANA_PASSIVES[key] || null;
}

// 国家が支配する領海のパッシブ一覧を返す
// territories: Firestoreから取得した全領海ドキュメントの配列
function getNationPassives(nation, territories) {
    return territories
        .filter((t) => t.ownerNation === nation && !t.isCapital)
        .map((t) => getArcanaPassive(t.territoryId))
        .filter(Boolean);
}

// ── バトル定数 ───────────────────────────────────────────────
const ARCANA_MODE_COST         = 200;
const SYMBOL_ATTACK_DAMAGE_BASE  = 500;
const SYMBOL_ATTACK_DAMAGE_BONUS = 200;

module.exports = {
    TERRITORIES,
    BUILDING_DEFS,
    ARCANA_SYMBOL_DEFS,
    CAPITAL_SYMBOLS,
    LEVEL_BUILDINGS,
    LEVEL_UP_COSTS,
    ARCANA_PASSIVES,
    ARCANA_MODE_COST,
    SYMBOL_ATTACK_DAMAGE_BASE,
    SYMBOL_ATTACK_DAMAGE_BONUS,
    getTerritory,
    getTerritoryIds,
    getBuildingDef,
    getArcanaSymbolDef,
    getArcanaPassive,
    getNationPassives,
    getBuildingIdsForLevels,
    getBuildingDefsForLevels,
    getLevelUpCost,
};

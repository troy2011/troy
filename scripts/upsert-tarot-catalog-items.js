#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SUIT_ORDER = ['Wand', 'Sword', 'Cup', 'Pentacle'];
const SUIT_LABEL = {
    Wand: 'ワンド',
    Sword: 'ソード',
    Cup: 'カップ',
    Pentacle: 'ペンタクル'
};
const MINOR_RANK_LABEL = {
    1: 'A',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: 'ペイジ',
    12: 'ナイト',
    13: 'クイーン',
    14: 'キング'
};
const FACE_RANK_KEY = {
    11: 'PAGE',
    12: 'KNIGHT',
    13: 'QUEEN',
    14: 'KING'
};
const SUIT_SKILL = {
    Wand: { type: '攻撃術', keyword: '火勢', detail: '火力と詠唱を伸ばす小アルカナ。' },
    Sword: { type: '斬撃術', keyword: '疾風', detail: '攻撃と機動を伸ばす小アルカナ。' },
    Cup: { type: '祝福術', keyword: '慈愛', detail: '知力と支援性能を伸ばす小アルカナ。' },
    Pentacle: { type: '防護術', keyword: '堅守', detail: '防御と継戦力を伸ばす小アルカナ。' }
};
const MINOR_SPRITE_BASE = {
    Wand: 0,
    Pentacle: 20,
    Cup: 40,
    Sword: 60
};
const CARD_SPRITE = {
    path: './Sprites/Buildings/tarot.png',
    width: 48,
    height: 80,
    cols: 10
};
const MAJOR_SPECIAL_SUIT = {
    2: 'Cup',
    3: 'Pentacle',
    4: 'Wand',
    5: 'Sword',
    6: 'Cup',
    7: 'Sword',
    8: 'Wand',
    9: 'Pentacle',
    11: 'Sword',
    12: 'Pentacle',
    13: 'Cup',
    14: 'Wand',
    16: 'Sword',
    17: 'Cup',
    18: 'Pentacle',
    19: 'Wand'
};
const MAJOR_ALL_SUIT_NUMBERS = new Set([1]);
const MAJOR_ARCANA = [
    { number: 0, name: '愚者', role: '旅人', passive: '先駆', keyword: '自由', stats: { Agi: 2, Int: 1 } },
    { number: 1, name: '魔術師', role: '術式使い', passive: '魔力変換', keyword: '創造', stats: { Power: 1, Int: 3 } },
    { number: 2, name: '女教皇', role: '水の巫女', passive: '静水の予見', keyword: '洞察', stats: { Defense: 1, Int: 3 } },
    { number: 3, name: '女帝', role: '地母の守り手', passive: '豊穣育成', keyword: '実り', stats: { Defense: 2, Int: 2 } },
    { number: 4, name: '皇帝', role: '炎の統治者', passive: '王威号令', keyword: '統率', stats: { Power: 2, Defense: 2 } },
    { number: 5, name: '法王', role: '風の導師', passive: '聖風加護', keyword: '導き', stats: { Defense: 1, Agi: 1, Int: 2 } },
    { number: 6, name: '恋人', role: '共鳴者', passive: '絆共振', keyword: '連携', stats: { Power: 1, Agi: 1, Int: 1 } },
    { number: 7, name: '戦車', role: '先陣将', passive: '突破進軍', keyword: '突撃', stats: { Power: 3, Agi: 1 } },
    { number: 8, name: '力', role: '剛力闘士', passive: '不屈', keyword: '闘志', stats: { Power: 3, Defense: 1 } },
    { number: 9, name: '隠者', role: '探究者', passive: '深思', keyword: '集中', stats: { Defense: 1, Int: 2 } },
    { number: 10, name: '運命の輪', role: '巡り手', passive: '再転', keyword: '運命', stats: { Agi: 2, Int: 1 } },
    { number: 11, name: '正義', role: '裁定者', passive: '均衡判定', keyword: '公正', stats: { Power: 1, Defense: 2, Int: 1 } },
    { number: 12, name: '吊るされた男', role: '逆転者', passive: '忍耐反転', keyword: '停滞', stats: { Defense: 2, Int: 1 } },
    { number: 13, name: '死神', role: '終焉騎士', passive: '断絶', keyword: '変化', stats: { Power: 2, Agi: 2 } },
    { number: 14, name: '節制', role: '調律師', passive: '均整', keyword: '調和', stats: { Defense: 1, Agi: 1, Int: 1 } },
    { number: 15, name: '悪魔', role: '契約者', passive: '代償強化', keyword: '欲望', stats: { Power: 3, Int: 1 } },
    { number: 16, name: '塔', role: '破城者', passive: '崩落', keyword: '破壊', stats: { Power: 2, Defense: 1 } },
    { number: 17, name: '星', role: '導き手', passive: '希望灯', keyword: '希望', stats: { Agi: 1, Int: 2 } },
    { number: 18, name: '月', role: '幻惑者', passive: '夢霧', keyword: '幻影', stats: { Agi: 2, Int: 2 } },
    { number: 19, name: '太陽', role: '光輝王', passive: '陽光', keyword: '勝利', stats: { Power: 2, Int: 2 } },
    { number: 20, name: '審判', role: '再起者', passive: '蘇唱', keyword: '復活', stats: { Power: 1, Defense: 1, Int: 2 } },
    { number: 21, name: '世界', role: '完成者', passive: '統合', keyword: '完全', stats: { Power: 2, Defense: 2, Agi: 1, Int: 1 } }
];

function resolveCatalogPath(argv) {
    const explicit = String(argv[2] || '').trim();
    if (explicit) {
        return path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
    }
    return path.resolve(process.cwd(), 'data', 'local', 'catalog_v2_items.json');
}

function getFriendlyId(item) {
    const alt = Array.isArray(item?.AlternateIds)
        ? item.AlternateIds.find((entry) => String(entry?.Type || '').toLowerCase() === 'friendlyid')
        : null;
    return String(alt?.Value || item?.Id || '').trim();
}

function createLocalizedText(text) {
    return {
        NEUTRAL: text,
        'ja-JP': text
    };
}

function createBaseItem(id, title, description, displayProperties) {
    return {
        Id: id,
        AlternateIds: [
            {
                Type: 'FriendlyId',
                Value: id
            }
        ],
        Type: 'catalogItem',
        Title: createLocalizedText(title),
        Description: createLocalizedText(description),
        ContentType: 'Durable',
        Tags: ['tarot'],
        DisplayProperties: displayProperties
    };
}

function getMajorSuit(number) {
    if (MAJOR_ALL_SUIT_NUMBERS.has(number)) return 'All';
    return MAJOR_SPECIAL_SUIT[number] || 'None';
}

function getMajorSuitLabel(number) {
    const suit = getMajorSuit(number);
    if (suit === 'All') return '全スート';
    if (suit === 'None') return '無属性';
    return SUIT_LABEL[suit] || suit;
}

function buildMajorArcanaItems() {
    return MAJOR_ARCANA.map((entry) => {
        const id = `arcana-${entry.number}`;
        const description = `大アルカナ。体に装着して4部位の具現化を導く「${entry.role}」のカード。`;
        const spriteIndex = entry.number < 10
            ? 80 + entry.number
            : 90 + (entry.number - 10);
        const suit = getMajorSuit(entry.number);
        return createBaseItem(id, entry.name, description, {
            Category: 'TarotMajor',
            ArcanaName: entry.name,
            ArcanaNumber: entry.number,
            CardNumber: entry.number,
            ArcanaSuit: suit,
            Suit: suit,
            ArcanaSuitLabel: getMajorSuitLabel(entry.number),
            ArcanaRole: entry.role,
            RoleName: entry.role,
            ArcanaPassive: entry.passive,
            PassiveName: entry.passive,
            ArcanaKeyword: entry.keyword,
            SkillKeyword: entry.keyword,
            sprite_path: CARD_SPRITE.path,
            sprite_index: spriteIndex,
            sprite_w: CARD_SPRITE.width,
            sprite_h: CARD_SPRITE.height,
            sprite_cols: CARD_SPRITE.cols,
            Power: entry.stats.Power || 0,
            Defense: entry.stats.Defense || 0,
            Agi: entry.stats.Agi || 0,
            Int: entry.stats.Int || 0
        });
    });
}

function getMinorStatBlock(suit, rankNumber) {
    const base = rankNumber <= 10 ? rankNumber + 1 : rankNumber + 1;
    if (suit === 'Wand') {
        return { Power: base, Defense: 0, Agi: 0, Int: Math.max(1, Math.floor(base / 3)) };
    }
    if (suit === 'Sword') {
        return { Power: base, Defense: 0, Agi: Math.max(1, Math.ceil(base / 2)), Int: 0 };
    }
    if (suit === 'Cup') {
        return { Power: 0, Defense: Math.max(1, Math.floor(base / 2)), Agi: 0, Int: base };
    }
    return { Power: Math.max(0, Math.floor(base / 3)), Defense: base, Agi: 0, Int: 0 };
}

function getMinorRankValue(rankNumber) {
    return FACE_RANK_KEY[rankNumber] || rankNumber;
}

function buildMinorArcanaItems() {
    const items = [];
    for (const suit of SUIT_ORDER) {
        const suitMeta = SUIT_SKILL[suit];
        for (let rankNumber = 1; rankNumber <= 14; rankNumber += 1) {
            const id = `minor-${suit.toLowerCase()}-${rankNumber}`;
            const rankLabel = MINOR_RANK_LABEL[rankNumber];
            const title = `${SUIT_LABEL[suit]}${rankLabel}`;
            const description = `${suitMeta.detail} 頭・右手・左手・アクセサリーのいずれかに具現化できる。`;
            const spriteIndex = rankNumber <= 10
                ? MINOR_SPRITE_BASE[suit] + (rankNumber - 1)
                : MINOR_SPRITE_BASE[suit] + 10 + (rankNumber - 11);
            const stats = getMinorStatBlock(suit, rankNumber);
            items.push(createBaseItem(id, title, description, {
                Category: 'TarotMinor',
                ArcanaSuit: suit,
                Suit: suit,
                ArcanaRank: getMinorRankValue(rankNumber),
                Rank: getMinorRankValue(rankNumber),
                CardNumber: rankNumber,
                ArcanaSkillType: suitMeta.type,
                SkillType: suitMeta.type,
                ArcanaKeyword: suitMeta.keyword,
                SkillKeyword: suitMeta.keyword,
                sprite_path: CARD_SPRITE.path,
                sprite_index: spriteIndex,
                sprite_w: CARD_SPRITE.width,
                sprite_h: CARD_SPRITE.height,
                sprite_cols: CARD_SPRITE.cols,
                Power: stats.Power,
                Defense: stats.Defense,
                Agi: stats.Agi,
                Int: stats.Int
            }));
        }
    }
    return items;
}

function buildTarotItems() {
    return [
        ...buildMajorArcanaItems(),
        ...buildMinorArcanaItems()
    ];
}

function main() {
    const filePath = resolveCatalogPath(process.argv);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.Items) ? parsed.Items : [];
    const tarotIdPattern = /^(arcana-\d+|minor-(wand|sword|cup|pentacle)-\d+)$/;
    const keptItems = items.filter((item) => {
        const id = getFriendlyId(item);
        return !tarotIdPattern.test(id);
    });
    const tarotItems = buildTarotItems();
    parsed.Items = [...keptItems, ...tarotItems];
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    console.log(`[tarot-catalog] wrote ${tarotItems.length} tarot items to ${filePath}`);
}

main();

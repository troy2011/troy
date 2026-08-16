const fs = require('fs');
const path = require('path');

const LEATHER01_TITLES = Object.freeze([
    '竜骨のマスク',
    '牡羊骨のフード',
    '髑髏のフード',
    '角髑髏のフード',
    '鹿骨のフード',
    '羽飾りペストマスク',
    '革面のフード',
    '牙飾りの革面',
    '革のソフトキャップ',
    '革のワークキャップ',
    '革のフルフェイス',
    '片覆いの革兜',
    '革のオープンヘルム',
    '二本角の革兜',
    '革の三角帽',
    '革のとんがり帽',
    '革の三角海賊帽',
    '羽飾りの革帽',
    '革の額当てフード',
    '鋲打ち革フード',
    '革の旅帽',
    '羽飾りの旅帽',
    '革の魔女帽',
    '帯締めの革魔女帽',
    '大角の革兜',
    '片覆いの革フード',
    '革の目深フード',
    '革の丸帽',
    '鋲打ち革帽',
    '角飾りの革帽',
    '鋲打ち革兜',
    '厚革の丸兜',
    '革の耳当て帽',
    '革のハンチング',
    '革の羽飾り帽',
    '羽飾りハンチング',
    '白羽根の革帽'
]);

const LEATHER02_TITLES = Object.freeze([
    '大角の革兜',
    '鹿角の革冠',
    '鹿骨の革面',
    '髑髏羽根の革兜'
]);

const METAL_TITLES = Object.freeze([
    '銀十字の騎士兜',
    '金十字の騎士兜',
    '鋼の面頬兜',
    '鋼の角面兜',
    '金十字の重騎士兜',
    '黒十字の面頬兜',
    '双紋の面頬兜',
    '鋲十字の面頬兜',
    '鉄十字の面頬兜',
    '格子面の重兜',
    '重格子の騎士兜',
    '丸面の騎士兜',
    '鋼のグレートヘルム',
    '鋲打ち鉄鉢兜',
    '鎖帷子の鉄鉢兜',
    '鋲打ち丸兜',
    '鎖垂れの丸兜',
    '平鉄鉢の丸兜',
    '鎖垂れ平鉄鉢兜',
    'つば広鉄帽',
    '鎖垂れ鉄帽',
    '鋼の鼻当て兜',
    '鋼の頬当て兜',
    '鋼の耳当て兜',
    '鎖垂れ耳当て兜',
    '鋼のサレット',
    '鎖垂れサレット',
    '鋼の片覆い兜',
    '黄金の片覆い兜',
    '羽飾り黄金兜',
    '黄金クレスト兜',
    '黄金クレスト重兜',
    '鋼のコリント兜',
    '黄金コリント兜',
    '鋼のイリュリア兜',
    '黄金イリュリア兜',
    '鋼のフリギア兜'
]);

const STAFF_TITLES = Object.freeze({
    staff_01: '木枝の杖',
    staff_04: '翠玉の杖',
    staff_05: '月輪の杖',
    staff_06: '白晶の杖',
    staff_07: '紫晶の杖',
    staff_08: '蛇木の杖',
    staff_09: '蒼晶の杖',
    staff_10: '若木の杖',
    staff_12: '蒼金の司祭杖',
    staff_13: '翠環の杖',
    staff_14: '牧者の杖',
    staff_15: '髑髏柱の杖',
    staff_16: '氷晶の大杖',
    staff_17: '紅晶の杖',
    staff_18: '鏡映の杖',
    staff_19: '紅珠のワンド',
    staff_20: '魔眼の杖',
    staff_21: '翠紋の大杖',
    staff_22: '天秤の杖',
    staff_23: '黄金樹の杖',
    staff_24: '深淵樹の杖',
    staff_25: '太陽紋の杖'
});

const WAND_TITLES = Object.freeze({
    wand_01: '木枝のワンド',
    wand_02: '翠晶のワンド',
    wand_03: '紫晶のワンド',
    wand_04: '蛇木のワンド',
    wand_05: '蒼晶のワンド',
    wand_06: '紅晶のワンド'
});

const DIRECT_OVERRIDES = Object.freeze({
    sword_01: {
        title: '粗鉄のショートソード',
        description: '飾り気のない短身の鉄剣。軽く、初めての実戦でも扱いやすい。'
    },
    sword_13: {
        title: '銀鋼のショートソード',
        description: '幅広の短い刀身を持つ、取り回しに優れた銀鋼の剣。'
    },
    sword_big_06: {
        title: '細身のグレートソード',
        description: '長い直刀を持つ両手剣。間合いを生かした斬撃に向く。'
    },
    sword_big_10: {
        title: 'フランベルジュ',
        description: '炎のように波打つ刀身を持つ大型剣。'
    },
    blunt_16: {
        title: '鉛球のフレイル',
        description: '鎖でつないだ重い鉛球を振り回して打ち付ける武器。'
    },
    dagger_05: {
        title: '幅広の短剣',
        description: '厚く幅広い刀身を持つ、切断力に優れた短剣。'
    },
    dagger_06: {
        title: '湾曲短剣',
        description: '内側へ湾曲した刃で素早く切り込む短剣。'
    },
    dagger_07: {
        title: '重刃の短剣',
        description: '短剣としては大ぶりな刃を持つ、重い一撃向けの武器。'
    }
});

const OFFHAND_SPRITE_INDICES = Object.freeze({
    offhand_tome_01: 18,
    offhand_tome_02: 19,
    offhand_tome_03: 20,
    offhand_tome_04: 21,
    offhand_tome_05: 23,
    offhand_orb_01: 192,
    offhand_orb_02: 194,
    offhand_orb_03: 198,
    offhand_orb_04: 202,
    offhand_orb_05: 207,
    offhand_catalyst_01: 912,
    offhand_catalyst_02: 914,
    offhand_catalyst_03: 915,
    offhand_catalyst_04: 925,
    offhand_catalyst_05: 923,
    offhand_relic_01: 176,
    offhand_relic_02: 177,
    offhand_relic_03: 178,
    offhand_relic_04: 179,
    offhand_relic_05: 180
});

function localized(text) {
    return {
        NEUTRAL: text,
        'ja-JP': text
    };
}

function getFriendlyId(item) {
    const alternateId = Array.isArray(item?.AlternateIds)
        ? item.AlternateIds.find((entry) => String(entry?.Type || '').toLowerCase() === 'friendlyid')
        : null;
    return String(alternateId?.Value || item?.Id || '').trim();
}

function buildSequentialOverrides(prefix, titles, descriptionFactory) {
    return Object.fromEntries(titles.map((title, index) => [
        `${prefix}${String(index + 1).padStart(2, '0')}`,
        {
            title,
            description: descriptionFactory(title)
        }
    ]));
}

const PRESENTATION_OVERRIDES = Object.freeze({
    ...buildSequentialOverrides(
        'leather01_',
        LEATHER01_TITLES,
        (title) => `${title}。革と補強材を組み合わせた頭部装備。`
    ),
    ...buildSequentialOverrides(
        'leather02_',
        LEATHER02_TITLES,
        (title) => `${title}。厚い革と獣素材で仕立てた頭部装備。`
    ),
    ...buildSequentialOverrides(
        'metal_',
        METAL_TITLES,
        (title) => `${title}。金属板を組み上げた堅牢な頭部装備。`
    ),
    ...Object.fromEntries(Object.entries(STAFF_TITLES).map(([id, title]) => [
        id,
        { title, description: `${title}。魔力を導くために作られた長杖。` }
    ])),
    ...Object.fromEntries(Object.entries(WAND_TITLES).map(([id, title]) => [
        id,
        { title, description: `${title}。片手で扱える魔法の短杖。` }
    ])),
    ...DIRECT_OVERRIDES
});

function removeUnpublishedDuplicateGunEntries(items) {
    const gun01Entries = items.filter((item) => getFriendlyId(item) === 'gun_01');
    if (gun01Entries.length <= 1) return items;
    const publishedEntry = gun01Entries.find((item) =>
        String(item?.Title?.['ja-JP'] || item?.Title?.NEUTRAL || '') === 'フリントロック'
    );
    if (!publishedEntry) {
        throw new Error('重複した gun_01 からフリントロックを特定できません。');
    }
    return items.filter((item) => getFriendlyId(item) !== 'gun_01' || item === publishedEntry);
}

function assertUniqueFriendlyIds(items, filePath) {
    const seen = new Set();
    for (const item of items) {
        const friendlyId = getFriendlyId(item);
        if (!friendlyId) continue;
        if (seen.has(friendlyId)) {
            throw new Error(`${filePath}: FriendlyId が重複しています: ${friendlyId}`);
        }
        seen.add(friendlyId);
    }
}

function normalizeCatalog(catalog, filePath) {
    const items = removeUnpublishedDuplicateGunEntries(Array.isArray(catalog?.Items) ? catalog.Items : []);
    let updatedCount = 0;

    for (const item of items) {
        const friendlyId = getFriendlyId(item);
        const presentation = PRESENTATION_OVERRIDES[friendlyId];
        if (presentation) {
            item.Title = localized(presentation.title);
            item.Description = localized(presentation.description);
            updatedCount += 1;
        }

        const spriteIndex = OFFHAND_SPRITE_INDICES[friendlyId];
        if (Number.isInteger(spriteIndex)) {
            item.DisplayProperties = {
                ...(item.DisplayProperties || {}),
                sprite_index: spriteIndex
            };
            updatedCount += 1;
        }
    }

    assertUniqueFriendlyIds(items, filePath);
    return {
        catalog: { ...catalog, Items: items },
        updatedCount
    };
}

function resolveCatalogPaths(argv) {
    const explicitPaths = argv.slice(2).filter(Boolean);
    const defaults = ['catalog_v2_items.json', path.join('data', 'local', 'catalog_v2_items.json')];
    return (explicitPaths.length ? explicitPaths : defaults).map((filePath) => path.resolve(process.cwd(), filePath));
}

function main() {
    for (const filePath of resolveCatalogPaths(process.argv)) {
        const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const result = normalizeCatalog(catalog, filePath);
        fs.writeFileSync(filePath, `${JSON.stringify(result.catalog, null, 2)}\n`, 'utf8');
        console.log(`[equipment-presentation] updated=${result.updatedCount} file=${filePath}`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    OFFHAND_SPRITE_INDICES,
    PRESENTATION_OVERRIDES,
    getFriendlyId,
    normalizeCatalog
};

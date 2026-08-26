const fs = require('fs');
const path = require('path');

const HAT_BLACK_HEADGEAR = Object.freeze([
    { title: '祭りぼうし', defense: 2 },
    { title: '狩人のぼうし', defense: 2 },
    { title: '紳士のぼうし', defense: 1 },
    { title: '旅人のぼうし', defense: 1 },
    { title: '星のぼうし', defense: 2 },
    { title: '魔術師のぼうし', defense: 2 },
    { title: '海賊のぼうし', defense: 2 },
    { title: '砂漠ターバン', defense: 2 },
    { title: '若海賊の帽子', defense: 2 },
    { title: '忍びのフード', defense: 3 },
    { title: '学者のぼうし', defense: 1 },
    { title: '羽根ベレー', defense: 1 },
    { title: '荒野のぼうし', defense: 2 },
    { title: '蛇のターバン', defense: 2 },
    { title: '魔女のぼうし', defense: 1 },
    { title: 'とんがり帽', defense: 1 },
    { title: '紋章のぼうし', defense: 2 },
    { title: '旅人フード', defense: 2 },
    { title: '海賊帽子', defense: 2 },
    { title: '隠密フード', defense: 3 },
    { title: '船長のぼうし', defense: 2 },
    { title: '黒ベレー', defense: 1 },
    { title: '羽根帽子', defense: 2 },
    { title: '砂海ターバン', defense: 2 },
    { title: 'つぶれ帽', defense: 1 },
    { title: '結びターバン', defense: 2 },
    { title: 'どくろ帽', defense: 2 },
    { title: '忍びマスク', defense: 3 },
    { title: '海賊三角帽', defense: 2 },
    { title: '半面フード', defense: 3 },
    { title: '羽根学帽', defense: 1 },
    { title: '提督のぼうし', defense: 2 },
    { title: '横かぶり帽', defense: 1 },
    { title: '平たい帽子', defense: 1 },
    { title: '帯の魔女帽', defense: 1 },
    { title: '包帯フード', defense: 3 },
    { title: '戦士のハチマキ', defense: 1 },
    { title: '旅のタオル', defense: 1 },
    { title: '赤のハチマキ', defense: 1 },
    { title: '口覆いフード', defense: 3 },
    { title: '森人のぼうし', defense: 2 },
    { title: '鉄のキャップ', defense: 4 },
    { title: '飾り帽子', defense: 1 },
    { title: '妖精の帽子', defense: 1 },
    { title: '魔導士の帽子', defense: 2 },
    { title: '包帯マスク', defense: 3 },
    { title: '結びハチマキ', defense: 1 },
    { title: 'ミイラフード', defense: 3 },
    { title: '防寒フード', defense: 4 }
]);

const HAT_STRAW_HEADGEAR = Object.freeze([
    { title: 'むぎわら帽', defense: 1 },
    { title: 'とんがり笠', defense: 1 },
    { title: '旅人の笠', defense: 1 },
    { title: '編み笠', defense: 2 },
    { title: '虚無僧笠', defense: 2 }
]);

const LEATHER01_HEADGEAR = Object.freeze([
    { title: '角獣の面', defense: 11 },
    { title: '牡羊の面', defense: 10 },
    { title: 'どくろ面', defense: 9 },
    { title: '角どくろ面', defense: 11 },
    { title: '鹿角の面', defense: 12 },
    { title: '鳥面マスク', defense: 6 },
    { title: '革のフード', defense: 7 },
    { title: '牙のマスク', defense: 8 },
    { title: '革のぼうし', defense: 4 },
    { title: '革のキャップ', defense: 4 },
    { title: '革の仮面', defense: 8 },
    { title: '革のかぶと', defense: 9 },
    { title: '革のヘルム', defense: 8 },
    { title: '角のかぶと', defense: 10 },
    { title: '革の三角帽', defense: 4 },
    { title: '革の魔女帽', defense: 3 },
    { title: '海賊の革帽', defense: 5 },
    { title: '羽根の革帽', defense: 4 },
    { title: '革の額当て', defense: 7 },
    { title: '鋲のフード', defense: 8 },
    { title: '革の旅帽', defense: 4 },
    { title: '羽根の旅帽', defense: 4 },
    { title: '革の魔導帽', defense: 5 },
    { title: '帯の魔導帽', defense: 5 },
    { title: '大角のかぶと', defense: 13 },
    { title: '片面フード', defense: 7 },
    { title: '目深フード', defense: 6 },
    { title: '革の丸帽', defense: 4 },
    { title: '鋲の革帽', defense: 6 },
    { title: '角の革帽', defense: 6 },
    { title: '鋲のかぶと', defense: 10 },
    { title: '厚革のかぶと', defense: 10 },
    { title: '革の耳当て', defense: 5 },
    { title: '狩人の革帽', defense: 4 },
    { title: '白羽根帽', defense: 4 },
    { title: '羽根ハンチング', defense: 4 },
    { title: '白羽根の帽子', defense: 4 }
]);

const LEATHER02_HEADGEAR = Object.freeze([
    { title: '魔獣のかぶと', defense: 13 },
    { title: '鹿角の冠', defense: 12 },
    { title: '鹿骨の面', defense: 11 },
    { title: 'どくろのかぶと', defense: 14 }
]);

const METAL_HEADGEAR = Object.freeze([
    { title: '鉄のかぶと', defense: 18 },
    { title: '金のかぶと', defense: 22 },
    { title: '面頬のかぶと', defense: 19 },
    { title: '角の鉄兜', defense: 20 },
    { title: '重騎士の兜', defense: 23 },
    { title: '黒鉄の兜', defense: 20 },
    { title: '双紋の兜', defense: 21 },
    { title: '鋲の鉄兜', defense: 21 },
    { title: '十字の兜', defense: 22 },
    { title: '鉄格子の兜', defense: 22 },
    { title: '重格子の兜', defense: 23 },
    { title: '丸面の兜', defense: 20 },
    { title: 'グレートヘルム', defense: 24 },
    { title: '鉄鉢兜', defense: 15 },
    { title: '鎖の鉄鉢', defense: 16 },
    { title: '鋲の丸兜', defense: 17 },
    { title: '鎖の丸兜', defense: 18 },
    { title: '平鉄鉢', defense: 17 },
    { title: '鎖の平鉄鉢', defense: 19 },
    { title: '鉄の広帽', defense: 14 },
    { title: '鎖の鉄帽', defense: 16 },
    { title: '鼻当て兜', defense: 17 },
    { title: '頬当て兜', defense: 17 },
    { title: '耳当て兜', defense: 17 },
    { title: '鎖の耳当て', defense: 18 },
    { title: 'サレット', defense: 18 },
    { title: '鎖サレット', defense: 19 },
    { title: '片面の兜', defense: 20 },
    { title: '金の片面兜', defense: 23 },
    { title: '羽根の金兜', defense: 24 },
    { title: '金のクレスト', defense: 23 },
    { title: '重クレスト', defense: 25 },
    { title: 'コリント兜', defense: 21 },
    { title: '金のコリント', defense: 24 },
    { title: 'イリュリア兜', defense: 22 },
    { title: '金のイリュリア', defense: 25 },
    { title: 'フリギア兜', defense: 23 }
]);

const METAL_BLACK_HEADGEAR = Object.freeze([
    { title: '炎王の冠', defense: 60 },
    { title: '獅子の兜', defense: 60 },
    { title: '獣王の兜', defense: 60 },
    { title: '黒翼の兜', defense: 60 },
    { title: '駿馬の兜', defense: 60 },
    { title: '鹿角の兜', defense: 60 },
    { title: '羽根兜', defense: 60 },
    { title: '風王の冠', defense: 60 },
    { title: '翼の兜', defense: 60 },
    { title: '覇王の兜', defense: 60 },
    { title: '地王の冠', defense: 60 },
    { title: '水王の冠', defense: 60 },
    { title: '黒羽の兜', defense: 60 },
    { title: '黒鋼の兜', defense: 60 },
    { title: '黄金の兜', defense: 60 },
    { title: '戦神の兜', defense: 60 },
    { title: '覇者の兜', defense: 60 },
    { title: '聖騎士の兜', defense: 60 },
    { title: '金剛の兜', defense: 60 },
    { title: '砂漠の兜', defense: 60 },
    { title: '砂漠の仮面', defense: 60 },
    { title: '大将の兜', defense: 60 },
    { title: '魔王の兜', defense: 60 }
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

function buildHeadArmorOverrides(prefix, entries, descriptionFactory) {
    return Object.fromEntries(entries.map(({ title, defense }, index) => [
        `${prefix}${String(index + 1).padStart(2, '0')}`,
        {
            title,
            description: descriptionFactory(title),
            defense
        }
    ]));
}

const HEAD_ARMOR_OVERRIDES = Object.freeze({
    ...buildHeadArmorOverrides(
        'hat_black_',
        HAT_BLACK_HEADGEAR,
        (title) => `${title}。軽くて扱いやすい頭装備。`
    ),
    ...buildHeadArmorOverrides(
        'hat_straw_',
        HAT_STRAW_HEADGEAR,
        (title) => `${title}。草を編んで作られた軽い頭装備。`
    ),
    ...buildHeadArmorOverrides(
        'leather01_',
        LEATHER01_HEADGEAR,
        (title) => `${title}。革で仕立てた頭装備。`
    ),
    ...buildHeadArmorOverrides(
        'leather02_',
        LEATHER02_HEADGEAR,
        (title) => `${title}。革と骨で作られた頭装備。`
    ),
    ...buildHeadArmorOverrides(
        'metal_',
        METAL_HEADGEAR,
        (title) => `${title}。金属で作られた頭装備。`
    ),
    ...buildHeadArmorOverrides(
        'metal_black_',
        METAL_BLACK_HEADGEAR,
        (title) => `${title}。名のある戦士のための重い頭装備。`
    )
});

const PRESENTATION_OVERRIDES = Object.freeze({
    ...HEAD_ARMOR_OVERRIDES,
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
            if (Number.isInteger(presentation.defense)) {
                item.DisplayProperties = {
                    ...(item.DisplayProperties || {}),
                    Defense: presentation.defense
                };
            }
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
    HEAD_ARMOR_OVERRIDES,
    OFFHAND_SPRITE_INDICES,
    PRESENTATION_OVERRIDES,
    getFriendlyId,
    normalizeCatalog
};

const fs = require('fs');
const path = require('path');

const ICON_SPRITE = {
    path: './Sprites/items/icons.png',
    width: 16,
    height: 16,
    cols: 16
};

const OFFHAND_GROUPS = [
    {
        key: 'tome',
        title: '魔導書',
        description: '左手に装備する魔導書。詠唱と魔法威力を助ける副手。',
        entries: [
            { no: 1, title: '初学の魔導書', spriteIndex: 18, stats: { Defense: 1, Int: 4, MagicPower: 4, CastRate: 2, MpEfficiency: 1 }, prices: { BuyPrice: 240, SellPrice: 150 } },
            { no: 2, title: '蒼頁の魔導書', spriteIndex: 19, stats: { Defense: 1, Int: 6, MagicPower: 6, CastRate: 3, MpEfficiency: 2 }, prices: { BuyPrice: 320, SellPrice: 200 } },
            { no: 3, title: '星紋の魔導書', spriteIndex: 20, stats: { Defense: 2, Int: 8, MagicPower: 9, CastRate: 4, MpEfficiency: 3 }, prices: { BuyPrice: 420, SellPrice: 270 } },
            { no: 4, title: '月影の魔導書', spriteIndex: 21, stats: { Defense: 2, Int: 10, MagicPower: 12, CastRate: 5, MpEfficiency: 4 }, prices: { BuyPrice: 560, SellPrice: 360 } },
            { no: 5, title: '禁書の断章', spriteIndex: 23, stats: { Defense: 3, Int: 13, MagicPower: 16, CastRate: 6, MpEfficiency: 5 }, prices: { BuyPrice: 720, SellPrice: 470 } }
        ]
    },
    {
        key: 'orb',
        title: 'オーブ',
        description: '左手に装備するオーブ。魔力放出と状態異常付与を補助する副手。',
        entries: [
            { no: 1, title: '玻璃のオーブ', spriteIndex: 192, stats: { Defense: 1, Int: 3, MagicPower: 5, StatusRate: 2 }, prices: { BuyPrice: 240, SellPrice: 150 } },
            { no: 2, title: '月光のオーブ', spriteIndex: 194, stats: { Defense: 1, Int: 5, MagicPower: 7, StatusRate: 3 }, prices: { BuyPrice: 320, SellPrice: 200 } },
            { no: 3, title: '深海のオーブ', spriteIndex: 198, stats: { Defense: 2, Int: 7, MagicPower: 10, StatusRate: 5 }, prices: { BuyPrice: 430, SellPrice: 280 } },
            { no: 4, title: '雷環のオーブ', spriteIndex: 202, stats: { Defense: 2, Int: 9, MagicPower: 13, StatusRate: 7 }, prices: { BuyPrice: 560, SellPrice: 370 } },
            { no: 5, title: '天球のオーブ', spriteIndex: 207, stats: { Defense: 3, Int: 11, MagicPower: 17, StatusRate: 10 }, prices: { BuyPrice: 730, SellPrice: 480 } }
        ]
    },
    {
        key: 'catalyst',
        title: '触媒',
        description: '左手に装備する触媒。結界や回復の出力を高める副手。',
        entries: [
            { no: 1, title: '祈祷の触媒', spriteIndex: 912, stats: { Defense: 3, Int: 2, MagicPower: 3, HealPower: 4, MpEfficiency: 2 }, prices: { BuyPrice: 240, SellPrice: 150 } },
            { no: 2, title: '精霊の触媒', spriteIndex: 914, stats: { Defense: 4, Int: 3, MagicPower: 5, HealPower: 6, MpEfficiency: 3 }, prices: { BuyPrice: 320, SellPrice: 200 } },
            { no: 3, title: '錬成の触媒', spriteIndex: 915, stats: { Defense: 5, Int: 5, MagicPower: 8, HealPower: 8, MpEfficiency: 4 }, prices: { BuyPrice: 430, SellPrice: 280 } },
            { no: 4, title: '結界の触媒', spriteIndex: 925, stats: { Defense: 6, Int: 6, MagicPower: 10, HealPower: 11, MpEfficiency: 5 }, prices: { BuyPrice: 560, SellPrice: 370 } },
            { no: 5, title: '王家の触媒', spriteIndex: 923, stats: { Defense: 8, Int: 8, MagicPower: 13, HealPower: 14, MpEfficiency: 6 }, prices: { BuyPrice: 730, SellPrice: 480 } }
        ]
    },
    {
        key: 'relic',
        title: '聖印',
        description: '左手に装備する聖印。浄化と加護を授ける法具。',
        entries: [
            { no: 1, title: '巡礼の聖印', spriteIndex: 176, stats: { Defense: 3, Int: 3, MagicPower: 3, HealPower: 3, StatusRate: 2 }, prices: { BuyPrice: 250, SellPrice: 160 } },
            { no: 2, title: '月詠みの聖印', spriteIndex: 177, stats: { Defense: 4, Int: 4, MagicPower: 5, HealPower: 5, StatusRate: 3 }, prices: { BuyPrice: 330, SellPrice: 210 } },
            { no: 3, title: '裁きの聖印', spriteIndex: 178, stats: { Defense: 5, Int: 6, MagicPower: 7, HealPower: 7, StatusRate: 5 }, prices: { BuyPrice: 440, SellPrice: 290 } },
            { no: 4, title: '暁光の聖印', spriteIndex: 179, stats: { Defense: 6, Int: 8, MagicPower: 9, HealPower: 10, StatusRate: 7 }, prices: { BuyPrice: 580, SellPrice: 380 } },
            { no: 5, title: '光冠の聖印', spriteIndex: 180, stats: { Defense: 8, Int: 10, MagicPower: 12, HealPower: 13, StatusRate: 9 }, prices: { BuyPrice: 750, SellPrice: 500 } }
        ]
    }
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

function createOffhandItem(groupKey, groupTitle, groupDescription, entry) {
    const id = `offhand_${groupKey}_${entry.no.toString().padStart(2, '0')}`;
    return {
        Id: id,
        AlternateIds: [
            {
                Type: 'FriendlyId',
                Value: id
            }
        ],
        Type: 'catalogItem',
        Title: createLocalizedText(entry.title),
        Description: createLocalizedText(groupDescription),
        ContentType: 'Durable',
        DisplayProperties: {
            Category: 'Offhand',
            OffhandGroup: groupKey,
            OffhandGroupLabel: groupTitle,
            OffhandTier: entry.no,
            preferredEquipSlot: 'LeftHand',
            sprite_path: ICON_SPRITE.path,
            sprite_index: entry.spriteIndex,
            Power: entry.stats.Power || 0,
            Defense: entry.stats.Defense || 0,
            Agi: entry.stats.Agi || 0,
            Int: entry.stats.Int || 0,
            MagicPower: entry.stats.MagicPower || 0,
            HealPower: entry.stats.HealPower || 0,
            MpEfficiency: entry.stats.MpEfficiency || 0,
            StatusRate: entry.stats.StatusRate || 0,
            CastRate: entry.stats.CastRate || 0,
            BuyPrice: entry.prices.BuyPrice,
            SellPrice: entry.prices.SellPrice
        }
    };
}

function buildOffhandItems() {
    return OFFHAND_GROUPS.flatMap((group) =>
        group.entries.map((entry) => createOffhandItem(group.key, group.title, group.description, entry))
    );
}

function upsertGeneratedItems(items, generatedItems, generatedIdPattern) {
    const generatedById = new Map(generatedItems.map((item) => [getFriendlyId(item), item]));
    const mergedItems = [];
    let insertAt = -1;

    for (const item of items) {
        const friendlyId = getFriendlyId(item);
        if (!generatedIdPattern.test(friendlyId)) {
            mergedItems.push(item);
            continue;
        }

        const replacement = generatedById.get(friendlyId);
        if (replacement) {
            mergedItems.push(replacement);
            generatedById.delete(friendlyId);
            insertAt = mergedItems.length;
        }
    }

    const additions = generatedItems.filter((item) => generatedById.has(getFriendlyId(item)));
    const insertionIndex = insertAt >= 0 ? insertAt : mergedItems.length;
    mergedItems.splice(insertionIndex, 0, ...additions);
    return mergedItems;
}

function main() {
    const filePath = resolveCatalogPath(process.argv);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.Items) ? parsed.Items : [];
    const offhandIdPattern = /^offhand_(tome|orb|catalyst|relic)_\d+$/;
    const offhandItems = buildOffhandItems();
    parsed.Items = upsertGeneratedItems(items, offhandItems, offhandIdPattern);
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    console.log(`[offhand-catalog] wrote ${offhandItems.length} offhand items to ${filePath}`);
}

if (require.main === module) {
    main();
}

module.exports = {
    OFFHAND_GROUPS,
    buildOffhandItems,
    getFriendlyId,
    upsertGeneratedItems
};

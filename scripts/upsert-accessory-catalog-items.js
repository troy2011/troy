const fs = require('fs');
const path = require('path');

const ICON_SPRITE = {
    path: './Sprites/items/icons.png',
    width: 16,
    height: 16,
    cols: 16
};

const ACCESSORY_GROUPS = [
    {
        key: 'mystic',
        tag: 'mystic',
        entries: [
            { no: 1, title: '祈りの首飾り', spriteIndex: 794, stats: { Defense: 2, Int: 4 }, prices: { BuyPrice: 220, SellPrice: 140 } },
            { no: 2, title: '魔導の鎖飾り', spriteIndex: 795, stats: { Defense: 3, Int: 5 }, prices: { BuyPrice: 280, SellPrice: 180 } },
            { no: 3, title: '蒼晶の首飾り', spriteIndex: 796, stats: { Defense: 4, Int: 7 }, prices: { BuyPrice: 360, SellPrice: 230 } },
            { no: 4, title: '月の指輪', spriteIndex: 801, stats: { Defense: 5, Int: 9 }, prices: { BuyPrice: 460, SellPrice: 300 } },
            { no: 5, title: '星詠みの指輪', spriteIndex: 802, stats: { Defense: 6, Int: 12 }, prices: { BuyPrice: 620, SellPrice: 410 } }
        ]
    },
    {
        key: 'royal',
        tag: 'royal',
        entries: [
            { no: 1, title: '王金の腕輪', spriteIndex: 790, stats: { Power: 1, Defense: 3 }, prices: { BuyPrice: 240, SellPrice: 150 } },
            { no: 2, title: '緋玉の腕輪', spriteIndex: 793, stats: { Power: 2, Defense: 4 }, prices: { BuyPrice: 320, SellPrice: 200 } },
            { no: 3, title: '祝祭の護符', spriteIndex: 799, stats: { Power: 2, Defense: 6, Int: 1 }, prices: { BuyPrice: 430, SellPrice: 270 } },
            { no: 4, title: '栄冠の宝環', spriteIndex: 820, stats: { Power: 3, Defense: 8 }, prices: { BuyPrice: 540, SellPrice: 350 } },
            { no: 5, title: '王旗のリボン', spriteIndex: 825, stats: { Power: 4, Defense: 10, Int: 1 }, prices: { BuyPrice: 680, SellPrice: 450 } }
        ]
    },
    {
        key: 'shadow',
        tag: 'shadow',
        entries: [
            { no: 1, title: '黒鉄の指輪', spriteIndex: 786, stats: { Defense: 2, Agi: 4 }, prices: { BuyPrice: 230, SellPrice: 150 } },
            { no: 2, title: '宵闇のサングラス', spriteIndex: 810, stats: { Defense: 3, Agi: 5 }, prices: { BuyPrice: 310, SellPrice: 200 } },
            { no: 3, title: '盗賊の仮面', spriteIndex: 811, stats: { Power: 1, Defense: 4, Agi: 7 }, prices: { BuyPrice: 400, SellPrice: 260 } },
            { no: 4, title: '狐面の飾り', spriteIndex: 813, stats: { Power: 2, Defense: 5, Agi: 9 }, prices: { BuyPrice: 520, SellPrice: 340 } },
            { no: 5, title: '魔人の仮面', spriteIndex: 815, stats: { Power: 3, Defense: 6, Agi: 12 }, prices: { BuyPrice: 700, SellPrice: 470 } }
        ]
    },
    {
        key: 'nature',
        tag: 'nature',
        entries: [
            { no: 1, title: '緑環の腕輪', spriteIndex: 791, stats: { Defense: 4, Int: 1 }, prices: { BuyPrice: 220, SellPrice: 140 } },
            { no: 2, title: '森花の耳飾り', spriteIndex: 804, stats: { Defense: 5, Agi: 1, Int: 1 }, prices: { BuyPrice: 300, SellPrice: 190 } },
            { no: 3, title: '羽根のブローチ', spriteIndex: 819, stats: { Defense: 6, Agi: 2, Int: 2 }, prices: { BuyPrice: 390, SellPrice: 250 } },
            { no: 4, title: '花冠の護り', spriteIndex: 821, stats: { Defense: 7, Agi: 2, Int: 4 }, prices: { BuyPrice: 500, SellPrice: 330 } },
            { no: 5, title: '白花のコサージュ', spriteIndex: 822, stats: { Defense: 9, Agi: 3, Int: 5 }, prices: { BuyPrice: 650, SellPrice: 430 } }
        ]
    },
    {
        key: 'tech',
        tag: 'tech',
        entries: [
            { no: 1, title: '機工の耳飾り', spriteIndex: 800, stats: { Defense: 2, Agi: 2, Int: 2 }, prices: { BuyPrice: 240, SellPrice: 150 } },
            { no: 2, title: '歯車のブローチ', spriteIndex: 806, stats: { Defense: 3, Agi: 3, Int: 3 }, prices: { BuyPrice: 320, SellPrice: 200 } },
            { no: 3, title: '導視のバイザー', spriteIndex: 808, stats: { Defense: 4, Agi: 4, Int: 4 }, prices: { BuyPrice: 430, SellPrice: 280 } },
            { no: 4, title: '夜見のゴーグル', spriteIndex: 809, stats: { Defense: 5, Agi: 5, Int: 5 }, prices: { BuyPrice: 560, SellPrice: 370 } },
            { no: 5, title: '旅人のゴーグル', spriteIndex: 812, stats: { Defense: 6, Agi: 7, Int: 6 }, prices: { BuyPrice: 720, SellPrice: 480 } }
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

function createAccessoryItem(groupKey, entry) {
    const id = `accessory_${groupKey}_${entry.no.toString().padStart(2, '0')}`;
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
        Description: createLocalizedText(`${entry.title}。アクセサリー枠に装備できる護りの装具。`),
        ContentType: 'Durable',
        DisplayProperties: {
            Category: 'Accessory',
            AccessoryGroup: groupKey,
            AccessoryTier: entry.no,
            sprite_path: ICON_SPRITE.path,
            sprite_index: entry.spriteIndex,
            sprite_w: ICON_SPRITE.width,
            sprite_h: ICON_SPRITE.height,
            sprite_cols: ICON_SPRITE.cols,
            Power: entry.stats.Power || 0,
            Defense: entry.stats.Defense || 0,
            Agi: entry.stats.Agi || 0,
            Int: entry.stats.Int || 0,
            BuyPrice: entry.prices.BuyPrice,
            SellPrice: entry.prices.SellPrice
        }
    };
}

function buildAccessoryItems() {
    return ACCESSORY_GROUPS.flatMap((group) =>
        group.entries.map((entry) => createAccessoryItem(group.key, entry))
    );
}

function main() {
    const filePath = resolveCatalogPath(process.argv);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.Items) ? parsed.Items : [];
    const accessoryIdPattern = /^accessory_(mystic|royal|shadow|nature|tech)_\d+$/;
    const keptItems = items.filter((item) => !accessoryIdPattern.test(getFriendlyId(item)));
    const accessoryItems = buildAccessoryItems();
    parsed.Items = [...keptItems, ...accessoryItems];
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    console.log(`[accessory-catalog] wrote ${accessoryItems.length} accessory items to ${filePath}`);
}

main();

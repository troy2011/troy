const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    TROY_MENU_CONSUMABLE_ID_PREFIX,
    getTroyMenuConsumableItemId,
    normalizeTroyMenuImagePath
} = require('../server/troyMenuConsumables');

function readUtf8NoBom(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function writeUtf8NoBom(filePath, content) {
    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
}

function loadFrontendModule(filePath, exportNames) {
    let source = readUtf8NoBom(filePath);
    source = source
        .replace(/\bexport\s+const\s+/g, 'const ')
        .replace(/\bexport\s+function\s+/g, 'function ');
    const context = {
        module: { exports: {} },
        exports: {}
    };
    const exportObject = exportNames.map((name) => `${name}: typeof ${name} !== 'undefined' ? ${name} : undefined`).join(',');
    vm.runInNewContext(`${source}\nmodule.exports = { ${exportObject} };`, context, { filename: filePath });
    return context.module.exports;
}

function getFriendlyId(item = {}) {
    const alternate = Array.isArray(item.AlternateIds)
        ? item.AlternateIds.find((entry) => String(entry?.Type || '').toLowerCase() === 'friendlyid')?.Value
        : '';
    return String(item.FriendlyId || alternate || item.ItemId || '').trim();
}

function parsePngSize(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        const isPng = buffer.length > 24
            && buffer[0] === 0x89
            && buffer[1] === 0x50
            && buffer[2] === 0x4E
            && buffer[3] === 0x47;
        if (!isPng) return null;
        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20)
        };
    } catch {
        return null;
    }
}

function resolveCatalogPath(argv) {
    const index = argv.indexOf('--file');
    if (index >= 0 && argv[index + 1]) {
        return path.resolve(process.cwd(), argv[index + 1]);
    }
    return path.resolve(process.cwd(), 'catalog_v2_items.json');
}

function buildCatalogEntry(row) {
    const itemId = getTroyMenuConsumableItemId(row.name, row.image);
    const size = row.size || { width: 64, height: 64 };
    return {
        AlternateIds: [
            {
                Type: 'FriendlyId',
                Value: itemId
            }
        ],
        Type: 'catalogItem',
        Title: {
            NEUTRAL: row.name,
            'ja-JP': row.name
        },
        Description: {
            NEUTRAL: 'TROYの会計で受け取ったメニュー。',
            'ja-JP': 'TROYの会計で受け取ったメニュー。'
        },
        ContentType: 'Consumable',
        Tags: [
            'troy',
            'menu'
        ],
        DisplayProperties: {
            Category: 'Consumable',
            TroyMenuConsumable: true,
            GachaExcluded: true,
            ShopSeedable: false,
            ShopCraftable: false,
            MenuCategory: row.category,
            MenuPrice: row.price,
            image_path: row.image,
            sprite_path: row.image,
            sprite_index: 0,
            sprite_w: size.width,
            sprite_h: size.height,
            sprite_cols: 1,
            UsageCount: 1
        }
    };
}

function buildMenuRows() {
    const menuDataPath = path.resolve(process.cwd(), 'public/js/troyMenuData.js');
    const menuAssetsPath = path.resolve(process.cwd(), 'public/js/troyMenuAssets.js');
    const { getTroyStaffMenu } = loadFrontendModule(menuDataPath, ['getTroyStaffMenu']);
    const { getTroyMenuImage } = loadFrontendModule(menuAssetsPath, ['getTroyMenuImage']);
    if (typeof getTroyStaffMenu !== 'function' || typeof getTroyMenuImage !== 'function') {
        throw new Error('TROY staff menu modules could not be loaded.');
    }

    const byId = new Map();
    getTroyStaffMenu().forEach((category) => {
        const categoryId = String(category?.id || '').trim();
        (Array.isArray(category?.items) ? category.items : []).forEach((item) => {
            const name = String(item?.name || '').trim();
            const image = normalizeTroyMenuImagePath(getTroyMenuImage(categoryId, item));
            const price = Math.max(0, Math.floor(Number(item?.price) || 0));
            if (!name || !image || price <= 0) return;
            const itemId = getTroyMenuConsumableItemId(name, image);
            if (!itemId) return;
            const publicImagePath = path.resolve(process.cwd(), 'public', image.replace(/^\.\//, ''));
            byId.set(itemId, {
                itemId,
                name,
                image,
                price,
                category: categoryId,
                size: parsePngSize(publicImagePath) || { width: 64, height: 64 }
            });
        });
    });

    return [...byId.values()]
        .sort((left, right) => left.category.localeCompare(right.category, 'ja')
            || left.name.localeCompare(right.name, 'ja')
            || left.price - right.price);
}

function isTroyMenuCatalogItem(item) {
    const friendlyId = getFriendlyId(item).toLowerCase();
    return friendlyId.startsWith(TROY_MENU_CONSUMABLE_ID_PREFIX);
}

function main() {
    const filePath = resolveCatalogPath(process.argv.slice(2));
    const catalog = JSON.parse(readUtf8NoBom(filePath));
    if (!Array.isArray(catalog.Items)) {
        throw new Error('catalog_v2_items.json に Items がありません。');
    }

    const generated = buildMenuRows().map(buildCatalogEntry);
    const retained = catalog.Items.filter((item) => !isTroyMenuCatalogItem(item));
    const insertIndex = retained.findIndex((item) => {
        const category = String(item?.DisplayProperties?.Category || '').trim();
        return category && category !== 'Consumable';
    });
    const at = insertIndex >= 0 ? insertIndex : retained.length;
    retained.splice(at, 0, ...generated);
    catalog.Items = retained;

    writeUtf8NoBom(filePath, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`[troy-menu-catalog] wrote ${generated.length} TROY menu consumables to ${filePath}`);
}

main();

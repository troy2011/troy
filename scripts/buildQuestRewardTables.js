const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'catalog_v2_items.json');
const outputPath = path.join(__dirname, '..', 'server', 'data', 'questRewardTables.json');

function getFriendlyId(item) {
    const altIds = Array.isArray(item?.AlternateIds) ? item.AlternateIds : [];
    const friendly = altIds.find((alt) => alt?.Type === 'FriendlyId');
    return friendly?.Value ? String(friendly.Value) : '';
}

function getDisplay(item) {
    return item?.DisplayProperties || {};
}

function getScore(item) {
    const display = getDisplay(item);
    if (typeof display.Power === 'number') return display.Power;
    if (typeof display.Defense === 'number') return display.Defense;
    const effectAmount = display?.Effect?.Amount;
    if (typeof effectAmount === 'number') return effectAmount;
    return 1;
}

function buildWeight(score) {
    return Math.max(1, Math.round(1000 / (Number(score) + 10)));
}

function pushReward(tables, key, itemId, score) {
    if (!itemId) return;
    if (!tables[key]) tables[key] = [];
    tables[key].push({
        itemId,
        weight: buildWeight(score),
        score
    });
}

function splitIntoTiers(items) {
    const list = Array.isArray(items) ? [...items] : [];
    if (!list.length) {
        return { common: [], rare: [], epic: [] };
    }
    const total = list.length;
    const commonEnd = Math.max(1, Math.floor(total * 0.6));
    const rareEnd = Math.max(commonEnd + 1, Math.floor(total * 0.9));
    return {
        common: list.slice(0, commonEnd),
        rare: list.slice(commonEnd, rareEnd),
        epic: list.slice(rareEnd)
    };
}

function classifyItem(item) {
    const id = getFriendlyId(item);
    const display = getDisplay(item);
    const category = String(display.Category || item.ContentType || '').toLowerCase();
    const score = getScore(item);

    if (id.startsWith('sword_') || id.startsWith('sword_big_')) return { key: 'sword', id, score };
    if (id.startsWith('axe_') || id.startsWith('axe_big_')) return { key: 'axe', id, score };
    if (id.startsWith('polearm_')) return { key: 'spear', id, score };
    if (id.startsWith('staff_')) return { key: 'staff', id, score };
    if (id.startsWith('gun_')) return { key: 'gun', id, score };
    if (id.startsWith('shield_')) return { key: 'shield', id, score };
    if (category === 'armor') return { key: 'helmet', id, score };
    if (category === 'consumable') return { key: 'item', id, score };
    return null;
}

function buildTables(items) {
    const flatTables = {
        sword: [],
        axe: [],
        spear: [],
        staff: [],
        gun: [],
        helmet: [],
        shield: [],
        item: []
    };
    const tables = {};
    items.forEach((item) => {
        const result = classifyItem(item);
        if (!result) return;
        pushReward(flatTables, result.key, result.id, result.score);
    });
    Object.keys(flatTables).forEach((key) => {
        const list = flatTables[key];
        list.sort((a, b) => a.score - b.score);
        tables[key] = splitIntoTiers(list);
    });
    return tables;
}

function main() {
    const raw = fs.readFileSync(catalogPath, 'utf8');
    const catalog = JSON.parse(raw);
    const items = Array.isArray(catalog?.Items) ? catalog.Items : [];
    const tables = buildTables(items);
    const payload = {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        tiers: {
            common: 0.6,
            rare: 0.9
        },
        tables
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    console.log(`Quest reward tables written: ${outputPath}`);
}

main();

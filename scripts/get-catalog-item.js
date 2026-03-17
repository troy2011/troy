#!/usr/bin/env node

require('dotenv').config();

const {
    PlayFabEconomy,
    configurePlayFab,
    promisifyPlayFab,
    getTitleEntityKey,
    withTitleEntityToken
} = require('../server/playfab');

function parseArgs(argv) {
    const ids = [];
    const friendlyIds = [];
    let outputJson = false;

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;
        if (token === '--id' && argv[i + 1]) {
            ids.push(String(argv[i + 1]).trim());
            i += 1;
            continue;
        }
        if (token === '--friendly' && argv[i + 1]) {
            friendlyIds.push(String(argv[i + 1]).trim());
            i += 1;
            continue;
        }
        if (token === '--json') {
            outputJson = true;
            continue;
        }
        if (/^[0-9a-f-]{36}$/i.test(token)) {
            ids.push(token);
            continue;
        }
        friendlyIds.push(token);
    }

    return {
        ids: Array.from(new Set(ids.filter(Boolean))),
        friendlyIds: Array.from(new Set(friendlyIds.filter(Boolean))),
        outputJson
    };
}

function pickLocalizedText(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return String(entry['ja-JP'] || entry.NEUTRAL || entry.en || Object.values(entry)[0] || '').trim();
}

function getFriendlyId(item) {
    if (!Array.isArray(item?.AlternateIds)) return '';
    const entry = item.AlternateIds.find((alt) => String(alt?.Type || '').toLowerCase() === 'friendlyid');
    return String(entry?.Value || '').trim();
}

function normalizeItem(item, query) {
    const props = item?.DisplayProperties && typeof item.DisplayProperties === 'object'
        ? item.DisplayProperties
        : {};
    return {
        query,
        id: String(item?.Id || '').trim(),
        friendlyId: getFriendlyId(item),
        title: pickLocalizedText(item?.Title) || String(item?.DisplayName || '').trim(),
        description: pickLocalizedText(item?.Description),
        category: String(props?.Category || '').trim(),
        etag: String(item?.ETag || '').trim(),
        displayProperties: props
    };
}

async function fetchByIds(titleEntity, ids) {
    if (!ids.length) return [];
    const result = await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.GetItems, {
        Entity: titleEntity,
        Ids: ids
    }));
    return Array.isArray(result?.Items) ? result.Items : [];
}

async function fetchByFriendlyId(titleEntity, friendlyId) {
    const key = String(friendlyId || '').trim();
    if (!key) return [];
    const result = await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.GetItems, {
        Entity: titleEntity,
        AlternateIds: [
            {
                Type: 'FriendlyId',
                Value: key
            }
        ]
    }));
    return Array.isArray(result?.Items) ? result.Items : [];
}

function printTextResult(entry) {
    console.log(`query: ${entry.query.type}=${entry.query.value}`);
    console.log(`id: ${entry.id}`);
    console.log(`friendlyId: ${entry.friendlyId}`);
    console.log(`title: ${entry.title}`);
    console.log(`category: ${entry.category}`);
    if (entry.description) {
        console.log(`description: ${entry.description}`);
    }
    console.log(`etag: ${entry.etag}`);
    console.log(JSON.stringify(entry.displayProperties, null, 2));
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.ids.length === 0 && args.friendlyIds.length === 0) {
        throw new Error('取得対象の Id または FriendlyId を指定してください。');
    }

    const titleId = String(process.env.PLAYFAB_TITLE_ID || '').trim();
    const secretKey = String(process.env.PLAYFAB_SECRET_KEY || '').trim();
    if (!titleId || !secretKey) {
        throw new Error('PLAYFAB_TITLE_ID / PLAYFAB_SECRET_KEY が必要です。');
    }

    configurePlayFab({ titleId, secretKey });
    const titleEntity = await getTitleEntityKey();
    if (!titleEntity?.Id || !titleEntity?.Type) {
        throw new Error('Title entity token の取得に失敗しました。');
    }

    const found = [];

    if (args.ids.length > 0) {
        const items = await fetchByIds(titleEntity, args.ids);
        const byId = new Map(items.map((item) => [String(item?.Id || '').trim(), item]));
        args.ids.forEach((id) => {
            const item = byId.get(id);
            if (item) {
                found.push(normalizeItem(item, { type: 'id', value: id }));
                return;
            }
            found.push({
                query: { type: 'id', value: id },
                missing: true
            });
        });
    }

    for (const friendlyId of args.friendlyIds) {
        const items = await fetchByFriendlyId(titleEntity, friendlyId);
        if (items.length > 0) {
            items.forEach((item) => {
                found.push(normalizeItem(item, { type: 'friendlyId', value: friendlyId }));
            });
            continue;
        }
        found.push({
            query: { type: 'friendlyId', value: friendlyId },
            missing: true
        });
    }

    if (args.outputJson) {
        console.log(JSON.stringify(found, null, 2));
        return;
    }

    found.forEach((entry, index) => {
        if (index > 0) {
            console.log('---');
        }
        if (entry.missing) {
            console.log(`query: ${entry.query.type}=${entry.query.value}`);
            console.log('missing: true');
            return;
        }
        printTextResult(entry);
    });
}

main().catch((error) => {
    console.error('[catalog:get] fatal:', error?.errorMessage || error?.message || error);
    process.exitCode = 1;
});

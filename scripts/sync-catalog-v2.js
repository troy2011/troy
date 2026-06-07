#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
    PlayFabEconomy,
    PlayFabAuthentication,
    configurePlayFab,
    promisifyPlayFab,
    ensureTitleEntityToken
} = require('../server/playfab');

function parseArgs(argv) {
    const args = { publish: false, file: null, friendlyPrefix: '' };
    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;
        if (token === '--publish') {
            args.publish = true;
            continue;
        }
        if (token === '--file' && argv[i + 1]) {
            args.file = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
        if (token === '--friendly-prefix' && argv[i + 1]) {
            args.friendlyPrefix = String(argv[i + 1]).trim();
            i += 1;
            continue;
        }
    }
    return args;
}

function resolveCatalogFilePath(explicitPath) {
    if (explicitPath) {
        return path.isAbsolute(explicitPath)
            ? explicitPath
            : path.resolve(process.cwd(), explicitPath);
    }
    return path.resolve(process.cwd(), 'catalog_v2_items.json');
}

function readCatalogItems(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.Items)
        ? parsed.Items
        : (Array.isArray(parsed) ? parsed : []);
    if (!Array.isArray(items) || items.length <= 0) {
        throw new Error('catalog_v2_items.json に Items がありません。');
    }
    return items;
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function getFriendlyId(item) {
    if (!Array.isArray(item?.AlternateIds)) return '';
    const entry = item.AlternateIds.find((alt) => String(alt?.Type || '').toLowerCase() === 'friendlyid');
    return String(entry?.Value || '').trim();
}

function getItemTitle(item) {
    if (!item?.Title) return '';
    if (typeof item.Title === 'string') return item.Title;
    return String(item.Title['ja-JP'] || item.Title.NEUTRAL || item.Title.en || '').trim();
}

async function getTitleEntity() {
    await ensureTitleEntityToken();
    const tokenResult = await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});
    const titleEntity = tokenResult?.Entity;
    if (!titleEntity?.Id || !titleEntity?.Type) {
        throw new Error('Title entity token の取得に失敗しました。');
    }
    return titleEntity;
}

async function loadAllCatalogItems(titleEntity) {
    const itemIds = [];
    let continuationToken = null;
    do {
        const result = await promisifyPlayFab(PlayFabEconomy.SearchItems, {
            Entity: titleEntity,
            Count: 50,
            ContinuationToken: continuationToken || undefined
        });
        const page = Array.isArray(result?.Items) ? result.Items : [];
        for (const item of page) {
            if (item?.Id) itemIds.push(String(item.Id));
        }
        continuationToken = result?.ContinuationToken || null;
    } while (continuationToken);

    const uniqueIds = Array.from(new Set(itemIds));
    if (uniqueIds.length <= 0) return [];

    const allItems = [];
    for (let i = 0; i < uniqueIds.length; i += 50) {
        const batchIds = uniqueIds.slice(i, i + 50);
        const result = await promisifyPlayFab(PlayFabEconomy.GetItems, {
            Entity: titleEntity,
            Ids: batchIds
        });
        const page = Array.isArray(result?.Items) ? result.Items : [];
        allItems.push(...page);
    }

    const draftItems = [];
    let draftContinuationToken = null;
    do {
        const draftResult = await promisifyPlayFab(PlayFabEconomy.GetEntityDraftItems, {
            Entity: titleEntity,
            Count: 50,
            ContinuationToken: draftContinuationToken || undefined
        });
        const page = Array.isArray(draftResult?.Items) ? draftResult.Items : [];
        draftItems.push(...page);
        draftContinuationToken = draftResult?.ContinuationToken || null;
    } while (draftContinuationToken);

    const mergedById = new Map();
    for (const item of allItems) {
        if (item?.Id) mergedById.set(String(item.Id), item);
    }
    for (const item of draftItems) {
        if (item?.Id) mergedById.set(String(item.Id), item);
    }
    return Array.from(mergedById.values());
}

async function loadCatalogItemByFriendlyId(titleEntity, friendlyId) {
    const key = String(friendlyId || '').trim();
    if (!key) return null;
    try {
        const draftResult = await promisifyPlayFab(PlayFabEconomy.GetDraftItem, {
            Entity: titleEntity,
            AlternateId: {
                Type: 'FriendlyId',
                Value: key
            }
        });
        if (draftResult?.Item) {
            return draftResult.Item;
        }
    } catch (error) {
        const errorCode = Number(error?.errorCode || 0);
        const errorName = String(error?.error || '');
        if (errorCode !== 1047 && errorName !== 'ItemNotFound') {
            throw error;
        }
    }
    try {
        const result = await promisifyPlayFab(PlayFabEconomy.GetItems, {
            Entity: titleEntity,
            AlternateIds: [
                {
                    Type: 'FriendlyId',
                    Value: key
                }
            ]
        });
        const items = Array.isArray(result?.Items) ? result.Items : [];
        return items[0] || null;
    } catch (error) {
        const errorCode = Number(error?.errorCode || 0);
        const errorName = String(error?.error || '');
        if (errorCode === 1047 || errorName === 'ItemNotFound') {
            return null;
        }
        throw error;
    }
}

function extractExistingIdFromDuplicateError(error) {
    const message = String(error?.errorMessage || error?.message || error || '');
    const match = message.match(/Id = '([^']+)'/i);
    return String(match?.[1] || '').trim();
}

function buildExistingItemMaps(items) {
    const byId = new Map();
    const byFriendlyId = new Map();
    for (const item of items || []) {
        if (item?.Id) byId.set(String(item.Id), item);
        const friendlyId = getFriendlyId(item);
        if (friendlyId) byFriendlyId.set(friendlyId, item);
    }
    return { byId, byFriendlyId };
}

async function upsertCatalogItem(localItem, existingItem, publish) {
    const payload = cloneJson(localItem);
    delete payload.Tags;
    if (!payload.Type) payload.Type = 'catalogItem';
    if (existingItem?.Id) {
        payload.Id = String(existingItem.Id);
    }
    if (existingItem?.ETag && !payload.ETag) {
        payload.ETag = String(existingItem.ETag);
    }
    const hasExistingItem = !!existingItem?.Id;
    const invoke = async (itemPayload, forceCreate = false) => {
        const request = {
            Item: itemPayload,
            Publish: !!publish
        };
        if (hasExistingItem && !forceCreate) {
            return promisifyPlayFab(PlayFabEconomy.UpdateDraftItem, request);
        }
        return promisifyPlayFab(PlayFabEconomy.CreateDraftItem, request);
    };

    try {
        return await invoke(payload);
    } catch (error) {
        const baseMessage = String(error?.errorMessage || error?.message || error || '');
        let retryPayload = null;

        if (/Tags are not enabled/i.test(baseMessage)) {
            retryPayload = cloneJson(payload);
            delete retryPayload.Tags;
        } else if (/The item could not be found/i.test(baseMessage) && payload?.PriceOptions) {
            retryPayload = cloneJson(payload);
            delete retryPayload.PriceOptions;
        }

        if (!retryPayload) {
            if (hasExistingItem && /The item could not be found/i.test(baseMessage)) {
                return invoke(payload, true);
            }
            throw error;
        }

        try {
            return await invoke(retryPayload);
        } catch (retryError) {
            const retryMessage = String(retryError?.errorMessage || retryError?.message || retryError || '');
            if (/The item could not be found/i.test(retryMessage) && retryPayload?.PriceOptions) {
                const finalPayload = cloneJson(retryPayload);
                delete finalPayload.PriceOptions;
                return invoke(finalPayload);
            }
            if (hasExistingItem && /The item could not be found/i.test(retryMessage)) {
                return invoke(retryPayload, true);
            }
            throw retryError;
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const filePath = resolveCatalogFilePath(args.file);
    if (!fs.existsSync(filePath)) {
        throw new Error(`カタログファイルが見つかりません: ${filePath}`);
    }

    const titleId = String(process.env.PLAYFAB_TITLE_ID || '').trim();
    const secretKey = String(process.env.PLAYFAB_SECRET_KEY || '').trim();
    if (!titleId || !secretKey) {
        throw new Error('PLAYFAB_TITLE_ID / PLAYFAB_SECRET_KEY が必要です。');
    }

    configurePlayFab({ titleId, secretKey });

    let localItems = readCatalogItems(filePath);
    if (args.friendlyPrefix) {
        localItems = localItems.filter((item) => getFriendlyId(item).startsWith(args.friendlyPrefix));
        if (!localItems.length) {
            throw new Error(`friendly-prefix に一致するカタログ項目がありません: ${args.friendlyPrefix}`);
        }
        console.log(`[catalog:sync] filtered by friendly-prefix=${args.friendlyPrefix}: ${localItems.length} items`);
    }
    const titleEntity = await getTitleEntity();
    const existingItems = await loadAllCatalogItems(titleEntity);
    const existingMaps = buildExistingItemMaps(existingItems);
    const missingFriendlyIds = new Set();

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const localItem of localItems) {
        const friendlyId = getFriendlyId(localItem);
        let existingItem =
            (localItem?.Id ? existingMaps.byId.get(String(localItem.Id)) : null)
            || (friendlyId ? existingMaps.byFriendlyId.get(friendlyId) : null)
            || null;
        if (!existingItem && friendlyId && !missingFriendlyIds.has(friendlyId)) {
            const directMatch = await loadCatalogItemByFriendlyId(titleEntity, friendlyId);
            if (directMatch?.Id) {
                existingItem = directMatch;
                existingMaps.byId.set(String(directMatch.Id), directMatch);
                existingMaps.byFriendlyId.set(friendlyId, directMatch);
            } else {
                missingFriendlyIds.add(friendlyId);
            }
        }
        const label = friendlyId || String(localItem?.Id || '') || getItemTitle(localItem) || '(unnamed item)';
        try {
            let result;
            try {
                result = await upsertCatalogItem(localItem, existingItem, args.publish);
            } catch (firstError) {
                const duplicateId = extractExistingIdFromDuplicateError(firstError);
                if (!duplicateId) {
                    if (friendlyId) {
                        const duplicateMatch = await loadCatalogItemByFriendlyId(titleEntity, friendlyId);
                        if (duplicateMatch?.Id) {
                            existingItem = duplicateMatch;
                            existingMaps.byId.set(String(duplicateMatch.Id), duplicateMatch);
                            existingMaps.byFriendlyId.set(friendlyId, duplicateMatch);
                            result = await upsertCatalogItem(localItem, existingItem, args.publish);
                            const returnedItem = result?.Item || duplicateMatch;
                            const nextFriendlyId = getFriendlyId(returnedItem) || friendlyId;
                            if (returnedItem?.Id) existingMaps.byId.set(String(returnedItem.Id), returnedItem);
                            if (nextFriendlyId) existingMaps.byFriendlyId.set(nextFriendlyId, returnedItem);
                            updatedCount += 1;
                            console.log(`[catalog:sync] updated: ${label}`);
                            continue;
                        }
                    }
                    throw firstError;
                }
                existingItem = {
                    Id: duplicateId,
                    ...(friendlyId ? {
                        AlternateIds: [
                            {
                                Type: 'FriendlyId',
                                Value: friendlyId
                            }
                        ]
                    } : null)
                };
                existingMaps.byId.set(String(duplicateId), existingItem);
                if (friendlyId) existingMaps.byFriendlyId.set(friendlyId, existingItem);
                result = await upsertCatalogItem(localItem, existingItem, args.publish);
            }
            const returnedItem = result?.Item || null;
            const nextItem = returnedItem || {
                ...localItem,
                Id: returnedItem?.Id || localItem?.Id || existingItem?.Id
            };
            const nextFriendlyId = getFriendlyId(nextItem) || friendlyId;
            if (nextItem?.Id) existingMaps.byId.set(String(nextItem.Id), nextItem);
            if (nextFriendlyId) existingMaps.byFriendlyId.set(nextFriendlyId, nextItem);
            if (existingItem?.Id) {
                updatedCount += 1;
                console.log(`[catalog:sync] updated: ${label}`);
            } else {
                createdCount += 1;
                console.log(`[catalog:sync] created: ${label}`);
            }
        } catch (error) {
            failedCount += 1;
            console.error(`[catalog:sync] failed: ${label} -> ${error?.errorMessage || error?.message || error}`);
        }
    }

    console.log(`[catalog:sync] done. created=${createdCount} updated=${updatedCount} failed=${failedCount} publish=${args.publish}`);
    if (failedCount > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('[catalog:sync] fatal:', error?.message || error);
    process.exitCode = 1;
});

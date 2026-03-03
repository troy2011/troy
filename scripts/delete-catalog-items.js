#!/usr/bin/env node

require('dotenv').config();

const {
    PlayFabEconomy,
    PlayFabAuthentication,
    configurePlayFab,
    promisifyPlayFab,
    ensureTitleEntityToken
} = require('../server/playfab');

function parseArgs(argv) {
    const ids = [];
    const friendlyIds = [];
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
        if (/^[0-9a-f-]{36}$/i.test(token)) {
            ids.push(token);
            continue;
        }
        friendlyIds.push(token);
    }
    return {
        ids: Array.from(new Set(ids.filter(Boolean))),
        friendlyIds: Array.from(new Set(friendlyIds.filter(Boolean)))
    };
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

async function deleteById(titleEntity, id) {
    return promisifyPlayFab(PlayFabEconomy.DeleteItem, {
        Entity: titleEntity,
        Id: String(id).trim()
    });
}

async function deleteByFriendlyId(titleEntity, friendlyId) {
    return promisifyPlayFab(PlayFabEconomy.DeleteItem, {
        Entity: titleEntity,
        AlternateId: {
            Type: 'FriendlyId',
            Value: String(friendlyId).trim()
        }
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.ids.length === 0 && args.friendlyIds.length === 0) {
        throw new Error('削除対象の Id または FriendlyId を指定してください。');
    }

    const titleId = String(process.env.PLAYFAB_TITLE_ID || '').trim();
    const secretKey = String(process.env.PLAYFAB_SECRET_KEY || '').trim();
    if (!titleId || !secretKey) {
        throw new Error('PLAYFAB_TITLE_ID / PLAYFAB_SECRET_KEY が必要です。');
    }

    configurePlayFab({ titleId, secretKey });
    const titleEntity = await getTitleEntity();

    let deletedCount = 0;
    let failedCount = 0;

    for (const id of args.ids) {
        try {
            await deleteById(titleEntity, id);
            deletedCount += 1;
            console.log(`[catalog:delete] deleted by id: ${id}`);
        } catch (error) {
            failedCount += 1;
            console.error(`[catalog:delete] failed by id: ${id} -> ${error?.errorMessage || error?.message || error}`);
        }
    }

    for (const friendlyId of args.friendlyIds) {
        try {
            await deleteByFriendlyId(titleEntity, friendlyId);
            deletedCount += 1;
            console.log(`[catalog:delete] deleted by friendlyId: ${friendlyId}`);
        } catch (error) {
            failedCount += 1;
            console.error(`[catalog:delete] failed by friendlyId: ${friendlyId} -> ${error?.errorMessage || error?.message || error}`);
        }
    }

    console.log(`[catalog:delete] done. deleted=${deletedCount} failed=${failedCount}`);
    if (failedCount > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('[catalog:delete] fatal:', error?.message || error);
    process.exitCode = 1;
});

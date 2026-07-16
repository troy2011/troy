const crypto = require('crypto');
const path = require('path');
const express = require('express');

const {
    PLAYFAB_DATA_KEY,
    initializeSpecialAbilityRoutes
} = require('../server/specialAbility');

const HOST = '127.0.0.1';
const PORT = Math.max(1, Math.min(65_535, Number(process.env.PORT) || 4174));
const DEMO_PLAYFAB_ID = 'SPECIAL_ABILITY_DEMO';
const TERMINAL_TOKEN = process.env.SPECIAL_ABILITY_TERMINAL_TOKEN
    || 'troy-local-special-ability-demo-terminal';
const SIGNING_SECRET = process.env.SPECIAL_ABILITY_SIGNING_SECRET
    || crypto.randomBytes(48).toString('base64url');

function createDemoFirestore() {
    const documents = new Map([
        ['troy_rooms/global', { isOpen: true }],
        [`troy_rooms/global/members/${DEMO_PLAYFAB_ID}`, { displayName: 'デモプレイヤー' }]
    ]);
    let transactionQueue = Promise.resolve();

    function snapshot(documentPath) {
        const exists = documents.has(documentPath);
        const value = documents.get(documentPath);
        return {
            exists,
            data: () => (exists ? structuredClone(value) : undefined)
        };
    }

    function document(documentPath) {
        return {
            _path: documentPath,
            collection(name) {
                return collection(`${documentPath}/${name}`);
            },
            async get() {
                return snapshot(documentPath);
            },
            async set(value, options = {}) {
                const next = options.merge
                    ? { ...(documents.get(documentPath) || {}), ...structuredClone(value) }
                    : structuredClone(value);
                documents.set(documentPath, next);
            },
            async delete() {
                documents.delete(documentPath);
            }
        };
    }

    function collection(collectionPath) {
        return {
            doc(id) {
                return document(`${collectionPath}/${id}`);
            }
        };
    }

    return {
        collection,
        runTransaction(callback) {
            const run = transactionQueue.then(async () => {
                const writes = [];
                const transaction = {
                    get: async (reference) => snapshot(reference._path),
                    set(reference, value, options = {}) {
                        writes.push({
                            type: 'set',
                            path: reference._path,
                            value: structuredClone(value),
                            merge: Boolean(options.merge)
                        });
                    },
                    delete(reference) {
                        writes.push({ type: 'delete', path: reference._path });
                    }
                };
                const result = await callback(transaction);
                writes.forEach((write) => {
                    if (write.type === 'delete') {
                        documents.delete(write.path);
                        return;
                    }
                    documents.set(write.path, write.merge
                        ? { ...(documents.get(write.path) || {}), ...write.value }
                        : write.value);
                });
                return result;
            });
            transactionQueue = run.catch(() => undefined);
            return run;
        }
    };
}

function createDemoPlayFab() {
    const values = new Map();
    const PlayFabServer = {
        GetUserReadOnlyData: Symbol('GetUserReadOnlyData'),
        UpdateUserReadOnlyData: Symbol('UpdateUserReadOnlyData')
    };

    async function promisifyPlayFab(method, request) {
        if (method === PlayFabServer.GetUserReadOnlyData) {
            const value = values.get(request.PlayFabId);
            return { Data: value ? { [PLAYFAB_DATA_KEY]: { Value: value } } : {} };
        }
        if (method === PlayFabServer.UpdateUserReadOnlyData) {
            values.set(request.PlayFabId, request.Data[PLAYFAB_DATA_KEY]);
            return {};
        }
        throw new Error('Unexpected PlayFab demo operation');
    }

    return { PlayFabServer, promisifyPlayFab };
}

function startDemo() {
    const app = express();
    const firestore = createDemoFirestore();
    const playFab = createDemoPlayFab();

    app.disable('x-powered-by');
    app.use(express.json({ limit: '64kb' }));
    app.get('/api/tarot-reading/customers', (_req, res) => {
        res.json({
            success: true,
            isOpen: true,
            customers: [{
                customerRef: `TROY:${DEMO_PLAYFAB_ID}`,
                displayName: 'デモプレイヤー',
                joinedAtMs: Date.now(),
                lineLinked: false
            }]
        });
    });

    initializeSpecialAbilityRoutes(app, { firestore, ...playFab }, {
        enabled: true,
        signingSecret: SIGNING_SECRET,
        terminalToken: TERMINAL_TOKEN
    });

    app.use(express.static(path.join(__dirname, '..', 'public'), {
        etag: false,
        maxAge: 0
    }));

    const server = app.listen(PORT, HOST, () => {
        const url = `http://${HOST}:${PORT}/tarot-reading.html?abilityTerminal=${encodeURIComponent(TERMINAL_TOKEN)}`;
        console.log(`[special-ability-demo] ${url}`);
        console.log('[special-ability-demo] 結果はメモリ内だけに保存され、終了時に破棄されます。');
    });

    server.on('error', (error) => {
        console.error('[special-ability-demo] 起動できませんでした:', error.message);
        process.exitCode = 1;
    });
}

startDemo();

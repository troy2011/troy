const resourceStorage = require('./resourceStorage');
const { drawLocalGachaItem } = require('./gacha');

const EXPLORATION_COLLECTION = 'player_explorations';
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const HOUR_MS = 60 * 60 * 1000;
// 通貨未減算の早期 pending スタブをこの時間で回収する
const PENDING_STALE_MS = 5 * 60 * 1000;
// claiming 中にプロセスが落ちた場合、この時間後に再実行を許可する
const CLAIMING_STALE_MS = 2 * 60 * 1000;

const DESTINATIONS = {
    near_sea: {
        id: 'near_sea',
        name: '近海の漂流箱',
        description: '初期ボートでも向かえる短距離探索。',
        cost: 100,
        durationMs: 3 * HOUR_MS,
        bossName: '漂流箱を守る小型海賊',
        classes: ['common', 'explorer', 'merchant', 'fighter', 'defender']
    },
    old_lighthouse: {
        id: 'old_lighthouse',
        name: '古代灯台跡',
        description: '探索船が見つけやすい古い航路。',
        cost: 250,
        durationMs: 5 * HOUR_MS,
        bossName: '灯台守の亡霊',
        classes: ['explorer']
    },
    sunken_trader: {
        id: 'sunken_trader',
        name: '沈没商船',
        description: '積荷の多い商船向けの探索先。',
        cost: 300,
        durationMs: 6 * HOUR_MS,
        bossName: '沈没船の番人',
        classes: ['merchant', 'explorer']
    },
    pirate_cove: {
        id: 'pirate_cove',
        name: '海賊の隠れ家',
        description: '戦闘向きの船で挑む危険な海域。',
        cost: 400,
        durationMs: 8 * HOUR_MS,
        bossName: '隠れ家のBOSS',
        classes: ['fighter', 'defender']
    }
};

function normalizeShipClassFromItemId(itemId) {
    const key = String(itemId || '').trim().toLowerCase();
    if (!key) return 'common';
    if (key === 'ship_common_boat' || key.includes('common')) return 'common';
    if (key.includes('merchant')) return 'merchant';
    if (key.includes('fighter')) return 'fighter';
    if (key.includes('defender')) return 'defender';
    if (key.includes('explorer')) return 'explorer';
    return 'common';
}

function normalizeDestinationId(value) {
    const id = String(value || '').trim().toLowerCase();
    return DESTINATIONS[id] ? id : '';
}

function publicDestination(destination) {
    return {
        id: destination.id,
        name: destination.name,
        description: destination.description,
        cost: destination.cost,
        durationMs: destination.durationMs,
        bossName: destination.bossName
    };
}

function normalizeCatalogDisplayData(itemId, item = {}) {
    const display = item.DisplayName || item.displayName || item.Title || item.title || item.Name || item.name || itemId;
    return {
        ItemId: itemId,
        DisplayName: String(display || itemId)
    };
}

// pending + completesAtMs = 通貨減算済みだが active flip 失敗。active として扱い claim から自動復旧させる
function resolveEffectiveStatus(data) {
    const status = String(data?.status || '');
    if (status === 'pending' && data?.completesAtMs) return 'active';
    return status;
}

function explorationDocToPayload(data = {}) {
    if (!data) return null;
    const effectiveStatus = resolveEffectiveStatus(data);
    if (effectiveStatus !== 'active') return null;
    return {
        id: String(data.id || ''),
        status: 'active',
        destinationId: String(data.destinationId || ''),
        destinationName: String(data.destinationName || ''),
        shipId: String(data.shipId || ''),
        shipName: String(data.shipName || ''),
        shipClass: String(data.shipClass || ''),
        startedAtMs: Number(data.startedAtMs || 0),
        completesAtMs: Number(data.completesAtMs || 0),
        cost: Number(data.cost || 0)
    };
}

function timestampToMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function reportDocToPayload(doc) {
    const data = doc.data ? (doc.data() || {}) : (doc || {});
    const rewardItems = Array.isArray(data.rewardItems) ? data.rewardItems.map((item) => ({
        itemId: String(item.itemId || item.ItemId || ''),
        displayName: String(item.displayName || item.DisplayName || item.itemId || item.ItemId || ''),
        rarity: String(item.rarity || 'common'),
        category: String(item.category || '')
    })) : [];
    return {
        id: doc.id || String(data.id || ''),
        destinationName: String(data.destinationName || ''),
        shipName: String(data.shipName || ''),
        bossName: String(data.bossName || ''),
        bossAppeared: !!data.bossAppeared,
        bossResult: String(data.bossResult || ''),
        bossLog: String(data.bossLog || ''),
        rewardItemId: String(data.rewardItemId || ''),
        rewardItemName: String(data.rewardItemName || data.rewardItemId || ''),
        rewardCount: Number(data.rewardCount ?? 1),
        rewardItems,
        completedAtMs: Number(data.completedAtMs || 0),
        reportText: String(data.reportText || '')
    };
}

async function resolveActiveShip(playFabId, deps) {
    const profile = await resourceStorage.getPlayerShipProfile(playFabId, deps);
    if (!profile) return null;
    const itemId = String(profile.itemId || '').trim();
    return {
        shipId: playFabId,
        shipName: String(profile.name || itemId || '船'),
        shipClass: String(profile.shipClass || normalizeShipClassFromItemId(itemId)),
        itemId,
        form: profile.form,
        stage: profile.stage,
        level: profile.level,
        upgradeOptions: resourceStorage.PLAYER_SHIP_UPGRADE_OPTIONS[profile.form] || []
    };
}

const BOSS_STATS = {
    near_sea:       { hp: 50,  attack: 8,  defense: 2  },
    old_lighthouse: { hp: 120, attack: 20, defense: 8  },
    sunken_trader:  { hp: 150, attack: 25, defense: 12 },
    pirate_cove:    { hp: 250, attack: 45, defense: 20 }
};

const SHIP_COMBAT_MODS = {
    fighter:  { attackMul: 1.5, defenseMul: 1.0 },
    defender: { attackMul: 1.0, defenseMul: 1.6 },
    merchant: { attackMul: 0.8, defenseMul: 1.0 },
    explorer: { attackMul: 1.0, defenseMul: 1.0 },
    common:   { attackMul: 0.7, defenseMul: 0.8 }
};

const DEFAULT_EXPLORATION_GACHA_PROFILES = {
    near_sea: {
        categoryWeights: { Weapon: 20, Armor: 25, Shield: 20, Consumable: 35 },
        rarityWeights: { common: 70, uncommon: 22, rare: 6, epic: 1.5, legendary: 0.5 }
    },
    old_lighthouse: {
        categoryWeights: { Weapon: 20, Armor: 55, Shield: 20, Consumable: 5 },
        rarityWeights: { common: 45, uncommon: 32, rare: 16, epic: 5, legendary: 2 }
    },
    sunken_trader: {
        categoryWeights: { Weapon: 25, Armor: 35, Shield: 15, Consumable: 25 },
        rarityWeights: { common: 40, uncommon: 32, rare: 18, epic: 7, legendary: 3 }
    },
    pirate_cove: {
        categoryWeights: { Weapon: 55, Armor: 15, Shield: 25, Consumable: 5 },
        rarityWeights: { common: 25, uncommon: 30, rare: 25, epic: 14, legendary: 6 }
    }
};

function parseExplorationGachaProfiles() {
    const raw = process.env.EXPLORATION_GACHA_PROFILES;
    if (!raw) return DEFAULT_EXPLORATION_GACHA_PROFILES;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return DEFAULT_EXPLORATION_GACHA_PROFILES;
        return Object.fromEntries(Object.entries(DEFAULT_EXPLORATION_GACHA_PROFILES).map(([destinationId, defaults]) => {
            const override = parsed[destinationId] || {};
            return [destinationId, {
                categoryWeights: {
                    ...defaults.categoryWeights,
                    ...(override.categoryWeights || {})
                },
                rarityWeights: {
                    ...defaults.rarityWeights,
                    ...(override.rarityWeights || {})
                },
                excludedItemIds: override.excludedItemIds,
                excludedItemPatterns: override.excludedItemPatterns
            }];
        }));
    } catch (error) {
        console.warn('[exploration/gacha] EXPLORATION_GACHA_PROFILES のパースに失敗しました。デフォルトを使用します。', error?.message || error);
        return DEFAULT_EXPLORATION_GACHA_PROFILES;
    }
}

const EXPLORATION_GACHA_PROFILES = parseExplorationGachaProfiles();

function getExplorationGachaOptions(destinationId) {
    return EXPLORATION_GACHA_PROFILES[destinationId] || EXPLORATION_GACHA_PROFILES.near_sea;
}

function resolveCatalogEntryByItemId(catalogCache, itemId) {
    const id = String(itemId || '').trim();
    if (!id) return null;
    if (catalogCache?.[id]) return catalogCache[id];
    return Object.values(catalogCache || {}).find((entry) => (
        String(entry?.ItemId || '').trim() === id
        || String(entry?.FriendlyId || '').trim() === id
    )) || null;
}

function getShipUpgradeCostsForForm(targetForm, catalogCache) {
    const form = String(targetForm || '').trim().toLowerCase();
    const spec = resourceStorage.PLAYER_SHIP_FORMS[form];
    if (!spec) return [];
    const entry = resolveCatalogEntryByItemId(catalogCache, spec.itemId);
    const amounts = Array.isArray(entry?.PriceAmounts) ? entry.PriceAmounts : [];
    return amounts
        .map((cost) => ({
            ItemId: String(cost?.ItemId || cost?.itemId || '').trim(),
            Amount: Math.max(0, Math.floor(Number(cost?.Amount ?? cost?.amount ?? 0) || 0))
        }))
        .filter((cost) => cost.ItemId && cost.Amount > 0);
}

function attachUpgradeCosts(ship, catalogCache) {
    const upgradeOptions = resourceStorage.PLAYER_SHIP_UPGRADE_OPTIONS[ship.form] || [];
    return {
        ...ship,
        upgradeOptions,
        upgradeCosts: Object.fromEntries(upgradeOptions.map((targetForm) => [
            targetForm,
            getShipUpgradeCostsForForm(targetForm, catalogCache)
        ]))
    };
}

// BOSS出現なし:1個 / BOSS勝利:2個 / BOSS敗北:0個、merchant は+1
function resolveRewardCount(bossResult, shipClass) {
    let base;
    if (!bossResult || !bossResult.bossAppeared) {
        base = 1;
    } else if (bossResult.playerWon) {
        base = 2;
    } else {
        base = 0;
    }
    return shipClass === 'merchant' ? base + 1 : base;
}

// HP更新は行わない。呼び出し元が Firestore 保存後に applyHpCost で適用する
async function resolveBossBattle(playFabId, destination, shipClass, { promisifyPlayFab, PlayFabServer }) {
    const bossBase = BOSS_STATS[destination.id] || BOSS_STATS.near_sea;
    const mod = SHIP_COMBAT_MODS[shipClass] || SHIP_COMBAT_MODS.common;

    let playerHp, playerAtk, playerDef;
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
        const st = {};
        (result?.Statistics || []).forEach((s) => { st[s.StatisticName] = s.Value; });
        const level = Math.max(1, Number(st.Level || 1));
        const strength = Number(st.ちから || 0);
        const defense = Number(st.みのまもり || 0);
        playerHp = Math.max(10, Number(st.HP || 30));
        playerAtk = Math.max(1, Math.floor((strength * level / 128) + 2) * mod.attackMul);
        playerDef = Math.floor(defense * mod.defenseMul);
    } catch {
        playerHp = 30; playerAtk = Math.max(1, 3 * mod.attackMul); playerDef = 0;
    }

    let bossHp = bossBase.hp;
    const bossAtk = bossBase.attack;
    const bossDef = bossBase.defense;
    const log = [];
    const MAX_ROUNDS = 15;

    for (let round = 1; round <= MAX_ROUNDS && playerHp > 0 && bossHp > 0; round++) {
        const playerDmg = Math.max(1, Math.floor(playerAtk - bossDef));
        const bossDmg = Math.max(0, Math.floor(bossAtk - playerDef));
        bossHp -= playerDmg;
        log.push(`ラウンド${round}: プレイヤー→${playerDmg}ダメージ`);
        if (bossHp <= 0) break;
        playerHp -= bossDmg;
        log.push(`${destination.bossName}の反撃: ${bossDmg}ダメージ (残HP: ${Math.max(0, playerHp)})`);
    }

    const playerWon = bossHp <= 0;
    const hpCost = playerWon ? Math.max(0, bossBase.hp - Math.max(0, playerHp)) : Math.floor(bossBase.hp * 0.6);

    return {
        bossAppeared: true,
        playerWon,
        hpCost,
        battleLog: [
            `${destination.bossName}と戦闘！`,
            ...log,
            playerWon ? `撃破！ (HPコスト: ${hpCost})` : `敗北…HPを${hpCost}失った。`
        ].join('\n')
    };
}

// Firestore保存後に呼び出す。失敗はログのみ（ベストエフォート）
async function applyHpCost(playFabId, hpCost, { promisifyPlayFab, PlayFabServer }) {
    if (!hpCost || hpCost <= 0) return true;
    try {
        const statResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
        const currentSt = {};
        (statResult?.Statistics || []).forEach((s) => { currentSt[s.StatisticName] = s.Value; });
        const currentHp = Number(currentSt.HP || 1);
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: 'HP', Value: Math.max(1, currentHp - hpCost) }]
        });
        return true;
    } catch (err) {
        console.warn('[exploration/boss] HP更新失敗:', err?.message || err);
        return false;
    }
}

async function applyHpCostOnce(activeRef, playFabId, bossResult, deps) {
    const hpCost = Number(bossResult?.hpCost || 0);
    if (hpCost <= 0) return;

    let shouldApply = false;
    await activeRef.firestore.runTransaction(async (tx) => {
        const snap = await tx.get(activeRef);
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (data.hpApplied || data.hpApplyReserved) return;
        shouldApply = true;
        tx.update(activeRef, {
            hpApplyReserved: true,
            hpApplyReservedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            hpCostReserved: hpCost,
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        });
    });

    if (!shouldApply) return;

    const applied = await applyHpCost(playFabId, hpCost, deps);
    const update = applied
        ? {
            hpApplied: true,
            hpAppliedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        }
        : {
            hpApplyFailed: true,
            hpApplyFailedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        };
    await activeRef.update(update).catch((err) => {
        console.warn('[exploration/boss] HP適用済みフラグ更新失敗:', err?.message || err);
    });
}

function buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount }) {
    const lines = [
        `${ship.shipName}は${destination.name}の探索から帰還しました。`
    ];
    if (!bossResult || !bossResult.bossAppeared) {
        lines.push('大きな戦闘を避けながら、海域を丁寧に調査しました。');
    } else if (bossResult.playerWon) {
        lines.push(`BOSS「${destination.bossName}」と激闘の末、勝利しました！ (HP消費: ${bossResult.hpCost})`);
    } else {
        lines.push(`BOSS「${destination.bossName}」に敗北しました。(HP消費: ${bossResult.hpCost})`);
    }
    if (ship.shipClass === 'merchant') lines.push('積荷スペースが広く、お宝を多く持ち帰った。');
    if (rewardCount > 0) lines.push(`発見したお宝 (${rewardCount}個): ${rewardDisplayName}`);
    else lines.push('お宝は得られませんでした。');
    return lines.join('\n');
}

function initializeExplorationRoutes(app, deps) {
    const { firestore, admin, promisifyPlayFab, PlayFabServer, subtractEconomyItem, addEconomyItem, getCurrencyBalance, requireAuthenticatedPlayFabId, catalogCache } = deps;
    if (!firestore || !admin) {
        console.warn('[exploration] Firestore deps missing. Routes disabled.');
        return;
    }

    async function requireAuthed(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') return playFabId;
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    async function buildExplorationStatus(playFabId) {
        const ship = await resolveActiveShip(playFabId, { promisifyPlayFab, PlayFabServer });
        const availableDestinations = ship
            ? Object.values(DESTINATIONS).filter((destination) => destination.classes.includes(ship.shipClass)).map(publicDestination)
            : [];
        const activeSnap = await firestore.collection(EXPLORATION_COLLECTION).doc(playFabId).get();
        const reportsSnap = await firestore
            .collection(EXPLORATION_COLLECTION)
            .doc(playFabId)
            .collection('reports')
            .orderBy('completedAtMs', 'desc')
            .limit(5)
            .get();
        return {
            success: true,
            ship,
            destinations: availableDestinations,
            active: activeSnap.exists ? explorationDocToPayload(activeSnap.data()) : null,
            reports: reportsSnap.docs.map(reportDocToPayload)
        };
    }

    app.post('/api/exploration/status', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            res.json(await buildExplorationStatus(playFabId));
        } catch (error) {
            console.error('[exploration/status] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '探索情報の取得に失敗しました。' });
        }
    });

    app.post('/api/player-ship/status', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const ship = await resourceStorage.getPlayerShipProfile(playFabId, { promisifyPlayFab, PlayFabServer });
            res.json({
                success: true,
                ship: attachUpgradeCosts(ship, catalogCache)
            });
        } catch (error) {
            console.error('[player-ship/status] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '船情報の取得に失敗しました。' });
        }
    });

    app.post('/api/player-ship/upgrade', async (req, res) => {
        let { playFabId, targetForm, requestId } = req.body || {};
        if (!playFabId || !targetForm) return res.status(400).json({ error: 'playFabId and targetForm are required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const current = await resourceStorage.getPlayerShipProfile(playFabId, { promisifyPlayFab, PlayFabServer });
            const allowed = resourceStorage.PLAYER_SHIP_UPGRADE_OPTIONS[current.form] || [];
            const normalizedTarget = String(targetForm || '').trim().toLowerCase();
            if (!allowed.includes(normalizedTarget)) {
                return res.status(400).json({
                    error: 'この船にはその進化先を選べません。',
                    currentForm: current.form,
                    allowed
                });
            }
            const costs = getShipUpgradeCostsForForm(normalizedTarget, catalogCache);
            if (!costs.length) {
                return res.status(400).json({ error: '進化先の船価格が設定されていません。', targetForm: normalizedTarget });
            }
            for (const cost of costs) {
                if (typeof getCurrencyBalance === 'function') {
                    const balance = await getCurrencyBalance(playFabId, cost.ItemId).catch(() => null);
                    if (Number.isFinite(balance) && balance < cost.Amount) {
                        return res.status(402).json({
                            error: '進化に必要な資源が足りません。',
                            cost,
                            balance
                        });
                    }
                }
            }
            const idempotencyBase = `player-ship-upgrade-${playFabId}-${current.form}-${normalizedTarget}-${requestId || Date.now()}`;
            for (const cost of costs) {
                await subtractEconomyItem(playFabId, cost.ItemId, cost.Amount, {
                    idempotencyId: `${idempotencyBase}-${cost.ItemId}`
                });
            }
            let ship;
            try {
                ship = await resourceStorage.upgradePlayerShipProfile(playFabId, targetForm, { promisifyPlayFab, PlayFabServer });
            } catch (upgradeError) {
                await Promise.all(costs.map((cost) => addEconomyItem(playFabId, cost.ItemId, cost.Amount, {
                    idempotencyId: `${idempotencyBase}-refund-${cost.ItemId}`
                }).catch((refundError) => {
                    console.error('[player-ship/upgrade] refund failed:', playFabId, cost, refundError?.errorMessage || refundError?.message || refundError);
                })));
                throw upgradeError;
            }
            res.json({
                success: true,
                ship: attachUpgradeCosts(ship, catalogCache),
                costs
            });
        } catch (error) {
            if (error?.message === 'InvalidShipUpgradePath') {
                return res.status(400).json({
                    error: 'この船にはその進化先を選べません。',
                    currentForm: error.currentForm,
                    allowed: error.allowed || []
                });
            }
            console.error('[player-ship/upgrade] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '船の進化に失敗しました。' });
        }
    });

    app.post('/api/exploration/start', async (req, res) => {
        let { playFabId } = req.body || {};
        const destinationId = normalizeDestinationId(req.body?.destinationId);
        if (!playFabId || !destinationId) return res.status(400).json({ error: 'playFabId and destinationId are required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const ship = await resolveActiveShip(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!ship) return res.status(400).json({ error: '探索には使用中の船が必要です。' });
            const destination = DESTINATIONS[destinationId];
            if (!destination.classes.includes(ship.shipClass)) {
                return res.status(403).json({ error: 'この船では選択した行き先に向かえません。' });
            }
            const balance = typeof getCurrencyBalance === 'function' ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE) : null;
            if (Number.isFinite(balance) && balance < destination.cost) {
                return res.status(402).json({ error: `探索には${destination.cost}G必要です。`, cost: destination.cost, balance });
            }

            const now = Date.now();
            const explorationId = `exp-${now}-${Math.random().toString(36).slice(2, 8)}`;
            const activeRef = firestore.collection(EXPLORATION_COLLECTION).doc(playFabId);

            // フルペイロードを持つ pending を先に Firestore に確保する。
            // これにより: 通貨減算前に保存するためユーザー資産は安全。
            // active flip (step3) が失敗しても pending にデータが残り claim から自動復旧可能。
            const fullPayload = {
                id: explorationId,
                status: 'pending',
                playFabId,
                destinationId,
                destinationName: destination.name,
                shipId: ship.shipId,
                shipName: ship.shipName,
                shipClass: ship.shipClass,
                cost: destination.cost,
                startedAtMs: now,
                completesAtMs: now + destination.durationMs,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            let conflicted = false;
            await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(activeRef);
                if (snap.exists) {
                    const data = snap.data() || {};
                    const status = String(data.status || '');
                    if (status === 'active' || status === 'claiming') {
                        conflicted = true;
                        return;
                    }
                    if (status === 'pending') {
                        if (data.completesAtMs) {
                            // フルペイロード pending: 通貨が減算済みの可能性がある → active として保護
                            conflicted = true;
                            return;
                        }
                        // 早期スタブ pending: PENDING_STALE_MS 未満なら保護、超えたら上書き可
                        const createdAtMs = timestampToMs(data.createdAt);
                        if (now - createdAtMs < PENDING_STALE_MS) {
                            conflicted = true;
                            return;
                        }
                    }
                }
                tx.set(activeRef, fullPayload);
            });
            if (conflicted) {
                return res.status(409).json({ error: '探索中です。帰還後に次の探索へ出発できます。' });
            }

            // 通貨減算。失敗時は pending を削除してスロットを解放（ユーザー安全）
            try {
                await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, destination.cost, {
                    idempotencyId: req.body?.requestId ? `exploration-start-${req.body.requestId}` : undefined
                });
            } catch (currencyError) {
                await activeRef.delete().catch(() => {});
                throw currencyError;
            }

            // active に昇格。失敗しても pending にフルデータが残るため claim から自動復旧可能
            try {
                await activeRef.update({ status: 'active', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            } catch (firestoreError) {
                console.error('[exploration/start] active昇格失敗 (通貨は減算済み、pending から claim で自動復旧可能):', playFabId, explorationId, firestoreError?.message || firestoreError);
                throw firestoreError;
            }

            res.json({ ...(await buildExplorationStatus(playFabId)), started: true });
        } catch (error) {
            console.error('[exploration/start] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '探索の開始に失敗しました。', details: error?.errorMessage || error?.message || String(error) });
        }
    });

    app.post('/api/exploration/claim', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        const activeRef = firestore.collection(EXPLORATION_COLLECTION).doc(playFabId);
        try {
            const now = Date.now();
            let activeData = null;
            let isRetry = false;
            let claimError = null;

            // Firestoreトランザクションで active/pending → claiming へ排他遷移（並行claim防止）
            await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(activeRef);
                if (!snap.exists) {
                    claimError = { code: 400, message: '帰還確認できる探索がありません。' };
                    return;
                }
                const data = snap.data() || {};
                const effectiveStatus = resolveEffectiveStatus(data);

                if (effectiveStatus === 'claiming' && Array.isArray(data.rolledRewardIds)) {
                    // リトライ: claiming + rolledRewardIds 保存済み → 続きから処理
                    activeData = data;
                    isRetry = true;
                    return;
                }
                if (effectiveStatus === 'claiming') {
                    const updatedAtMs = timestampToMs(data.updatedAt);
                    if (updatedAtMs && now - updatedAtMs < CLAIMING_STALE_MS) {
                        claimError = { code: 409, message: '探索結果を確認中です。少し待ってから再試行してください。' };
                        return;
                    }
                    // 抽選結果保存前に中断した古い claiming は、同じ探索データで再実行する
                    activeData = data;
                    isRetry = false;
                    tx.update(activeRef, {
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        recoveryReason: 'stale-claiming-before-roll'
                    });
                    return;
                }
                if (effectiveStatus !== 'active') {
                    claimError = { code: 400, message: '帰還確認できる探索がありません。' };
                    return;
                }
                if (Number(data.completesAtMs || 0) > now) {
                    claimError = { code: 400, message: '探索はまだ完了していません。', completesAtMs: Number(data.completesAtMs) };
                    return;
                }
                activeData = data;
                isRetry = false;
                // Atomically flip: 並行リクエストはここで排除される
                tx.update(activeRef, { status: 'claiming', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            });

            if (claimError) return res.status(claimError.code).json(claimError);

            const destination = DESTINATIONS[String(activeData.destinationId || '')] || DESTINATIONS.near_sea;
            const ship = {
                shipId: String(activeData.shipId || ''),
                shipName: String(activeData.shipName || '船'),
                shipClass: String(activeData.shipClass || 'common')
            };

            let bossResult = null;
            let rolledItemIds = [];
            let rolledRewards = [];

            if (isRetry) {
                // Firestore 保存済みデータを再利用（再抽選・HP再減算なし）
                bossResult = activeData.bossResultData || null;
                rolledRewards = Array.isArray(activeData.rolledRewards) ? activeData.rolledRewards : [];
                rolledItemIds = rolledRewards.length
                    ? rolledRewards.map((entry) => String(entry.itemId || '')).filter(Boolean)
                    : (activeData.rolledRewardIds || []);
                await applyHpCostOnce(activeRef, playFabId, bossResult, { admin, promisifyPlayFab, PlayFabServer });
            } else {
                // 初回: BOSS戦闘 → 抽選 → Firestore保存 → HP適用
                const bossEncountered = Math.random() < 0.35;
                if (bossEncountered) {
                    bossResult = await resolveBossBattle(playFabId, destination, ship.shipClass, { promisifyPlayFab, PlayFabServer });
                }

                const rewardCount = resolveRewardCount(bossResult, ship.shipClass);
                const gachaOptions = getExplorationGachaOptions(destination.id);
                for (let i = 0; i < rewardCount; i++) {
                    const result = drawLocalGachaItem(catalogCache, gachaOptions);
                    if (result.itemId) {
                        rolledItemIds.push(result.itemId);
                        rolledRewards.push({
                            itemId: result.itemId,
                            displayName: result.displayName || result.itemId,
                            rarity: result.rarity || 'common',
                            category: result.category || ''
                        });
                    }
                }

                // 抽選結果と BOSS 結果を先に保存する。以降の失敗はリトライで同一結果を保証
                await activeRef.update({
                    rolledRewardIds: rolledItemIds,
                    rolledRewards,
                    bossResultData: bossResult,
                    hpApplied: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // HP は Firestore で適用予約を取れた1リクエストだけが反映する
                await applyHpCostOnce(activeRef, playFabId, bossResult, { admin, promisifyPlayFab, PlayFabServer });
            }

            // インデックスベースの idempotency キーで付与（itemId 非依存のためリトライ安全）
            const rewards = [];
            for (let i = 0; i < rolledItemIds.length; i++) {
                const itemId = rolledItemIds[i];
                await addEconomyItem(playFabId, itemId, 1, {
                    idempotencyId: `exploration-reward-${activeData.id}-${i}`
                });
                const rolled = rolledRewards[i] || {};
                const display = normalizeCatalogDisplayData(itemId, catalogCache?.[itemId] || {});
                rewards.push({
                    ...display,
                    Rarity: String(rolled.rarity || 'common'),
                    Category: String(rolled.category || '')
                });
            }

            const rewardItemId = rewards[0]?.ItemId || '';
            const reward = rewards[0] || null;
            const rewardDisplayName = rewards.length > 0
                ? rewards.map((r) => r.DisplayName).join('、')
                : '（なし）';
            const report = {
                id: String(activeData.id || `exp-${now}`),
                playFabId,
                destinationId: destination.id,
                destinationName: destination.name,
                shipId: ship.shipId,
                shipName: ship.shipName,
                shipClass: ship.shipClass,
                bossName: destination.bossName,
                bossAppeared: bossResult?.bossAppeared || false,
                bossResult: bossResult ? (bossResult.playerWon ? 'victory' : 'defeat') : 'none',
                bossLog: bossResult?.battleLog || '',
                rewardItemId: rewardItemId || '',
                rewardItemName: rewardDisplayName,
                rewardCount: rewards.length,
                rewardItems: rewards.map((item) => ({
                    itemId: item.ItemId,
                    displayName: item.DisplayName,
                    rarity: item.Rarity,
                    category: item.Category
                })),
                reportText: buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount: rewards.length }),
                completedAtMs: now,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await activeRef.collection('reports').doc(report.id).set(report);
            await activeRef.delete();
            res.json({ ...(await buildExplorationStatus(playFabId)), claimed: true, report: reportDocToPayload(report), reward });
        } catch (error) {
            console.error('[exploration/claim] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '探索結果の確認に失敗しました。', details: error?.errorMessage || error?.message || String(error) });
        }
    });
}

module.exports = { initializeExplorationRoutes };

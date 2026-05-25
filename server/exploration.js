const resourceStorage = require('./resourceStorage');
const { drawLocalGachaItem } = require('./gacha');
const battleRoutes = require('./routes/battleRoutes');

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
    near_sea: {
        hp: 45,
        attack: 8,
        defense: 2,
        strength: 8,
        guard: 2,
        agility: 8,
        weapon: 'sword',
        skills: [
            { type: 'weapon', weapon: 'sword', name: '小太刀の連撃', procChance: 0.16, powerMultiplier: 1.16 },
            { type: 'passive', weapon: 'sword', name: '小型海賊の身軽さ', level: 1 }
        ]
    },
    old_lighthouse: {
        hp: 110,
        attack: 15,
        defense: 7,
        strength: 14,
        guard: 8,
        agility: 14,
        mp: 22,
        weapon: 'staff',
        magicPower: 14,
        skills: [
            { type: 'magic', weapon: 'staff', magicKind: 'attack', name: '灯火の呪い', mpCost: 6, minRange: 1, maxRange: 2, powerMultiplier: 1.16 },
            { type: 'weapon', weapon: 'staff', name: '霊気集中', procChance: 0.16, powerMultiplier: 1.16 },
            { type: 'passive', weapon: 'staff', name: '亡霊の集中', level: 2 }
        ]
    },
    sunken_trader: {
        hp: 135,
        attack: 18,
        defense: 10,
        strength: 16,
        guard: 12,
        agility: 10,
        weapon: 'shield',
        skills: [
            { type: 'passive', weapon: 'shield', name: '沈没船の守り', level: 3 },
            { type: 'weapon', weapon: 'blunt', name: '錆びた錨撃ち', procChance: 0.14, powerMultiplier: 1.18 }
        ]
    },
    pirate_cove: {
        hp: 220,
        attack: 32,
        defense: 14,
        strength: 24,
        guard: 16,
        agility: 20,
        weapon: 'axe',
        skills: [
            { type: 'weapon', weapon: 'axe', name: '荒くれ強撃', procChance: 0.2, powerMultiplier: 1.25 },
            { type: 'passive', weapon: 'axe', name: '海賊頭の威圧', level: 3 }
        ]
    }
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

// BOSS出現なし:1個 / BOSS勝利:2個 / 逃走・決着なし:1個 / BOSS敗北:0個、merchant は+1
function resolveRewardCount(bossResult, shipClass) {
    let base;
    if (!bossResult || !bossResult.bossAppeared) {
        base = 1;
    } else if (bossResult.playerWon) {
        base = 2;
    } else if (bossResult.escaped || bossResult.draw) {
        base = 1;
    } else {
        base = 0;
    }
    return shipClass === 'merchant' ? base + 1 : base;
}

function createBossEquipmentRef(weaponType, category = 'Weapon') {
    const normalized = String(weaponType || 'blunt').trim().toLowerCase();
    return {
        customData: {
            Category: category,
            ManifestWeaponType: normalized,
            Power: 0,
            Defense: 0
        }
    };
}

function buildExplorationBossProfile(destination, bossBase) {
    const weapon = String(bossBase.weapon || 'blunt').trim().toLowerCase();
    const equipment = {};
    if (weapon === 'shield') {
        equipment.RightHand = createBossEquipmentRef('blunt');
        equipment.LeftHand = createBossEquipmentRef('shield', 'Shield');
    } else {
        equipment.RightHand = createBossEquipmentRef(weapon);
    }
    return {
        id: `boss-${destination.id}`,
        stats: {
            DisplayName: destination.bossName,
            Level: Math.max(1, Number(bossBase.level || 1)),
            HP: bossBase.hp,
            MaxHP: bossBase.hp,
            CurrentHP: bossBase.hp,
            MP: Number(bossBase.mp || 0) || 0,
            MaxMP: Number(bossBase.mp || 0) || 0,
            CurrentMP: Number(bossBase.mp || 0) || 0,
            ちから: Number(bossBase.strength || 1) || 1,
            みのまもり: Number(bossBase.guard || 0) || 0,
            すばやさ: Number(bossBase.agility || 1) || 1,
            かしこさ: Number(bossBase.intelligence || 0) || 0
        },
        equipmentStats: {
            Power: bossBase.attack,
            Defense: bossBase.defense,
            Agi: 0,
            Int: 0,
            MagicPower: Number(bossBase.magicPower || 0) || 0,
            HealPower: 0,
            MpEfficiency: 0,
            CastRate: 0,
            StatusRate: 0
        },
        equipment,
        skills: Array.isArray(bossBase.skills) ? bossBase.skills : []
    };
}

async function getExplorationBattlePlayerProfile(playFabId, { promisifyPlayFab, PlayFabServer }) {
    if (typeof battleRoutes.getPlayerFullProfile === 'function') {
        try {
            return await battleRoutes.getPlayerFullProfile(playFabId);
        } catch (error) {
            console.warn('[exploration/boss] 白兵戦プロフィール取得失敗。統計のみで代替します:', error?.message || error);
        }
    }

    const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
    const st = {};
    (result?.Statistics || []).forEach((s) => { st[s.StatisticName] = s.Value; });
    const hp = Math.max(10, Number(st.HP || 30));
    const maxHp = Math.max(hp, Number(st.MaxHP || hp));
    return {
        id: playFabId,
        stats: {
            ...st,
            Level: Math.max(1, Number(st.Level || 1)),
            CurrentHP: hp,
            HP: hp,
            MaxHP: maxHp
        },
        equipmentStats: {
            Power: 0,
            Defense: 0,
            Agi: 0,
            Int: 0,
            MagicPower: 0,
            HealPower: 0,
            MpEfficiency: 0,
            CastRate: 0,
            StatusRate: 0
        },
        equipment: {}
    };
}

// BOSS戦では一時的にHPを使うが、探索後に全回復する
async function resolveBossBattle(playFabId, destination, shipClass, { promisifyPlayFab, PlayFabServer }) {
    const bossBase = BOSS_STATS[destination.id] || BOSS_STATS.near_sea;
    let player;
    try {
        player = await getExplorationBattlePlayerProfile(playFabId, { promisifyPlayFab, PlayFabServer });
    } catch (error) {
        console.warn('[exploration/boss] プレイヤープロフィール取得に失敗。最低値で代替します:', error?.message || error);
        player = {
            id: playFabId,
            stats: { Level: 1, HP: 30, MaxHP: 30, CurrentHP: 30, ちから: 1, みのまもり: 0 },
            equipmentStats: { Power: 0, Defense: 0 },
            equipment: {}
        };
    }

    const boss = buildExplorationBossProfile(destination, bossBase);
    player.stats = player.stats || {};
    player.equipmentStats = player.equipmentStats || {};
    player.stats.CurrentHP = Math.max(1, Number(player.stats.CurrentHP || player.stats.HP || 30));
    boss.stats.CurrentHP = boss.stats.MaxHP;

    const battleResult = await battleRoutes.runBattle(player, boss);
    const playerWon = battleResult?.winner?.id === player.id;
    const escaped = !!battleResult?.escaped;
    const draw = !escaped && !battleResult?.winner;
    return {
        bossAppeared: true,
        playerWon,
        escaped,
        draw,
        hpCost: 0,
        battleLog: [
            `${destination.bossName}と戦闘！`,
            ...(Array.isArray(battleResult?.logs) ? battleResult.logs : []),
            escaped
                ? '戦闘は決着せず終了した。探索後にHPは全回復した。'
                : draw
                    ? '決着はつかなかった。探索後にHPは全回復した。'
                : (playerWon ? '撃破！探索後にHPは全回復した。' : '敗北したが、探索後にHPは全回復した。')
        ].join('\n')
    };
}

async function restoreHpToFull(playFabId, { promisifyPlayFab, PlayFabServer }) {
    try {
        const statResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
        const currentSt = {};
        (statResult?.Statistics || []).forEach((s) => { currentSt[s.StatisticName] = s.Value; });
        const maxHp = Math.max(1, Number(currentSt.MaxHP || currentSt.HP || 30));
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: 'HP', Value: maxHp }]
        });
        return true;
    } catch (err) {
        console.warn('[exploration/boss] HP全回復失敗:', err?.message || err);
        return false;
    }
}

async function restoreHpToFullOnce(activeRef, playFabId, deps) {
    let shouldApply = false;
    await activeRef.firestore.runTransaction(async (tx) => {
        const snap = await tx.get(activeRef);
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (data.hpRestored || data.hpRestoreReserved) return;
        shouldApply = true;
        tx.update(activeRef, {
            hpRestoreReserved: true,
            hpRestoreReservedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        });
    });

    if (!shouldApply) return;

    const applied = await restoreHpToFull(playFabId, deps);
    const update = applied
        ? {
            hpRestored: true,
            hpRestoredAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        }
        : {
            hpRestoreFailed: true,
            hpRestoreFailedAt: deps.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: deps.admin.firestore.FieldValue.serverTimestamp()
        };
    await activeRef.update(update).catch((err) => {
        console.warn('[exploration/boss] HP全回復フラグ更新失敗:', err?.message || err);
    });
}

function buildReportText({ destination, ship, bossResult, rewardDisplayName, rewardCount }) {
    const lines = [
        `${ship.shipName}は${destination.name}の探索から帰還しました。`
    ];
    if (!bossResult || !bossResult.bossAppeared) {
        lines.push('大きな戦闘を避けながら、海域を丁寧に調査しました。');
    } else if (bossResult.playerWon) {
        lines.push(`BOSS「${destination.bossName}」と激闘の末、勝利しました！探索後にHPは全回復しました。`);
    } else if (bossResult.escaped || bossResult.draw) {
        lines.push(`BOSS「${destination.bossName}」との戦闘は決着せず、持ち帰れるお宝だけを回収しました。探索後にHPは全回復しました。`);
    } else {
        lines.push(`BOSS「${destination.bossName}」に敗北しましたが、探索後にHPは全回復しました。`);
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
                completesAtMs: now,
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
                // Firestore 保存済みデータを再利用（再抽選なし）
                bossResult = activeData.bossResultData || null;
                rolledRewards = Array.isArray(activeData.rolledRewards) ? activeData.rolledRewards : [];
                rolledItemIds = rolledRewards.length
                    ? rolledRewards.map((entry) => String(entry.itemId || '')).filter(Boolean)
                    : (activeData.rolledRewardIds || []);
                await restoreHpToFullOnce(activeRef, playFabId, { admin, promisifyPlayFab, PlayFabServer });
            } else {
                // 初回: BOSS戦闘 → 抽選 → Firestore保存 → HP全回復
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
                    hpRestored: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // HP全回復は Firestore で予約を取れた1リクエストだけが反映する
                await restoreHpToFullOnce(activeRef, playFabId, { admin, promisifyPlayFab, PlayFabServer });
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
                bossResult: bossResult
                    ? (bossResult.playerWon ? 'victory' : (bossResult.escaped || bossResult.draw ? 'escaped' : 'defeat'))
                    : 'none',
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

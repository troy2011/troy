// server/nation.js
// 国家関連のAPI

const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};

const NATION_GROUP_BY_NATION = {
    fire: { island: 'fire', groupName: 'nation_fire_island' },
    earth: { island: 'earth', groupName: 'nation_earth_island' },
    wind: { island: 'wind', groupName: 'nation_wind_island' },
    water: { island: 'water', groupName: 'nation_water_island' }
};

const AVATAR_COLOR_BY_NATION = {
    fire: 'red',
    earth: 'green',
    wind: 'purple',
    water: 'blue'
};

function getAvatarColorForNation(nation) {
    const key = String(nation || '').toLowerCase();
    return AVATAR_COLOR_BY_NATION[key] || null;
}

function getNationMappingByNation(nation) {
    const key = String(nation || '').toLowerCase();
    return NATION_GROUP_BY_NATION[key] || null;
}

async function getNationForPlayer(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['Nation']
    });
    const nation = ro?.Data?.Nation?.Value || null;
    return nation ? String(nation).toLowerCase() : null;
}

function getNationGroupDoc(firestore, groupName) {
    return firestore.collection('nation_groups').doc(groupName);
}

async function ensureNationGroupExists(firestore, mapping, deps) {
    const { promisifyPlayFab, PlayFabAdmin, PlayFabGroups, ensureTitleEntityToken, admin } = deps;

    const docRef = await getNationGroupDoc(firestore, mapping.groupName);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data()?.groupId) {
        const existingGroupId = docSnap.data().groupId;
        try {
            await ensureTitleEntityToken();
            await promisifyPlayFab(PlayFabGroups.GetGroup, {
                Group: { Id: existingGroupId, Type: 'group' }
            });
            return {
                groupId: existingGroupId,
                groupName: mapping.groupName,
                created: false
            };
        } catch (e) {
            console.warn('[ensureNationGroupExists] Stored groupId invalid, recreating:', existingGroupId);
        }
    }

    const titleDataKey = 'NationGroupIds';
    const titleData = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [titleDataKey] });
    let titleGroupId = null;
    if (titleData?.Data?.[titleDataKey]) {
        try {
            const parsed = JSON.parse(titleData.Data[titleDataKey]);
            titleGroupId = parsed?.[mapping.groupName] || null;
        } catch (e) {
            console.warn('[ensureNationGroupExists] Failed to parse TitleData:', e?.message || e);
        }
    }
    if (titleGroupId) {
        try {
            await ensureTitleEntityToken();
            await promisifyPlayFab(PlayFabGroups.GetGroup, {
                Group: { Id: titleGroupId, Type: 'group' }
            });
            await docRef.set({
                groupId: titleGroupId,
                groupName: mapping.groupName,
                nation: mapping.island,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { groupId: titleGroupId, groupName: mapping.groupName, created: false };
        } catch (e) {
            console.warn('[ensureNationGroupExists] TitleData groupId invalid, recreating:', titleGroupId);
            titleGroupId = null;
        }
    }

    await ensureTitleEntityToken();
    const createResult = await promisifyPlayFab(PlayFabGroups.CreateGroup, {
        GroupName: mapping.groupName
    });
    const groupId = createResult?.Group?.Id || null;
    if (!groupId) {
        throw new Error('CreateGroup did not return group id');
    }

    await docRef.set({
        groupId,
        groupName: mapping.groupName,
        nation: mapping.island,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const newTitleMap = { [mapping.groupName]: groupId };
    try {
        const existing = titleData?.Data?.[titleDataKey] ? JSON.parse(titleData.Data[titleDataKey]) : {};
        const merged = { ...existing, ...newTitleMap };
        await promisifyPlayFab(PlayFabAdmin.SetTitleData, {
            Key: titleDataKey,
            Value: JSON.stringify(merged)
        });
    } catch (e) {
        console.warn('[ensureNationGroupExists] Failed to update TitleData:', e?.message || e);
    }

    return { groupId, groupName: mapping.groupName, created: true };
}

async function getNationGroupIdByNation(nation, firestore, deps) {
    const key = String(nation || '').toLowerCase();
    if (!key) return null;
    const mapping = getNationMappingByNation(key);
    if (!mapping) return null;
    const info = await ensureNationGroupExists(firestore, mapping, deps);
    return info?.groupId || null;
}

async function getNationTaxRateBps(nation, firestore, deps) {
    const { getGroupDataValue } = deps;
    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) return 0;
    const raw = await getGroupDataValue(groupId, 'taxRateBps');
    const bps = Math.max(0, Math.min(5000, Math.floor(Number(raw) || 0)));
    return bps;
}

async function addNationTreasury(nation, amount, firestore, deps) {
    const { getGroupDataValue, setGroupDataValues } = deps;
    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) return null;
    const raw = await getGroupDataValue(groupId, 'treasuryPT');
    const current = Math.max(0, Math.floor(Number(raw) || 0));
    const next = current + Math.max(0, Math.floor(Number(amount) || 0));
    await setGroupDataValues(groupId, { treasuryPT: String(next) });
    return { groupId, treasuryPT: next };
}

async function getNationTreasuryRanking(firestore, deps) {
    const rows = [];
    for (const mapping of Object.values(NATION_GROUP_BY_NATION)) {
        try {
            const info = await ensureNationGroupExists(firestore, mapping, deps);
            const groupId = info?.groupId;
            if (!groupId) {
                rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs: 0 });
                continue;
            }
            const raw = await deps.getGroupDataValue(groupId, 'treasuryPT');
            const treasuryPs = Math.max(0, Math.floor(Number(raw) || 0));
            rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs });
        } catch (error) {
            console.warn('[getNationTreasuryRanking] Failed for', mapping?.groupName, error?.message || error);
            rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs: 0 });
        }
    }

    rows.sort((a, b) => b.treasuryPs - a.treasuryPs);
    return rows;
}

async function getPlayerEntity(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    if (!playFabId) return null;
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true, ShowEntity: true }
        });
        const entityId = profile?.PlayerProfile?.Entity?.Id || profile?.PlayerProfile?.EntityId || null;
        const entityType = profile?.PlayerProfile?.Entity?.Type || profile?.PlayerProfile?.EntityType || null;
        if (entityId && entityType) return { Id: entityId, Type: entityType };
    } catch (error) {
        console.warn('[getPlayerEntity] GetPlayerProfile failed:', error?.errorMessage || error?.message || error);
    }
    return null;
}

// APIルートを初期化
function initializeNationRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabGroups, firestore, admin, ensureTitleEntityToken, getGroupDataValue, setGroupDataValues, subtractEconomyItem, transferOwnedIslands, createStarterIsland, relocateActiveShip } = deps;

    const nationDeps = { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabGroups, ensureTitleEntityToken, admin, getGroupDataValue, setGroupDataValues };

    // 国家グループ取得
    app.post('/api/get-nation-group', async (req, res) => {
        const { raceName } = req.body || {};
        if (!raceName) return res.status(400).json({ error: 'raceName is required' });

        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

        try {
            const docRef = await getNationGroupDoc(firestore, mapping.groupName);
            const docSnap = await docRef.get();
            const data = docSnap.exists ? docSnap.data() : null;
            return res.json({
                groupName: mapping.groupName,
                groupId: data && data.groupId ? data.groupId : null
            });
        } catch (error) {
            console.error('[get-nation-group] Error:', error.errorMessage || error.message);
            return res.status(500).json({ error: 'Failed to get nation group', details: error.errorMessage || error.message });
        }
    });

    // 国家グループ確保
    app.post('/api/ensure-nation-group', async (req, res) => {
        const { raceName } = req.body || {};
        if (!raceName) return res.status(400).json({ error: 'raceName is required' });

        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

        try {
            let result;
            try {
                result = await ensureNationGroupExists(firestore, mapping, nationDeps);
            } catch (e) {
                const msg = e?.errorMessage || e?.message || String(e);
                if (String(msg).includes('group name is already in use')) {
                    const retry = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: ['NationGroupIds'] });
                    let retryGroupId = null;
                    try {
                        const parsed = retry?.Data?.NationGroupIds ? JSON.parse(retry.Data.NationGroupIds) : {};
                        retryGroupId = parsed?.[mapping.groupName] || null;
                    } catch (parseErr) {
                        console.warn('[ensure-nation-group] Retry parse failed:', parseErr?.message || parseErr);
                    }
                    if (retryGroupId) {
                        await getNationGroupDoc(firestore, mapping.groupName).set({
                            groupId: retryGroupId,
                            groupName: mapping.groupName,
                            nation: mapping.island,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        result = { groupId: retryGroupId, groupName: mapping.groupName, created: false };
                    } else {
                        throw e;
                    }
                } else {
                    throw e;
                }
            }
            return res.json({
                groupName: mapping.groupName,
                groupId: result.groupId,
                created: result.created
            });
        } catch (error) {
            console.error('[ensure-nation-group] Error:', error.errorMessage || error.message || error);
            return res.status(500).json({ error: 'Failed to ensure nation group', details: error.errorMessage || error.message || String(error) });
        }
    });

    // 国王ページデータ取得
    app.post('/api/get-nation-king-page', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });

        try {
            const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['NationGroupId']
            });
            if (!ro || !ro.Data || !ro.Data.NationGroupId || !ro.Data.NationGroupId.Value) {
                return res.json({ notInNation: true });
            }

            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: playFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });

            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NationGroupNotSet')) {
                    return res.json({ notInNation: true });
                }
                if (String(msg).includes('JavascriptException')) {
                    return res.json({ notInNation: true });
                }
                if (String(msg).includes('NotKing')) {
                    return res.status(403).json({ error: 'Only the king can view this page' });
                }
                if (String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'Nation king is not set' });
                }
                return res.status(500).json({ error: 'Failed to get king page data', details: msg });
            }

            const payload = csResult ? (csResult.FunctionResult || {}) : {};
            try {
                const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
                const groupId = await getNationGroupIdByNation(nation, firestore, nationDeps);
                if (groupId) {
                    const taxRateRaw = await getGroupDataValue(groupId, 'taxRateBps');
                    const treasuryRaw = await getGroupDataValue(groupId, 'treasuryPT');
                    const taxRateBps = Math.max(0, Math.min(5000, Math.floor(Number(taxRateRaw) || 0)));
                    const treasuryPs = Math.max(0, Math.floor(Number(treasuryRaw) || 0));
                    payload.taxRateBps = taxRateBps;
                    payload.treasuryPs = treasuryPs;
                }
            } catch (e) {
                console.warn('[get-nation-king-page] Failed to load group tax data:', e?.message || e);
            }

            res.json(payload);
        } catch (error) {
            const msg = error.errorMessage || error.message;
            if (String(msg).includes('NationGroupNotSet')) {
                return res.json({ notInNation: true });
            }
            if (String(msg).includes('JavascriptException')) {
                return res.json({ notInNation: true });
            }
            console.error('[get-nation-king-page]', msg);
            res.status(500).json({ error: 'Failed to get king page data', details: msg });
        }
    });

    // 税率設定
    app.post('/api/king-set-tax-rate', async (req, res) => {
        const { playFabId, taxRatePercent } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const percent = Number(taxRatePercent);
        if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
            return res.status(400).json({ error: 'Tax rate must be between 0 and 50' });
        }
        const bps = Math.floor(percent * 100);

        try {
            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: playFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });
            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing') || String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'NotKing' });
                }
            }

            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'Nation not set' });
            const groupId = await getNationGroupIdByNation(nation, firestore, nationDeps);
            if (!groupId) return res.status(400).json({ error: 'Nation group not found' });

            await setGroupDataValues(groupId, { taxRateBps: String(bps) });
            res.json({ success: true, taxRateBps: bps });
        } catch (error) {
            console.error('[king-set-tax-rate] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'Failed to set tax rate' });
        }
    });

    // プレイヤー追放
    app.post('/api/king-exile', async (req, res) => {
        const { playFabId, targetPlayFabId } = req.body || {};
        if (!playFabId || !targetPlayFabId) {
            return res.status(400).json({ error: 'playFabId and targetPlayFabId are required' });
        }
        if (playFabId === targetPlayFabId) {
            return res.status(400).json({ error: 'Cannot exile self' });
        }

        try {
            const kingCheck = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: playFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });
            if (kingCheck && kingCheck.Error) {
                const msg = kingCheck.Error.Message || kingCheck.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing') || String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'Only the king can exile players' });
                }
                return res.status(500).json({ error: 'Failed to validate king', details: msg });
            }

            const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation', 'Race']
            });
            const kingNation = String(kingRo?.Data?.Nation?.Value || '').toLowerCase();
            if (!kingNation) return res.status(400).json({ error: 'King nation not set' });
            const nationMapping = getNationMappingByNation(kingNation);
            if (!nationMapping) return res.status(400).json({ error: 'Invalid king nation' });
            const groupInfo = await ensureNationGroupExists(firestore, nationMapping, nationDeps);
            const kingNationGroupId = groupInfo.groupId;
            const targetNationIsland = nationMapping.island;
            const targetNationGroupName = nationMapping.groupName;

            const targetRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: targetPlayFabId,
                Keys: ['Race', 'Nation']
            });
            const targetRace = targetRo?.Data?.Race?.Value || null;
            const targetPrevNation = String(targetRo?.Data?.Nation?.Value || '').toLowerCase();

            const playerEntity = await getPlayerEntity(targetPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!playerEntity) return res.status(400).json({ error: 'Failed to resolve target entity' });

            if (targetPrevNation && targetPrevNation !== kingNation) {
                const prevMapping = getNationMappingByNation(targetPrevNation);
                if (prevMapping) {
                    try {
                        const prevGroup = await ensureNationGroupExists(firestore, prevMapping, nationDeps);
                        await promisifyPlayFab(PlayFabGroups.RemoveMembers, {
                            Group: { Id: prevGroup.groupId, Type: 'group' },
                            Members: [playerEntity]
                        });
                    } catch (e) {
                        console.warn('[king-exile] RemoveMembers failed:', e?.errorMessage || e?.message || e);
                    }
                }
            }

            try {
                await promisifyPlayFab(PlayFabGroups.AddMembers, {
                    Group: { Id: kingNationGroupId, Type: 'group' },
                    Members: [playerEntity]
                });
            } catch (e) {
                const msg = e?.errorMessage || e?.message || String(e);
                if (!String(msg).includes('EntityIsAlreadyMember')) throw e;
            }

            const avatarColor = getAvatarColorForNation(targetNationIsland || kingNation);
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: targetPlayFabId,
                Data: {
                    Nation: targetNationIsland || kingNation || null,
                    NationGroupId: kingNationGroupId,
                    NationGroupName: targetNationGroupName,
                    AvatarColor: avatarColor || 'brown',
                    NationChangedAt: String(Date.now())
                }
            });

            const transferResult = await transferOwnedIslands(firestore, targetPlayFabId, playFabId, targetNationIsland || kingNation || null);
            let starterIsland = null;
            try {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: targetPlayFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                const displayName = profile?.PlayerProfile?.DisplayName || null;
                starterIsland = await createStarterIsland({
                    playFabId: targetPlayFabId,
                    raceName: targetRace || 'Human',
                    nationIsland: targetNationIsland || kingNation || null,
                    displayName
                });
            } catch (e) {
                console.warn('[king-exile] Failed to create starter island:', e?.errorMessage || e?.message || e);
            }

            if (starterIsland?.respawnPosition) {
                await relocateActiveShip(firestore, targetPlayFabId, starterIsland.respawnPosition);
            }

            return res.json({
                success: true,
                nationGroupId: kingNationGroupId,
                nationIsland: targetNationIsland || kingNation || null,
                transferredIslands: transferResult.transferred,
                starterIsland
            });
        } catch (error) {
            console.error('[king-exile] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'Failed to exile player', details: error?.errorMessage || error?.message || error });
        }
    });

    // 国家通貨寄付
    app.post('/api/donate-nation-currency', async (req, res) => {
        const { playFabId, currency, amount } = req.body || {};
        if (!playFabId || !currency) {
            return res.status(400).json({ error: 'playFabId and currency are required' });
        }
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) {
                return res.status(400).json({ error: 'Nation not set' });
            }
            const mapping = getNationMappingByNation(nation);
            if (!mapping) {
                return res.status(400).json({ error: 'Invalid nation' });
            }

            await subtractEconomyItem(playFabId, String(currency).toUpperCase(), value);

            const docRef = await getNationGroupDoc(firestore, mapping.groupName);
            await docRef.set({
                treasury: {
                    [String(currency).toUpperCase()]: admin.firestore.FieldValue.increment(value)
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const normalizedCurrency = String(currency).toUpperCase();
            if (normalizedCurrency === 'PS') {
                await addNationTreasury(nation, value, firestore, nationDeps);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('[donate-nation-currency] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'Failed to donate currency' });
        }
    });

    // ギルドエリア取得
    app.post('/api/get-guild-areas', async (req, res) => {
        const { guildId } = req.body || {};
        if (!guildId) return res.json({ success: true, areas: [] });
        try {
            const snapshot = await firestore.collection('guild_areas')
                .where('guildId', '==', guildId)
                .get();
            const areas = snapshot.docs.map((doc) => doc.data());
            res.json({ success: true, areas });
        } catch (error) {
            console.error('[GetGuildAreas] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get guild areas' });
        }
    });

    // ギルドエリア占領
    app.post('/api/capture-guild-area', async (req, res) => {
        const { guildId, gx, gy } = req.body || {};
        if (!guildId || !Number.isFinite(Number(gx)) || !Number.isFinite(Number(gy))) {
            return res.status(400).json({ error: 'guildId, gx, gy are required' });
        }
        try {
            const key = `${guildId}_${gx}_${gy}`;
            await firestore.collection('guild_areas').doc(key).set({
                guildId,
                gx: Number(gx),
                gy: Number(gy),
                occupiedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            res.json({ success: true });
        } catch (error) {
            console.error('[CaptureGuildArea] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to capture guild area' });
        }
    });

    app.post('/api/get-nation-treasury-ranking', async (_req, res) => {
        try {
            const ranking = await getNationTreasuryRanking(firestore, nationDeps);
            res.json({ ranking });
        } catch (error) {
            console.error('[get-nation-treasury-ranking] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get nation treasury ranking' });
        }
    });
}

module.exports = {
    NATION_GROUP_BY_RACE,
    NATION_GROUP_BY_NATION,
    AVATAR_COLOR_BY_NATION,
    getAvatarColorForNation,
    getNationMappingByNation,
    getNationForPlayer,
    getNationGroupDoc,
    ensureNationGroupExists,
    getNationGroupIdByNation,
    getNationTaxRateBps,
    addNationTreasury,
    getNationTreasuryRanking,
    getPlayerEntity,
    initializeNationRoutes
};

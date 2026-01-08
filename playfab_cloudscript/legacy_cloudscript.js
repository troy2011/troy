var handlers = handlers || {};

var RACE_TO_NATION = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};

var NATION_VC_CODE = 'PS';

function _stringifyError(e) {
    try {
        if (e && typeof e === 'object') return JSON.stringify(e);
        return String(e);
    } catch (_) {
        return String(e);
    }
}

function _getGroupObject(objectsResult, objectName) {
    if (!objectsResult || !objectsResult.Objects || !objectsResult.Objects[objectName]) return null;
    return objectsResult.Objects[objectName].DataObject || null;
}

function _safeGetGroupObjects(groupEntity) {
    try {
        return entity.GetObjects({ Entity: groupEntity, EscapeObject: false });
    } catch (e) {
        return null;
    }
}

function _getNationTreasuryPs(groupId) {
    var groupEntity = { Id: groupId, Type: 'group' };
    var objects = _safeGetGroupObjects(groupEntity);
    if (!objects) return 0;
    var treasury = _getGroupObject(objects, 'NationTreasury');
    if (!treasury || typeof treasury.ps !== 'number') return 0;
    return treasury.ps;
}

function _setNationTreasuryPs(groupId, ps) {
    var groupEntity = { Id: groupId, Type: 'group' };
    entity.SetObjects({
        Entity: groupEntity,
        Objects: [{ ObjectName: 'NationTreasury', DataObject: { ps: ps } }]
    });
}

function _getNationTaxRateBps(groupId) {
    var groupEntity = { Id: groupId, Type: 'group' };
    var objects = _safeGetGroupObjects(groupEntity);
    if (!objects) return 0;
    var tax = _getGroupObject(objects, 'NationTax');
    var bps = tax && typeof tax.bps === 'number' ? tax.bps : 0;
    if (bps < 0) bps = 0;
    if (bps > 5000) bps = 5000; // max 50%
    return bps;
}

function _setNationTaxRateBps(groupId, bps) {
    if (bps < 0) bps = 0;
    if (bps > 5000) bps = 5000;
    var groupEntity = { Id: groupId, Type: 'group' };
    entity.SetObjects({
        Entity: groupEntity,
        Objects: [{ ObjectName: 'NationTax', DataObject: { bps: bps, updatedAt: Date.now() } }]
    });
    return bps;
}

function _getNationGroupIdForCurrentPlayer() {
    var ro = server.GetUserReadOnlyData({
        PlayFabId: currentPlayerId,
        Keys: ['Nation', 'NationGroupId', 'NationGroupName']
    });

    if (!ro || !ro.Data || !ro.Data.NationGroupId || !ro.Data.NationGroupId.Value) return null;
    return {
        nationIsland: ro.Data.Nation ? ro.Data.Nation.Value : null,
        nationGroupId: ro.Data.NationGroupId.Value,
        nationGroupName: ro.Data.NationGroupName ? ro.Data.NationGroupName.Value : null
    };
}

function _getEntityKeyForPlayFabId(playFabId) {
    var profile = server.GetPlayerProfile({
        PlayFabId: playFabId,
        ProfileConstraints: { ShowEntity: true }
    });
    return profile && profile.PlayerProfile ? profile.PlayerProfile.Entity : null;
}

function _getNationKing(groupId) {
    var groupEntity = { Id: groupId, Type: 'group' };
    var objects = _safeGetGroupObjects(groupEntity);
    if (!objects) return null;
    var king = _getGroupObject(objects, 'NationKing');
    return (king && king.playFabId) ? king : null;
}

function _setNationKing(groupId, playFabId) {
    var groupEntity = { Id: groupId, Type: 'group' };
    var payload = { playFabId: playFabId, assignedAt: Date.now() };
    entity.SetObjects({
        Entity: groupEntity,
        Objects: [{ ObjectName: 'NationKing', DataObject: payload }]
    });
    return payload;
}

function _requireNationKing(groupId) {
    var king = _getNationKing(groupId);
    if (!king) throw 'NationKingNotSet';
    if (king.playFabId !== currentPlayerId) throw 'NotKing';
    return king;
}

handlers.AssignNationGroupByRace = function (args, context) {
    try {
        if (typeof groups === 'undefined') throw 'GroupsApiNotAvailable';
        var raceName = args && args.raceName ? String(args.raceName).trim() : '';
        if (!raceName) throw 'raceName is required';

    var mapping = RACE_TO_NATION[raceName];
    if (!mapping) throw 'Invalid raceName: ' + raceName;

    var nationIsland = mapping.island;
    var groupName = mapping.groupName;
    if (typeof log !== 'undefined' && log && typeof log.info === 'function') {
        log.info({ handler: 'AssignNationGroupByRace', step: 'start', raceName: raceName, groupName: groupName });
    }

    var ro = server.GetUserReadOnlyData({
        PlayFabId: currentPlayerId,
        Keys: ['Nation', 'NationGroupId', 'NationGroupName']
    });

    if (ro && ro.Data) {
        var existingIsland = ro.Data.Nation && ro.Data.Nation.Value;
        var existingGroupId = ro.Data.NationGroupId && ro.Data.NationGroupId.Value;
        if (existingIsland === nationIsland && existingGroupId) {
            var existingKing = _getNationKing(existingGroupId);
            return {
                alreadyAssigned: true,
                nationIsland: existingIsland,
                nationGroupId: existingGroupId,
                nationGroupName: (ro.Data.NationGroupName && ro.Data.NationGroupName.Value) || groupName,
                isKing: existingKing && existingKing.playFabId === currentPlayerId
            };
        }
    }

    var tokenResult = entity.GetEntityToken({});
    if (!tokenResult || !tokenResult.Entity) throw 'Failed to resolve player entity';
    var playerEntity = tokenResult.Entity;

    var groupKey = null;
    var createdNewGroup = false;
    try {
        var search = groups.SearchGroups({ SearchTerm: groupName });
        if (search && search.Groups) {
            for (var i = 0; i < search.Groups.length; i++) {
                if (search.Groups[i].GroupName === groupName) {
                    groupKey = search.Groups[i].Group;
                    break;
                }
            }
        }
        if (typeof log !== 'undefined' && log && typeof log.info === 'function') {
            log.info({ handler: 'AssignNationGroupByRace', step: 'search', groupName: groupName, found: !!groupKey });
        }
    } catch (e) {
        // SearchGroups が利用できない場合は CreateGroup を試す
        if (typeof log !== 'undefined' && log && typeof log.warn === 'function') {
            log.warn({ handler: 'AssignNationGroupByRace', step: 'search_failed', error: _stringifyError(e) });
        }
    }

    if (!groupKey) {
        var created = groups.CreateGroup({ GroupName: groupName });
        if (!created || !created.Group) throw 'Failed to create group: ' + groupName;
        groupKey = created.Group;
        createdNewGroup = true;
        if (typeof log !== 'undefined' && log && typeof log.info === 'function') {
            log.info({ handler: 'AssignNationGroupByRace', step: 'created', groupId: groupKey.Id, groupName: groupName });
        }
    }

    var added = false;
    for (var addTry = 0; addTry < 3 && !added; addTry += 1) {
        try {
            groups.AddMembers({ Group: groupKey, Members: [playerEntity] });
            added = true;
        } catch (e) {
            var msg = _stringifyError(e);
            if (msg.indexOf('already') !== -1 || msg.indexOf('Already') !== -1) {
                added = true;
            } else if (msg.indexOf('No group profile found') !== -1) {
                // retry for eventual consistency
            } else {
                if (typeof log !== 'undefined' && log && typeof log.error === 'function') {
                    log.error({ handler: 'AssignNationGroupByRace', step: 'add_members_failed', error: msg, groupId: groupKey.Id });
                }
                throw msg;
            }
        }
    }
    if (!added) throw 'Failed to add member to nation group';

    server.UpdateUserReadOnlyData({
        PlayFabId: currentPlayerId,
        Data: {
            Nation: nationIsland,
            NationGroupId: groupKey.Id,
            NationGroupName: groupName
        }
    });
    if (typeof log !== 'undefined' && log && typeof log.info === 'function') {
        log.info({ handler: 'AssignNationGroupByRace', step: 'done', groupId: groupKey.Id, isKing: !!kingObj });
    }

    // グループ作成時のみ、作成者を王として設定する
    var kingObj = _getNationKing(groupKey.Id);
    if (!kingObj) {
        var memberCountAfterJoin = null;
        try {
            var listForKing = groups.ListGroupMembers({ Group: { Id: groupKey.Id, Type: 'group' } });
            if (listForKing && listForKing.Members) memberCountAfterJoin = listForKing.Members.length;
        } catch (e) { }

        if (createdNewGroup || memberCountAfterJoin === 1) {
            kingObj = _setNationKing(groupKey.Id, currentPlayerId);
        }
    }

    return {
        assigned: true,
        nationIsland: nationIsland,
        nationGroupId: groupKey.Id,
        nationGroupName: groupName,
        isKing: kingObj && kingObj.playFabId === currentPlayerId
    };
    } catch (ex) {
        if (typeof log !== 'undefined' && log && typeof log.error === 'function') {
            log.error({
                handler: 'AssignNationGroupByRace',
                currentPlayerId: currentPlayerId,
                hasGroups: (typeof groups !== 'undefined'),
                hasEntity: (typeof entity !== 'undefined'),
                error: _stringifyError(ex),
                raw: ex
            });
        }
        throw _stringifyError(ex);
    }
};

handlers.GetNationKingPageData = function (args, context) {
    var nation = _getNationGroupIdForCurrentPlayer();
    if (!nation || !nation.nationGroupId) throw 'NationGroupNotSet';

    _requireNationKing(nation.nationGroupId);

    var groupEntity = { Id: nation.nationGroupId, Type: 'group' };
    var objects = entity.GetObjects({ Entity: groupEntity, EscapeObject: false });
    var announcement = _getGroupObject(objects, 'NationAnnouncement') || { message: '', updatedAt: null };
    var taxRateBps = _getNationTaxRateBps(nation.nationGroupId);
    var treasuryPs = _getNationTreasuryPs(nation.nationGroupId);

    var memberCount = null;
    try {
        var list = groups.ListGroupMembers({ Group: groupEntity });
        if (list && list.Members) memberCount = list.Members.length;
    } catch (e) {
        // ignore
    }

    return {
        nationIsland: nation.nationIsland,
        nationGroupId: nation.nationGroupId,
        nationGroupName: nation.nationGroupName,
        memberCount: memberCount,
        taxRateBps: taxRateBps,
        treasuryPs: treasuryPs,
        announcement: {
            message: announcement.message || '',
            updatedAt: announcement.updatedAt || null
        }
    };
};

handlers.SetNationAnnouncement = function (args, context) {
    var message = args && args.message != null ? String(args.message) : '';
    if (message.length > 200) message = message.slice(0, 200);

    var nation = _getNationGroupIdForCurrentPlayer();
    if (!nation || !nation.nationGroupId) throw 'NationGroupNotSet';

    _requireNationKing(nation.nationGroupId);

    var groupEntity = { Id: nation.nationGroupId, Type: 'group' };
    var payload = { message: message, updatedAt: Date.now() };

    entity.SetObjects({
        Entity: groupEntity,
        Objects: [{ ObjectName: 'NationAnnouncement', DataObject: payload }]
    });

    return { success: true };
};

handlers.SetNationTaxRate = function (args, context) {
    var nation = _getNationGroupIdForCurrentPlayer();
    if (!nation || !nation.nationGroupId) throw 'NationGroupNotSet';
    _requireNationKing(nation.nationGroupId);

    var percent = 0;
    try {
        percent = Number(args && args.taxRatePercent != null ? args.taxRatePercent : 0);
    } catch (e) {
        percent = 0;
    }

    if (!isFinite(percent)) percent = 0;
    if (percent < 0) percent = 0;
    if (percent > 50) percent = 50;

    var bps = Math.round(percent * 100);
    var saved = _setNationTaxRateBps(nation.nationGroupId, bps);
    return { success: true, taxRateBps: saved };
};

handlers.KingGrantPsWithTax = function (args, context) {
    var receiverPlayFabId = args && args.receiverPlayFabId ? String(args.receiverPlayFabId).trim() : '';
    if (!receiverPlayFabId) throw 'receiverPlayFabId is required';

    var amount = 0;
    try {
        amount = Number(args && args.amount != null ? args.amount : 0);
    } catch (e) {
        amount = 0;
    }
    if (!isFinite(amount)) amount = 0;
    amount = Math.floor(amount);
    if (amount <= 0) throw 'amount must be positive';

    var nation = _getNationGroupIdForCurrentPlayer();
    if (!nation || !nation.nationGroupId) throw 'NationGroupNotSet';

    _requireNationKing(nation.nationGroupId);

    // 受取人が同じ国グループか確認
    var receiverNation = server.GetUserReadOnlyData({
        PlayFabId: receiverPlayFabId,
        Keys: ['NationGroupId']
    });
    var receiverGroupId = receiverNation && receiverNation.Data && receiverNation.Data.NationGroupId ? receiverNation.Data.NationGroupId.Value : null;
    if (!receiverGroupId || receiverGroupId !== nation.nationGroupId) throw 'ReceiverNotInSameNation';

    var taxRateBps = _getNationTaxRateBps(nation.nationGroupId);
    var tax = Math.floor((amount * taxRateBps) / 10000);
    if (tax < 0) tax = 0;
    if (tax > amount) tax = amount;
    var net = amount - tax;

    // 王の所持金から差し引く（付与の原資）
    var senderEntity = _getEntityKeyForPlayFabId(currentPlayerId);
    entity.SubtractInventoryItems({
        Entity: senderEntity,
        Item: { Id: NATION_VC_CODE },
        Amount: amount
    });

    if (net > 0) {
        var receiverEntity = _getEntityKeyForPlayFabId(receiverPlayFabId);
        entity.AddInventoryItems({
            Entity: receiverEntity,
            Item: { Id: NATION_VC_CODE },
            Amount: net
        });
    }

    // 税金は国庫として記録（数値のみ）
    if (tax > 0) {
        var oldTreasury = _getNationTreasuryPs(nation.nationGroupId);
        var newTreasury = oldTreasury + tax;
        _setNationTreasuryPs(nation.nationGroupId, newTreasury);
    }

    return {
        success: true,
        grossAmount: amount,
        taxRateBps: taxRateBps,
        taxAmount: tax,
        netAmount: net,
        receiverPlayFabId: receiverPlayFabId,
        treasuryPs: _getNationTreasuryPs(nation.nationGroupId)
    };
};

handlers.TransferNationKing = function (args, context) {
    var newKingPlayFabId = args && args.newKingPlayFabId ? String(args.newKingPlayFabId).trim() : '';
    if (!newKingPlayFabId) throw 'newKingPlayFabId is required';

    var nation = _getNationGroupIdForCurrentPlayer();
    if (!nation || !nation.nationGroupId) throw 'NationGroupNotSet';
    _requireNationKing(nation.nationGroupId);

    var targetNation = server.GetUserReadOnlyData({
        PlayFabId: newKingPlayFabId,
        Keys: ['NationGroupId']
    });
    var targetGroupId = targetNation && targetNation.Data && targetNation.Data.NationGroupId ? targetNation.Data.NationGroupId.Value : null;
    if (!targetGroupId || targetGroupId !== nation.nationGroupId) throw 'TargetNotInSameNation';

    _setNationKing(nation.nationGroupId, newKingPlayFabId);
    return { success: true, newKingPlayFabId: newKingPlayFabId };
};

/*
 * (v18) PlayFab Cloud Script
 * LIFFサーバーから呼び出され、表示名とアイコンURLを更新する
 */
handlers.UpdateProfile = function (args, context) {
    var displayName = args && args.displayName ? String(args.displayName) : '';
    var pictureUrl = args && args.pictureUrl ? String(args.pictureUrl) : '';

    var playFabId = (context && context.currentPlayerId) ? context.currentPlayerId : currentPlayerId;
    if (!playFabId) throw 'playFabId is required';

    if (displayName) {
        server.UpdateUserTitleDisplayName({
            PlayFabId: playFabId,
            DisplayName: displayName
        });
    }

    if (pictureUrl) {
        server.UpdateAvatarUrl({
            PlayFabId: playFabId,
            ImageUrl: pictureUrl
        });
    }

    return { success: true };
};

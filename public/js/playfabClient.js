// c:/Users/ikeda/my-liff-app/public/js/playfabClient.js

import { callApiWithLoader, buildApiUrl } from './api.js';

export { callApiWithLoader };

export async function playfabRequest(endpoint, body, options) {
    return callApiWithLoader(endpoint, body, options);
}

async function fetchJson(endpoint, { method = 'GET', body = null } = {}) {
    const response = await fetch(buildApiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    return response.json();
}

export function getPlayerStats(playFabId, options) {
    return callApiWithLoader('/api/get-stats', { playFabId }, options);
}

export function allocateStatPoints(playFabId, allocations, options) {
    return callApiWithLoader('/api/allocate-stat-points', { playFabId, allocations }, options);
}

export function recoverHpResource(playFabId, options) {
    return callApiWithLoader('/api/recover-hp-resource', { playFabId }, options);
}

export function recoverMpResource(playFabId, options) {
    return callApiWithLoader('/api/recover-mp-resource', { playFabId }, options);
}

export function consumeVoyageMp(playFabId, durationMs, options) {
    return callApiWithLoader('/api/consume-voyage-mp', { playFabId, durationMs }, options);
}

export function recoverDockedMp(playFabId, options) {
    return callApiWithLoader('/api/recover-docked-mp', { playFabId }, options);
}

export function getPoints(playFabId, options) {
    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/get-inventory', { playFabId, entityKey }, options)
        .then((data) => {
            const points = Number(data?.virtualCurrency?.PS || 0);
            return { points, virtualCurrency: data?.virtualCurrency || {} };
        });
}

export function addPoints(playFabId, amount, options) {
    return callApiWithLoader('/api/add-points', { playFabId, amount }, options);
}

export function usePoints(playFabId, amount, options) {
    return callApiWithLoader('/api/use-points', { playFabId, amount }, options);
}

export function getRanking(options) {
    return callApiWithLoader('/api/get-ranking', {}, options);
}

export function getBountyRanking(options) {
    return callApiWithLoader('/api/get-bounty-ranking', {}, options);
}

export function getNationTreasuryRanking(options) {
    return callApiWithLoader('/api/get-nation-treasury-ranking', {}, options);
}

export function getStoreGameRanking(gameType, options) {
    return callApiWithLoader('/api/get-store-game-ranking', { gameType }, options);
}

export function kingUpdateStoreGameScore(playFabId, targetPlayFabId, gameType, scoreOrPayload, options) {
    const extraPayload = scoreOrPayload && typeof scoreOrPayload === 'object'
        ? scoreOrPayload
        : { score: scoreOrPayload };
    return callApiWithLoader('/api/king-update-store-game-score', { playFabId, targetPlayFabId, gameType, ...extraPayload }, options);
}

export function getInventory(playFabId, options) {
    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/get-inventory', { playFabId, entityKey }, options);
}

export function getEquipment(playFabId, options) {
    return callApiWithLoader('/api/get-equipment', { playFabId }, options);
}

export function updateAvatarStyle(playFabId, style, options) {
    return callApiWithLoader('/api/update-avatar-style', { playFabId, style, requestId: style?.requestId || null }, options);
}

export function ensureAvatarStyleDefaults(playFabId, options) {
    return callApiWithLoader('/api/ensure-avatar-style-defaults', { playFabId }, options);
}

export function getPublicPlayerProfile(playFabId, targetPlayFabId, options) {
    return callApiWithLoader('/api/get-player-public-profile', { playFabId, targetPlayFabId }, options);
}

export function getTarotKingdomCombatProfiles(playFabId, targetPlayFabIds, options = {}) {
    const { roomId = '', ...requestOptions } = options || {};
    return callApiWithLoader(
        '/api/tarot-kingdom/combat-profiles',
        { playFabId, targetPlayFabIds, roomId: String(roomId || '').trim() },
        requestOptions
    );
}

export function getTarotKingdomPetState(playFabId, options) {
    return callApiWithLoader('/api/tarot-kingdom/pet-state', { playFabId }, options);
}

export function renameTarotKingdomPet(playFabId, nickname, options) {
    return callApiWithLoader('/api/tarot-kingdom/pet-name', {
        playFabId,
        nickname: String(nickname || '').trim()
    }, options);
}

export function rollTarotKingdomPetRound(playFabId, explorationId, finisher, options) {
    const source = finisher && typeof finisher === 'object' ? finisher : {};
    return callApiWithLoader('/api/tarot-kingdom/pet-round-roll', {
        playFabId,
        explorationId: String(explorationId || '').trim(),
        finisher: {
            roundNo: Math.max(1, Math.min(4, Math.floor(Number(source.roundNo) || 1))),
            playerIndex: Math.max(0, Math.floor(Number(source.playerIndex) || 0)),
            playFabId: String(source.playFabId || '').trim(),
            isNpc: source.isNpc === true,
            isPet: source.isPet === true,
            defeatMode: String(source.defeatMode || '').trim().toLowerCase(),
            monsterId: String(source.monsterId || '').trim(),
            mode: String(source.mode || '').trim().toLowerCase()
        }
    }, options);
}

export function chooseTarotKingdomPet(playFabId, offerId, accept, options) {
    return callApiWithLoader('/api/tarot-kingdom/pet-choice', {
        playFabId,
        offerId: String(offerId || '').trim(),
        accept: accept === true
    }, options);
}

export function transferPoints(fromId, toId, amount, options = {}) {
    return callApiWithLoader('/api/transfer-points', {
        fromId,
        toId,
        amount,
        fromEntityKey: window.myPlayFabLoginInfo?.entityKey || null,
        requestId: options?.requestId || null
    }, options);
}

export function equipItem(playFabId, itemId, slot, options) {
    return callApiWithLoader('/api/equip-item', { playFabId, itemId, slot }, options);
}

export function getTarotDecks(playFabId, options) {
    return callApiWithLoader('/api/tarot-deck-get', { playFabId }, options);
}

export function getTarotBattleSkills() {
    return fetchJson('/api/tarot-battle-skills');
}

export function equipTarotCard(playFabId, cardItemId, deckType, options) {
    return callApiWithLoader('/api/tarot-deck-equip', { playFabId, cardItemId, deckType }, options);
}

export function unequipTarotCard(playFabId, cardItemId, deckType, options) {
    return callApiWithLoader('/api/tarot-deck-unequip', { playFabId, cardItemId, deckType }, options);
}

export function moveTarotDeckCard(playFabId, cardItemId, deckType, direction, options) {
    return callApiWithLoader('/api/tarot-deck-move', { playFabId, cardItemId, deckType, direction }, options);
}

export function equipTarotGuardian(playFabId, cardItemId, options) {
    return callApiWithLoader('/api/tarot-guardian-equip', { playFabId, cardItemId }, options);
}

export function unequipTarotGuardian(playFabId, options) {
    return callApiWithLoader('/api/tarot-guardian-unequip', { playFabId }, options);
}

export function equipShipMajorArcana(playFabId, itemId, slotIndex = null, options) {
    const body = { playFabId, itemId };
    if (Number.isInteger(slotIndex)) body.slotIndex = slotIndex;
    return callApiWithLoader('/api/player-ship/major-arcana/equip', body, options);
}

export function unequipShipMajorArcana(playFabId, itemId, slotIndex = null, options) {
    const body = { playFabId };
    if (itemId) body.itemId = itemId;
    if (Number.isInteger(slotIndex)) body.slotIndex = slotIndex;
    return callApiWithLoader('/api/player-ship/major-arcana/unequip', body, options);
}

export function moveShipMajorArcana(playFabId, itemId, direction, options) {
    return callApiWithLoader('/api/player-ship/major-arcana/move', { playFabId, itemId, direction }, options);
}

export function getEvents(playFabId, options) {
    return callApiWithLoader('/api/events/list', { playFabId }, options);
}

export function createEvent(playFabId, payload, options) {
    return callApiWithLoader('/api/events/create', { playFabId, ...(payload || {}) }, options);
}

export function joinEvent(playFabId, eventId, payload = {}, options) {
    return callApiWithLoader('/api/events/join', { playFabId, eventId, ...(payload || {}) }, options);
}

export function approveEvent(playFabId, eventId, approve = true, payload = {}, options) {
    return callApiWithLoader('/api/events/approve', { playFabId, eventId, approve, ...(payload || {}) }, options);
}

export function getReservations(playFabId, options) {
    return callApiWithLoader('/api/reservations/list', { playFabId }, options);
}

export function createReservation(playFabId, payload, options) {
    return callApiWithLoader('/api/reservations/create', { playFabId, ...(payload || {}) }, options);
}

export function reviewReservation(playFabId, reservationId, approve = true, options) {
    return callApiWithLoader('/api/reservations/review', { playFabId, reservationId, approve }, options);
}

export function cancelReservation(playFabId, reservationId, options) {
    return callApiWithLoader('/api/reservations/cancel', { playFabId, reservationId }, options);
}

export function getTroyCalendar(playFabId, payload = {}, options) {
    return callApiWithLoader('/api/troy-calendar/list', { playFabId, ...(payload || {}) }, options);
}

export function getTroyCalendarGoogleSyncStatus(playFabId, options) {
    return callApiWithLoader('/api/troy-calendar/google-sync-status', { playFabId }, options);
}

export function getTroyCalendarGoogleSyncReviewDetails(playFabId, options) {
    return callApiWithLoader('/api/troy-calendar/google-sync-review-details', { playFabId }, options);
}

export function approveTroyCalendarGoogleSyncReview(playFabId, payload = {}, options) {
    return callApiWithLoader(
        '/api/troy-calendar/google-sync-review-approve',
        { playFabId, ...(payload || {}) },
        options
    );
}

export function saveTroyCalendarEntry(playFabId, payload = {}, options) {
    return callApiWithLoader('/api/troy-calendar/save', { playFabId, ...(payload || {}) }, options);
}

export function deleteTroyCalendarEntry(playFabId, calendarId, payload = {}, options) {
    return callApiWithLoader('/api/troy-calendar/delete', { playFabId, calendarId, ...(payload || {}) }, options);
}

export function getCapitalWarState(playFabId, targetNation, options) {
    return callApiWithLoader('/api/get-capital-war-state', { playFabId, targetNation }, options);
}

export function performCapitalWarAction(playFabId, targetNation, action, options) {
    return callApiWithLoader('/api/nation-war-capital-action', { playFabId, targetNation, action }, options);
}

export function useItem(playFabId, itemInstanceId, itemId, options) {
    return callApiWithLoader('/api/use-item', { playFabId, itemInstanceId, itemId }, options);
}

export function sellItem(playFabId, itemInstanceId, itemId, options) {
    return callApiWithLoader('/api/sell-item', { playFabId, itemInstanceId, itemId }, options);
}

export function sellItems(playFabId, items, options) {
    return callApiWithLoader('/api/sell-items', { playFabId, items }, options);
}

export function getBlackMarketListings(playFabId, options) {
    return callApiWithLoader('/api/black-market/list', { playFabId }, options);
}

export function getBlackMarketOrigins(playFabId, itemIds, options) {
    return callApiWithLoader('/api/black-market/origins', { playFabId, itemIds }, options);
}

export function createBlackMarketListing(playFabId, itemId, price, options) {
    return callApiWithLoader('/api/black-market/create', { playFabId, itemId, price }, options);
}

export function cancelBlackMarketListing(playFabId, listingId, options) {
    return callApiWithLoader('/api/black-market/cancel', { playFabId, listingId }, options);
}

export function buyBlackMarketListing(playFabId, listingId, options) {
    return callApiWithLoader('/api/black-market/buy', { playFabId, listingId }, options);
}

export function getGuildInfo(playFabId, entityKey, options) {
    const resolvedEntityKey = entityKey || window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/get-guild-info', { playFabId, entityKey: resolvedEntityKey }, options);
}

export function getGuildInviteInfo(playFabId, guildId, crewRoleId, options) {
    return callApiWithLoader('/api/get-guild-invite-info', { playFabId, guildId, crewRoleId }, options);
}

export function createGuild(playFabId, guildName, payloadOrOptions, maybeOptions) {
    const hasPayload = payloadOrOptions && typeof payloadOrOptions === 'object' && (
        Object.prototype.hasOwnProperty.call(payloadOrOptions, 'requestId')
        || Object.prototype.hasOwnProperty.call(payloadOrOptions, 'crewRoleId')
        || Object.prototype.hasOwnProperty.call(payloadOrOptions, 'payload')
    );
    const payload = hasPayload ? payloadOrOptions : {};
    const options = hasPayload ? maybeOptions : payloadOrOptions;
    return callApiWithLoader('/api/create-guild', { playFabId, guildName, ...(payload || {}) }, options);
}

export function joinGuild(playFabId, guildId, payloadOrOptions, maybeOptions) {
    const hasPayload = payloadOrOptions && typeof payloadOrOptions === 'object' && (
        Object.prototype.hasOwnProperty.call(payloadOrOptions, 'crewRoleId')
        || Object.prototype.hasOwnProperty.call(payloadOrOptions, 'roleId')
    );
    const payload = hasPayload ? payloadOrOptions : {};
    const options = hasPayload ? maybeOptions : payloadOrOptions;
    return callApiWithLoader('/api/join-guild', { playFabId, guildId, ...(payload || {}) }, options);
}

export function leaveGuild(playFabId, options) {
    return callApiWithLoader('/api/leave-guild', { playFabId }, options);
}

export function getGuildMembers(playFabId, guildId, options) {
    return callApiWithLoader('/api/get-guild-members', { playFabId, guildId }, options);
}

export function updateGuildMemberRole(playFabId, guildId, memberPlayFabId, crewRoleId, options) {
    return callApiWithLoader('/api/update-guild-member-role', { playFabId, guildId, memberPlayFabId, crewRoleId }, options);
}

export function removeGuildMember(playFabId, guildId, memberPlayFabId, options) {
    return callApiWithLoader('/api/remove-guild-member', { playFabId, guildId, memberPlayFabId }, options);
}

export function getGuildChat(playFabId, guildId, options) {
    return callApiWithLoader('/api/get-guild-chat', { playFabId, guildId }, options);
}

export function sendGuildChat(playFabId, guildId, message, options) {
    return callApiWithLoader('/api/send-guild-chat', { playFabId, guildId, message }, options);
}

export function getGuildWarehouse(playFabId, guildId, options) {
    return callApiWithLoader('/api/get-guild-warehouse', { playFabId, guildId }, options);
}

export function donateToGuildWarehouse(playFabId, guildId, itemId, itemInstanceId, metadataOrOptions, maybeOptions) {
    const metadataKeys = ['itemName', 'displayName', 'imagePath', 'category'];
    const hasMetadata = metadataOrOptions
        && typeof metadataOrOptions === 'object'
        && metadataKeys.some((key) => Object.prototype.hasOwnProperty.call(metadataOrOptions, key));
    const metadata = hasMetadata ? metadataOrOptions : {};
    const options = hasMetadata ? maybeOptions : metadataOrOptions;
    return callApiWithLoader('/api/donate-to-guild-warehouse', {
        playFabId,
        guildId,
        itemId,
        itemInstanceId,
        ...metadata
    }, options);
}

export function withdrawFromGuildWarehouse(playFabId, guildId, warehouseIndex, options) {
    return callApiWithLoader('/api/withdraw-from-guild-warehouse', { playFabId, guildId, warehouseIndex }, options);
}

export function depositGuildCurrency(playFabId, guildId, amount, options) {
    return callApiWithLoader('/api/deposit-guild-currency', { playFabId, guildId, amount }, options);
}

export function withdrawGuildCurrency(playFabId, guildId, amount, options) {
    return callApiWithLoader('/api/withdraw-guild-currency', { playFabId, guildId, amount }, options);
}

export function getGuildApplications(playFabId, guildId, options) {
    return callApiWithLoader('/api/get-guild-applications', { playFabId, guildId }, options);
}

export function approveGuildApplication(playFabId, guildId, applicantId, payloadOrOptions, maybeOptions) {
    const hasPayload = payloadOrOptions && typeof payloadOrOptions === 'object' && (
        Object.prototype.hasOwnProperty.call(payloadOrOptions, 'crewRoleId')
        || Object.prototype.hasOwnProperty.call(payloadOrOptions, 'roleId')
    );
    const payload = hasPayload ? payloadOrOptions : {};
    const options = hasPayload ? maybeOptions : payloadOrOptions;
    return callApiWithLoader('/api/approve-guild-application', { playFabId, guildId, applicantId, ...(payload || {}) }, options);
}

export function rejectGuildApplication(playFabId, guildId, applicantId, options) {
    return callApiWithLoader('/api/reject-guild-application', { playFabId, guildId, applicantId }, options);
}

export function getCrewRecruitmentBoard(playFabId, options) {
    return callApiWithLoader('/api/crew-recruitment/list', { playFabId }, options);
}

export function saveCrewRecruitment(playFabId, guildId, payload = {}, options) {
    return callApiWithLoader('/api/crew-recruitment/save', { playFabId, guildId, ...(payload || {}) }, options);
}

export function applyCrewRecruitment(playFabId, guildId, crewRoleId, options) {
    return callApiWithLoader('/api/crew-recruitment/apply', { playFabId, guildId, crewRoleId }, options);
}

export function getNearbyChat(playFabId, x, y, mapId, options) {
    return callApiWithLoader('/api/get-nearby-chat', { playFabId, x, y, mapId }, options);
}

export function getGlobalChat(playFabId, options) {
    return callApiWithLoader('/api/get-global-chat', { playFabId }, options);
}

export function sendNearbyChat(payload, options) {
    return callApiWithLoader('/api/send-nearby-chat', payload, options);
}

export function getTroyChat(playFabId, options) {
    return callApiWithLoader('/api/get-troy-chat', { playFabId }, options);
}

export function sendTroyChat(playFabId, message, options) {
    return callApiWithLoader('/api/send-troy-chat', { playFabId, message }, options);
}

export function sendGlobalChat(payload, options) {
    return callApiWithLoader('/api/send-global-chat', payload, options);
}

export function getNationKingPage(playFabId, options) {
    return callApiWithLoader('/api/get-nation-king-page', { playFabId }, options);
}

export function getNationAnnouncements(playFabId, options) {
    return callApiWithLoader('/api/get-nation-announcements', { playFabId }, options);
}

export function deployNationWarWeapon(playFabId, weaponId, options) {
    return callApiWithLoader('/api/nation-war-deploy', { playFabId, weaponId }, options);
}

export function prepareNationWarStrike(playFabId, weaponId, targetNation, targetPart, options) {
    return callApiWithLoader('/api/nation-war-prepare-strike', { playFabId, weaponId, targetNation, targetPart }, options);
}

export function respondNationWarIntercept(playFabId, incomingId, action, interceptSystemId, options) {
    return callApiWithLoader('/api/nation-war-intercept', { playFabId, incomingId, action, interceptSystemId }, options);
}

export function raidNationTreasury(playFabId, targetNation, options) {
    return callApiWithLoader('/api/nation-war-raid-treasury', { playFabId, targetNation }, options);
}

export function getTarotKingdomRaidStatus(playFabId, options) {
    return callApiWithLoader('/api/tarot-kingdom/raid/status', { playFabId }, options);
}

export function startTarotKingdomRaid(playFabId, roomId = '', options) {
    return callApiWithLoader('/api/tarot-kingdom/raid/start', {
        playFabId,
        roomId: String(roomId || '').trim()
    }, options);
}

export function finishTarotKingdomRaid(playFabId, attemptId, result = {}, options) {
    return callApiWithLoader('/api/tarot-kingdom/raid/finish', {
        playFabId,
        attemptId: String(attemptId || '').trim(),
        damageDealt: Math.max(0, Math.floor(Number(result?.damageDealt) || 0)),
        finisher: result?.finisher && typeof result.finisher === 'object'
            ? {
                playFabId: String(result.finisher.playFabId || '').trim(),
                displayName: String(result.finisher.displayName || '').trim(),
                isNpc: result.finisher.isNpc === true
            }
            : null
    }, options);
}

export function setNationAnnouncement(playFabId, message, options) {
    return callApiWithLoader('/api/set-nation-announcement', { playFabId, message }, options);
}

export function grantPs(playFabId, receiverPlayFabId, amount, requestId, options) {
    return callApiWithLoader('/api/king-grant-ps', { playFabId, receiverPlayFabId, amount, requestId }, options);
}

export function directGrantPs(playFabId, receiverPlayFabId, amount, requestId, options) {
    return callApiWithLoader('/api/king-direct-grant-ps', { playFabId, receiverPlayFabId, amount, requestId }, options);
}

export function kingReturnTroyCoin(playFabId, receiverPlayFabId, amount, requestId, options) {
    return callApiWithLoader('/api/king-troy-return-coin', { playFabId, receiverPlayFabId, amount, requestId }, options);
}

export function getTroyStatus(playFabId, payload = {}, options) {
    return callApiWithLoader('/api/get-troy-status', { playFabId, ...(payload || {}) }, options);
}

export function createTroyCustomerOrderRequest(playFabId, payload = {}, options) {
    return callApiWithLoader('/api/troy-orders/customer-request', { playFabId, ...(payload || {}) }, options);
}

export function convertTroyGoldToCoin(playFabId, amount, requestId, options) {
    return callApiWithLoader('/api/troy-convert-gold-to-coin', { playFabId, amount, requestId }, options);
}

export function setTroyOpen(playFabId, isOpen, options) {
    return callApiWithLoader('/api/king-set-troy-open', { playFabId, isOpen }, options);
}

export function kingUpdateMenu(playFabId, payload, options) {
    return callApiWithLoader('/api/king-update-menu', { playFabId, ...payload }, options);
}

export function joinTroy(playFabId, displayName, payload = {}, options) {
    return callApiWithLoader('/api/troy-join', { playFabId, displayName, ...(payload || {}) }, options);
}

export function leaveTroy(playFabId, payload = {}, options) {
    return callApiWithLoader('/api/troy-leave', { playFabId, ...(payload || {}) }, options);
}

export function transferKing(playFabId, newKingPlayFabId, options) {
    return callApiWithLoader('/api/king-transfer', { playFabId, newKingPlayFabId }, options);
}

export function exileKing(playFabId, targetPlayFabId, options) {
    return callApiWithLoader('/api/king-exile', { playFabId, targetPlayFabId }, options);
}

export function getActiveShip(playFabId, options) {
    return callApiWithLoader('/api/get-active-ship', { playFabId }, options);
}

export function setActiveShip(playFabId, shipId, options) {
    return callApiWithLoader('/api/set-active-ship', { playFabId, shipId }, options);
}

export function createShip(playFabId, shipItemId, mapId, islandId, options) {
    return callApiWithLoader('/api/create-ship', { playFabId, shipItemId, mapId, islandId }, options);
}

export function startShipVoyage(shipId, playFabId, destination, options) {
    return callApiWithLoader('/api/start-ship-voyage', { shipId, playFabId, destination }, options);
}

export function stopShip(shipId, playFabId, options) {
    return callApiWithLoader('/api/stop-ship', { shipId, playFabId }, options);
}

export function upgradeShip(playFabId, shipId, options) {
    return callApiWithLoader('/api/upgrade-ship', { playFabId, shipId }, options);
}

export function repairShip(playFabId, shipId, tier = 'small', options) {
    return callApiWithLoader('/api/repair-ship', { playFabId, shipId, tier }, options);
}

export function consumeShipBroadside(playFabId, options) {
    return callApiWithLoader('/api/consume-ship-broadside', { playFabId }, options);
}

export function getShipSkillStatus(playFabId, options) {
    return callApiWithLoader('/api/ship-skill-status', { playFabId }, options);
}

export function useShipSkill(playFabId, cardItemId, context = {}, options) {
    return callApiWithLoader('/api/ship-skill-use', { playFabId, cardItemId, ...context }, options);
}

export function triggerShipSkill(playFabId, triggerCondition, context = {}, options) {
    return callApiWithLoader('/api/ship-skill-trigger', { playFabId, triggerCondition, ...context }, options);
}

export function getShipResourceStorage(playFabId, options) {
    return callApiWithLoader('/api/get-ship-resource-storage', { playFabId }, options);
}

export function depositShipResources(playFabId, shipId = null, options) {
    return callApiWithLoader('/api/deposit-ship-resources', { playFabId, shipId }, options);
}

export function saveShipResourcePreset(playFabId, preset, options) {
    return callApiWithLoader('/api/save-ship-resource-preset', { playFabId, preset }, options);
}

export function applyShipResourcePreset(playFabId, shipId = null, options) {
    return callApiWithLoader('/api/apply-ship-resource-preset', { playFabId, shipId }, options);
}

export function getPlayerShips(playFabId, options) {
    return callApiWithLoader('/api/get-player-ships', { playFabId }, options);
}

export function getShipsInView(centerX, centerY, radius, mapId, options) {
    return callApiWithLoader('/api/get-ships-in-view', { centerX, centerY, radius, mapId }, options);
}

export function getShipAsset(playFabId, shipId, options) {
    return callApiWithLoader('/api/get-ship-asset', { playFabId, shipId }, options);
}

export function getShipPosition(shipId, options) {
    return callApiWithLoader('/api/get-ship-position', { shipId }, options);
}

export function detectIslandApproach(playFabId, shipId, options) {
    return callApiWithLoader('/api/detect-island-approach', { playFabId, shipId }, options);
}

export function startIslandOccupation(playFabId, islandId, mapId, options) {
    return callApiWithLoader('/api/start-island-occupation', { playFabId, islandId, mapId }, options);
}

export function guardianBattleResult(playFabId, islandId, isWin, options) {
    return callApiWithLoader('/api/guardian-battle-result', { playFabId, islandId, isWin }, options);
}

export function getPlayerIslands(playFabId, options) {
    return callApiWithLoader('/api/get-player-islands', { playFabId }, options);
}

export function getOwnedIslands(playFabId, mapId, options) {
    return callApiWithLoader('/api/get-owned-islands', { playFabId, mapId }, options);
}

export function getIslandDetails(islandId, mapId, playFabId, options) {
    return callApiWithLoader('/api/get-island-details', { islandId, mapId, playFabId }, options);
}
export function renameIsland(playFabId, islandId, mapId, name, options) {
    return callApiWithLoader('/api/rename-island', { playFabId, islandId, mapId, name }, options);
}

export function getResourceStatus(playFabId, islandId, mapId, options) {
    return callApiWithLoader('/api/get-resource-status', { playFabId, islandId, mapId }, options);
}

export function collectResource(playFabId, islandId, mapId, options) {
    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/collect-resource', { playFabId, islandId, mapId, entityKey }, options);
}

export function startBuildingConstruction(playFabId, islandId, buildingId, mapId, options, extra) {
    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    const payload = { playFabId, islandId, buildingId, mapId, entityKey, ...(extra || {}) };
    return callApiWithLoader('/api/start-building-construction', payload, options);
}

export function upgradeIslandLevel(playFabId, islandId, mapId, paymentMethod, options) {
    return callApiWithLoader('/api/upgrade-island-level', { playFabId, islandId, mapId, paymentMethod }, options);
}

export function upgradeBuilding(playFabId, islandId, mapId, paymentMethod, options) {
    return callApiWithLoader('/api/upgrade-building', { playFabId, islandId, mapId, paymentMethod }, options);
}

export function checkBuildingCompletion(islandId, mapId, options) {
    return callApiWithLoader('/api/check-building-completion', { islandId, mapId }, options);
}

export function helpConstruction(islandId, playFabId, mapId, options) {
    return callApiWithLoader('/api/help-construction', { islandId, playFabId, helperPlayFabId: playFabId, mapId }, options);
}

export function getShopState(islandId, mapId, options) {
    return callApiWithLoader('/api/get-shop-state', { islandId, mapId }, options);
}

export function setShopPricing(playFabId, islandId, buyMultiplier, sellMultiplier, mapId, options) {
    return callApiWithLoader('/api/set-shop-pricing', { playFabId, islandId, buyMultiplier, sellMultiplier, mapId }, options);
}

export function sellToShop(playFabId, islandId, itemInstanceId, itemId, quantity, mapId, options) {
    return callApiWithLoader('/api/sell-to-shop', { playFabId, islandId, itemInstanceId, itemId, quantity, mapId }, options);
}

export function setShopItemPrice(playFabId, islandId, itemId, buyPrice, sellPrice, mapId, options) {
    return callApiWithLoader('/api/set-shop-item-price', { playFabId, islandId, itemId, buyPrice, sellPrice, mapId }, options);
}

export function buyFromShop(playFabId, islandId, itemId, quantity, mapId, options) {
    return callApiWithLoader('/api/buy-from-shop', { playFabId, islandId, itemId, quantity, mapId }, options);
}

export function getBuildingsByCategory(category, islandSize, mapId, options) {
    const playFabId = (typeof window !== 'undefined' && window.myPlayFabId)
        ? window.myPlayFabId
        : localStorage.getItem('playFabId');
    const payload = { category, islandSize, mapId };
    if (playFabId) payload.playFabId = playFabId;
    return callApiWithLoader('/api/get-buildings-by-category', payload, options);
}

export function donateNationCurrency(playFabId, currency, amount, options) {
    return callApiWithLoader('/api/donate-nation-currency', { playFabId, currency, amount }, options);
}

export function hotSpringBath(playFabId, islandId, mapId, options) {
    return callApiWithLoader('/api/hot-spring-bath', { playFabId, islandId, mapId }, options);
}

export function setHotSpringPrice(playFabId, islandId, price, mapId, options) {
    return callApiWithLoader('/api/set-hot-spring-price', { playFabId, islandId, price, mapId }, options);
}

export function getConstructingIslands(mapId) {
    const suffix = mapId ? `?mapId=${encodeURIComponent(mapId)}` : '';
    return fetchJson(`/api/get-constructing-islands${suffix}`);
}

export function demolishIsland(playFabId, islandId, mapId) {
    return fetchJson('/api/demolish-island', { method: 'POST', body: { playFabId, islandId, mapId } });
}

export function checkIslandRebuildable(playFabId, islandId, mapId) {
    return fetchJson('/api/check-island-rebuildable', { method: 'POST', body: { playFabId, islandId, mapId } });
}

export function rebuildIsland(playFabId, islandId, mapId) {
    return fetchJson('/api/rebuild-island', { method: 'POST', body: { playFabId, islandId, mapId } });
}

export function getDemolishedIslands(playFabId) {
    return fetchJson('/api/get-demolished-islands', { method: 'POST', body: { playFabId } });
}

export function getExplorationStatus(playFabId, options) {
    return callApiWithLoader('/api/exploration/status', { playFabId }, options);
}

export function startExploration(playFabId, stageNo, requestId, options) {
    const body = {
        playFabId,
        stageNo: Math.max(1, Math.floor(Number(stageNo) || 1)),
        requestId
    };
    if (Array.isArray(options?.supplies)) body.supplies = options.supplies;
    return callApiWithLoader('/api/exploration/start', body, options);
}

export function getExplorationEncounter(playFabId, options) {
    return callApiWithLoader('/api/exploration/encounter', { playFabId }, options);
}

export function retreatExploration(playFabId, explorationId, options) {
    return callApiWithLoader('/api/exploration/retreat', {
        playFabId,
        explorationId: String(explorationId || '').trim()
    }, options);
}

export function claimExploration(playFabId, options) {
    const body = { playFabId };
    const tarotOutcome = String(options?.tarotOutcome || '').trim().toLowerCase();
    const explorationId = String(options?.explorationId || '').trim();
    if (tarotOutcome) body.tarotOutcome = tarotOutcome;
    if (explorationId) body.explorationId = explorationId;
    if (options?.tarotFinisher && typeof options.tarotFinisher === 'object') {
        body.tarotFinisher = {
            roundNo: Math.floor(Number(options.tarotFinisher.roundNo) || 0),
            playerIndex: Math.floor(Number(options.tarotFinisher.playerIndex) || 0),
            playFabId: String(options.tarotFinisher.playFabId || '').trim(),
            isNpc: options.tarotFinisher.isNpc === true,
            isPet: options.tarotFinisher.isPet === true,
            defeatMode: String(options.tarotFinisher.defeatMode || '').trim().toLowerCase(),
            monsterId: String(options.tarotFinisher.monsterId || '').trim(),
            mode: String(options.tarotFinisher.mode || '').trim().toLowerCase()
        };
    }
    if (Array.isArray(options?.tarotFinishers)) {
        body.tarotFinishers = options.tarotFinishers;
    }
    if (Array.isArray(options?.tarotStandings)) {
        body.tarotStandings = options.tarotStandings;
    }
    return callApiWithLoader('/api/exploration/claim', body, options);
}

export function joinExplorationStage(playFabId, ownerPlayFabId, explorationId, options) {
    return callApiWithLoader('/api/exploration/stage-join', {
        playFabId,
        ownerPlayFabId,
        explorationId
    }, options);
}

export function getPlayerShipStatus(playFabId, options) {
    return callApiWithLoader('/api/player-ship/status', { playFabId }, options);
}

export function upgradePlayerShip(playFabId, targetForm, requestId, options) {
    return callApiWithLoader('/api/player-ship/upgrade', { playFabId, targetForm, requestId }, options);
}

export function renamePlayerShip(playFabId, name, options) {
    return callApiWithLoader('/api/player-ship/name', { playFabId, name }, options);
}

// ── バトルルーム ────────────────────────────────────────────

export function createBattleRoom(playFabId, territoryId, options) {
    return callApiWithLoader('/api/battle-room/create', { playFabId, territoryId }, options);
}

export function joinBattleRoom(playFabId, roomId, options) {
    return callApiWithLoader('/api/battle-room/join', { playFabId, roomId }, options);
}

export function collectArcana(playFabId, roomId, buildingId, options) {
    return callApiWithLoader('/api/battle-room/collect-arcana', { playFabId, roomId, buildingId }, options);
}

export function damageBuilding(playFabId, roomId, buildingId, damage, options) {
    return callApiWithLoader('/api/battle-room/damage-building', { playFabId, roomId, buildingId, damage }, options);
}

export function strikeSymbol(playFabId, roomId, options) {
    return callApiWithLoader('/api/battle-room/strike-symbol', { playFabId, roomId }, options);
}

export function reportKill(playFabId, roomId, killedPlayFabId, options) {
    return callApiWithLoader('/api/battle-room/report-kill', { playFabId, roomId, killedPlayFabId }, options);
}

export function updateBattlePosition(playFabId, roomId, x, y, options) {
    return callApiWithLoader('/api/battle-room/move', { playFabId, roomId, x, y }, options);
}

export function attackBattlePlayer(playFabId, roomId, targetPlayFabId, options) {
    return callApiWithLoader('/api/battle-room/attack-player', { playFabId, roomId, targetPlayFabId }, options);
}

export function respawnBattle(playFabId, roomId, options) {
    return callApiWithLoader('/api/battle-room/respawn', { playFabId, roomId }, options);
}

export function resolveBattleRoom(roomId, options) {
    return callApiWithLoader('/api/battle-room/resolve', { roomId }, options);
}

export function getBattleRoom(roomId) {
    return fetchJson(`/api/battle-room/${encodeURIComponent(roomId)}`);
}

export function getActiveBattleRoom(territoryId) {
    return fetchJson(`/api/battle-room/active/${encodeURIComponent(territoryId)}`);
}

// ── NPC スナップショット ─────────────────────────────────────

export function updateNpcSnapshot(playFabId, snapshotData, options) {
    return callApiWithLoader('/api/npc-snapshot/update', { playFabId, ...snapshotData }, options);
}

export function getNpcSnapshot(targetPlayFabId) {
    return fetchJson(`/api/npc-snapshot/${encodeURIComponent(targetPlayFabId)}`);
}

export function getNpcSnapshotsByNation(nation, limit = 10) {
    return fetchJson(`/api/npc-snapshot/nation/${encodeURIComponent(nation)}?limit=${limit}`);
}

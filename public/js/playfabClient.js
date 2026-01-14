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

export function getPoints(playFabId, options) {
    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/get-inventory', { playFabId, entityKey }, options)
        .then((data) => {
            const points = Number(data?.virtualCurrency?.PS || 0);
            return { points };
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

export function getInventory(playFabId, options) {
    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/get-inventory', { playFabId, entityKey }, options);
}

export function getEquipment(playFabId, options) {
    return callApiWithLoader('/api/get-equipment', { playFabId }, options);
}

export function equipItem(playFabId, itemId, slot, options) {
    return callApiWithLoader('/api/equip-item', { playFabId, itemId, slot }, options);
}

export function useItem(playFabId, itemInstanceId, itemId, options) {
    return callApiWithLoader('/api/use-item', { playFabId, itemInstanceId, itemId }, options);
}

export function sellItem(playFabId, itemInstanceId, itemId, options) {
    return callApiWithLoader('/api/sell-item', { playFabId, itemInstanceId, itemId }, options);
}

export function getGuildInfo(playFabId, entityKey, options) {
    const resolvedEntityKey = entityKey || window.myPlayFabLoginInfo?.entityKey || null;
    return callApiWithLoader('/api/get-guild-info', { playFabId, entityKey: resolvedEntityKey }, options);
}

export function createGuild(playFabId, guildName, options) {
    return callApiWithLoader('/api/create-guild', { playFabId, guildName }, options);
}

export function joinGuild(playFabId, guildId, options) {
    return callApiWithLoader('/api/join-guild', { playFabId, guildId }, options);
}

export function leaveGuild(playFabId, options) {
    return callApiWithLoader('/api/leave-guild', { playFabId }, options);
}

export function getGuildMembers(playFabId, guildId, options) {
    return callApiWithLoader('/api/get-guild-members', { playFabId, guildId }, options);
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

export function withdrawFromGuildWarehouse(playFabId, guildId, warehouseIndex, options) {
    return callApiWithLoader('/api/withdraw-from-guild-warehouse', { playFabId, guildId, warehouseIndex }, options);
}

export function getGuildApplications(playFabId, guildId, options) {
    return callApiWithLoader('/api/get-guild-applications', { playFabId, guildId }, options);
}

export function approveGuildApplication(playFabId, guildId, applicantId, options) {
    return callApiWithLoader('/api/approve-guild-application', { playFabId, guildId, applicantId }, options);
}

export function rejectGuildApplication(playFabId, guildId, applicantId, options) {
    return callApiWithLoader('/api/reject-guild-application', { playFabId, guildId, applicantId }, options);
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

export function sendGlobalChat(payload, options) {
    return callApiWithLoader('/api/send-global-chat', payload, options);
}

export function getNationKingPage(playFabId, options) {
    return callApiWithLoader('/api/get-nation-king-page', { playFabId }, options);
}

export function setNationAnnouncement(playFabId, message, options) {
    return callApiWithLoader('/api/set-nation-announcement', { playFabId, message }, options);
}

export function setNationGrantMultiplier(playFabId, grantMultiplier, options) {
    return callApiWithLoader('/api/king-set-grant-multiplier', { playFabId, grantMultiplier }, options);
}

export function grantPs(playFabId, receiverPlayFabId, amount, options) {
    return callApiWithLoader('/api/king-grant-ps', { playFabId, receiverPlayFabId, amount }, options);
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

export function createShip(playFabId, shipItemId, spawnPosition, mapId, islandId, options) {
    return callApiWithLoader('/api/create-ship', { playFabId, shipItemId, spawnPosition, mapId, islandId }, options);
}

export function startShipVoyage(shipId, playFabId, destination, options) {
    return callApiWithLoader('/api/start-ship-voyage', { shipId, playFabId, destination }, options);
}

export function stopShip(shipId, options) {
    return callApiWithLoader('/api/stop-ship', { shipId }, options);
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

export function upgradeIslandLevel(playFabId, islandId, mapId, options) {
    return callApiWithLoader('/api/upgrade-island-level', { playFabId, islandId, mapId }, options);
}

export function checkBuildingCompletion(islandId, mapId, options) {
    return callApiWithLoader('/api/check-building-completion', { islandId, mapId }, options);
}

export function helpConstruction(islandId, helperPlayFabId, mapId, options) {
    return callApiWithLoader('/api/help-construction', { islandId, helperPlayFabId, mapId }, options);
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
    return callApiWithLoader('/api/get-buildings-by-category', { category, islandSize, mapId }, options);
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

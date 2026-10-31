'use strict';

// Do not automatically resend after an uncertain SDK result. The ledger holds
// that step until it is reconciled; idempotency also protects known retries.
async function createDailyFortuneGrant(playerId, deps) {
    const { PlayFabEconomy, promisifyPlayFab, ensureTitleEntityToken, getEntityKeyForPlayFabId, resolveItemId } = deps;
    if (typeof PlayFabEconomy?.AddInventoryItems !== 'function' || typeof promisifyPlayFab !== 'function'
        || typeof ensureTitleEntityToken !== 'function' || typeof getEntityKeyForPlayFabId !== 'function'
        || typeof resolveItemId !== 'function') throw Error('FortuneGrantUnavailable');
    await ensureTitleEntityToken();
    const entity = await getEntityKeyForPlayFabId(playerId);
    if (!entity?.Id || entity.Type !== 'title_player_account') throw Error('FortuneEntityUnavailable');
    return (itemId, amount, idempotencyId) => {
        const resolved = resolveItemId(itemId);
        if (typeof resolved !== 'string' || !resolved || !Number.isSafeInteger(amount) || amount < 1 || !idempotencyId) throw Error('FortuneGrantInvalid');
        return async () => {
            const response = await promisifyPlayFab(PlayFabEconomy.AddInventoryItems, {
                Entity: { Id: entity.Id, Type: entity.Type }, Item: { Id: resolved }, Amount: amount, IdempotencyId: idempotencyId
            });
            // The SDK reports unsuccessful calls through its error callback.
            // Both receipt fields are optional in AddInventoryItemsResponse.
            if (!response || typeof response !== 'object' || Array.isArray(response)
                || Object.prototype.hasOwnProperty.call(response, 'data')
                || (response.IdempotencyId != null && response.IdempotencyId !== idempotencyId)
                || (response.TransactionIds != null && (!Array.isArray(response.TransactionIds)
                    || response.TransactionIds.some(id => typeof id !== 'string' || !id)))) {
                throw Error('FortuneReceiptUnverified');
            }
        };
    };
}
module.exports = { createDailyFortuneGrant };

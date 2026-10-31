'use strict';
// Inputs must come from authenticated server state and the loaded catalog.
function buildAtomicShipRequest({ entity, shipItemId, shipId, requestId, resolvedCosts }) {
  if (!entity || typeof entity.Id !== 'string' || !entity.Id || typeof entity.Type !== 'string' || !entity.Type) throw Error('InvalidEntity');
  if (typeof shipItemId !== 'string' || !shipItemId) throw Error('InvalidShipItem');
  if (!/^[a-f0-9]{32}$/.test(requestId || '')) throw Error('InvalidRequestId');
  if (typeof shipId !== 'string' || !/^ship_[A-Z0-9]+_[a-f0-9]{20}$/.test(shipId) || !shipId.endsWith(`_${requestId.slice(0, 20)}`) || `Ship_${shipId}`.length > 50) throw Error('InvalidShipId');
  if (!Array.isArray(resolvedCosts) || resolvedCosts.length === 0) throw Error('NoVerifiedCost');
  const merged = new Map();
  for (const cost of resolvedCosts) {
    if (typeof cost.itemId !== 'string' || !cost.itemId || cost.itemId === shipItemId || !Number.isSafeInteger(cost.amount) || cost.amount <= 0) throw Error('InvalidCost');
    const total = (merged.get(cost.itemId) || 0) + cost.amount;
    if (!Number.isSafeInteger(total)) throw Error('InvalidCost');
    merged.set(cost.itemId, total);
  }
  if (merged.size > 9) throw Error('TooManyCosts');
  const stackId = `ship${requestId}`;
  return {
    Entity: { Id: entity.Id, Type: entity.Type },
    IdempotencyId: `ship-build-${requestId}`,
    // Trace is an opaque request identifier, not an authentication token.
    // It lets an operator find this one attempt in the player's history.
    CustomTags: { shipBuildTrace: requestId },
    Operations: [
      ...Array.from(merged, ([itemId, amount]) => ({ Subtract: { Item: { Id: itemId }, Amount: amount } })),
      { Add: { Item: { Id: shipItemId, StackId: stackId }, Amount: 1,
        NewStackValues: { DisplayProperties: { purpose: 'ship-build', requestId, shipId } } } }
    ]
  };
}

// An absent result is not proof of failure (replication or pending request).
// A matching shape alone does not prove ownership or successful payment; the
// caller must verify the entity, trusted origin, intent, and transaction history.
// No retry or compensating inventory action is performed by this function.
function inspectReceipt(items, expectedRequest) {
  const add = expectedRequest.Operations.at(-1).Add;
  const matches = (items || []).filter(item => item.Id === add.Item.Id && item.StackId === add.Item.StackId);
  if (matches.length === 0) return 'unknown';
  if (matches.length !== 1 || matches[0].Amount !== 1 || matches[0].DisplayProperties?.requestId !== add.NewStackValues.DisplayProperties.requestId
    || matches[0].DisplayProperties?.purpose !== 'ship-build'
    || matches[0].DisplayProperties?.shipId !== add.NewStackValues.DisplayProperties.shipId) return 'inconsistent';
  return 'matched';
}

module.exports = { buildAtomicShipRequest, inspectReceipt };

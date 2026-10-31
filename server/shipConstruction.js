'use strict';

// Build records are private per-player journals. A lost response is reconciled
// from the unique inventory stack; it is never treated as a failed payment.
const { createHash, randomUUID } = require('node:crypto');
const { quoteBuild } = require('./shipBuildCost');
const { createShipBuildInputs, verifyCommonBoatCosts } = require('./shipBuildInputs');
const { buildAtomicShipRequest, inspectReceipt } = require('./shipBuildAtomic');
const { createShipBuildAsset } = require('./shipBuildAsset');
const { normalizePlayerShipProfile, getShipProfileKey } = require('./resourceStorage');
const { isFeatureUnlocked } = require('./featureUnlocks');

const ownerKey = owner => createHash('sha256').update(owner).digest('hex');
const ownerId = value => String(value || '').trim().replace(/^playfab:/i, '').toUpperCase();
const validRequest = value => /^[a-f0-9]{32}$/.test(value || '');

function createShipConstruction(deps) {
  const { firestore: db, promisifyPlayFab: call, PlayFabServer, PlayFabEconomy,
    getEntityKeyForPlayFabId, getAllInventoryItems, ensureTitleEntityToken,
    catalogCache, catalogCurrencyMap, resolveItemId } = deps;
  const inputs = createShipBuildInputs({ ...deps, verifyFallbackCosts: item =>
    verifyCommonBoatCosts({ item, catalogCurrencyMap, resolveItemId }) });
  const refs = (owner, requestId) => {
    const root = db.collection('ship_construction').doc(ownerKey(owner));
    return { root, intent: root.collection('requests').doc(requestId) };
  };
  const read = async (owner, keys) => {
    const result = await call(PlayFabServer.GetUserReadOnlyData, { PlayFabId: owner, Keys: keys });
    if (!result?.Data || typeof result.Data !== 'object') throw Error('ShipDataUnavailable');
    return result.Data;
  };
  const parse = (data, key) => {
    if (!data[key]) return null;
    try { return JSON.parse(data[key].Value); } catch { throw Error('ShipDataInvalid'); }
  };
  async function quote(owner, shipItemId, selectedResource) {
    const [account, spec] = await Promise.all([inputs.getPlayer(owner), inputs.getCatalogEntry(shipItemId)]);
    if (!isFeatureUnlocked('shipPurchase', account.level)) throw Error('LevelRestricted');
    if (spec.race !== 'common' && spec.race !== account.race) throw Error('RaceRestricted');
    return { spec, costs: quoteBuild({ className: spec.shipClass, nation: account.nation,
      selectedResource, fallbackCosts: spec.verifiedFallbackCosts }) };
  }
  async function context(owner) {
    const account = await inputs.getPlayer(owner);
    return { unaffiliated: account.unaffiliated, eligible: isFeatureUnlocked('shipPurchase', account.level),
      catalog: await inputs.listCatalog(account) };
  }
  async function prepare(owner, input) {
    const { spec, costs } = await quote(owner, input.shipItemId, input.selectedResource);
    if (JSON.stringify(costs) !== JSON.stringify(input.expectedQuote)) throw Error('QuoteChanged');
    const entity = await getEntityKeyForPlayFabId(owner);
    if (!entity?.Id || entity.Type !== 'title_player_account') throw Error('EntityUnavailable');
    const shipId = `ship_${owner}_${input.requestId.slice(0, 20)}`;
    if (`Ship_${shipId}`.length > 50) throw Error('InvalidShipId');
    const assetKey = `Ship_${shipId}`, profileKey = getShipProfileKey(shipId);
    const [existing, index] = await Promise.all([read(owner, [assetKey, profileKey]), db.collection('ships').doc(shipId).get()]);
    if (existing[assetKey] || existing[profileKey] || index.exists) throw Error('ShipAlreadyExists');
    const asset = createShipBuildAsset({ playerId: owner, shipId, shipItemId: input.shipItemId,
      shipClass: spec.shipClass, spec: spec.assetSpec });
    const form = ['none', 'common'].includes(spec.shipClass) ? 'boat' : spec.shipClass;
    const profile = normalizePlayerShipProfile({ form, itemId: input.shipItemId, name: asset.ShipType, level: 1 });
    const item = resolveItemId(input.shipItemId);
    const resolvedCosts = costs.map(c => ({ itemId: resolveItemId(c.itemId), amount: c.amount }));
    if (!catalogCache[item] || resolvedCosts.some(c => !catalogCache[c.itemId])) throw Error('CatalogUnavailable');
    const request = buildAtomicShipRequest({ entity, shipItemId: item, shipId,
      requestId: input.requestId, resolvedCosts });
    return { owner, shipId, input: { shipItemId: input.shipItemId, selectedResource: input.selectedResource || '' },
      costs, request, asset, profile };
  }
  async function begin(owner, requestId, plan) {
    const ref = refs(owner, requestId);
    return db.runTransaction(async tx => {
      const [root, intent] = await Promise.all([tx.get(ref.root), tx.get(ref.intent)]);
      if (intent.exists) {
        const previous = intent.data();
        if (previous.plan.input.shipItemId !== plan.input.shipItemId || previous.plan.input.selectedResource !== plan.input.selectedResource) throw Error('IntentConflict');
        return previous;
      }
      if (root.exists && root.data().activeRequestId) throw Error('BuildPending');
      const value = { state: 'prepared', plan, createdAtMs: Date.now() };
      tx.set(ref.intent, value);
      tx.set(ref.root, { activeRequestId: requestId }, { merge: true });
      return value;
    });
  }
  async function claimSend(owner, requestId) {
    const ref = refs(owner, requestId);
    return db.runTransaction(async tx => {
      const intent = await tx.get(ref.intent);
      if (!intent.exists) throw Error('IntentMissing');
      const row = intent.data();
      if (row.state !== 'prepared') return false;
      tx.update(ref.intent, { state: 'sending', sentAtMs: Date.now() });
      return true;
    });
  }
  async function setState(owner, requestId, expected, changes, nonce) {
    const ref = refs(owner, requestId);
    return db.runTransaction(async tx => {
      const [root, intent] = await Promise.all([tx.get(ref.root), tx.get(ref.intent)]);
      if (!intent.exists) throw Error('IntentMissing');
      const row = intent.data();
      if (row.state !== expected || (nonce && row.provisionNonce !== nonce)) return row;
      tx.update(ref.intent, changes);
      if (['complete', 'failed'].includes(changes.state) && root.exists && root.data().activeRequestId === requestId)
        tx.set(ref.root, { activeRequestId: null }, { merge: true });
      return { ...row, ...changes };
    });
  }
  async function claimProvision(owner, requestId) {
    const ref = refs(owner, requestId), nonce = randomUUID();
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref.intent);
      if (!snapshot.exists) throw Error('IntentMissing');
      const row = snapshot.data();
      if (row.state !== 'paid' && !(row.state === 'provisioning' && row.provisionUntil <= Date.now())) return null;
      tx.update(ref.intent, { state: 'provisioning', provisionNonce: nonce, provisionUntil: Date.now() + 120000 });
      return { ...row, state: 'provisioning', provisionNonce: nonce };
    });
  }
  async function markProvisionWrite(owner, requestId, nonce, expected, next) {
    const ref = refs(owner, requestId);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref.intent);
      if (!snapshot.exists) throw Error('IntentMissing');
      const row = snapshot.data();
      if (row.state !== 'provisioning' || row.provisionNonce !== nonce || (row.assetWriteState || 'not_started') !== expected) return false;
      tx.update(ref.intent, { assetWriteState: next });
      return true;
    });
  }
  async function provision(owner, requestId, row) {
    const { plan } = row;
    const assetKey = `Ship_${plan.shipId}`, profileKey = getShipProfileKey(plan.shipId);
    const existing = await read(owner, [assetKey, profileKey]);
    const expectedAsset = { ...plan.asset, CreatedAt: new Date(row.createdAtMs).toISOString() };
    const storedAsset = parse(existing, assetKey), storedProfile = parse(existing, profileKey);
    if (storedAsset && JSON.stringify(storedAsset) !== JSON.stringify(expectedAsset)) throw Error('ShipConflict');
    if (storedProfile && JSON.stringify(storedProfile) !== JSON.stringify(plan.profile)) throw Error('ShipConflict');
    const missing = {};
    if (!storedAsset) missing[assetKey] = JSON.stringify(expectedAsset);
    if (!storedProfile) missing[profileKey] = JSON.stringify(plan.profile);
    const writeState = row.assetWriteState || 'not_started';
    if (Object.keys(missing).length) {
      // A previous write may still arrive. Never issue a second write to the
      // same mutable keys until an operator has resolved that uncertainty.
      if (writeState !== 'not_started') return { state: 'pending', requestId };
      if (!await markProvisionWrite(owner, requestId, row.provisionNonce, 'not_started', 'sending')) return { state: 'pending', requestId };
      await call(PlayFabServer.UpdateUserReadOnlyData, { PlayFabId: owner, Data: missing });
      if (!await markProvisionWrite(owner, requestId, row.provisionNonce, 'sending', 'saved')) return { state: 'pending', requestId };
    } else if (writeState !== 'saved') {
      if (!await markProvisionWrite(owner, requestId, row.provisionNonce, writeState, 'saved')) return { state: 'pending', requestId };
    }
    const index = db.collection('ships').doc(plan.shipId);
    const snapshot = await index.get();
    if (snapshot.exists && (snapshot.data()?.shipId !== plan.shipId || ownerId(snapshot.data()?.playFabId) !== owner)) throw Error('ShipConflict');
    if (!snapshot.exists) await index.create({ shipId: plan.shipId, playFabId: owner, createdAtMs: row.createdAtMs });
    const done = await setState(owner, requestId, 'provisioning', { state: 'complete', completedAtMs: Date.now() }, row.provisionNonce);
    return done.state === 'complete' ? { state: 'complete', requestId, shipId: plan.shipId } : { state: 'pending', requestId };
  }
  async function resume(owner, requestId) {
    if (!validRequest(requestId)) throw Error('InvalidRequest');
    const snapshot = await refs(owner, requestId).intent.get();
    if (!snapshot.exists) return { state: 'not_started', requestId };
    let row = snapshot.data();
    if (row.plan?.owner !== owner) throw Error('IntentConflict');
    if (row.state === 'complete') return { state: 'complete', requestId, shipId: row.plan.shipId };
    if (row.state === 'failed') return { state: 'failed', requestId, reason: row.reason };
    // The player already confirmed this exact plan. A prepared intent proves
    // that no inventory send has started, so it can be dispatched once here.
    if (row.state === 'prepared') {
      await ensureTitleEntityToken();
      if (await claimSend(owner, requestId)) {
        try {
          const receipt = await call(PlayFabEconomy.ExecuteInventoryOperations, row.plan.request);
          if (receipt?.IdempotencyId === row.plan.request.IdempotencyId && Array.isArray(receipt.TransactionIds)
              && receipt.TransactionIds.length && receipt.TransactionIds.every(id => typeof id === 'string' && id)) {
            row = await setState(owner, requestId, 'sending', { state: 'paid', transactionIds: receipt.TransactionIds });
          } else row = (await refs(owner, requestId).intent.get()).data();
        } catch (error) {
          if (error?.error === 'InsufficientFunds' || error?.apiErrorInfo?.apiError === 'InsufficientFunds') {
            await setState(owner, requestId, 'sending', { state: 'failed', reason: 'InsufficientFunds' });
            return { state: 'failed', requestId, reason: 'InsufficientFunds' };
          }
          return { state: 'pending', requestId };
        }
      } else return { state: 'pending', requestId };
    }
    if (row.state === 'sending') {
      const items = await getAllInventoryItems(row.plan.request.Entity);
      if (inspectReceipt(items, row.plan.request) !== 'matched') return { state: 'pending', requestId };
      row = await setState(owner, requestId, 'sending', { state: 'paid' });
    }
    if (row.state === 'paid' || row.state === 'provisioning') {
      const claimed = await claimProvision(owner, requestId);
      if (claimed) return provision(owner, requestId, claimed);
    }
    return { state: 'pending', requestId };
  }
  async function build(owner, input) {
    if (!validRequest(input.requestId)) throw Error('InvalidRequest');
    const ref = refs(owner, input.requestId);
    const prior = await ref.intent.get();
    let row;
    if (prior.exists) {
      row = prior.data();
      if (row.plan.input.shipItemId !== input.shipItemId || row.plan.input.selectedResource !== (input.selectedResource || '')) throw Error('IntentConflict');
    } else row = await begin(owner, input.requestId, await prepare(owner, input));
    return resume(owner, input.requestId);
  }
  async function current(owner) {
    const root = await refs(owner, 'current').root.get();
    const id = root.exists && root.data().activeRequestId;
    return id ? resume(owner, id) : { state: 'not_started' };
  }
  return { context, quote, build, resume, current };
}

function registerShipConstructionRoutes(app, deps) {
  const service = createShipConstruction(deps);
  for (const [path, action] of Object.entries({ context: (owner) => service.context(owner),
    quote: (owner, body) => service.quote(owner, body.shipItemId, body.selectedResource).then(x => ({ quote: x.costs })),
    build: (owner, body) => service.build(owner, body),
    status: (owner, body) => service.resume(owner, body.requestId), current: owner => service.current(owner) })) {
    app.post(`/api/ship-construction/${path}`, async (req, res) => {
      const requested = ownerId(req.body?.playFabId);
      if (!requested) return res.status(400).json({ error: 'InvalidIdentity' });
      const authenticated = await deps.requireAuthenticatedPlayFabId(req, res, requested);
      if (!authenticated) return;
      try { return res.json(await action(ownerId(authenticated), req.body)); }
      catch (error) {
        const code = String(error?.message || '');
        if (['InvalidRequest', 'InvalidShip', 'ChooseMaterial', 'NationUnverified', 'RaceRestricted', 'LevelRestricted', 'CatalogPriceUnavailable', 'IntentConflict', 'QuoteChanged', 'BuildPending'].includes(code)) return res.status(400).json({ error: code });
        return res.status(503).json({ error: 'ShipConstructionUnavailable' });
      }
    });
  }
}
module.exports = { createShipConstruction, registerShipConstructionRoutes };

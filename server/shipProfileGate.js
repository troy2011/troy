'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash, randomUUID } = require('node:crypto');
const scope = new AsyncLocalStorage();
const canonical = value => String(value || '').trim().replace(/^playfab:/i, '').toUpperCase();
const LEASE_MS = 120000;
const INVENTORY_RECOVERY_MS = 300000;

// Shared by all single-ship profile writers and, in the second release, switch.
// An unknown PlayFab write is retained, not automatically replayed or unlocked.
function createShipProfileGate(db, readCurrent = null) {
  if (!db || typeof db.runTransaction !== 'function') throw Error('ShipGateUnavailable');
  const refFor = owner => db.collection('ship_profile_writer_gate_v1').doc(createHash('sha256').update(owner).digest('hex'));
  async function recoverConfirmed(owner) {
    if (typeof readCurrent !== 'function') return false;
    const ref = refFor(owner), snapshot = await ref.get(), row = snapshot.exists && snapshot.data();
    if (!row || !['writing', 'uncertain'].includes(row.state) || !Array.isArray(row.keys) || !Number.isFinite(row.startedAt)) return false;
    if (row.keys.length) {
      if (!row.digest || row.startedAt + LEASE_MS > Date.now()) return false;
      const values = await readCurrent(owner, row.keys);
      if (digest(values) !== row.digest) return false;
    } else if (row.startedAt + INVENTORY_RECOVERY_MS > Date.now()) return false;
    return db.runTransaction(async tx => {
      const current = await tx.get(ref), held = current.exists && current.data();
      if (!held || held.nonce !== row.nonce || held.state !== row.state || held.digest !== row.digest) return false;
      tx.delete(ref);
      return true;
    });
  }
  async function run(player, work) {
    const owner = canonical(player);
    if (!/^[A-Z0-9]+$/.test(owner) || typeof work !== 'function' || scope.getStore()) throw Error('ShipGateUnavailable');
    const ref = refFor(owner), nonce = randomUUID();
    const acquire = () => db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const previous = snapshot.exists ? snapshot.data() : null;
      // A worker that died before sending a write can be replaced. A worker
      // that may have sent a write must instead be investigated.
      if (previous && (previous.state !== 'active' || !Number.isFinite(previous.expiresAt) || previous.expiresAt > Date.now())) throw Error('ShipProfileBusy');
      tx.set(ref, { nonce, state: 'active', expiresAt: Date.now() + LEASE_MS });
    });
    try { await acquire(); }
    catch (error) {
      if (error?.message !== 'ShipProfileBusy' || !await recoverConfirmed(owner)) throw error;
      await acquire();
    }
    const state = { owner, ref, nonce, db, writePending: false };
    try { return await scope.run(state, work); }
    finally {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref), row = snapshot.exists && snapshot.data();
        if (!row || row.nonce !== nonce) throw Error('ShipGateConflict');
        if (state.writePending) tx.update(ref, { state: 'uncertain' });
        else tx.delete(ref);
      });
    }
  }
  return { run, recoverConfirmed };
}
function digest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const keys = Object.keys(value).sort();
  if (!keys.length || keys.some(key => typeof value[key] !== 'string')) return '';
  return createHash('sha256').update(JSON.stringify(keys.map(key => [key, value[key]]))).digest('hex');
}
function createProfileRecoveryReader(promisifyPlayFab, PlayFabServer) {
  return async (owner, keys) => {
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: owner, Keys: keys });
    const values = {};
    for (const key of keys) {
      const value = result?.Data?.[key]?.Value;
      if (typeof value !== 'string') return null;
      values[key] = value;
    }
    return values;
  };
}
function inShipProfileScope(player) { return scope.getStore()?.owner === canonical(player); }
async function writeShipProfile(player, action, expectedData = null) {
  const state = scope.getStore();
  if (!state || state.owner !== canonical(player) || state.writePending) throw Error('ShipProfileGateRequired');
  // Check ownership of the lease immediately before dispatch. This prevents a
  // paused pre-write worker from writing after its expired lease was replaced.
  await state.db.runTransaction(async tx => {
    const snapshot = await tx.get(state.ref), row = snapshot.exists && snapshot.data();
    if (!row || row.nonce !== state.nonce || row.state !== 'active' || row.expiresAt <= Date.now()) throw Error('ShipProfileLeaseExpired');
    tx.update(state.ref, { state: 'writing', startedAt: Date.now(),
      keys: expectedData ? Object.keys(expectedData).sort() : [], digest: digest(expectedData) });
  });
  state.writePending = true;
  try {
    const result = await action();
    await state.db.runTransaction(async tx => {
      const snapshot = await tx.get(state.ref), row = snapshot.exists && snapshot.data();
      if (!row || row.nonce !== state.nonce || row.state !== 'writing') throw Error('ShipGateConflict');
      tx.update(state.ref, { state: 'active', expiresAt: Date.now() + LEASE_MS });
    });
    state.writePending = false;
    return result;
  } catch (error) {
    if (error && typeof error === 'object') error.shipWriteUncertain = true;
    throw error;
  }
}
module.exports = { createShipProfileGate, createProfileRecoveryReader, inShipProfileScope, writeShipProfile };

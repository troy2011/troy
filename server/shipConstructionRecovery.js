'use strict';

// Operator-only helper. It has no HTTP route and must be called from a trusted
// environment only after an operator has examined authoritative evidence.
const { createHash } = require('node:crypto');

async function resolveReviewedBuild(db, { playerId, requestId, outcome, confirmation, caseId, reviewer }) {
  const owner = String(playerId || '').trim().replace(/^playfab:/i, '').toUpperCase();
  const expected = outcome === 'paid' ? 'MANUALLY_VERIFIED_PAID' : outcome === 'failed' ? 'MANUALLY_VERIFIED_NOT_CHARGED' : '';
  if (!db?.runTransaction || !/^[A-Z0-9]+$/.test(owner) || !/^[a-f0-9]{32}$/.test(requestId || '') || !expected || confirmation !== expected ||
      typeof caseId !== 'string' || !caseId.trim() || caseId.length > 120 || typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 120) throw Error('InvalidReview');
  const root = db.collection('ship_construction').doc(createHash('sha256').update(owner).digest('hex'));
  const intent = root.collection('requests').doc(requestId);
  return db.runTransaction(async tx => {
    const [rootSnapshot, intentSnapshot] = await Promise.all([tx.get(root), tx.get(intent)]);
    if (!rootSnapshot.exists || rootSnapshot.data()?.activeRequestId !== requestId || !intentSnapshot.exists) throw Error('ReviewConflict');
    const record = intentSnapshot.data();
    if (record?.state !== 'sending' || record?.plan?.owner !== owner || record?.plan?.request?.IdempotencyId !== `ship-build-${requestId}`) throw Error('ReviewConflict');
    const review = { outcome, caseId: caseId.trim(), reviewer: reviewer.trim(), reviewedAtMs: Date.now() };
    if (outcome === 'paid') tx.update(intent, { state: 'paid', manualReview: review });
    else {
      tx.update(intent, { state: 'failed', reason: 'ReviewedNoCharge', manualReview: review });
      tx.set(root, { activeRequestId: null }, { merge: true });
    }
    return { state: outcome, requestId };
  });
}

// Reset a stranded pre-send/uncertain asset write only after the operator has
// verified that the old writer cannot issue or complete that write later.
async function resolveReviewedProvision(db, { playerId, requestId, confirmation, caseId, reviewer }) {
  const owner = String(playerId || '').trim().replace(/^playfab:/i, '').toUpperCase();
  if (!db?.runTransaction || !/^[A-Z0-9]+$/.test(owner) || !/^[a-f0-9]{32}$/.test(requestId || '') ||
      confirmation !== 'MANUALLY_VERIFIED_NO_INFLIGHT_WRITE' || typeof caseId !== 'string' || !caseId.trim() || caseId.length > 120 ||
      typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 120) throw Error('InvalidReview');
  const root = db.collection('ship_construction').doc(createHash('sha256').update(owner).digest('hex'));
  const intent = root.collection('requests').doc(requestId);
  return db.runTransaction(async tx => {
    const [rootSnapshot, intentSnapshot] = await Promise.all([tx.get(root), tx.get(intent)]);
    if (!rootSnapshot.exists || rootSnapshot.data()?.activeRequestId !== requestId || !intentSnapshot.exists) throw Error('ReviewConflict');
    const record = intentSnapshot.data();
    if (record?.state !== 'provisioning' || record?.assetWriteState !== 'sending' || record?.plan?.owner !== owner ||
        record?.plan?.request?.IdempotencyId !== `ship-build-${requestId}`) throw Error('ReviewConflict');
    tx.update(intent, { assetWriteState: 'not_started', provisionUntil: 0,
      provisionReview: { caseId: caseId.trim(), reviewer: reviewer.trim(), reviewedAtMs: Date.now() } });
    return { state: 'ready', requestId };
  });
}
module.exports = { resolveReviewedBuild, resolveReviewedProvision };

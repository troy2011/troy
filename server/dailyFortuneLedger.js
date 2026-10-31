'use strict';

const { createHash, randomUUID } = require('node:crypto');
const LEASE_MS = 120000;

// Firestore serializes claims; it cannot atomically commit PlayFab writes.
// A started write with an unknown outcome is deliberately never resent.
function createDailyFortuneLedger(db) {
    if (!db || typeof db.runTransaction !== 'function') throw Error('FortuneLedgerUnavailable');
    function refs(player, day) {
        const id = createHash('sha256').update(String(player).trim().toUpperCase()).digest('hex');
        return { player: db.collection('daily_fortune_players').doc(id), claim: db.collection('daily_fortune_claims').doc(`${id}_${day}`) };
    }
    const data = snapshot => snapshot.exists ? snapshot.data() : null;
    const view = claim => claim?.state === 'complete'
        ? { state: 'complete', result: claim.plan.result, dailyBountyReward: claim.dailyBountyReward || null, legacyBountyUnverified: !!claim.legacyBountyUnverified }
        : claim?.completed?.fortune_record
            ? { state: 'core_complete', result: claim.plan.result, bountyPending: true }
        : claim ? { state: 'pending' } : { state: 'not_started' };
    async function transaction(player, day, fn) {
        const ref = refs(player, day);
        return db.runTransaction(async tx => {
            const [claim, lock] = await Promise.all([tx.get(ref.claim), tx.get(ref.player)]);
            return fn(tx, ref, data(claim), data(lock));
        });
    }
    function owned(claim, lock, owner, day) {
        if (!claim || !lock || claim.owner !== owner || lock.owner !== owner || lock.activeDay !== day) throw Error('FortuneReservationLost');
    }
    return {
        status(player, day) {
            return transaction(player, day, async (tx, _ref, claim, lock) => {
                const earlierDay = lock?.activeDay || lock?.recoveredDay;
                if (earlierDay && earlierDay !== day) {
                    const parsedDay = Date.parse(`${earlierDay}T00:00:00.000Z`);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(earlierDay) || !Number.isFinite(parsedDay)
                        || new Date(parsedDay).toISOString().slice(0, 10) !== earlierDay || earlierDay > day) throw Error('FortuneLedgerInvalid');
                    const earlier = data(await tx.get(refs(player, earlierDay).claim));
                    if (!earlier) throw Error('FortuneLedgerInvalid');
                    if (lock.activeDay) return { state: 'pending', pendingDay: earlierDay };
                    if (earlier.state !== 'complete') throw Error('FortuneLedgerInvalid');
                    return { ...view(earlier), state: 'recovered', recoveryDay: earlierDay };
                }
                if (!claim && lock?.activeDay) return { state: 'pending', pendingDay: lock.activeDay };
                return view(claim);
            });
        },
        acquire(player, day, legacyResult, legacyBounty, requireExisting = false) {
            const owner = randomUUID(), now = Date.now();
            return transaction(player, day, (tx, ref, claim, lock) => {
                if (claim?.state === 'complete') return view(claim);
                if (lock?.recoveredDay && lock.recoveredDay !== day) return { state: 'pending' };
                if (lock?.activeDay && lock.activeDay !== day) return { state: 'pending' };
                if (!claim && lock?.activeDay) return { state: 'pending' };
                if (!claim && requireExisting) return { state: 'pending' };
                if (claim?.runningStep || (claim && Number(claim.leaseUntil) > now)) return view(claim);
                if (!claim && legacyResult) {
                    const adopted = { state: 'complete', day, plan: { result: legacyResult }, dailyBountyReward: legacyBounty || null, legacyBountyUnverified: !legacyBounty };
                    tx.create(ref.claim, adopted);
                    return view(adopted);
                }
                const next = claim ? { ...claim, owner, leaseUntil: now + LEASE_MS } : {
                    state: 'preparing', day, owner, leaseUntil: now + LEASE_MS, completed: {}, runningStep: null
                };
                if (claim) tx.set(ref.claim, next); else tx.create(ref.claim, next);
                tx.set(ref.player, { activeDay: day, owner }, { merge: true });
                return { state: 'acquired', owner, claim: next };
            });
        },
        savePlan(player, day, owner, plan) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                owned(claim, lock, owner, day);
                if (claim.plan || claim.runningStep || claim.leaseUntil < Date.now()) throw Error('FortuneReservationLost');
                tx.update(ref.claim, { state: 'applying', plan, leaseUntil: Date.now() + LEASE_MS });
            });
        },
        saveBountyPlan(player, day, owner, bountyPlan) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                owned(claim, lock, owner, day);
                if (claim.runningStep || claim.leaseUntil < Date.now()) throw Error('FortuneReservationLost');
                if (claim.bountyPlan) return claim.bountyPlan;
                tx.update(ref.claim, { bountyPlan, leaseUntil: Date.now() + LEASE_MS });
                return bountyPlan;
            });
        },
        saveBountyBasis(player, day, owner, basis) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                owned(claim, lock, owner, day);
                if (claim.runningStep || claim.leaseUntil < Date.now()) throw Error('FortuneReservationLost');
                if (claim.bountyBasis) return claim.bountyBasis;
                tx.update(ref.claim, { bountyBasis: basis, leaseUntil: Date.now() + LEASE_MS });
                return basis;
            });
        },
        startStep(player, day, owner, step) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                owned(claim, lock, owner, day);
                if (claim.leaseUntil < Date.now() || claim.runningStep) throw Error('FortuneReservationLost');
                if (claim.completed?.[step]) return false;
                tx.update(ref.claim, { runningStep: step, leaseUntil: Date.now() + LEASE_MS });
                return true;
            });
        },
        finishStep(player, day, owner, step) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                owned(claim, lock, owner, day);
                if (claim.runningStep !== step) throw Error('FortuneReservationLost');
                tx.update(ref.claim, { runningStep: null, completed: { ...claim.completed, [step]: true }, leaseUntil: Date.now() + LEASE_MS });
            });
        },
        finish(player, day, owner, bounty, recovered = false) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                owned(claim, lock, owner, day);
                if (claim.runningStep || !claim.completed?.fortune_record || !claim.completed?.bounty_record) throw Error('FortuneIncomplete');
                tx.update(ref.claim, { state: 'complete', dailyBountyReward: bounty, completedAt: Date.now() });
                tx.set(ref.player, { activeDay: null, owner: null, recoveredDay: recovered ? day : null }, { merge: true });
            });
        },
        acknowledgeRecovery(player, day) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                if (!lock?.recoveredDay) return;
                if (lock.recoveredDay !== day || lock.activeDay || claim?.state !== 'complete') throw Error('FortuneRecoveryMismatch');
                tx.set(ref.player, { recoveredDay: null }, { merge: true });
            });
        },
        release(player, day, owner) {
            return transaction(player, day, (tx, ref, claim, lock) => {
                if (claim?.owner !== owner || lock?.owner !== owner || claim.runningStep) return;
                tx.update(ref.claim, { leaseUntil: 0 });
            });
        }
    };
}

module.exports = { createDailyFortuneLedger };

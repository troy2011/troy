'use strict';

const { createHash } = require('node:crypto');

// One Firestore claim per player and day is the only guard against a second draw.
// Rewards are sent once after the claim; a reward whose send fails is not retried.
function createDailyFortuneLedger(db) {
    if (!db || typeof db.runTransaction !== 'function') throw Error('FortuneLedgerUnavailable');
    function claimRef(player, day) {
        const id = createHash('sha256').update(String(player).trim().toUpperCase()).digest('hex');
        return db.collection('daily_fortune_claims').doc(`${id}_${day}`);
    }
    const data = snapshot => snapshot.exists ? snapshot.data() : null;
    // Claims written by the earlier step-by-step ledger count as claimed once they hold a result.
    const view = claim => claim?.plan?.result
        ? { state: 'complete', result: claim.plan.result, dailyBountyReward: claim.dailyBountyReward || null, legacyBountyUnverified: !!claim.legacyBountyUnverified }
        : { state: 'not_started' };
    return {
        status(player, day) {
            return db.runTransaction(async tx => view(data(await tx.get(claimRef(player, day)))));
        },
        claim(player, day, result) {
            const ref = claimRef(player, day);
            return db.runTransaction(async tx => {
                const existing = view(data(await tx.get(ref)));
                if (existing.state === 'complete') return existing;
                tx.set(ref, { state: 'complete', day, plan: { result }, dailyBountyReward: null, completedAt: Date.now() });
                return { state: 'claimed' };
            });
        },
        saveBounty(player, day, bounty) {
            const ref = claimRef(player, day);
            return db.runTransaction(async tx => {
                if (data(await tx.get(ref))) tx.update(ref, { dailyBountyReward: bounty });
            });
        }
    };
}

module.exports = { createDailyFortuneLedger };

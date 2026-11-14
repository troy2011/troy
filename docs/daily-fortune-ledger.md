# Daily fortune claim

The authenticated draw API guards the daily fortune with one Firestore document, `daily_fortune_claims/{sha256(normalized PlayFab ID)}_{JST day}`. This document is the source of truth for "has this player drawn today" and for the day's result. The PlayFab records `DailyTarotFortune`, `DailyTarotCardFragmentsV1` and `DailyBountyGachaReward`, the Economy inventory and the statistics are written as before.

## Draw

1. The server picks the card and builds the result. A reversed major arcana reads the fragment record first.
2. One transaction creates the claim with the result. If a claim with a result already exists, the stored result is returned with `alreadyClaimed: true` and nothing is granted.
3. After the claim, the rewards are sent together: the card or G grant (Economy V2, with the per-day idempotency ID), the fragment record, the fortune record, and the ranking bonus (contribution version, leaderboard read, bonus grants, bonus record).
4. The response is sent. The balance read and the `ps_ranking` update for a G reward run after the response.

The response no longer carries `balance`; the client refreshes the inventory instead.

## Trade-off chosen for speed

The earlier step-by-step journal (plan, per-step start and finish marks, lease, prior-day recovery, `/api/tarot-fortune-ack-recovery`) was removed on the owner's instruction to favour speed. A draw now waits for about four sequential service calls instead of about twenty.

The cost: a reward whose send fails after the claim is logged on the server (`[tarot-fortune-draw] <name> was not delivered`) and is not retried. The player keeps the day's result but may miss that reward, and the result screen still names it. A failed ranking read skips that day's ranking bonus.

The claim still prevents a second draw on the same day from any device or browser.

## Status

`/api/tarot-fortune-status` reads the claim only. It returns the stored result, or `canDraw: true`. It never draws or resumes anything, and no longer returns `state: pending` or `state: recovered`.

## Compatibility and rollback

- Claims written by the earlier ledger count as claimed once they hold `plan.result`; one without a result is replaced by the next draw. `daily_fortune_players` is no longer read or written.
- New claims use the same shape as a completed claim of the earlier ledger (`state: complete`, `plan.result`, `dailyBountyReward`), so reverting the server still treats them as claimed.
- The client keeps a display-only copy of today's result in `localStorage` (`troy:fortune-result:v1:{PlayFab ID}`) to reopen the result without a request. It grants nothing and does not decide whether a draw is allowed.

Real PlayFab and Firestore behaviour of this flow has not been exercised against production; it is covered by `tests/daily-fortune-ledger.test.cjs` with stubbed services.

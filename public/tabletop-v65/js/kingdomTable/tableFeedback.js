const OWN_ACTIONS = new Set(['play', 'pass', 'trash', 'give', 'deathSwapComplete']);
export function updateAcquisition(previous, hand, me, events, over = false) {
    const owned = new Set(hand.map(card => card.id));
    const acquisition = events.findLast(event =>
        ((event.type === 'draw' || event.type === 'exchange') && event.by === me)
        || ((event.type === 'give' || event.type === 'devilCardTransfer') && event.to === me));
    const added = previous?.owned && acquisition && hand.filter(card => !previous.owned.has(card.id));
    const retained = !events.some(event => event.by === me && OWN_ACTIONS.has(event.type))
        && owned.has(previous?.id) ? previous : null;
    const fresh = added?.length === 1 ? { id: added[0].id, source: acquisition.type } : retained;
    return { owned, id: over ? null : fresh?.id ?? null, source: over ? null : fresh?.source ?? null };
}

export function updateTurns(previous, round, me, events) {
    const own = round.phase === 'play' && round.turn === me;
    const counts = round.players.map(player => player.hand.length);
    const ownAction = events.findLastIndex(event => event.by === me && ['play', 'pass', 'cede'].includes(event.type));
    const returnedInBatch = ownAction >= 0 && events.some((event, position) => position > ownAction
        && event.by !== me && ['pass', 'play', 'cede'].includes(event.type));
    const ownEntered = !!(own && events.length && (previous ? !previous.own || returnedInBatch
        : events.some(event => ['deal', 'start'].includes(event.type))));
    const lastSeats = !previous || !events.length || round.phase === 'over' ? []
        : counts.flatMap((count, seat) => count === 1 && previous.counts[seat] > 1 ? [seat] : []);
    return { state: { own, counts }, ownEntered, lastSeats };
}

// A snapshot of the current seat order, not a prediction of card effects.
export function turnOrder(round) {
    const count = round?.players?.length;
    const current = round?.turn;
    if (round?.phase !== 'play' || !Number.isInteger(current) || current < 0 || current >= count || count < 2) return null;
    const direction = round.direction === -1 ? -1 : 1;
    const passed = new Set(round.passed);
    for (let step = 1; step < count; step += 1) {
        const seat = (current + direction * step + count) % count;
        if (!passed.has(seat)) return { current, next: seat };
    }
    return { current, next: null };
}

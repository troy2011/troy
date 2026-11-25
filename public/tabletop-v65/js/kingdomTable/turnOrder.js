// Only actual plays have a field owner; the first flipped lead card does not.
export function tableSeatCues(round) {
    const count = round?.players?.length ?? 0;
    const valid = (seat) => Number.isInteger(seat) && seat >= 0 && seat < count;
    const current = round?.phase === 'play' && valid(round.turn) ? round.turn : null;
    const top = round?.field?.plays?.at(-1);
    const owner = !top?.start && top?.cards?.length && valid(top.by) ? top.by : null;
    return { current, owner };
}

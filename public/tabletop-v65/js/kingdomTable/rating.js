// Shared calculation only. Persisting a rated result is the server's responsibility.
export const RATING_RULES = Object.freeze({ initial: 1000, minimum: 100, maximum: 3000, kFactor: 32, scale: 400 });
// Relative strengths fitted from 4,000 rotating-seat matches, with the original AI at 1000.
export const CPU_RATING_ANCHORS = Object.freeze([870, 1000, 1090, 1140]);

export function normalizeRating(value = RATING_RULES.initial) {
    if (!Number.isFinite(value)) throw new RangeError('Rating must be finite');
    return Math.max(RATING_RULES.minimum, Math.min(RATING_RULES.maximum, Math.round(value)));
}

export function expectedScore(playerRating, opponentRating) {
    return 1 / (1 + 10 ** ((normalizeRating(opponentRating) - normalizeRating(playerRating)) / RATING_RULES.scale));
}

// Compare the final chips against each opponent; a tie counts as half a win.
// Averaging keeps a three-seat table and a four-seat table on the same scale.
export function calculateRating({ playerRating, opponentRatings, playerChips, opponentChips }) {
    const previous = normalizeRating(playerRating);
    if (!Array.isArray(opponentRatings) || !Array.isArray(opponentChips)
        || ![2, 3].includes(opponentRatings.length) || opponentRatings.length !== opponentChips.length) {
        throw new RangeError('Expected two or three opponents');
    }
    if (![playerChips, ...opponentChips].every(value => Number.isSafeInteger(value) && value >= 0)) {
        throw new RangeError('Final chips must be nonnegative integers');
    }
    const comparisons = opponentRatings.map((rating, index) => ({
        rating: normalizeRating(rating),
        actual: playerChips === opponentChips[index] ? 0.5 : playerChips > opponentChips[index] ? 1 : 0,
        expected: expectedScore(previous, rating)
    }));
    const average = key => comparisons.reduce((sum, comparison) => sum + comparison[key], 0) / comparisons.length;
    const actual = average('actual'), expected = average('expected');
    const rating = normalizeRating(previous + RATING_RULES.kFactor * (actual - expected));
    return { previous, rating, change: rating - previous, actual, expected, comparisons };
}

export function cpuLevel(rating) {
    const value = normalizeRating(rating);
    let lower = 0;
    while (lower < CPU_RATING_ANCHORS.length - 1 && value >= CPU_RATING_ANCHORS[lower + 1]) lower += 1;
    if (lower === CPU_RATING_ANCHORS.length - 1) return { lower, upper: lower, blend: 0 };
    const blend = Math.max(0, (value - CPU_RATING_ANCHORS[lower]) / (CPU_RATING_ANCHORS[lower + 1] - CPU_RATING_ANCHORS[lower]));
    return { lower, upper: lower + 1, blend };
}

export function makeOpponents(playerRating, seats, random) {
    if (![3, 4].includes(seats)) throw new RangeError('Expected three or four seats');
    const offsets = seats === 3 ? [-80, 80] : [-120, 0, 120];
    const ratings = offsets.map(offset => Math.max(CPU_RATING_ANCHORS[0],
        Math.min(CPU_RATING_ANCHORS.at(-1), normalizeRating(playerRating) + offset)));
    for (let index = ratings.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [ratings[index], ratings[other]] = [ratings[other], ratings[index]];
    }
    return ratings;
}

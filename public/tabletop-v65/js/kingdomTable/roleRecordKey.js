import { roleRank } from './rules.js?v=suit-opposition-v1';

export const PIECE_OF_EIGHT_KEY = 'piece-of-eight';
export const PIECE_OF_EIGHT_NAME = 'ピース・オブ・エイト';

// Only trusted engine events may award the opening role.
export function openingRoleKey(event) {
    return event?.type === 'win' && (event.openingWin === 'odd' || event.openingWin === 'even')
        ? PIECE_OF_EIGHT_KEY : null;
}
export function openingRoleName(parity) {
    return PIECE_OF_EIGHT_NAME + (parity === 'odd' ? '（奇数揃い）' : parity === 'even' ? '（偶数揃い）' : '');
}

const HIGH_KEYS = new Set(['straight', 'flush', 'fullHouse', 'elemental', 'five', 'world', 'highElemental']);

// IDs are stable for practice saves and server history, independent of displayed names.
export function roleRecordKey(role) {
    if (!role || !Array.isArray(role.tb)) return null;
    if (role.high === 'quad') return 'elemental'; // Old saved role before the rename.
    if (HIGH_KEYS.has(role.high)) return role.high;
    const rank = roleRank(role);
    return Number.isInteger(rank) && rank >= 1 && rank <= 8 ? String(rank) : null;
}

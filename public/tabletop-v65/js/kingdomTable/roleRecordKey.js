import { roleRank } from './rules.js?v=suit-opposition-v1-finish-han-v1';

export const JUSTICE_EXECUTION_KEY = 'justice-execution';
export const JUSTICE_EXECUTION_NAME = '正義執行';
export const TEMPERANCE_CLEAR_KEY = 'temperance-clear';
export const TEMPERANCE_CLEAR_NAME = '清めの盃';
export const TRIPLET_KEY = 'triplet';
export const TRIPLET_NAME = 'スリーカード';
export const FIVE_CARD_FINISH_KEY = 'five-card-finish';
export const FIVE_CARD_FINISH_NAME = '役上がり';
export function namedHanRoleKey(event) {
    if (event?.type === 'justiceHan') return JUSTICE_EXECUTION_KEY;
    if (event?.type === 'temperanceHan') return TEMPERANCE_CLEAR_KEY;
    if (event?.type === 'tripletHan') return TRIPLET_KEY;
    if (event?.type === 'fiveCardFinishHan') return FIVE_CARD_FINISH_KEY;
    return null;
}

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

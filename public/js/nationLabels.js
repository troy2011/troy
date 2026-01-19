// c:/Users/ikeda/my-liff-app/public/js/nationLabels.js
// Nation name helper (UI labels).

export const NATION_LABELS = {
    fire: '火の国',
    water: '水の国',
    wind: '風の国',
    earth: '地の国',
    neutral: '中立'
};

export const NATION_MARKS = {
    fire: '🔥',
    water: '💧',
    wind: '🌪️',
    earth: '🪨',
    neutral: '⭕'
};

const NATION_ALIASES = {
    human: 'fire',
    goblin: 'water',
    orc: 'earth',
    elf: 'wind'
};

function normalizeNationKey(nationKey) {
    const raw = String(nationKey || '').trim().toLowerCase();
    if (!raw) return '';
    if (NATION_LABELS[raw]) return raw;
    if (NATION_ALIASES[raw]) return NATION_ALIASES[raw];
    const match = /^nation_([a-z]+)_island$/.exec(raw);
    if (match && NATION_LABELS[match[1]]) return match[1];
    return raw;
}

export function getNationLabel(nationKey) {
    const key = normalizeNationKey(nationKey);
    return NATION_LABELS[key] || '';
}

export function getNationMark(nationKey) {
    const key = normalizeNationKey(nationKey);
    return NATION_MARKS[key] || key;
}

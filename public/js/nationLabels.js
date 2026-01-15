// c:/Users/ikeda/my-liff-app/public/js/nationLabels.js
// Nation name helper (UI labels).

export const NATION_LABELS = {
    fire: '火の国',
    water: '水の国',
    wind: '風の国',
    earth: '地の国',
    neutral: '中立'
};

export function getNationLabel(nationKey) {
    const key = String(nationKey || '').trim().toLowerCase();
    return NATION_LABELS[key] || '';
}

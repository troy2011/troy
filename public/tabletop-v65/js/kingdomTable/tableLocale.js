import { tableEnglish } from './tableEnglish.js?v=6';
const preferenceKey = 'tarot-kingdom:language';
const supported = new Set(['auto', 'ja', 'en']);
const english = Object.freeze({
    'ストレート': 'Straight', 'フラッシュ': 'Flush', 'フルハウス': 'Full House',
    'フォーカード': 'Four of a Kind', 'ザ・ワールド': 'The World',
    'ストレートフラッシュ': 'Straight Flush', 'ファイブカード': 'Five of a Kind',
    'ロイヤルストレートフラッシュ': 'Royal Straight Flush',
    'ハイストレート': 'High Straight', 'ハイフラッシュ': 'High Flush',
    'ハイフルハウス': 'High Full House', 'エレメンタル': 'Elemental',
    'ハイエレメンタル': 'High Elemental', 'ハイファイブカード': 'High Five of a Kind',
    'ハイワールド': 'High World', '正義執行': 'Justice Served', '清めの盃': 'Purification', 'スリーカード': 'Three of a Kind', '役上がり': 'Five-Card Finish',
    'ピース・オブ・エイト': 'Piece of Eight', 'ピース・オブ・エイト（奇数揃い）': 'Piece of Eight (Odd)',
    'ピース・オブ・エイト（偶数揃い）': 'Piece of Eight (Even)',
    '大札流し': 'Major Arcana Clear', '切札': 'Final Trump', '親': 'Dealer',
    '上がり': 'Going Out', '役の加点': 'Role Bonus', '悪魔': 'Devil Transfer'
});
let preference = null;

export function resolveTableLanguage(choice, preferred) {
    if (choice === 'ja' || choice === 'en') return choice;
    return typeof preferred !== 'string' || !preferred || /^ja(?:[-_]|$)/i.test(preferred) ? 'ja' : 'en';
}

export function getTableLanguage() {
    if (preference) return preference;
    const route = new URLSearchParams(globalThis.location?.search).get('lang');
    if (route === 'ja' || route === 'en') return route;
    let saved;
    try { saved = globalThis.localStorage?.getItem(preferenceKey); } catch { /* Unavailable in some embedded browsers. */ }
    return supported.has(saved) ? saved : 'auto';
}

export function setTableLanguage(value) {
    if (!supported.has(value)) return false;
    preference = value;
    try {
        const url = new URL(globalThis.location.href);
        if (value === 'auto') url.searchParams.delete('lang');
        else url.searchParams.set('lang', value);
        globalThis.history.replaceState(globalThis.history.state, '', url);
    } catch { /* URL may be unavailable in tests or embedded browsers. */ }
    try { globalThis.localStorage?.setItem(preferenceKey, value); } catch { /* Still apply in this tab. */ }
    return true;
}

export const activeTableLanguage = () => resolveTableLanguage(getTableLanguage(), typeof document === 'undefined' ? undefined : (globalThis.navigator?.languages?.[0] || globalThis.navigator?.language));

export function localizedLabel(label, language = activeTableLanguage()) {
    return language === 'en' && Object.hasOwn(english, label) ? english[label] : label;
}

export const formatScoreHan = (han, language = activeTableLanguage()) => han + (language === 'en' ? ' han' : '翻');


const owns = (dictionary, key) => Object.hasOwn(dictionary, key);
export function translateTable(value, language = activeTableLanguage()) {
    if (language !== 'en' || typeof value !== 'string') return value;
    if (owns(tableEnglish, value)) return tableEnglish[value];
    if (owns(english, value)) return english[value];
    const room = /^参加中の部屋 (\d{6}) に戻ってください。$/.exec(value);
    if (room) return 'Return to room ' + room[1] + ', which you already joined.';
    const round = /^第(\d+)局(?: (\d+)本場)?$/.exec(value);
    if (round) return 'Round ' + round[1] + (round[2] ? ' · repeat ' + round[2] : '');
    const count = /^場と同じ(\d+)枚で出してください$/.exec(value);
    if (count) return 'Match the ' + count[1] + ' cards on the table.';
    const ace = /^この大札では小札Aに返せません（(.+)は大札(\d+)）。$/.exec(value);
    if (ace) return 'This Major Arcana cannot reply to that Ace (' + translateTable(ace[1], 'en') + ': Major Arcana ' + ace[2] + ').';
    return value;
}
export function translateTableTemplate(parts, ...values) {
    const key = parts.join('♦');
    if (activeTableLanguage() === 'en' && owns(tableEnglish, key)) {
        let index = 0;
        return tableEnglish[key].replaceAll('♦', () => String(values[index++]));
    }
    return parts.reduce((result, part, index) => result + (index ? String(values[index-1]) : '') + part, '');
}

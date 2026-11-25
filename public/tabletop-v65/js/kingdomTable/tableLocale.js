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
    'ハイワールド': 'High World', '正義執行': 'Justice Served', '清めの杯': 'Clearance',
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
    let saved;
    try { saved = globalThis.localStorage?.getItem(preferenceKey); } catch { /* Unavailable in some embedded browsers. */ }
    return supported.has(saved) ? saved : 'auto';
}

export function setTableLanguage(value) {
    if (!supported.has(value)) return false;
    preference = value;
    try { globalThis.localStorage?.setItem(preferenceKey, value); } catch { /* Still apply in this tab. */ }
    return true;
}

export const activeTableLanguage = () => resolveTableLanguage(getTableLanguage(), globalThis.navigator?.languages?.[0] || globalThis.navigator?.language);

export function localizedLabel(label, language = activeTableLanguage()) {
    return language === 'en' && Object.hasOwn(english, label) ? english[label] : label;
}

export const formatScoreHan = (han, language = activeTableLanguage()) => han + (language === 'en' ? ' han' : '翻');

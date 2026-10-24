import { createPirateTarotImage } from './pirateTarotArtwork.js?v=20261024-pirate-v8';

const $ = (id) => document.getElementById(id);
const decks = [['all', 'すべて'], ['major', '大アルカナ'], ['wand', 'ワンド'], ['cup', 'カップ'], ['sword', 'ソード'], ['pentacle', 'ペンタクル（金貨）']];
let cards = [];
let selected = null;
let orientation = '';
let deck = 'all';
let phase = 'picker';
let loading = false;
const normalize = (text) => String(text).normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/金貨/g, 'ペンタクル').replace(/剣/g, 'ソード').replace(/聖杯/g, 'カップ').replace(/棒/g, 'ワンド');

function renderCards() {
    const query = normalize($('cardSearch').value);
    const visible = cards.filter((card) => {
        const rank = ({ page: 11, knight: 12, queen: 13, king: 14 })[card.rankId] || card.rankId || card.number;
        return (deck === 'all' || card.deckId === deck) && normalize(`${card.search} ${card.label} ${rank} ${card.label.split(' ')[0]}${rank}`).includes(query);
    });
    $('cardGrid').replaceChildren();
    for (const card of visible) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'card-choice';
        button.dataset.cardId = card.id;
        button.setAttribute('aria-pressed', String(selected?.id === card.id));
        button.setAttribute('aria-label', card.kind === 'major' ? `${card.number} ${card.label}` : card.label);
        const image = createPirateTarotImage(card.id, { thumbnail: true });
        const name = document.createElement('strong');
        name.textContent = card.label;
        const number = document.createElement('span');
        number.textContent = card.kind === 'major' ? `No. ${card.number}` : `${decks.find(([id]) => id === card.deckId)[1]} · ${({ page: 11, knight: 12, queen: 13, king: 14 })[card.rankId] || card.rankId}`;
        button.append(image, name, number);
        button.addEventListener('click', () => selectCard(card));
        $('cardGrid').append(button);
    }
    $('searchCount').textContent = `${visible.length}枚を表示`;
    $('emptySearch').hidden = visible.length > 0;
}

function selectCard(card) {
    selected = card;
    orientation = '';
    document.querySelectorAll('[name="orientation"]').forEach((radio) => { radio.checked = false; });
    $('selection').hidden = false;
    $('selectedLabel').textContent = card.label;
    $('selectedArt').replaceChildren(createPirateTarotImage(card.id, { label: card.label, eager: true }));
    $('showReading').disabled = true;
    document.querySelectorAll('#cardGrid button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.cardId === card.id)));
    $('selectionHeading').focus();
    $('selection').scrollIntoView({ block: 'start' });
}

function showPicker(focus = false) {
    phase = 'picker';
    $('result').hidden = true;
    $('picker').hidden = false;
    $('selection').hidden = !selected;
    if (selected) {
        $('selectedLabel').textContent = selected.label;
        $('selectedArt').replaceChildren(createPirateTarotImage(selected.id, { label: selected.label, reversed: orientation === 'reversed', eager: true }));
        document.querySelectorAll('[name="orientation"]').forEach((radio) => { radio.checked = radio.value === orientation; });
        $('showReading').disabled = !orientation;
    }
    if (focus) {
        $('pickerHeading').focus();
        $('picker').scrollIntoView({ block: 'start' });
    }
}

function showResult(id, direction, push = false) {
    const card = cards.find((entry) => entry.id === id);
    if (!card || !['upright', 'reversed'].includes(direction)) return showPicker();
    selected = card;
    orientation = direction;
    phase = 'result';
    const meaning = card.meanings[direction];
    $('resultArt').replaceChildren(createPirateTarotImage(id, { label: card.label, reversed: direction === 'reversed', eager: true }));
    $('resultLabel').textContent = card.label;
    $('resultDirection').textContent = direction === 'upright' ? '正位置' : '逆位置';
    for (const key of ['keywords', 'point', 'action', 'caution']) $('result' + key[0].toUpperCase() + key.slice(1)).textContent = meaning[key];
    $('picker').hidden = true;
    $('selection').hidden = true;
    $('result').hidden = false;
    if (push) history.pushState({ pirateTarot: true, view: 'result', cardId: id, orientation: direction }, '', location.pathname);
    $('resultHeading').focus();
    $('result').scrollIntoView({ block: 'start' });
}

async function load() {
    if (loading) return;
    loading = true;
    $('retryLoad').hidden = true;
    $('loadStatus').textContent = 'カードを準備しています…';
    try {
        const response = await fetch('/data/pirate-self-readings.json', { credentials: 'omit' });
        if (!response.ok) throw new Error('Meanings unavailable');
        const data = await response.json();
        if (data.cards?.length !== 78 || new Set(data.cards.map((card) => card.id)).size !== 78) throw new Error('Incomplete deck');
        cards = data.cards;
        renderCards();
        $('cardCount').textContent = '全78枚';
        $('loadStatus').textContent = '';
        if (history.state?.pirateTarot && history.state.view === 'result') showResult(history.state.cardId, history.state.orientation);
        else showPicker();
    } catch {
        $('loadStatus').textContent = 'カードを読み込めませんでした。接続を確認して、もう一度お試しください。';
        $('retryLoad').hidden = false;
    } finally { loading = false; }
}

for (const [id, label] of decks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.deck = id;
    button.setAttribute('aria-pressed', String(id === deck));
    button.addEventListener('click', () => {
        deck = id;
        document.querySelectorAll('[data-deck]').forEach((entry) => entry.setAttribute('aria-pressed', String(entry.dataset.deck === id)));
        renderCards();
    });
    $('deckFilters').append(button);
}
$('cardSearch').addEventListener('input', renderCards);
$('clearSearch').addEventListener('click', () => {
    $('cardSearch').value = '';
    deck = 'all';
    document.querySelectorAll('[data-deck]').forEach((entry) => entry.setAttribute('aria-pressed', String(entry.dataset.deck === deck)));
    renderCards();
    $('cardSearch').focus();
});
document.querySelectorAll('[name="orientation"]').forEach((radio) => radio.addEventListener('change', () => {
    orientation = radio.value;
    $('selectedArt').querySelector('img')?.classList.toggle('is-reversed', orientation === 'reversed');
    $('showReading').disabled = !selected;
}));
$('showReading').addEventListener('click', () => {
    if (phase === 'picker' && selected && orientation) showResult(selected.id, orientation, true);
});
$('changeCard').addEventListener('click', () => showPicker(true));
$('readAgain').addEventListener('click', () => {
    if (phase !== 'result') return;
    phase = 'leaving';
    if (history.state?.pirateTarot && history.state.view === 'result') history.back();
    else showPicker(true);
});
window.addEventListener('popstate', () => {
    if (!cards.length) return;
    if (history.state?.pirateTarot && history.state.view === 'result') showResult(history.state.cardId, history.state.orientation);
    else showPicker(true);
});
$('retryLoad').addEventListener('click', load);
// No identity, questions, readings, or purchaser entitlements are persisted.
load();

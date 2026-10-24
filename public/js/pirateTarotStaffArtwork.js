import { createPirateTarotImage } from './pirateTarotArtwork.js?v=20261025-pirate-delivery-v2';

// Add artwork without changing the staff reading engine, customer list, or send flow.
const grid = document.getElementById('tarotCardGrid');
function decorateGrid() {
    grid?.querySelectorAll('button[data-card-id]').forEach((button) => {
        if (button.querySelector('.pirate-tarot-artwork')) return;
        const image = createPirateTarotImage(button.dataset.cardId, { thumbnail: true });
        if (image) button.prepend(image);
    });
}
const gallery = document.createElement('div');
gallery.className = 'pirate-tarot-staff-gallery';
gallery.setAttribute('aria-label', '選択したカードの原画');
document.querySelector('.tarot-reading-result-wrap')?.before(gallery);
function decorateSelection() {
    const state = window.TarotReadingApp?.getState();
    if (!state) return;
    const cards = window.TarotReadingApp.allCards;
    const selections = state.spreadMode === 'triple' ? state.tripleSelections.filter(Boolean) : [{ cardId: state.selectedCardId, orientation: state.orientation }];
    gallery.replaceChildren();
    selections.forEach((selection) => {
        const card = cards.find((entry) => entry.id === selection.cardId);
        const image = createPirateTarotImage(selection.cardId, { label: card?.label, reversed: selection.orientation === 'reversed', eager: true });
        if (image) gallery.append(image);
    });
    gallery.hidden = !gallery.childElementCount;
}
if (grid) new MutationObserver(decorateGrid).observe(grid, { childList: true });
for (const id of ['tarotSelectedName', 'tarotTriplePreview']) {
    const node = document.getElementById(id);
    if (node) new MutationObserver(decorateSelection).observe(node, { childList: true, subtree: true });
}
decorateGrid();
decorateSelection();

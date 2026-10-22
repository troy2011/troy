const SUITS = { wand: 'wand', wands: 'wand', cup: 'cup', cups: 'cup', sword: 'sword', swords: 'sword', pentacle: 'pentacle', pentacles: 'pentacle', coins: 'pentacle' };
const FACES = { PAGE: 'page', P: 'page', 'ペイジ': 'page', KNIGHT: 'knight', N: 'knight', 'ナイト': 'knight', QUEEN: 'queen', Q: 'queen', 'クイーン': 'queen', KING: 'king', K: 'king', 'キング': 'king', 11: 'page', 12: 'knight', 13: 'queen', 14: 'king' };

export function getPirateTarotCardId(item) {
    if (typeof item === 'string') return /^(major-(?:[0-9]|1[0-9]|2[01])|(?:wand|cup|sword|pentacle)-(?:[1-9]|10|page|knight|queen|king))$/.test(item) ? item : null;
    const data = item?.customData || item || {};
    const category = data.Category;
    if (['TarotMajor', 'MajorArcana', 'TarotArcanaMajor'].includes(category)) {
        const value = data.ArcanaNumber ?? data.CardNumber;
        if (value === undefined || value === null || String(value).trim() === '') return null;
        return getPirateTarotCardId(`major-${Number(value)}`);
    }
    if (!['TarotMinor', 'MinorArcana', 'TarotArcanaMinor'].includes(category)) return null;
    const suit = SUITS[String(data.ArcanaSuit || data.Suit || '').trim().toLowerCase()];
    const rank = String(data.ArcanaRank || data.Rank || data.CardRank || data.CardNumber || '').trim();
    return getPirateTarotCardId(`${suit}-${FACES[rank.toUpperCase()] || Number(rank)}`);
}

export function createPirateTarotImage(cardInput, { label = '', thumbnail = false, reversed = false, eager = false } = {}) {
    const id = getPirateTarotCardId(cardInput);
    if (!id) return null;
    const image = document.createElement('img');
    image.className = 'pirate-tarot-artwork';
    image.src = `/assets/pirate-tarot/${thumbnail ? 'thumbs' : 'cards'}/${id}.webp`;
    image.alt = label ? `${label}の採用原画${reversed ? '（逆位置）' : ''}` : '';
    image.width = thumbnail ? 160 : 640;
    image.height = thumbnail ? 240 : 960;
    image.loading = eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.dataset.artworkCardId = id;
    image.classList.toggle('is-reversed', reversed);
    // Keep the surrounding card name and controls usable if an asset cannot load.
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    return image;
}

export function renderInventoryTarotArtwork(item, modal) {
    modal.querySelector('.pirate-tarot-inventory-art')?.remove();
    const image = createPirateTarotImage(item, { label: item?.name || '', eager: true });
    if (!image) return;
    const figure = document.createElement('figure');
    figure.className = 'pirate-tarot-inventory-art';
    figure.append(image);
    modal.querySelector('#itemDetailDescription')?.after(figure);
}


// Daily fortune returns a number/suit/major flag; catalog item IDs are not its identity.
export function getDailyTarotArtworkId(card) {
    if (!card || typeof card.isArcana !== 'boolean') return null;
    return getPirateTarotCardId({
        Category: card.isArcana ? 'TarotMajor' : 'TarotMinor',
        ArcanaNumber: card.number,
        ArcanaSuit: card.suit,
        ArcanaRank: card.number
    });
}

export function renderDailyTarotArtwork(card, host, { label = '', reversed = false } = {}) {
    host.querySelector('.pirate-tarot-artwork')?.remove();
    host.classList.remove('has-pirate-artwork');
    const image = createPirateTarotImage(getDailyTarotArtworkId(card), { label, reversed, eager: true });
    if (!image) return;
    host.classList.add('pirate-tarot-artwork-host');
    // Keep the existing sprite until the adopted image actually loads, including on failure.
    image.addEventListener('load', () => host.classList.add('has-pirate-artwork'), { once: true });
    host.append(image);
}

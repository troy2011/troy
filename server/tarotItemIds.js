const TAROT_MINOR_SUIT_ALIASES = Object.freeze({
    wand: 'wand',
    wands: 'wand',
    fire: 'wand',
    sword: 'sword',
    swords: 'sword',
    wind: 'sword',
    cup: 'cup',
    cups: 'cup',
    water: 'cup',
    pentacle: 'pentacle',
    pentacles: 'pentacle',
    coin: 'pentacle',
    coins: 'pentacle',
    earth: 'pentacle'
});

const TAROT_RANK_ALIASES = Object.freeze({
    a: 1,
    ace: 1,
    p: 11,
    page: 11,
    n: 12,
    knight: 12,
    q: 13,
    queen: 13,
    k: 14,
    king: 14
});

function getStoredTarotItemId(value) {
    if (value && typeof value === 'object') {
        return String(value.itemId || value.ItemId || value.id || value.Id || '').trim();
    }
    return String(value || '').trim();
}

function normalizeTarotRank(value) {
    const raw = String(value || '').trim().toLowerCase();
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        const rank = Math.floor(numeric);
        return rank >= 1 && rank <= 14 ? rank : null;
    }
    return TAROT_RANK_ALIASES[raw] || null;
}

function normalizeTarotCatalogFriendlyId(value) {
    const raw = getStoredTarotItemId(value);
    if (!raw) return '';

    const majorPatterns = [
        /^arcana[-_](\d{1,2})$/i,
        /^major[-_](\d{1,2})$/i,
        /^tarot[-_]major(?:[-_][a-z]+)?[-_](\d{1,2})$/i
    ];
    for (const pattern of majorPatterns) {
        const match = raw.match(pattern);
        if (!match) continue;
        const number = Math.floor(Number(match[1]));
        return number >= 0 && number <= 21 ? `arcana-${number}` : raw;
    }

    const minorPatterns = [
        /^minor[-_](wand|wands|sword|swords|cup|cups|pentacle|pentacles|coin|coins|fire|water|wind|earth)[-_](\d{1,2}|a|ace|p|page|n|knight|q|queen|k|king)$/i,
        /^tarot[-_]minor[-_](wand|wands|sword|swords|cup|cups|pentacle|pentacles|coin|coins|fire|water|wind|earth)[-_](\d{1,2}|a|ace|p|page|n|knight|q|queen|k|king)$/i,
        /^(wand|wands|sword|swords|cup|cups|pentacle|pentacles|coin|coins)[-_](\d{1,2}|a|ace|p|page|n|knight|q|queen|k|king)$/i
    ];
    for (const pattern of minorPatterns) {
        const match = raw.match(pattern);
        if (!match) continue;
        const suit = TAROT_MINOR_SUIT_ALIASES[String(match[1]).toLowerCase()];
        const rank = normalizeTarotRank(match[2]);
        return suit && rank ? `minor-${suit}-${rank}` : raw;
    }

    return raw;
}

function callItemResolver(resolveItemId, value) {
    if (typeof resolveItemId !== 'function' || !value) return value;
    try {
        return String(resolveItemId(value) || value).trim() || value;
    } catch {
        return value;
    }
}

function resolveTarotCatalogItemId(value, resolveItemId) {
    const raw = getStoredTarotItemId(value);
    if (!raw) return '';
    const friendlyId = normalizeTarotCatalogFriendlyId(raw);

    let resolved = callItemResolver(resolveItemId, friendlyId);
    if (resolved === friendlyId && raw !== friendlyId) {
        const rawResolved = callItemResolver(resolveItemId, raw);
        if (rawResolved !== raw) resolved = rawResolved;
    }

    const normalizedResolved = normalizeTarotCatalogFriendlyId(resolved);
    if (normalizedResolved !== resolved) {
        resolved = callItemResolver(resolveItemId, normalizedResolved);
    } else {
        resolved = callItemResolver(resolveItemId, resolved);
    }
    return resolved || friendlyId;
}

function getTarotItemIdAliases(value, resolveItemId) {
    const raw = getStoredTarotItemId(value);
    const aliases = new Set();
    if (!raw) return aliases;
    aliases.add(raw);
    aliases.add(normalizeTarotCatalogFriendlyId(raw));
    aliases.add(resolveTarotCatalogItemId(raw, resolveItemId));
    return new Set(Array.from(aliases).filter(Boolean));
}

function normalizeTarotCardLevelMap(cardLevels = {}, resolveItemId) {
    const source = cardLevels && typeof cardLevels === 'object' ? cardLevels : {};
    // Keep explicit current-ID values authoritative when old and new keys happen
    // to coexist during migration, then fill only missing aliases.
    const normalized = { ...source };
    Object.entries(source).forEach(([itemId, value]) => {
        getTarotItemIdAliases(itemId, resolveItemId).forEach((alias) => {
            if (!Object.prototype.hasOwnProperty.call(normalized, alias)) normalized[alias] = value;
        });
    });
    return normalized;
}

module.exports = {
    getStoredTarotItemId,
    getTarotItemIdAliases,
    normalizeTarotCardLevelMap,
    normalizeTarotCatalogFriendlyId,
    resolveTarotCatalogItemId
};

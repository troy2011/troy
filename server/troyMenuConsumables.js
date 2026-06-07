const crypto = require('crypto');

const TROY_MENU_CONSUMABLE_ID_PREFIX = 'troy_menu_';

function normalizeTroyMenuImagePath(value) {
    const raw = String(value || '').trim().replace(/\\/g, '/').slice(0, 240);
    if (!raw) return '';
    const withoutPublic = raw.replace(/^(\.\/)?public\//i, '');
    const normalized = withoutPublic.startsWith('./') ? withoutPublic : `./${withoutPublic.replace(/^\/+/, '')}`;
    if (normalized.includes('..')) return '';
    if (!/^\.\/Sprites\/(?:drinks|food)\/[-_./ a-zA-Z0-9]+\.(?:png|webp|jpg|jpeg)$/i.test(normalized)) {
        return '';
    }
    return normalized;
}

function getTroyMenuConsumableItemId(name, imagePath) {
    const normalizedName = String(name || '').trim().slice(0, 80);
    const normalizedImage = normalizeTroyMenuImagePath(imagePath);
    if (!normalizedName || !normalizedImage) return '';
    const digest = crypto
        .createHash('sha1')
        .update(`${normalizedName}\n${normalizedImage}`)
        .digest('hex')
        .slice(0, 16);
    return `${TROY_MENU_CONSUMABLE_ID_PREFIX}${digest}`;
}

function isTroyMenuConsumableItemId(itemId) {
    return String(itemId || '').trim().toLowerCase().startsWith(TROY_MENU_CONSUMABLE_ID_PREFIX);
}

module.exports = {
    TROY_MENU_CONSUMABLE_ID_PREFIX,
    normalizeTroyMenuImagePath,
    getTroyMenuConsumableItemId,
    isTroyMenuConsumableItemId
};

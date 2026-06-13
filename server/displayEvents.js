function normalizeDisplayRankBenefits(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => String(entry || '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 4);
}

function normalizeDisplayText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeDisplayInteger(value, min, max) {
    const normalized = Math.floor(Number(value));
    if (!Number.isFinite(normalized)) return null;
    return Math.min(max, Math.max(min, normalized));
}

function normalizeDisplayImagePath(value) {
    const imagePath = normalizeDisplayText(value, 220);
    if (!imagePath || !imagePath.startsWith('/')) return '';
    if (/[\r\n"'<>]/.test(imagePath)) return '';
    return imagePath;
}

function normalizeDisplayEvent(input) {
    const now = Date.now();
    const type = String(input?.type || 'splash').toLowerCase();
    const topic = String(input?.topic || '').trim().toLowerCase().slice(0, 80);
    const label = normalizeDisplayText(input?.label, 140);
    const rawLevel = Math.floor(Number(input?.level));
    const rankName = normalizeDisplayText(input?.rankName, 80);
    const rankBenefits = normalizeDisplayRankBenefits(input?.rankBenefits);
    let x = Number(input?.x);
    let y = Number(input?.y);
    const requestId = normalizeDisplayText(input?.requestId, 96);
    const displayName = normalizeDisplayText(input?.displayName, 48);
    const itemName = normalizeDisplayText(input?.itemName || input?.name, 80);
    const quantity = normalizeDisplayInteger(input?.quantity, 1, 99);
    const lineTotal = normalizeDisplayInteger(input?.lineTotal ?? input?.total, 0, 9999999);
    const menuImage = normalizeDisplayImagePath(input?.menuImage || input?.image || input?.iconImage);
    const action = normalizeDisplayText(input?.action, 24).toLowerCase();
    const status = normalizeDisplayText(input?.status, 24).toLowerCase();
    const createdAtMs = normalizeDisplayInteger(input?.createdAtMs || input?.createdAt, 1, 9999999999999);

    if (Number.isFinite(x) && x >= 0 && x <= 1) x *= 100;
    if (Number.isFinite(y) && y >= 0 && y <= 1) y *= 100;

    if (!Number.isFinite(x)) x = null;
    if (!Number.isFinite(y)) y = null;

    if (Number.isFinite(x)) x = Math.min(95, Math.max(5, x));
    if (Number.isFinite(y)) y = Math.min(95, Math.max(5, y));

    const event = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        label,
        x,
        y,
        at: now
    };

    if (topic) event.topic = topic;
    if (Number.isFinite(rawLevel) && rawLevel > 0) event.level = rawLevel;
    if (rankName) event.rankName = rankName;
    if (rankBenefits.length > 0) event.rankBenefits = rankBenefits;
    if (typeof input?.isOpen === 'boolean') event.isOpen = input.isOpen;
    if (requestId) event.requestId = requestId;
    if (displayName) event.displayName = displayName;
    if (itemName) event.itemName = itemName;
    if (quantity !== null) event.quantity = quantity;
    if (lineTotal !== null) event.lineTotal = lineTotal;
    if (menuImage) event.menuImage = menuImage;
    if (createdAtMs !== null) event.createdAtMs = createdAtMs;
    if (action) event.action = action;
    if (status) event.status = status;

    return event;
}

module.exports = {
    normalizeDisplayEvent
};

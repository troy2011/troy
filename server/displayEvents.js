function normalizeDisplayRankBenefits(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => String(entry || '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 4);
}

function normalizeDisplayEvent(input) {
    const now = Date.now();
    const type = String(input?.type || 'splash').toLowerCase();
    const topic = String(input?.topic || '').trim().toLowerCase().slice(0, 80);
    const label = String(input?.label || '').trim().slice(0, 120);
    const rawLevel = Math.floor(Number(input?.level));
    const rankName = String(input?.rankName || '').trim().slice(0, 80);
    const rankBenefits = normalizeDisplayRankBenefits(input?.rankBenefits);
    let x = Number(input?.x);
    let y = Number(input?.y);

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

    return event;
}

module.exports = {
    normalizeDisplayEvent
};

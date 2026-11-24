const PREFERENCE = 'troy:kingdom-table:music';
const TITLE_BOOKMARK = 'troy:kingdom-table:title-bookmark:v1';
const HANDOFF_LIFETIME = 30 * 60 * 1000;

export function readTitleBookmark(storage, now = Date.now()) {
    try {
        const entry = JSON.parse(storage?.getItem(TITLE_BOOKMARK));
        if (entry && Number.isFinite(entry.offset) && entry.offset >= 0 && Number.isFinite(entry.savedAt) &&
            entry.savedAt <= now && now - entry.savedAt <= HANDOFF_LIFETIME) return entry.offset;
    } catch { /* First visit, or storage unavailable. */ }
    return null;
}

export function bindMusicSession({ player, checkbox, syncScene, doc = document, win = window }) {
    let preferences, bookmark;
    try { preferences = win.localStorage; } catch { /* Ephemeral setting. */ }
    try { bookmark = win.sessionStorage; } catch { /* Site storage unavailable. */ }
    let pageHidden = false;

    const readPreference = () => {
        let enabled = true;
        try { enabled = preferences?.getItem(PREFERENCE) !== 'off'; } catch { /* Default. */ }
        if (checkbox) checkbox.checked = enabled;
        player.enabled(enabled);
    };
    const save = () => {
        const offset = player.titlePosition();
        if (!Number.isFinite(offset)) return;
        try { bookmark?.setItem(TITLE_BOOKMARK, JSON.stringify({ offset, savedAt: Date.now() })); } catch { /* Handoff optional. */ }
    };
    const resume = () => {
        const offset = readTitleBookmark(bookmark);
        if (offset !== null) player.restoreTitle(offset);
        player.visible(!doc.hidden);
        syncScene();
        // A same-tab navigation may retain autoplay permission. If it does not, the
        // saved seek position is still used when the next trusted gesture unlocks audio.
        if (offset !== null && !doc.hidden) player.unlock();
    };

    const unlock = (event) => { if (event.isTrusted && !doc.hidden) player.unlock(); };
    readPreference();
    resume();
    doc.addEventListener('click', unlock, { capture: true });
    doc.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') unlock(event); }, { capture: true });
    checkbox?.addEventListener('change', event => {
        player.enabled(checkbox.checked);
        try { preferences?.setItem(PREFERENCE, checkbox.checked ? 'on' : 'off'); } catch { /* This visit only. */ }
        if (checkbox.checked) unlock(event);
    });
    win.addEventListener('storage', event => { if (event.key === PREFERENCE) readPreference(); });
    doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) save();
        player.visible(!doc.hidden && !pageHidden);
    });
    win.addEventListener('pagehide', () => {
        pageHidden = true;
        save();
        player.visible(false);
    });
    win.addEventListener('pageshow', event => {
        if (!pageHidden && !event.persisted) return;
        pageHidden = false;
        readPreference();
        resume();
    });
}

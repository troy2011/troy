import '../four-elements/result-catalog.js?v=20261127-1';

const catalog = globalThis.TROY_ARCANA_RESULTS;
const profileActions = Object.freeze({ self: 'self', save: 'save' });
const profileUrl = '/four-elements/?profile=1&v=20261127-7';

function session() {
    const user = window.__firebaseAuth?.currentUser;
    const account = String(window.myPlayFabId || '').trim();
    if (!account || String(user?.uid || '').trim().toUpperCase() !== account.toUpperCase()
        || typeof user.getIdToken !== 'function') return null;
    return { user, account, generation: window.__troySessionGeneration };
}

function isSameSession(before) {
    const now = session();
    return now?.user === before.user && now?.account === before.account && now?.generation === before.generation;
}

export async function fetchFourElements(action, body = {}) {
    const before = session();
    if (!before) throw new Error('トロイアプリにログインしてください。');
    const token = await before.user.getIdToken();
    if (!token || !isSameSession(before)) throw new Error('ログイン状態が変わりました。');
    const response = await fetch('/api/four-elements/' + action, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ ...body, playFabId: before.account })
    });
    const result = await response.json().catch(() => ({}));
    if (!isSameSession(before)) throw new Error('ログイン状態が変わりました。');
    if (!response.ok) throw new Error(response.status === 401 ? 'もう一度ログインしてください。' : (result.error || '読み書きできませんでした。'));
    return result;
}

const launch = document.getElementById('btnTroyFourElements');
const dialog = document.getElementById('troyFourElementsDialog');
const frame = document.getElementById('troyFourElementsFrame');
const home = document.getElementById('homeArcanaCard');
const homeArt = document.getElementById('homeArcanaArt');
const homeName = document.getElementById('homeArcanaName');
const detail = document.getElementById('homeArcanaDetail');
const detailArt = document.getElementById('homeArcanaDetailArt');
const detailLead = document.getElementById('homeArcanaLead');
const detailNumber = document.getElementById('homeArcanaNumber');
const detailDescription = document.getElementById('homeArcanaDescription');
const detailElements = document.getElementById('homeArcanaElements');
const ELEMENT_NAMES = { fire: '火', water: '水', wind: '風', earth: '地' };
let displayed = null;
function elementLabel(key) {
    if (key === 'fool') return 'どの元素にも縛られない';
    if (key === 'magician' || key === 'world') return '火・水・風・地';
    const parts = key.split(':');
    return parts.filter(e => ELEMENT_NAMES[e]).map(e => ELEMENT_NAMES[e]).join(parts[0] === 'tri' ? '・' : ' × ');
}
let renderVersion = 0;

function renderHome(saved) {
    if (!home || !homeArt) return;
    const result = session() && typeof saved?.key === 'string' && Object.hasOwn(catalog,saved.key) ? catalog[saved.key] : null;
    displayed = result ? { ...result, elements: elementLabel(saved.key) } : null;
    if (!result) {
        home.hidden = true;
        homeArt.removeAttribute('src');
        home.setAttribute('aria-label', '保存した大アルカナの詳細');
        clearDetail();
        return;
    }
    const source = '/assets/pirate-tarot/cards/major-' + result.number + '.webp';
    if (homeArt.getAttribute('src') !== source) homeArt.src = source;
    home.setAttribute('aria-label', result.name + 'の詳細');
    if (detail?.open) fillDetail(displayed, source);
    home.hidden = false;
}

function clearDetail() {
    if (detail?.open) detail.close();
    detailArt?.removeAttribute('src');
    for (const node of [homeName, detailLead, detailNumber, detailDescription, detailElements]) {
        if (node) node.textContent = '';
    }
}

function fillDetail(card, source) {
    homeName.textContent = card.name;
    detailArt.src = source;
    detailArt.alt = '海賊タロット：' + card.name;
    detailLead.textContent = card.lead;
    detailNumber.textContent = 'あなたの大アルカナ ／ ' + card.number;
    detailElements.textContent = card.elements;
    detailDescription.textContent = card.detail;
    detailDescription.hidden = !card.detail;
}

function openDetail() {
    if (!session() || !displayed || home.hidden || !detail || detail.open) return;
    fillDetail(displayed, homeArt.getAttribute('src'));
    detail.showModal();
}

async function refreshHome() {
    const version = ++renderVersion;
    if (!session()) return renderHome(null);
    try {
        const { saved } = await fetchFourElements('self');
        if (version === renderVersion) renderHome(saved);
    } catch {
        if (version === renderVersion) renderHome(null);
    }
}

function reset() {
    ++renderVersion;
    renderHome(null);
    if (dialog?.open) dialog.close();
}

function open() {
    if (!session() || !dialog || !frame || typeof dialog.showModal !== 'function') return false;
    if (!dialog.open) {
        dialog.showModal();
        frame.src = profileUrl;
    }
    return true;
}

if (launch && dialog && frame) {
    launch.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (open()) event.preventDefault();
    });
    home?.addEventListener('click', openDetail);
    dialog.addEventListener('close', () => frame.removeAttribute('src'));
    window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow || !dialog.open
            || event.data?.kind !== 'troy-element-profile' || !Object.hasOwn(profileActions, event.data?.action)) return;
        const before = session();
        if (!before) return;
        const { id, action, key } = event.data;
        const reply = { kind: 'troy-element-profile-result', id };
        try {
            Object.assign(reply, await fetchFourElements(profileActions[action], { key }));
            ++renderVersion;
            renderHome(reply.saved);
        } catch (error) {
            reply.error = error.message || '読み書きできませんでした。';
        }
        if (dialog.open && isSameSession(before)) event.source.postMessage(reply, window.location.origin);
    });
    window.addEventListener('troy:session-changed', () => {
        reset();
        void refreshHome();
    });
    window.addEventListener('troy:auth-expired', reset);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void refreshHome();
    });
    void refreshHome();
}

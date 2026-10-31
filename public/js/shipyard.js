import { callApiWithLoader } from './api.js';
import { getPlayerShips } from './playfabClient.js?v=20260830-s1-auth-v1';

function requestId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

export function mountShipyard(root, { playerId, sessionCurrent, switchShip }) {
    let busy = false, eligible = false, pending = null, quote = null, selection = null;
    root.innerHTML = `<h2>船の管理</h2><div data-ships></div><h3>新しい船を建造</h3>
        <label>船 <select data-ship></select></label>
        <label data-material-label>素材 <select data-material><option value="">選択してください</option>
          <option value="RR">火 (RR)</option><option value="RG">地 (RG)</option>
          <option value="RY">風 (RY)</option><option value="RB">水 (RB)</option></select></label>
        <p data-quote></p><button type="button" data-check>必要な素材を確認</button>
        <button type="button" data-build disabled>建造する</button>
        <button type="button" data-status hidden>建造状況を確認</button><p role="status" data-message></p>`;
    const el = name => root.querySelector(`[data-${name}]`);
    const api = (action, body = {}) => callApiWithLoader(`/api/ship-construction/${action}`,
        { ...body, playFabId: playerId }, { isSilent: true, throwOnError: true });
    const valid = () => root.isConnected && sessionCurrent();
    function controls() {
        for (const button of root.querySelectorAll('button, select')) button.disabled = busy;
        el('build').disabled = busy || !eligible || !quote || !!pending;
        el('check').disabled = busy || !eligible || !!pending;
        el('status').hidden = !pending;
    }
    function clearQuote() { quote = null; selection = null; el('quote').textContent = ''; controls(); }
    async function load() {
        busy = true; controls();
        try {
            const [ships, context, state] = await Promise.all([
                getPlayerShips(playerId, { isSilent: true, throwOnError: true }), api('context'), api('current')
            ]);
            if (!valid()) return;
            const owner = value => String(value || '').trim().replace(/^playfab:/i, '').toUpperCase();
            if (!ships?.success || ships.isSharedShip || ships.isGuildShip || owner(ships.shipOwnerPlayFabId) !== owner(playerId) || !Array.isArray(ships.ships) || !Array.isArray(context.catalog)) throw Error('Unavailable');
            el('ships').replaceChildren();
            for (const ship of ships.ships) {
                if (!ship.assetData || owner(ship.assetData.Owner) !== owner(playerId)) continue;
                const row = document.createElement('p');
                row.textContent = `${ship.profileName || ship.assetData.ShipType || '船'}${ship.isActive ? '（使用中）' : ' '}`;
                if (!ship.isActive) {
                    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'この船を使う';
                    button.addEventListener('click', async () => {
                        if (busy || !valid()) return;
                        busy = true; controls();
                        try {
                            const result = await switchShip(ship.shipId);
                            if (!valid()) return;
                            if (!result?.success) throw Error('Unavailable');
                            await load();
                            if (valid()) el('message').textContent = result.removedCards?.length ? '船を切り替えました。利用できないカードは装備から外しました。' : '船を切り替えました。';
                        } catch { if (valid()) el('message').textContent = '船を切り替えられませんでした。'; }
                        finally { if (valid()) { busy = false; controls(); } }
                    });
                    row.append(button);
                }
                el('ships').append(row);
            }
            const select = el('ship'); select.replaceChildren();
            for (const ship of context.catalog) {
                const option = document.createElement('option'); option.value = ship.id; option.textContent = ship.name; select.append(option);
            }
            el('material-label').hidden = !context.unaffiliated;
            eligible = context.eligible === true;
            pending = state.state === 'pending' ? state : null;
            el('message').textContent = pending ? '建造状況を確認中です。もう一度建造せず、状況を確認してください。' : context.eligible ? '' : '建造できるレベルに達していません。';
        } catch { if (valid()) el('message').textContent = '船の情報を読み込めませんでした。'; }
        finally { if (valid()) { busy = false; controls(); } }
    }
    el('ship').addEventListener('change', clearQuote); el('material').addEventListener('change', clearQuote);
    el('check').addEventListener('click', async () => {
        if (busy || pending || !valid()) return;
        selection = { shipItemId: el('ship').value, selectedResource: el('material-label').hidden ? '' : el('material').value };
        busy = true; controls();
        try {
            const result = await api('quote', selection);
            if (!valid()) return;
            quote = result.quote;
            el('quote').textContent = quote.map(cost => `${cost.itemId} × ${cost.amount}`).join(' / ');
        } catch { if (valid()) { clearQuote(); el('message').textContent = '必要な素材を確認できませんでした。'; } }
        finally { if (valid()) { busy = false; controls(); } }
    });
    el('build').addEventListener('click', async () => {
        if (busy || pending || !quote || !valid()) return;
        const id = requestId(); pending = { requestId: id }; busy = true; controls();
        try {
            const result = await api('build', { ...selection, expectedQuote: quote, requestId: id });
            if (!valid()) return;
            if (result.state === 'complete') { pending = null; clearQuote(); await load(); if (valid()) el('message').textContent = '船を建造しました。'; }
            else if (result.state === 'failed') { pending = null; clearQuote(); el('message').textContent = result.reason === 'InsufficientFunds' ? '素材が足りません。' : '建造を完了できませんでした。'; }
            else el('message').textContent = '建造状況を確認中です。';
        } catch { if (valid()) el('message').textContent = '建造状況を確認中です。もう一度建造せず、状況を確認してください。'; }
        finally { if (valid()) { busy = false; controls(); } }
    });
    el('status').addEventListener('click', async () => {
        if (busy || !pending || !valid()) return;
        busy = true; controls();
        try {
            const result = await api('status', { requestId: pending.requestId });
            if (!valid()) return;
            if (result.state === 'complete') { pending = null; clearQuote(); await load(); if (valid()) el('message').textContent = '船を建造しました。'; }
            else if (result.state === 'failed') { pending = null; clearQuote(); el('message').textContent = result.reason === 'InsufficientFunds' ? '素材が足りません。' : '建造を完了できませんでした。'; }
            else el('message').textContent = '建造状況を確認中です。';
        } catch { if (valid()) el('message').textContent = '建造状況を確認できませんでした。'; }
        finally { if (valid()) { busy = false; controls(); } }
    });
    void load();
}

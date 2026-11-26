import { translateTable as tr } from './tableLocale.js?v=6';
// The tavern menu: each choice is its own page in the browser history (#online, #cpu, #practice, #settings),
// so the browser's back button, the on-screen back button and a reload all agree on where you are.
const ROUTES = { practice: 'practice', settings: 'settings' };
const HASH = Object.fromEntries(Object.entries(ROUTES).map(([hash, mode]) => [mode, hash]));
const TITLES = { practice: 'CPU練習' };

export function installTavernMenu(settings) {
    const root = document.getElementById('ktSetup');
    const tabs = [...root.querySelectorAll('[data-tavern-mode]')];
    const back = root.querySelector('[data-tavern-back]');
    const seats = document.getElementById('ktTavernSeats');
    const cpu = document.getElementById('ktTavernCpu');
    const caption = document.getElementById('ktCpuMode');
    const title = document.getElementById('ktPageTitle');
    const settingsButton = document.getElementById('ktTavernSettings');
    const practice = [...root.querySelectorAll('[data-tavern-practice]')];
    let current = '';

    const routeOf = () => {
        const route = location.hash.slice(1);
        return Object.hasOwn(ROUTES, route) ? ROUTES[route] : '';
    };

    // `focus`: true moves focus into the new page; a mode name returns focus to that menu button.
    function show(mode, focus = false) {
        // Settings is a dialog over the menu, so the page under it is the menu itself.
        const page = mode === 'settings' ? '' : mode;
        if (mode === 'settings') {
            if (!settings.open) settings.showModal();
        } else if (settings.open && current === 'settings') settings.close();
        current = mode;
        root.dataset.nvMode = page;
        root.classList.toggle('nv-on-page', !!page);
        const isCpu = page === 'practice';
        cpu.hidden = !isCpu;
        back.hidden = !page;
        seats.hidden = !isCpu;
        caption.textContent = tr('CPU練習');
        title.textContent = tr(TITLES[page]) || '';
        practice.forEach(node => { node.hidden = page !== 'practice'; });
        tabs.forEach(tab => tab.setAttribute('aria-expanded', String(tab.dataset.tavernMode === page)));
        if (focus && isCpu) caption.focus({ preventScroll: true });
        if (!page && typeof focus === 'string') {
            (focus === 'settings' ? settingsButton : tabs.find(tab => tab.dataset.tavernMode === focus))?.focus({ preventScroll: true });
        }
        // A new menu page starts at its top; never move the page while a game is on screen.
        if (document.getElementById('ktTable').hidden) window.scrollTo(0, 0);
    }

    // A new page: one history entry, so the browser's back returns to the menu.
    function go(mode) {
        if (mode === current) return;
        const url = new URL(location.href);
        url.hash = HASH[mode] || '';
        history.pushState({ nvMenu: mode, nvFrom: current }, '', url);
        show(mode, true);
    }

    // The on-screen back button does what the browser's back does, unless this page was opened directly.
    function leave() {
        const from = current;
        if (history.state && 'nvMenu' in history.state) history.back();
        else {
            history.replaceState(null, '', location.pathname + location.search);
            show('', from);
        }
    }

    tabs.forEach(tab => tab.addEventListener('click', () => go(tab.dataset.tavernMode)));
    back.addEventListener('click', leave);
    settingsButton.addEventListener('click', () => go('settings'));
    // Escape or the settings page's own back button close the dialog: treat that as going back.
    settings.addEventListener('close', () => { if (current === 'settings') leave(); });
    window.addEventListener('popstate', () => {
        const from = current;
        show(routeOf(), from);
    });


    // Only the local practice and settings pages exist on this host.
    const initial = new URL(location.href);
    for (const key of ['room', 'mode', 'seats', 'rating-preview']) initial.searchParams.delete(key);
    if (routeOf() !== 'practice') initial.hash = '';
    if (initial.href !== location.href) history.replaceState(null, '', initial);
    show(routeOf());

    return function showCpuLobbyAfterMatch() {
        const url = new URL(location.href);
        url.hash = HASH.practice;
        // Preserve ordinary CPU menu history, but not state inherited from an online route.
        const state = history.state?.nvMenu === 'practice' ? history.state : null;
        history.replaceState(state, '', url);
        show('practice', true);
    };
}

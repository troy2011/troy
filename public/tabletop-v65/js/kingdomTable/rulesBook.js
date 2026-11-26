import { localizeRuleDocument } from './ruleDocumentLocale.js?v=1';

localizeRuleDocument();

// The rules book: a chapter list that fits the screen, each chapter read in its own sheet.
// Every open chapter is a history entry (#eight, #reply, ...), so the browser's back button closes it.
const sheets = new Map([...document.querySelectorAll('.nv-rule-sheet')].map(sheet => [sheet.id, sheet]));
let current = null;
// True once a chapter was opened from this page; a chapter opened from a link elsewhere has no list entry behind it.
let fromIndex = false;
// Whether a page came before this one in this tab (a rules tab opened from the table has none). Read before any chapter adds entries.
const cameFromPage = history.length > 1;

// Long lists start some items with a term ending in a colon. Set that term apart so the list can be scanned. The text itself is unchanged.
for (const item of document.querySelectorAll('.nv-rule-body li')) {
    const first = item.firstChild;
    if (first?.nodeType !== Node.TEXT_NODE) continue;
    const at = first.data.indexOf(document.documentElement.lang === 'en' ? ':' : '：');
    if (at < 1 || at > 40) continue;
    const term = document.createElement('b');
    term.className = 'nv-term';
    term.textContent = first.data.slice(0, at + 1);
    first.data = first.data.slice(at + 1);
    item.prepend(term);
}

function render() {
    let hash;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { hash = ''; }
    const wanted = sheets.get(hash) || null;
    const previous = current;
    current = wanted;
    if (previous && previous !== wanted) previous.close();
    if (wanted && !wanted.open) {
        wanted.showModal();
        wanted.querySelector('.nv-rule-body').scrollTop = 0;
    }
    if (!wanted && previous) document.querySelector(`[data-rule="${previous.id}"]`)?.focus({ preventScroll: true });
}

function closeChapter() {
    if (fromIndex) history.back();
    else {
        history.replaceState(null, '', location.pathname + location.search);
        render();
    }
}

for (const link of document.querySelectorAll('.nv-rule-index [data-rule]')) link.addEventListener('click', () => { fromIndex = true; });
// Previous / next replace the open chapter, so back still returns to the list in one step.
for (const link of document.querySelectorAll('[data-rule-step]')) {
    link.addEventListener('click', event => {
        event.preventDefault();
        location.replace(`#${link.dataset.rule}`);
    });
}
for (const sheet of sheets.values()) {
    sheet.addEventListener('cancel', event => { event.preventDefault(); closeChapter(); });
    sheet.addEventListener('click', event => { if (event.target === sheet) closeChapter(); });
    sheet.querySelector('[data-rule-close]').addEventListener('click', closeChapter);
}
window.addEventListener('hashchange', render);

// The page's back button: back in history when we came from this site, otherwise to the table's menu.
document.querySelector('.nv-rules-back').addEventListener('click', event => {
    let sameSite = false;
    try { sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* Treat as another site. */ }
    if (sameSite && cameFromPage) {
        event.preventDefault();
        history.back();
    }
});

render();

const table = document.getElementById('ttTable');
const back = () => document.getElementById('ttBack').click();
document.getElementById('nvTutorialBack').addEventListener('click', back);
const historyChapter = () => Number.isInteger(history.state?.ttChapter) ? history.state.ttChapter : null;
const currentChapter = () => Number(table.dataset.chapter);
function syncChapter() {
    const playing = historyChapter();
    if (!table.hidden) {
        const chapter = currentChapter();
        if (!Number.isInteger(chapter)) return;
        if (playing === null) history.pushState({ ttChapter: chapter }, '', '#play');
        else if (playing !== chapter) history.replaceState({ ttChapter: chapter }, '', '#play');
    } else if (playing !== null) history.back();
}
new MutationObserver(syncChapter).observe(table, { attributes: true, attributeFilter: ['hidden', 'data-chapter'] });
window.addEventListener('popstate', () => {
    const chapter = historyChapter();
    if (chapter === null && !table.hidden) back();
    else if (chapter !== null && table.hidden) document.querySelector(`#ttChapters button[data-chapter="${chapter}"]`)?.click();
});
const cameFromPage = history.length > 1;
document.querySelector('#ttMenu .nv-plate-back').addEventListener('click', event => {
    let sameSite = false;
    try { sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* Treat as another site. */ }
    if (sameSite && cameFromPage) {
        event.preventDefault();
        history.back();
    }
});
// Restore a deliberately revisited history entry and turn an external ?chapter link into an in-page chapter.
if (table.hidden && historyChapter() !== null) document.querySelector(`#ttChapters button[data-chapter="${historyChapter()}"]`)?.click();
else if (!table.hidden) syncChapter();

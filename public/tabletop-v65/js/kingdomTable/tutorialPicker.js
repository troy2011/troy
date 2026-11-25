import { CHAPTERS, ME } from './tutorialScript.js?v=suit-opposition-v1-named-han-v3';

const DONE_KEY = 'tarot-kingdom-tutorial:done';
const $ = id => document.getElementById(id);
const chapterUrl = number => '/tarot-kingdom-table.html?tutorial=' + number;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function doneChapters() {
    try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); }
}

function renderMenu() {
    const done = doneChapters();
    $('ttChapters').replaceChildren(...CHAPTERS.map((chapter, index) => {
        const item = el('li');
        const button = el('button', 'kt-button');
        button.type = 'button';
        button.dataset.chapter = String(index);
        const label = el('span');
        label.append(el('span', '', chapter.title), el('br'), el('small', '', `${chapter.steps.filter(s => s.seat === ME).length}手`));
        button.append(el('span', 'tt-chapter-no', `第${index + 1}章`), label, el('span', 'tt-chapter-done', done.has(chapter.id) ? '済' : ''));
        button.addEventListener('click', () => location.assign(chapterUrl(index + 1)));
        item.append(button);
        return item;
    }));
}


const initial = new URL(location.href).searchParams.get('chapter');
const legacy = initial === null && Number.isInteger(history.state?.ttChapter)
  ? history.state.ttChapter + 1 : Number(initial);
if (Number.isInteger(legacy) && legacy >= 1 && legacy <= CHAPTERS.length) location.replace(chapterUrl(legacy));
else {
    renderMenu();
    addEventListener('pageshow', event => { if (event.persisted) renderMenu(); });
}

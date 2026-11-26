import { CHAPTERS, ME } from './tutorialScript.js?v=full-locale-v1';
import { tutorialText, tutorialCopy, tutorialPageUrl, tutorialIsEnglish } from './tutorialLocale.js';

const DONE_KEY = 'tarot-kingdom-tutorial:done';
const $ = id => document.getElementById(id);
const chapterUrl = number => tutorialPageUrl('/tarot-kingdom-table.html?tutorial=' + number);

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
    document.documentElement.lang = tutorialIsEnglish() ? 'en' : 'ja';
    document.title = tutorialCopy('チュートリアル — タロットキングダム', 'Tutorial — Tarot Kingdom');
    for (const node of document.querySelectorAll('[data-en-text]')) {
        if (node.dataset.jaText === undefined) node.dataset.jaText = node.textContent;
        node.textContent = tutorialCopy(node.dataset.jaText, node.dataset.enText);
    }
    for (const node of document.querySelectorAll('[data-en-aria-label]')) {
        if (node.dataset.jaAriaLabel === undefined) node.dataset.jaAriaLabel = node.getAttribute('aria-label');
        node.setAttribute('aria-label', tutorialCopy(node.dataset.jaAriaLabel, node.dataset.enAriaLabel));
    }
    for (const link of document.querySelectorAll('a[href]')) link.href = tutorialPageUrl(link.getAttribute('href'));
    $('ttChapters').replaceChildren(...CHAPTERS.map((chapter, index) => {
        const item = el('li');
        const button = el('button', 'kt-button');
        button.type = 'button';
        button.dataset.chapter = String(index);
        const label = el('span');
        const moves = chapter.steps.filter(s => s.seat === ME).length;
        label.append(el('span', '', tutorialText(chapter.title)), el('br'), el('small', '', tutorialCopy(`${moves}手`, `${moves} moves`)));
        button.append(el('span', 'tt-chapter-no', tutorialCopy(`第${index + 1}章`, `Chapter ${index + 1}`)), label, el('span', 'tt-chapter-done', done.has(chapter.id) ? tutorialCopy('済', 'Done') : ''));
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

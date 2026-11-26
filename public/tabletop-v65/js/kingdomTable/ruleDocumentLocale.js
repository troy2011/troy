import { activeTableLanguage } from './tableLocale.js?v=6';
import { documentEnglish } from './ruleDocumentEnglish.js?v=1';

export function localizeRuleDocument(doc = document, language = activeTableLanguage()) {
    doc.documentElement.lang = language;
    for (const link of doc.querySelectorAll('a[data-table-language-link]')) {
        const destination = new URL(link.href);
        destination.searchParams.set('lang', language);
        link.href = destination.href;
    }
    if (language !== 'en') return;
    if (Object.hasOwn(documentEnglish, doc.title.trim())) doc.title = documentEnglish[doc.title.trim()];
    const nodes = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let node = nodes.nextNode(); node; node = nodes.nextNode()) {
        if (node.parentElement?.closest('script, style')) continue;
        const source = node.data.trim();
        if (Object.hasOwn(documentEnglish, source)) {
            const prefix = node.data.match(/^\s*/)[0];
            const suffix = node.data.match(/\s*$/)[0];
            node.data = prefix + documentEnglish[source] + suffix;
        }
    }
    for (const node of doc.querySelectorAll('[aria-label], [title], [alt]')) {
        for (const attr of ['aria-label', 'title', 'alt']) {
            const source = node.getAttribute(attr);
            if (source != null && Object.hasOwn(documentEnglish, source)) node.setAttribute(attr, documentEnglish[source]);
        }
    }
}

import { activeTableLanguage, translateTable as tr } from './tableLocale.js?v=6';

export function createTableStaticLocale(doc = document) {
    const textNodes = [];
    const walker = doc.createTreeWalker(doc.documentElement, 4);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement?.closest('script,style,template')) continue;
        const parts = node.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (/[ぁ-んァ-ン一-龯]/u.test(parts[2])) textNodes.push([node, ...parts.slice(1)]);
    }
    const attributes = [];
    for (const node of doc.querySelectorAll('[aria-label],[placeholder],[alt],[title]')) {
        for (const attribute of ['aria-label','placeholder','alt','title']) {
            const original = node.getAttribute(attribute);
            if (original && /[ぁ-んァ-ン一-龯]/u.test(original)) attributes.push([node, attribute, original]);
        }
    }
    return () => {
        doc.documentElement.lang = activeTableLanguage();
        for (const [node, before, original, after] of textNodes) {
            if (node.isConnected) node.nodeValue = before + tr(original) + after;
        }
        for (const [node, attribute, original] of attributes) {
            if (node.isConnected) node.setAttribute(attribute, tr(original));
        }
    };
}

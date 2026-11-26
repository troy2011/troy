import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { documentEnglish } from '../public/tabletop-v65/js/kingdomTable/ruleDocumentEnglish.js';
import { localizeRuleDocument } from '../public/tabletop-v65/js/kingdomTable/ruleDocumentLocale.js';

const textPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

for (const name of ['tabletop-v65/tarot-kingdom-table-rules.html', 'tabletop-v65/tarot-kingdom-audio-credits.html', 'tarot-kingdom-table-rules.html']) {
    test(name + ': every Japanese text node, title and accessible label has an English translation', () => {
        const content = readFileSync(new URL('../public/' + name, import.meta.url), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        const parts = content.split(/(<[^<>]+>)/).flatMap(part => {
            if (!part.startsWith('<')) return [part.trim()];
            return [...part.matchAll(/\b(?:aria-label|title|alt)="([^"]*)"/g)].map(match => match[1]);
        }).map(part => part.replace(/&#(\d+);/g, (_, cp) => String.fromCodePoint(Number(cp)))).filter(part => textPattern.test(part));
        assert.ok(parts.length > 3);
        for (const part of parts) {
            assert.ok(Object.hasOwn(documentEnglish, part), 'Missing English copy: ' + part);
            assert.ok(!textPattern.test(documentEnglish[part]), 'English copy contains Japanese: ' + part);
        }
    });
}

test('localization sets document language and preserves markup and English credits', () => {
    const jpTitle = 'タロットキングダム 効果音クレジット';
    const text = [{ data: '効果音クレジット' }, { data: 'ロープを振る音：' }, { data: ' / Nox_Sound / ' }];
    const value = new Map([['aria-label', '戻る']]);
    const link = { href: 'https://example.com/rules?keep=yes#reply' };
    const doc = {
        title: jpTitle, documentElement: { lang: 'ja' },
        body: {}, createTreeWalker() { return { nextNode: () => text[i++] }; },
        querySelectorAll: selector => selector.startsWith('a[') ? [link] : [{ getAttribute: k => value.get(k), setAttribute: (k, v) => value.set(k, v) }],
    };
    let i = 0;
    const before = globalThis.NodeFilter;
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    try {
        localizeRuleDocument(doc, 'ja');
        assert.equal(doc.title, jpTitle);
        assert.equal(text[0].data, '効果音クレジット');
        localizeRuleDocument(doc, 'en');
        assert.equal(doc.documentElement.lang, 'en');
        assert.equal(doc.title, 'Tarot Kingdom — Sound Credits');
        assert.deepEqual(text.map(node => node.data), ['Sound Credits', 'Rope whoosh: ', ' / Nox_Sound / ']);
        assert.equal(value.get('aria-label'), 'Back');
        assert.equal(link.href, 'https://example.com/rules?keep=yes&lang=en#reply');
    } finally {
        if (before === undefined) delete globalThis.NodeFilter;
        else globalThis.NodeFilter = before;
    }
});

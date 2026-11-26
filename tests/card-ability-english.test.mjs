import assert from 'node:assert/strict';
import test from 'node:test';
import { cardAbility, cardInspectDetails } from '../public/tabletop-v65/js/kingdomTable/cardAbility.js';
import { setTableLanguage } from '../public/tabletop-v65/js/kingdomTable/tableLocale.js?v=6';
import { buildDeck } from '../public/tabletop-v65/js/kingdomTable/rules.js';

test('all 78 card inspector entries have field-complete English and Japanese copy',()=>{
    const d=buildDeck();
    assert.equal(d.length,78);
    for(const card of d){
        const en=cardInspectDetails(card,'en');
        const ja=cardInspectDetails(card,'ja');
        assert.ok(en.flavor.length>0,card.id);
        assert.notEqual(en.flavor,ja.flavor,card.id);
        assert.equal(en.effects.length,ja.effects.length,card.id);
        assert.doesNotMatch(JSON.stringify(en),/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,card.id);
        for(const {label,text} of en.effects){assert.ok(label&&text,card.id);}
    }
});

test('inspector switches in-place with table setting and preserves invalid-card behavior',()=>{
    const card=buildDeck().find(x=>x.major&&x.num===13);
    try {
        setTableLanguage('en');
        assert.match(cardAbility(card),/^The Reaping: /);
        assert.deepEqual(cardInspectDetails({num:15,major:false,suit:'invalid'}),{effects:[],flavor:''});
        setTableLanguage('ja');
        assert.match(cardAbility(card),/^ザ・リーピング：/);
    } finally {setTableLanguage('auto');}
});

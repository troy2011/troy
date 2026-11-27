const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const CATALOG = require('../public/four-elements/result-catalog');
const html = fs.readFileSync(require.resolve('../public/four-elements/index.html'), 'utf8');
const scope = { TROY_ARCANA_RESULTS: CATALOG, module: {} };
vm.runInNewContext(html.match(/<script>(const ELEMENTS[\s\S]*?)<\/script>/)[1], scope);
const { assess, ORDER } = scope.module.exports;

test('23 paths use exactly all 22 original cards, and only Wheel uses two results', () => {
    assert.equal(Object.keys(CATALOG).length, 23);
    const cards = new Map();
    for (const [key, result] of Object.entries(CATALOG)) {
        assert.ok(fs.existsSync(require('node:path').join(__dirname, '../public/assets/pirate-tarot/cards/major-' + result.number + '.webp')));
        cards.set(result.number, [...(cards.get(result.number) || []), key]);
    }
    assert.deepEqual([...cards.keys()].sort((a,b)=>a-b), Array.from({length:22}, (_,n)=>n));
    assert.deepEqual([...cards].filter(([,keys])=>keys.length>1), [[10,['fire:wind','wind:fire']]]);
    assert.deepEqual(['fire','water','wind','earth'].map(e=>CATALOG[e+':'+e].name), ['太陽','星','塔','月']);
});

test('all 16 main/sub choices classify in order', () => {
    for (const main of ORDER) for (const sub of ORDER) {
        const result = assess([...Array(6).fill(main), ...Array(6).fill(sub)]);
        assert.equal(result.key, main+':'+sub);
        assert.equal(result.pure, main===sub);
    }
});

test('all four triples are unordered; two incidental picks prevent a triple', () => {
    for (const missing of ORDER) {
        const members = ORDER.filter(key=>key!==missing);
        const repeated = [...members,...members];
        const answers = [...repeated,...repeated];
        assert.equal(assess(answers).key, 'tri:'+members.join(':'));
        assert.equal(assess([...answers].reverse()).key, 'tri:'+members.join(':'));
        answers[0]=missing;
        assert.equal(assess(answers).key, 'tri:'+members.join(':'));
        answers[1]=missing;
        assert.notEqual(assess(answers).status,'triple');
    }
});

test('balanced four-element choices lead to specials only with agreeing follow-ups', () => {
    const balanced = ['fire','water','wind','earth','fire','water'];
    const answers = [...balanced,...balanced];
    assert.equal(assess(answers).status,'arcana');
    for (const key of ['fool','magician','world']) {
        assert.equal(assess(answers,[key,key]).key,key);
    }
    assert.equal(assess(answers,['fool','world']).status,'tie');
    assert.equal(assess(answers.slice(0,11)).status,'incomplete');
});

test('triple wins when both blocks are balanced until the fourth element has two picks', () => {
    const main = ['fire','fire','water','water','wind','wind'];
    const sub = ['fire','earth','water','water','wind','wind'];
    const special = ['magician','magician'];
    assert.equal(assess([...main,...main],special).key,'tri:fire:water:wind');
    assert.equal(assess([...main,...sub],special).key,'tri:fire:water:wind');
    const changed = [...main,...sub];
    changed[8] = 'earth';
    assert.equal(assess(changed).status,'arcana');
    assert.equal(assess(changed,special).key,'magician');
});

test('each half and follow-up uses only its short prompt', () => {
    const {questionPrompt}=scope.module.exports;
    const now='今の自分に、いちばん近い絵は？';
    const reborn='生まれ変わるなら？';
    for(let i=0;i<12;i++) assert.equal(questionPrompt(i),i<6?now:reborn);
    assert.equal(questionPrompt(12,{status:'tie',phase:'main'}),now);
    assert.equal(questionPrompt(12,{status:'tie',phase:'sub'}),reborn);
    assert.equal(questionPrompt(12,{status:'arcana'}),reborn);
});

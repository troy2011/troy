const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
if (process.env.TROY_MUG_CAPTURE || process.env.TROY_TRIPLE_CAPTURE) test.use({deviceScaleFactor:3});

const fixture = `
window.rulePropFixture = (kind) => {
    const card = id => Rules.buildDeck().find(c => c.id === id);
    clearTimeout(timer); timer = 0;
    const round = match.round;
    const suffix = kind.startsWith("vessel:") ? kind.slice(7) : null;
    if (kind === 'initial' || kind === 'back-off') {
        if (kind==='initial') { seenEvents=round.events.length; cancelRulePropAnimations($('ktRuleProps')); Object.assign(round,{cut:false,back:false,lock:null}); render(); return; }
        round.back = true;
        Object.assign(round,{phase:'play',turn:ME,lock:null,cut:false,field:{kind:null,count:0,plays:[]}});
        round.players[ME].hand = [card('coin-11'),card('cup-4')];
        if (!Rules.play(round, ME, ['coin-11'], 'normal').ok) throw Error('Illegal 11 back-off setup');
        render(); return;
    }
    if (kind === 'triple-preview') {
        seenEvents = round.events.length;
        delete $('ktMessage').dataset.last;
        round.players[ME].hand=['cup-4','coin-6','sword-9'].map(card);
        Object.assign(round, {phase:'play', turn:1, last:ME, dealer:ME, han:[1,0,0], passed:[], direction:1,cut:true,back:true,lock:'coin',
            field:{kind:'normal',count:3,plays:[{by:ME,cards:['cup-8','coin-8','sword-8'].map(card)}]}});
        render();
        return;
    }
    if (kind === 'conceal') {
        seenEvents = round.events.length;
        Object.assign(round, {cut:false,back:false,lock:null});
        render();
        // Simulate restoring a snapshot: settled props must not replay their presentation cues.
        const host = $('ktRuleProps');
        cancelRulePropAnimations(host);
        Object.assign(round, {cut:true,back:true,lock:'coin'});
        render();
        return;
    }
    const after = suffix ? 13 : { alt:13, stack:8, pair:8, cut: 8, back: 11, lock: 13, clear: 7 }[kind];
    const before = suffix ? 14 : { alt:14, stack:13, pair:7, cut: 7, back: 10, lock: 14, clear: 6 }[kind];
    const suit = suffix ? suffix + "-" : kind === "alt" ? "sword-" : "coin-";
    Object.assign(round, {
        phase: 'play', turn: ME, last: 1, passed: [], direction: 1, cut: false,
        back: kind === 'lock' || kind === 'stack' || kind === 'alt' || !!suffix, lock: kind === 'stack' ? 'coin' : null,
        field: {kind:'normal',count:kind==='pair'?2:1,plays:[{by:1,cards:kind==='pair'?[card('coin-'+before),card('sword-'+before)]:[card(suit+before)]}]}
    });
    round.players[ME].hand = [card(suit+after), card('cup-4')];
    if (kind === 'pair') round.players[ME].hand.push(card('sword-'+after));
    if (kind !== 'clear' && !Rules.play(round, ME, kind==='pair'?['coin-'+after,'sword-'+after]:[suit+after], 'normal').ok) throw Error('Illegal rule setup: '+kind);
    render();
};
`;

for (const motion of ['reduce', 'no-preference']) test('TROY tabletop rule props retain true flags and do not intercept controls ('+motion+')', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: motion });
    await page.route('**/ui.js?v=canonical-props-v1-field-dealt-v1-no-stock-v1-grave-label-v1-suit-cycle-v1-table-cues-v1', route => route.fulfill({
        contentType: 'text/javascript',
        body: fs.readFileSync('public/tabletop-v65/js/kingdomTable/ui.js', 'utf8') + fixture
    }));
    await page.route('**/sfx.js?v=whisky-v2', route => route.fulfill({
        contentType:'text/javascript',
        body:fs.readFileSync('public/tabletop-v65/js/kingdomTable/sfx.js','utf8')
            .replace('export function playRuleProp(kind, suit) {',
                'export function playRuleProp(kind, suit) { (window.propCueLog ??= []).push([kind,suit ?? null]);')
    }));
    await page.goto('/tarot-kingdom-table.html?v=65');
    await page.getByRole('button',{ name:'CPU練習' }).click();
    await page.locator('input[name=ktSeats][value="3"]').check();
    await page.locator('#ktStart').click();
    await expect(page.locator('#ktTable')).toBeVisible();
    await page.evaluate(() => window.rulePropFixture('initial'));
    const layer = page.locator('#ktRuleProps');
    const scroll = () => page.evaluate(() => document.scrollingElement.scrollHeight);
    const controls = await page.locator('#ktActions').boundingBox();
    for (const kind of ['cut','back','lock']) {
        const frames = await page.evaluate(flag => {
            window.rulePropFixture(flag);
            return document.querySelector('#ktRuleProps [data-kind="'+flag+'"]')?.getAnimations()[0]?.effect.getKeyframes() ?? [];
        }, kind);
        await expect(layer.locator('[data-leaving]')).toHaveCount(0);
        await expect(layer).toBeVisible();
        await expect(layer).toHaveAttribute('aria-hidden','true');
        await expect(layer.locator('img').first()).toBeVisible();
        await expect.poll(() => layer.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
        expect(await layer.evaluate(n => getComputedStyle(n).pointerEvents)).toBe('none');
        expect(await scroll()).toBe(568);
        expect(await page.locator('#ktActions').boundingBox()).toEqual(controls);
        if (kind!=='lock') {
            if (motion==='no-preference') {
                expect(frames.map(frame=>frame.opacity)).toEqual(['0','1']);
                expect(frames.every(frame=>frame.transform===undefined)).toBe(true);
            } else expect(frames).toEqual([]);
        }
        if (kind === 'back' || kind === 'lock') {
            const glass = layer.locator('[data-kind="back"] img:not(.kt-hourglass-flip)');
            await expect(glass).toHaveAttribute('src', /whisky-spill-shadow\.webp$/);
            expect(await glass.evaluate(node=>getComputedStyle(node).transform)).toBe('none');
        }
        if (motion==='reduce') {
            await expect(layer.locator('.kt-hourglass-flip')).toHaveCount(0);
            await expect(layer.locator('.kt-rule-impact')).toHaveCount(0);
            expect(await layer.locator('img').evaluateAll(nodes=>nodes.every(node=>!node.getAnimations().length))).toBe(true);
        }
        if (kind==='lock') {
            await expect(layer.locator('img')).toHaveCount(2);
            await expect(page.locator('#ktFieldState')).toContainText('11バック');
            await expect(page.locator('#ktFieldState')).toContainText('ペンタクル');
            await expect(layer.locator('svg[data-suit="coin"]')).toHaveCount(1);
            if (process.env.TROY_RULE_PREVIEW && motion==='reduce') await page.screenshot({ path: process.env.TEMP+'/TROY-rule-lock-back.png' });
        }
    }
    await page.evaluate(() => window.rulePropFixture('stack'));
    await expect(layer.locator('.kt-rule-prop:not(.kt-rule-impact)')).toHaveCount(3);
    await expect(layer.locator('[data-kind="cut"]:not(.kt-rule-impact) img')).toHaveAttribute('src', /knife-reference/);
    expect(await layer.evaluate(n=>['lock','cut'].map(kind=>getComputedStyle(n.querySelector('[data-kind='+kind+']:not(.kt-rule-impact)')).zIndex))).toEqual(['1','2']);
    const exactMug=layer.locator('[data-kind="lock"]');
    await expect(exactMug.locator('img')).toHaveAttribute('src', /tankard-coin/);
    await expect(exactMug.locator('.kt-rule-suits')).toBeHidden();
    await expect(layer.locator('svg[data-suit="coin"]')).toHaveCount(1);
    await expect(page.locator('#ktSeatRight .kt-seat-panel')).toHaveAttribute('data-turn','current');
    await expect(page.locator('#ktSeatLeft .kt-seat-panel')).toHaveAttribute('data-turn','next');
    await expect(page.locator('#ktFieldCards .kt-field-top [data-card="coin-8"]')).toBeVisible();
    expect(await scroll()).toBe(568);
    for (const control of await page.locator('#ktActions button').all()) {
       const {x,y,width,height} = await control.boundingBox();
       expect(x).toBeGreaterThanOrEqual(0);
       expect(x+width).toBeLessThanOrEqual(320);
       expect(y+height).toBeLessThanOrEqual(556);
    }
    for (const suit of ['coin','cup','sword','wand']) {
        await page.evaluate(s=>window.rulePropFixture('vessel:'+s),suit);
        const mug=layer.locator('[data-kind="lock"]');
        await expect(mug).toHaveAttribute('data-vessel',suit);
        await expect(mug.locator('img')).toHaveAttribute('src',new RegExp('tankard-'+suit+'-shadow[.]webp'));
        await expect.poll(()=>mug.locator('img').evaluate(n=>n.complete && n.naturalWidth>0)).toBe(true);
        expect(await mug.locator('img').evaluate(n=>n.naturalWidth>n.parentNode.offsetWidth && getComputedStyle(n).filter==='none')).toBe(true);
        await expect(mug.locator('svg[data-suit="'+suit+'"]')).toHaveCount(1);
        await expect(mug.locator('.kt-rule-suits')).toBeHidden();
        if (process.env.TROY_MUG_CAPTURE && motion==='reduce') {
            await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].filter(n=>n.getClientRects().length).map(n=>n.decode()));});
            await page.screenshot({path:process.env.TEMP+'/TROY-live-vessel-'+suit+'-DPR3.png'});
        }
    }
    await expect.poll(()=>page.evaluate(()=>window.propCueLog?.filter(row=>row[0]==='lock').map(row=>row[1]) ?? [])).toEqual(['coin','coin','cup','sword','wand']);
    const beforePair = await page.evaluate(() => window.propCueLog?.filter(([k])=>k==='cut').length ?? 0);
    await page.evaluate(() => window.rulePropFixture('pair'));
    if (motion==='no-preference') {
        await expect(layer.locator('.kt-rule-impact')).toHaveCount(1);
        expect(await layer.locator('.kt-rule-impact').evaluate(n=>getComputedStyle(n).zIndex)).toBe('3');
    }
    else await expect(layer.locator('.kt-rule-impact')).toHaveCount(0);
    await expect(layer.locator('.kt-rule-impact')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>window.propCueLog?.filter(([k])=>k==='cut').length ?? 0)).toBe(beforePair+1);
    const audioCount = await page.evaluate(() => window.propCueLog?.length ?? 0);
    await page.evaluate(() => window.rulePropFixture('back-off'));
    await expect(layer.locator('[data-kind="back"]')).toHaveCount(0);
    await page.evaluate(() => window.rulePropFixture('conceal'));
    expect(await layer.evaluate(n=>n.getAnimations({subtree:true}).length)).toBe(0);
    const fade = await page.evaluate(() => {
        window.rulePropFixture('clear');
        return [...document.querySelectorAll('#ktRuleProps [data-leaving]')].map(n=>n.getAnimations()[0]?.effect.getKeyframes());
    });
    if (motion==='no-preference') {
        expect(fade).toHaveLength(3);
        expect(fade.every(frames=>frames.map(frame=>frame.opacity).join(',')==='1,0'&&frames.every(frame=>frame.transform===undefined))).toBe(true);
    } else expect(fade).toEqual([]);
    await expect(layer.locator(".kt-rule-prop:not(.kt-rule-impact)")).toHaveCount(0);
    expect(await page.evaluate(() => window.propCueLog?.length ?? 0)).toBe(audioCount);
    if (process.env.TROY_TRIPLE_CAPTURE && motion==='reduce') {
        await page.evaluate(()=>window.rulePropFixture('triple-preview'));
        await expect(layer.locator('.kt-rule-prop')).toHaveCount(3);
        await expect(page.locator('#ktFieldCards .kt-field-top .kt-card')).toHaveCount(3);
        expect(await scroll()).toBe(568);
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].filter(n=>n.getClientRects().length).map(n=>n.decode()));});
        const dims = await page.locator('#ktRuleProps .kt-rule-prop').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.kind,[n.getBoundingClientRect().width,n.getBoundingClientRect().height]])));
        console.log('320 DPR3 non-shadow props',dims);
        for(const [kind,[width,height]] of Object.entries({cut:[56,78.05],back:[32.64,58.48],lock:[70.4,61.86]})){
            expect(dims[kind][0]).toBeCloseTo(width,1);
            expect(dims[kind][1]).toBeCloseTo(height,1);
        }
        await page.screenshot({path:process.env.TEMP+'/TROY-triple-aligned-hud-DPR3.png'});
    }
});

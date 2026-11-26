const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const root=fs.existsSync('public/tabletop-v65')?'public/tabletop-v65':'public';
const read=name=>fs.readFileSync(root+'/js/kingdomTable/'+name,'utf8');
for(const reducedMotion of ['no-preference','reduce']) test('last-card cue: '+reducedMotion,async({page})=>{
    await page.setViewportSize({width:375,height:667});
    await page.emulateMedia({reducedMotion});
    await page.addInitScript(()=>{
        window.cues=0; window.pulses=0;
        const animate=Element.prototype.animate;
        Element.prototype.animate=function(frames,options){
            if(this.classList.contains('is-final-hand-card')&&frames[1]?.boxShadow) window.pulses++;
            return animate.call(this,frames,options);
        };
    });
    await page.route(/\/kingdomTable\/sfx\.js\?/,r=>r.fulfill({contentType:'text/javascript',body:read('sfx.js').replace(
        'export function play(name, at = 0, ...args) {',
        "export function play(name, at = 0, ...args) { if (name === 'last-card') window.cues++;"
    )}));
    const fixture="\nwindow.lastCardFixture=(seat,count)=>{\n    const deck=Rules.buildDeck();\n    if(!match){\n        $('ktTable').hidden=false; $('ktSetup').hidden=true; $('ktFelt').dataset.seats='3';\n        match=createMatch({players:3}); startRound(match); seenEvents=0; resetDrawFeedback();\n        Object.assign(match.round,{phase:'play',turn:1,events:[],winner:null});\n        match.round.players.forEach((p,i)=>{p.hand=deck.slice(i*2,i*2+2);});\n    }\n    if(seat!==undefined){\n        match.round.players[seat].hand=deck.slice(seat*2,seat*2+count);\n        match.round.events.push({type:'testFixture'});\n    }\n    render();\n};\n";
    await page.route(/\/kingdomTable\/ui\.js\?/,r=>r.fulfill({contentType:'text/javascript',body:read('ui.js')+fixture}));
    await page.goto('/tarot-kingdom-table.html');
    await expect.poll(()=>page.evaluate(()=>typeof window.lastCardFixture)).toBe('function');
    await page.evaluate(()=>window.lastCardFixture());
    const self=page.locator('#ktHand .is-final-hand-card');
    const other=page.locator('#ktSeatRight .kt-fan-card.is-final-hand-card');
    const cues=()=>page.evaluate(()=>window.cues);
    await expect(self).toHaveCount(0);
    await expect(other).toHaveCount(0);
    for(const [seat,card,expected] of [[1,other,1],[0,self,2]]){
        await page.evaluate(seat=>window.lastCardFixture(seat,1),seat);
        await expect(card).toBeVisible();
        await expect.poll(cues).toBe(expected);
        await expect(card).toHaveCSS('box-shadow',/rgb\(255, 89, 101\)/);
        await page.evaluate(seat=>window.lastCardFixture(seat,1),seat);
        await expect.poll(cues).toBe(expected);
        await expect(page.locator('[data-kt-feedback="last-card"]')).toHaveCount(0);
    }
    expect(await page.evaluate(()=>window.pulses)).toBe(reducedMotion==='reduce'?0:2);
    await page.evaluate(()=>window.lastCardFixture(1,2));
    await expect(other).toHaveCount(0);
    await expect(self).toBeVisible();
    expect(await cues()).toBe(2);
});

const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const root=(fs.existsSync('public/tabletop-v65')?'public/tabletop-v65':'public')+'/js/kingdomTable/';
test('invalid play shakes the whole local hand without submitting the move',async({page})=>{
    await page.setViewportSize({width:375,height:667});
    await page.addInitScript(()=>{
        window.shaken=[];
        const animate=Element.prototype.animate;
        Element.prototype.animate=function(frames,options){
            if(frames[1]?.translate==='-5px') window.shaken.push(this.id||this.className);
            return animate.call(this,frames,options);
        };
    });
    const fixture="\nwindow.invalidFixture=()=>{\n    $('ktTable').hidden=false; $('ktSetup').hidden=true; $('ktFelt').dataset.seats='3';\n    match=createMatch({players:3}); startRound(match); seenEvents=0; resetDrawFeedback();\n    const deck=Rules.buildDeck();\n    match.round.players[0].hand=['wand-3','cup-5','sword-6'].map(id=>deck.find(c=>c.id===id));\n    Object.assign(match.round,{phase:'play',turn:0,events:[],winner:null,field:{kind:null,count:0,role:null,plays:[]}});\n    render();\n};\n";
    await page.route(/\/kingdomTable\/ui\.js\?/,r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'ui.js','utf8')+fixture}));
    await page.goto('/tarot-kingdom-table.html');
    await expect.poll(()=>page.evaluate(()=>typeof window.invalidFixture)).toBe('function');
    await page.evaluate(()=>window.invalidFixture());
    const hand=page.locator('#ktHand');
    const play=page.locator('#ktPlay');
    await expect(play).toBeDisabled();
    await hand.locator('[data-card="wand-3"]').click({position:{x:4,y:12}});
    await hand.locator('[data-card="cup-5"]').click({position:{x:4,y:12}});
    await expect(play).toHaveAttribute('data-invalid','');
    await play.click();
    expect(await page.evaluate(()=>window.shaken)).toEqual(['ktHand']);
    await expect(hand.locator('[aria-pressed="true"]')).toHaveCount(2);
    await expect(page.locator('#ktFieldCards [data-card]')).toHaveCount(0);
    await hand.locator('[data-card="cup-5"]').click({position:{x:4,y:12}});
    await expect(play).not.toHaveAttribute('data-invalid','');
    await play.click();
    await expect(page.locator('#ktFieldCards [data-card="wand-3"]')).toBeVisible();
    expect(await page.evaluate(()=>window.shaken)).toEqual(['ktHand']);
});

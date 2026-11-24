const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const root='public/tabletop-v65/js/kingdomTable/';
for(const transfer of ['give','devilCardTransfer']) test('local tabletop feedback: '+transfer,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{window.cues=[]});
 const synth=fs.readFileSync(root+'sfx.js','utf8').replace('export function play(name, at = 0, ...args) {', 'export function play(name, at = 0, ...args) { window.cues.push(name);');
 await page.route('**/sfx.js?v=prop-fade-v1',r=>r.fulfill({contentType:'text/javascript',body:synth}));
 await page.route('**/turn-pass-v1/self-turn.mp3',r=>r.fulfill({status:404}));
 const bracket=String.raw`
window.fxFixture=(kind)=>{
 const c=id=>Rules.buildDeck().find(x=>x.id===id);
 if(kind==='start'){
   $('ktTable').hidden=false; $('ktSetup').hidden=true; $('ktFelt').dataset.seats='3';
   match=createMatch({players:3}); startRound(match); seenEvents=0; resetDrawFeedback();
   Object.assign(match.round,{phase:'play',turn:1,events:[],winner:null});
   ['coin-3,wand-5','cup-11,cup-10','sword-5,sword-7'].forEach((cards,i)=>{match.round.players[i].hand=cards.split(',').map(c);});
 }else{
   const r=match.round;
   r.players[1].hand=[c('cup-10')];
   r.players[0].hand=kind==='give'?[c('coin-3'),c('wand-5'),c('cup-11')]:[c('coin-3'),c('cup-11')];
   r.events.push({type:kind,by:1,from:1,to:0});r.turn=0;
 }
 render();
};
`;
 await page.route('**/ui.js?v=canonical-board-v1',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'ui.js','utf8')+bracket}));
 await page.goto('/tarot-kingdom-table.html?v=65');
 await expect.poll(()=>page.evaluate(()=>typeof window.fxFixture)).toBe('function');
 await page.evaluate(()=>window.fxFixture('start'));
 await expect(page.locator('.kt-your-turn-flag')).toHaveCount(0);
 await expect(page.locator('#ktHand [data-card="cup-11"]')).toHaveCount(0);
 await page.evaluate(transfer=>window.fxFixture(transfer),transfer);
 await expect(page.locator('.kt-your-turn-flag')).toHaveCount(0);
 await expect(page.locator('#ktTurnOrder')).toContainText('手番');
 await expect(page.locator('.kt-seat.is-last-card .kt-last-card-flag')).toHaveCount(1);
 await expect(page.locator('#ktHand [data-card="cup-11"]')).toHaveClass(/is-drawn/);
 for(const cue of ['turn','last-card']) await expect.poll(()=>page.evaluate(cue=>window.cues.filter(x=>x===cue).length,cue)).toBe(1);
 expect(errors).toEqual([]);
});

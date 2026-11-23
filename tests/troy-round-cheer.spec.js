const {test,expect}=require('@playwright/test');
const fs=require('node:fs'), root='public/tabletop-v65/js/kingdomTable/';
for(const mode of ['self','opponent','poll','restored','match']) test('round applause '+mode,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{window.cues=[]});
 const instrument=fs.readFileSync(root+'sfx.js','utf8').replace('export function playRoundVictory(own, variant = 0) {','export function playRoundVictory(own, variant = 0) { window.cues.push(own?"own":"rival");').replace('export function playMatchVictory() {','export function playMatchVictory() { window.cues.push("J");');
 await page.route('**/sfx.js?v=four-crowd-v1',r=>r.fulfill({contentType:'text/javascript',body:instrument}));
 await page.route('**/localTable.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'localTable.js','utf8').replace('get view() { return null; }','view:null')}));
 const hook=String.raw`
window.fxRound=(mode)=>{
 const base=()=>{ const m=createMatch({players:3});startRound(m);m.round.events.length=0;return m; };
 const complete=(m,by,opening=false,final=false)=>{
  Object.assign(m.round,{phase:'over',winner:by,openingWin:opening?'parity':null});
  m.round.events.push({type:'win',by,openingWin:opening?'parity':null});
  if(final)m.rounds=1;
  settleRound(m);
  if(final){m.over=true;m.chips[0]=Math.max(...m.chips)+500;}
 };
 const view=(m,status='playing')=>({match:m,status,code:'FXPOll',members:[{name:'A'},{name:'B'},{name:'C'}]});
 const apply=v=>{online.view=v;online.onView(v)};
 const m=base();
 if(mode==='restored'){complete(m,1,true); apply(view(m)); return;}
 if(mode==='poll'){ apply(view(m)); complete(m,1); apply(view(m)); apply(view(m)); return; }
 $('ktTable').hidden=false; $('ktSetup').hidden=true; $('ktFelt').dataset.seats='3';
 match=m;seenEvents=0;resetDrawFeedback();render();
 complete(m,mode==='opponent'?1:0,false,mode==='match');render();render();
 if(mode==='match'){showResult(m.lastResult);showResult(m.lastResult);}
};
`;
 await page.route('**/ui.js?v=four-crowd-v1',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'ui.js','utf8')+hook}));
 await page.goto('/tarot-kingdom-table.html?v=65');
 await expect.poll(()=>page.evaluate(()=>typeof window.fxRound)).toBe('function');
 await page.evaluate(mode=>window.fxRound(mode),mode);
 if(['restored','match'].includes(mode)){
   await page.waitForTimeout(300);expect(await page.evaluate(()=>window.cues)).toEqual(mode==='match'?['J']:[]);
 } else {
   await expect.poll(()=>page.evaluate(()=>window.cues)).toEqual([mode==='self'?'own':'rival']);
   await page.waitForTimeout(200);expect(await page.evaluate(()=>window.cues)).toHaveLength(1);
 }
});

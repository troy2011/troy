const {test,expect}=require('@playwright/test');
test.use({locale:'ja-JP'});
const fs=require('node:fs'),p=require('node:path');
const isTroy=fs.existsSync(p.resolve(__dirname,'../public/tabletop-v65'));
const fixture=String.raw`
window.preparePoseScenario=(kind)=>{
 clearTimeout(timer); timer=0; Fx.cancelAll(); cancelRulePropAnimations($('ktRuleProps'));
 const all=Rules.buildDeck(), card=id=>all.find(c=>c.id===id), r=match.round;
 const samples={
 pair:[['coin-7','cup-7'],['wand-6','sword-6']],
 triple:[['coin-7','cup-7','sword-7'],['wand-6','sword-6','coin-6']],
 world:[['major-21'],['major-7']],
 worldWin:[['major-21'],['major-7']],
 cutWin:[['wand-8','cup-8'],['wand-6','sword-6']],
 cut:[['wand-8','cup-8'],['wand-6','sword-6']],
 win:[['coin-7'],['wand-6']],
 role:[['wand-4','cup-4','sword-6','coin-6','wand-6'],[]],
 call:[['cup-4','sword-6','coin-6','wand-6'],['wand-4']],
 pass:[[],['wand-6','sword-6']],
 };
 const [ids,pile]=samples[kind];
 r.players[ME].hand=(['win','worldWin','cutWin'].includes(kind)?ids:[...ids,'cup-2','coin-3']).map(card);
 Object.assign(r,{phase:'play',turn:ME,last:2,back:false,lock:null,cut:false,direction:1,passed:kind==='pass'?[1]:[],drew:kind==='pass',events:[],openingWin:null,winner:null,lastPlay:null,
  field:{kind:pile.length?'normal':null,count:pile.length,role:null,plays:pile.length?[{by:2,cards:pile.map(card)}]:[]}});
 seenEvents=0; fieldKey=''; selected=new Set(); render(); return {ids,pile};
};

window.prepareOpponentHands=async()=>{
 clearTimeout(timer); timer=0; Fx.cancelAll();
 const members=[{name:'Viewer'},{name:'Kai'},{name:'Mina'}];
 const round=match.round;
 Object.assign(round,{phase:'play',turn:ME,events:[],drew:false,passed:[],field:{kind:null,count:0,role:null,plays:[]}});
 for(const p of round.players.slice(1))p.hand=p.hand.slice(0,3);
 const view={code:'flash-test',status:'playing',members,match};
 if(!Object.getOwnPropertyDescriptor(online,'view')?.get)online.view=view;
 online.onView(view);
 await Promise.all(document.getAnimations().filter(a=>a.animationName==='kt-fan-in').map(a=>a.finished));
 return view;
};
window.measureOpponentHands=async view=>{
 const seats=[$('ktSeatRight'),$('ktSeatLeft')];
 const fans=seats.map(seat=>seat.querySelector('.kt-opponent-hand'));
 const backs=fans.map(fan=>[...fan.children]);
 const initial=backs.map(back=>back.length);
 const hiddenChanges=[];
 const observer=new MutationObserver(entries=>hiddenChanges.push(...entries.map(e=>e.target.id)));
 for(const s of seats)observer.observe(s,{attributes:true,attributeFilter:['hidden']});
 for(let i=0;i<3;i++){
   online.onView(view);
   await new Promise(requestAnimationFrame);
 }
 const restarts=fans.map(fan=>fan.getAnimations({subtree:true}).filter(a=>a.animationName==='kt-fan-in').length);
 const opacity=backs.map(back=>Number(getComputedStyle(back[0]).opacity));
 observer.disconnect();
 const sameBacks=fans.every((fan,i)=>fan.children.length===backs[i].length&&[...fan.children].every((node,j)=>node===backs[i][j]));
 view.match.round.players[1].hand.length=1;
 online.onView(view);
 const lastCard={count:fans[0].children.length,outline:getComputedStyle(fans[0].firstElementChild).outlineStyle,visible:!fans[0].hidden};
 view.match.round.players[1].hand.length=0;
 online.onView(view);
 return {initial,restarts,opacity,hiddenChanges,sameBacks,lastCard,empty:fans[0].hidden};
};

window.measureJusticeAndOwner=(back=false)=>{
 clearTimeout(timer); timer=0; Fx.cancelAll();
 const r=match.round, all=Rules.buildDeck(), card=id=>all.find(c=>c.id===id);
 const me=$('ktMe'), right=seatPlate(1), second=seatPlate(2);
 r.players[ME].hand=['major-11','wand-3'].map(card);
 Object.assign(r,{phase:'play',turn:ME,direction:-1,last:2,events:[],winner:null,openingWin:null,back,lock:null,cut:false,
  passed:[],field:{kind:'normal',count:1,role:null,plays:[{by:2,cards:[card(back?'cup-12':'sword-9')]}]}});
 seenEvents=0; fieldKey=''; render();
 const initial=[me.dataset.turn,second.dataset.turn];
 const colors=[me,second].map(node=>getComputedStyle(node,'::before').backgroundImage);
 const ok=result=>{if(!result.ok)throw Error(result.reason);};
 ok(Rules.play(r,ME,['major-11'],'normal')); render();
 const notice=$('ktMessage').textContent;
 const play=[me.dataset.turn,right.dataset.turn,r.back,r.turn,r.events.map(e=>e.type),r.justiceHan?.[0]||0];
 ok(Rules.pass(r,1)); render();
 const pass=[me.dataset.turn,second.dataset.turn,r.turn];
 for(let seat=2;seat<match.seats;seat++)ok(Rules.pass(r,seat)); render();
 const clear=[me.dataset.turn,r.turn,r.back,document.querySelectorAll('[data-turn=owner]').length];
 return {initial,play,pass,clear,colors,notice};
};

window.inspectNamedWinner=()=>{
 window.measureJusticeAndOwner(true);
 if(!Rules.play(match.round,ME,['wand-3'],'normal').ok)throw Error('cannot win from fixture');
 showResult(settleRound(match));
};

window.inspectTemperanceWinner=()=>{
 clearTimeout(timer); timer=0; Fx.cancelAll();
 const r=match.round, all=Rules.buildDeck(), card=id=>all.find(c=>c.id===id);
 r.players[ME].hand=['major-14','wand-3'].map(card);
 Object.assign(r,{phase:'play',turn:ME,last:2,events:[],winner:null,openingWin:null,back:true,lock:'cup',cut:false,judgement:true,
  passed:[],field:{kind:'normal',count:1,role:null,plays:[{by:2,cards:[card('major-20')]}]}});
 seenEvents=0; fieldKey=''; render();
 if(!Rules.play(r,ME,['major-14'],'normal').ok)throw Error('fixture cannot play Temperance');
 if(r.back||r.lock||r.judgement||r.temperanceHan[ME]!==1)throw Error('fixture did not award exactly 1 han');
 render();
 for(let seat=1;seat<match.seats;seat++)if(!Rules.pass(r,seat).ok)throw Error('fixture cannot pass');
 if(!Rules.play(r,ME,['wand-3'],'normal').ok)throw Error('fixture cannot go out');
 showResult(settleRound(match));
};
window.runPoseScenario=(kind,ids)=>{
 const r=match.round;
 playOrigins=new Map(ids.map(id=>[id,rectOf($('ktHand').querySelector('[data-card="'+id+'"]'))]));
 const outcome=kind==='pass'?Rules.pass(r,ME):Rules.play(r,ME,ids,kind==='call'?'call':kind==='role'?'role':'normal');
 if(!outcome.ok)throw Error('fixture '+kind+' '+outcome.reason);
 render();
 return r.events.map(e=>e.type);
};
`;

async function open(page,width,height,reduced,roomApi=null,seats=3) {
 const root=p.resolve(__dirname,'../public');
 await page.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.hostname!=='127.0.0.1')return r.fulfill({status:200,body:''});
   if(u.pathname.startsWith('/api/'))return roomApi ? roomApi(r,u) : r.fulfill({json:{user:null}});
   const f=p.resolve(root,'.'+decodeURIComponent(u.pathname));
   if(!f.startsWith(root+p.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return r.fulfill({status:404});
   if(u.pathname.endsWith('/kingdomTable/ui.js'))return r.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(f,'utf8')+fixture});
   return r.fulfill({path:f});
 });
 await page.addInitScript(()=>{
  window.poseMoves=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   const a=animate.call(this,frames,options);
   if(this.matches('.kt-fx-card[data-card]')){
    a.pause();
    window.poseMoves.push({id:this.dataset.card,element:this,animation:a,frames,options,sweep:this.dataset.fieldSweep==='true',finish:()=>a.finish()});
   }
   return a;
  };
 });
 await page.setViewportSize({width,height});
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 await page.goto('/tarot-kingdom-table.html'+(roomApi?'?room=123456':''));
 if(!roomApi){
  await page.locator('[data-tavern-mode=practice]').click();
  await page.locator('input[name=ktSeats][value="'+seats+'"]').check();
  await page.locator('#ktStart').click();
 }
 await expect(page.locator('#ktTable')).toBeVisible();
}
const records=(page,sweep=false)=>page.evaluate(s=>window.poseMoves.filter(m=>m.sweep===s).map(m=>({id:m.id,transforms:m.frames.map(f=>f.transform),ratio:m.element.offsetHeight/m.element.offsetWidth})),sweep);
const finish=(page,sweep=false)=>page.evaluate(s=>window.poseMoves.filter(m=>m.sweep===s).forEach(m=>m.finish()),sweep);
const prepare=(page,kind)=>page.evaluate(k=>window.preparePoseScenario(k),kind);
const run=(page,kind,ids)=>page.evaluate(([k,v])=>window.runPoseScenario(k,v),[kind,ids]);
async function centresAgree(page) {
 const errors=await page.evaluate(()=>{
   const edge=(node)=>{
    const a=node.getBoundingClientRect(), b=node.querySelector('.kt-card-rank').getBoundingClientRect();
    return [a.left,a.top,a.right,a.bottom,b.left,b.top,b.right,b.bottom];
   };
   return window.poseMoves.filter(m=>!m.sweep).map(m=>{
    m.animation.currentTime=m.options.duration+(m.options.delay||0);
    const to=document.querySelector('.kt-field-top [data-card="'+m.id+'"]');
    if(!to)return null;
    return Math.max(...edge(m.element).map((v,i)=>Math.abs(v-edge(to)[i])));
   }).filter(x=>x!==null);
 });
 expect(errors.length).toBeGreaterThan(0);
 expect(Math.max(...errors)).toBeLessThan(1.8);
}
for(const kind of ['pair','triple','win','worldWin','cutWin','role','call'])test('card geometry: '+kind,async({page})=>{
 const width=kind==='triple'?320:390,height=kind==='triple'?568:844;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await open(page,width,height,false);
 const {ids}=await prepare(page,kind);const events=await run(page,kind,ids);
 const count=ids.length+(kind==='call'?1:0);
 await expect.poll(async()=>(await records(page)).length,{timeout:6000}).toBe(count);
 const flights=await records(page);
 expect(flights.every(m=>Math.abs(m.ratio-1.5)<.04)).toBe(true);
 expect(flights.every(m=>m.transforms.at(-1).includes('matrix3d'))).toBe(true);
 if(['win','worldWin','cutWin'].includes(kind)){
    expect(events).toContain('win'); expect(events).not.toContain('clear');
    const axes=await page.evaluate(()=>{
      const m=window.poseMoves.find(m=>m.element.classList.contains('kt-fx-agari-slam'));
      m.animation.currentTime=(m.options.delay||0)+m.options.duration*.64;
      const matrix=new DOMMatrix(getComputedStyle(m.element).transform);
      return [Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)];
    });
    expect(axes[0]).toBeGreaterThan(1.25);
    expect(axes[1]).toBeCloseTo(axes[0],3);
 }
 await centresAgree(page); await finish(page);
 await expect(page.locator('.kt-field-top .kt-card.is-arriving')).toHaveCount(0);
 await expect(page.locator('.kt-fx-card[data-card]')).toHaveCount(0);
 expect(errors).toEqual([]);
});
for(const kind of ['world','cut','pass'])test('swept field geometry: '+kind,async({page})=>{
 await open(page,375,667,false);
 const {ids,pile}=await prepare(page,kind);
 const old=await page.locator('.kt-field-top .kt-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [n.dataset.card,r.x,r.y,r.width,r.height]}));
 const events=await run(page,kind,ids);
 expect(events).toContain('clear');
 const held=await page.locator('.kt-fx-card[data-card]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [n.dataset.card,r.x,r.y,r.width,r.height]}));
 for(const a of old){const b=held.find(n=>n[0]===a[0]); expect(b).toBeDefined();expect(a.slice(1).every((v,i)=>Math.abs(v-b[i+1])<1.8)).toBe(true);}
 if(kind!=='pass'){
  await expect.poll(async()=>(await records(page)).length).toBe(ids.length);
  expect((await records(page)).every(m=>m.transforms.at(-1).includes('matrix3d'))).toBe(true);
  await finish(page);
 }
 await expect.poll(async()=>(await records(page,true)).map(x=>x.id).sort()).toEqual([...pile,...ids].sort());
 expect((await records(page,true)).every(m=>m.transforms.every(t=>t.includes('matrix3d')))).toBe(true);
 await finish(page,true);
 await expect(page.locator('.kt-fx-card[data-card]')).toHaveCount(0);
 await expect(page.locator('.kt-field-top .kt-card')).toHaveCount(0);
});
test('reduced motion never creates projected ghosts',async({page})=>{
 await open(page,320,568,true);
 const {ids}=await prepare(page,'world');await run(page,'world',ids);
 await expect(page.locator('.kt-fx-card[data-card]')).toHaveCount(0);
 expect(await records(page)).toEqual([]);
});

if(!isTroy)test('rated CPU own pair starts at the actual two hand cards',async({page})=>{
 const R=await import('../public/js/kingdomTable/rules.js'),M=await import('../public/js/kingdomTable/match.js'),G=await import('../server/game.mjs');
 const card=id=>R.buildDeck().find(c=>c.id===id), ids=['coin-7','cup-7'];
 const hand=[...ids,'wand-3'].map(card), match=M.createMatch({players:3});
 M.startRound(match);
 const round=match.round;
 Object.assign(round,{players:[hand,['coin-3','coin-4'].map(card),['coin-2','wand-2'].map(card)].map(hand=>({hand,grave:[],exiled:[]})),aside:[],field:{kind:'normal',count:2,role:null,plays:[{by:2,cards:['wand-6','sword-6'].map(card)}]},turn:0,last:2,phase:'play',winner:null,openingWin:null,back:false,lock:null,direction:1,cut:false,passed:[],events:[],judgement:false,han:[0,0,0]});
 const room={code:'123456',seats:3,owner:'viewer',status:'playing',turnAt:Date.now()+60000,match,members:[{id:'viewer',name:'Viewer',rating:1000},{id:null,name:'CPU A',rating:1000},{id:null,name:'CPU B',rating:1000}]};let revision=0;
 await open(page,390,844,false,async(r,u)=>{
  if(u.pathname==='/api/me')return r.fulfill({json:{user:{name:'Viewer',rating:1000,games:3},activeRoom:room.code}});
  if(u.pathname.endsWith('/action')){const {action}=r.request().postDataJSON();expect(G.applyAction(room,0,action).ok).toBe(true);revision++;}
  return r.fulfill({json:G.viewRoom(room,'viewer',revision)});
 });
 for(const id of ids)await page.locator('#ktHand [data-card="'+id+'"]').click({position:{x:7,y:14}});
 await page.evaluate(()=>document.addEventListener('click',e=>{
   if(e.target.closest('#ktPlay'))window.beforePoseHand=Object.fromEntries([...document.querySelectorAll('#ktHand .kt-card.is-selected')].map(n=>{
    const a=n.getBoundingClientRect();return [n.dataset.card,[a.x+a.width/2,a.y+a.height/2]];
   }));
 },{capture:true,once:true}));
 await page.locator('#ktPlay').click();
 const handCentres=await page.evaluate(()=>window.beforePoseHand);
 expect(Object.keys(handCentres).sort()).toEqual(ids.slice().sort());
 await expect.poll(async()=>(await records(page)).length).toBe(2);
 const origin=await page.evaluate(()=>Object.fromEntries(window.poseMoves.map(m=>{
   m.animation.currentTime=m.options.delay||0;
   const a=m.element.getBoundingClientRect();return [m.id,[a.x+a.width/2,a.y+a.height/2]];
 })));
 for(const id of ids)expect(origin[id].map((n,i)=>Math.abs(n-handCentres[id][i]))).toEqual([expect.closeTo(0,0),expect.closeTo(0,0)]);
 await centresAgree(page); await finish(page);
 await expect(page.locator('.kt-fx-card[data-card]')).toHaveCount(0);
});
test('opponent card backs do not flash when an unchanged room update arrives',async({page})=>{
 await open(page,390,844,false);
 const result=await page.evaluate(async()=>{
   const before=await window.prepareOpponentHands();
   return await window.measureOpponentHands(before);
 });
 expect(result.initial).toEqual([3,3]);
 expect(result.restarts).toEqual([0,0]);
 expect(result.opacity).toEqual([1,1]);
 expect(result.hiddenChanges).toEqual([]);
 expect(result.sameBacks).toBe(true);
 expect(result.lastCard).toEqual({count:1,outline:'solid',visible:true});
 expect(result.empty).toBe(true);
});

for(const [seats,width,height] of [[3,390,844],[4,320,568]])test('Justice flips only rank; field owner cue persists through a pass ('+seats+' seats)',async({page})=>{
 await open(page,width,height,true,null,seats);
 const state=await page.evaluate(()=>window.measureJusticeAndOwner());
 expect(state.initial).toEqual(['current','owner']);
 expect(state.play).toEqual(['owner','current',true,1,['play','back'],0]);
 expect(state.pass).toEqual(['owner','current',2]);
 expect(state.clear).toEqual(['current',0,false,0]);
 expect(state.colors.every(color=>color.includes('conic-gradient'))).toBe(true);
 expect(state.colors[0]).not.toBe(state.colors[1]);
});

test('removing 11-back with Justice shows and stores 正義執行 +1翻',async({page})=>{
 await open(page,390,844,true);
 const state=await page.evaluate(()=>window.measureJusticeAndOwner(true));
 expect(state.play).toEqual(['owner','current',false,1,['play','back','justiceHan'],1]);
 expect(state.notice).toContain('正義執行 +1翻');
 expect(state.clear).toEqual(['current',0,false,0]);
});

test('winning result lists the earned role by its name and han',async({page})=>{
 await open(page,320,568,true);
 await page.evaluate(()=>window.inspectNamedWinner());
 const ledger=page.getByRole('list',{name:'翻の内訳'});
 await expect(ledger).toBeVisible();
 await expect(ledger.getByRole('listitem').filter({hasText:'正義執行 1翻'})).toHaveCount(1);
 await expect(ledger.getByRole('listitem').filter({hasText:'上がり 1翻'})).toHaveCount(1);
});

test('device language automatically selects English role names',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(Navigator.prototype,'languages',{get:()=>['fr-FR','ja-JP']}));
 await open(page,390,844,true);
 await page.evaluate(()=>window.inspectNamedWinner());
 const ledger=page.getByRole('list',{name:'Han breakdown'});
 await expect(ledger).toHaveAttribute('lang','en');
 await expect(ledger.getByRole('listitem').filter({hasText:'Justice Served 1 han'})).toHaveCount(1);
});

test('setting a language overrides the device and survives reload',async({page})=>{
 await open(page,390,844,true);
 await page.locator('#ktSettings').click();
 await page.locator('#ktTableLanguage').selectOption('en');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('tarot-kingdom:language'))).toBe('en');
 await page.goto('/tarot-kingdom-table.html');
 await page.locator('[data-tavern-mode=practice]').click();
 await page.locator('#ktStart').click();
 await page.evaluate(()=>window.inspectNamedWinner());
 const ledger=page.getByRole('list',{name:'Han breakdown'});
 await expect(ledger.getByRole('listitem').filter({hasText:'Justice Served 1 han'})).toHaveCount(1);
});

test('Temperance clearing three effects is listed once at one han',async({page})=>{
 await open(page,320,568,true);
 await page.evaluate(()=>window.inspectTemperanceWinner());
 const ledger=page.getByRole('list',{name:'翻の内訳'});
 await expect(ledger.getByRole('listitem').filter({hasText:'清めの杯 1翻'})).toHaveCount(1);
});

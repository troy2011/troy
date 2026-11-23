
const { test, expect } = require('@playwright/test');
test.use({hasTouch:true});
const seat=(p,n)=>p.locator('.xgame-seat').nth(n);
const game=async(p,id)=>{await p.locator('[data-game='+id+']').click(); await p.locator('#start').click();};
async function open(p,w,h,layout){
 await p.setViewportSize({width:w,height:h});
 await p.addInitScript(()=>{Math.random=()=>0;});
 await p.clock.install(); await p.goto('/tavern-minigames.html');await p.locator('input[value='+layout+']').check();
}
for(const [layout,w,h] of [['table',320,640],['counter',390,844],['counter',844,390]]){
 test('wave warning, simultaneous collision, victory & replay '+layout+' '+w,async({page:p})=>{
  await open(p,w,h,layout); await game(p,'wave-dodge');
  const lane=(n,i)=>seat(p,n).locator('.sea-lanes button').nth(i);
  // A 3・2・1 countdown comes first: no wave is shown and no lane can be taken until it ends.
  await expect(p.locator('#signal')).toContainText('まもなく第 1 波　3');
  await expect(lane(0,1)).toHaveAttribute('data-danger','false');
  await lane(1,0).tap(); await expect(lane(1,1)).toHaveAttribute('data-ship','true');
  const countdown=()=>p.clock.runFor(2100);
  await countdown();
  await expect(lane(0,1)).toHaveAttribute('data-danger','true');
  await expect(lane(1,1)).toHaveAttribute('data-danger','true');
  await p.clock.runFor(1510); await expect(p.locator('#signal')).toContainText('引き分け');
  await p.locator('#start').click(); await countdown(); await lane(1,0).tap(); await p.clock.runFor(1510);
  await expect(p.locator('#signal')).toContainText('2P');
  await p.locator('#start').click(); await countdown(); await lane(0,0).tap(); await lane(1,0).tap();
  await p.clock.runFor(1510); await expect(p.locator('#signal')).toContainText('第 2');
  await p.locator('#exit').click(); await p.clock.runFor(20000); await expect(p.locator('#arena')).toBeHidden();
 });
 test('chart rotation is shared scramble but independent, equivalent solves tie & replay changes map '+layout+' '+w,async({page:p})=>{
  await open(p,w,h,layout); await game(p,'sea-chart');
  const read=()=>p.locator('.sea-chart').evaluateAll(boards=>boards.map(board=>({
    inlet:board.dataset.inlet,outlet:board.dataset.outlet,
    pieces:[...board.querySelectorAll('button')].map(b=>b.dataset.ports.split(',').map(Number))
  })));
  const [a,b]=await read(); expect(a).toEqual(b);
  expect(await seat(p,0).locator('.sea-chart button').evaluateAll(bs=>bs.every(e=>e.getBoundingClientRect().height>=44&&e.getBoundingClientRect().width>=44))).toBe(true);
  const targets=[[2,3],[1,2],[2,3],[0,2],[0,2],[0,2],[0,1],[0,3],[0,1]];
  expect(a.inlet).toBe('0:3');expect(a.outlet).toBe('8:1');
  await p.clock.pauseAt(new Date(await p.evaluate(()=>Date.now())+1000));
  await p.evaluate(masks=>{
   const boards=[...document.querySelectorAll('.sea-chart')];
   for(const board of boards){
    [...board.querySelectorAll('button')].forEach((btn,i)=>{
     for(let n=0;n<4;n++){
      if(btn.dataset.ports.split(',').map(Number).sort().join(',')===masks[i].join(','))break;
      btn.click();
     }
    });
   }
  },targets);
  await expect(p.locator('#signal')).toContainText('引き分け');
  await p.locator('#start').click();
  const [c,d]=await read(); expect(c).toEqual(d);
  expect(c.inlet+' '+c.outlet).not.toBe(a.inlet+' '+a.outlet);
  await p.locator('#exit').click(); await expect(p.locator('#arena')).toBeHidden();
 });
}

test('four extra games share touch-safe controls, outcomes and cancellation in rotated counter',async({page:p})=>{
 await open(p,390,844,'counter');
 const arena=p.locator('#arena'), signal=p.locator('#signal');
 for(const id of ['deck-balance','barrel-rally']){
   await game(p,id);
   await expect(p.locator('[data-physics-board]')).toHaveCount(2);
   await expect(p.locator('[data-physics-direction]')).toHaveCount(4);
   expect(await p.locator('[data-physics-direction]').evaluateAll(bs=>bs.every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.width>=44&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}))).toBe(true);
   if(id==='deck-balance'){
     const b=await p.locator('[data-physics-direction]').first().boundingBox();
     const c=await p.context().newCDPSession(p);
     await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});
     await p.clock.runFor(5000);
     await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await expect(arena).toHaveAttribute('data-phase','done');
     await expect(seat(p,1)).toHaveAttribute('data-result','win');
   } else {
     await p.clock.runFor(78000);
     await expect(arena).toHaveAttribute('data-phase','done');
   }
   await p.locator('#start').click();await p.locator('#exit').click();
   await p.clock.runFor(20000);await expect(arena).toBeHidden();
 }
 await game(p,'pirate-cipher');
 const board=p.locator('[data-sea-cipher]');
 await expect(board).toHaveCount(2);
 await p.clock.pauseAt(new Date(await p.evaluate(()=>Date.now())+1000));
 await p.evaluate(()=>{
  for(const el of document.querySelectorAll('[data-sea-cipher]')){
   for(const digit of [1,2,3,4]) el.querySelector('[data-cipher-digit="'+digit+'"]').click();
  }
 });
 await p.clock.runFor(100);
 await expect(signal).toContainText('引き分け');
 await p.locator('#exit').click();
 await expect(arena).toBeHidden();
});

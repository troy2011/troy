
const {test,expect}=require('@playwright/test');
test.use({hasTouch:true});
const seat=(p,n)=>p.locator('.xgame-seat').nth(n);
async function open(p,w,h,layout){
 await p.setViewportSize({width:w,height:h});await p.addInitScript(()=>{Math.random=()=>0;});
 await p.clock.install();await p.goto('/tavern-minigames.html');
 await p.locator('input[value='+layout+']').check();
}
const game=async(p,id)=>{await p.locator('[data-game='+id+']').click();await p.clock.pauseAt(new Date(await p.evaluate(()=>Date.now())+400));await p.locator('#start').click();};
async function tap(p,seats,pointer=false){
 await p.evaluate(({seats,pointer})=>{
   for(const s of seats){
    const pad=document.querySelectorAll('.bell-pad')[s];
    const e=pointer?new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',button:0}):new MouseEvent('click',{bubbles:true,detail:0});
    Object.defineProperty(e,'timeStamp',{value:performance.now()});pad.dispatchEvent(e);
   }
 },{seats,pointer});
}
for(const [layout,w,h] of [['table',320,640],['counter',390,844],['counter',844,390]]){
 test('bell simultaneous timing, misses, seat-neutral order, and exit '+layout+' '+w,async({page:p})=>{
  await open(p,w,h,layout);await game(p,'bell-rhythm');
  const pads=p.locator('.bell-pad'), signal=p.locator('#signal'), arena=p.locator('#arena');
  await expect(pads).toHaveCount(2);
  await expect(p.locator('.bell-count')).toHaveText(['準備 3','準備 3']);
  expect(await pads.evaluateAll(nodes=>nodes.every(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}))).toBe(true);
  await p.clock.runFor(960);
  await tap(p,[1,0],true);await expect(p.locator('.bell-score')).toHaveText(['100 点','100 点']);
  await expect(p.locator('.bell-feedback')).toHaveText(['◎ ぴったり','◎ ぴったり']);
  await p.clock.runFor(17); await expect(p.locator('.bell-landed')).toHaveText(['成功 1 / 10','成功 1 / 10']);
  await tap(p,[1,0]);await expect(p.locator('.bell-score')).toHaveText(['100 点','100 点']);
  await p.clock.runFor(6880);await expect(arena).toHaveAttribute('data-phase','done');
  await expect(signal).toContainText('引き分け');
  await p.locator('#start').click();
  await p.clock.runFor(960);
  await tap(p,[1]);await p.clock.runFor(7200);
  await expect(seat(p,1)).toHaveAttribute('data-result','win');
  await expect(signal).toContainText('1P 0 点');
  await p.locator('#start').click();
  await expect(p.locator('.bell-score')).toHaveText(['0 点','0 点']);
  await p.locator('#exit').click();await p.clock.runFor(13000);await expect(arena).toBeHidden();
 });
 test('sail puzzle equal fabric, independent progress, tie and next board '+layout+' '+w,async({page:p})=>{
  await open(p,w,h,layout);await game(p,'sail-patch');
  const buttons=n=>seat(p,n).locator('[data-sail-tile]');
  const read=p.locator('.sea-sail-example');
  const panes=await read.evaluateAll(nodes=>nodes.map(n=>n.dataset.sailSample));expect(panes[0]).toBe(panes[1]);
  expect(await buttons(0).evaluateAll(ns=>ns.every(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.top>=0&&b.bottom<=innerHeight;}))).toBe(true);
  const current=()=>p.locator('[data-sail-tile="0"]').evaluateAll(ns=>ns.map(n=>n.dataset.sailCorner));
  const before=await current();expect(before[0]).toBe(before[1]);
  await expect(seat(p,0).locator('.sea-sail-stitches')).toContainText('○');
  await buttons(0).first().tap();const after=await current();expect(after[0]).not.toBe(after[1]);
  for(let i=0;i<2&&await buttons(0).first().getAttribute('data-sail-corner')!==panes[0].split(',')[0];i++) await buttons(0).first().tap();
  await expect(buttons(0).first().locator('.sea-sail-tile-mark')).toHaveText('✓');
  await expect(buttons(1).first().locator('.sea-sail-tile-mark')).toHaveText('↻');
  const solve=async picks=>p.evaluate(picks=>{
   const zones=document.querySelectorAll('.sea-sail');
   for(const n of picks){
    const z=zones[n], targets=z.querySelector('.sea-sail-example').dataset.sailSample.split(',');
    [...z.querySelectorAll('[data-sail-tile]')].forEach((b,i)=>{for(let q=0;q<4&&b.dataset.sailCorner!==targets[i];q++)b.click();});
   }
  },picks);
  await solve([1,0]);await p.clock.runFor(120);await expect(p.locator('#signal')).toContainText('引き分け');
  await p.locator('#start').click();expect(await read.first().getAttribute('data-sail-sample')).not.toBe(panes[0]);
  await solve([0]);await p.clock.runFor(120);await expect(seat(p,0)).toHaveAttribute('data-result','win');
  await expect(p.locator('#signal')).toContainText('布4枚が一致');
  await p.locator('#start').click();await p.locator('#exit').click();
  await p.clock.runFor(13000);await expect(p.locator('#arena')).toBeHidden();
 });
}

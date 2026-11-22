const {test,expect}=require('@playwright/test');
const path=require('node:path');
const shots=process.env.TAVERN_SHOTS;
async function open(page,width,height){
 await page.setViewportSize({width,height});
 const remote=[], bad=[];
 page.on('request',r=>{const u=new URL(r.url());if(!['/tavern-minigames.html','/js/tavern-minigames-v1.js','/css/tavern-minigames-v1.css','/favicon.ico','/js/tavern-extra-v1.js','/js/tavern-fx-v1.js','/js/tavern-games-a-v1.js','/js/tavern-games-b-v1.js','/js/tavern-expansion-v1.js','/css/tavern-expansion-v1.css'].includes(u.pathname) || u.hostname!=='127.0.0.1') remote.push(r.url());});
 page.on('pageerror',e=>bad.push(e.message));
 await page.addInitScript(()=>{Math.random=()=>0; for(const key of ['localStorage','sessionStorage']) Object.defineProperty(window,key,{get(){throw Error('persistent storage not permitted');}});});
 await page.goto('/tavern-minigames.html');
 async function clean(){expect(remote).toEqual([]);expect(bad).toEqual([]);}
 return {clean,arena:page.locator('#arena'),one:page.locator('button.player.a'),two:page.locator('button.player.b')};
}
for(const w of [320,390,430])test('table layout is tap-safe at '+w,async({page})=>{
 const {arena,one,two,clean}=await open(page,w,640);
 await expect(page.locator('[data-game]')).toHaveCount(22);
 await page.locator('#category').selectOption('reflex');await expect(page.locator('[data-game]')).toHaveCount(6);
 await page.locator('#category').selectOption('all');
 if(shots&&w===390)await page.screenshot({path:path.join(shots,'chooser-390.png')});
 await page.locator('[data-game=count]').click();
 await expect(arena).toHaveAttribute('data-layout','table');
 const [a,b]=await Promise.all([one.boundingBox(),two.boundingBox()]);
 expect(a.y+a.height).toBeLessThan(b.y);expect(a.height).toBeGreaterThan(100);expect(b.height).toBeGreaterThan(100);
 expect(await one.evaluate(n=>getComputedStyle(n).transform)).toBe('matrix(-1, 0, 0, -1, 0, 0)');
 expect(await two.evaluate(n=>getComputedStyle(n).transform)).toBe('none');
 expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([w,640]);
 await page.locator('#start').click();
 if(shots&&w===390)await page.screenshot({path:path.join(shots,'ten-count-390.png')});
 await page.mouse.click(a.x+10,a.y+10);await expect(one).toHaveAttribute('aria-disabled','true');
 await page.mouse.click(a.x+15,a.y+15);await expect(arena).toHaveAttribute('data-phase','counting');
 await page.mouse.click(b.x+10,b.y+10);await expect(arena).toHaveAttribute('data-phase','done');
 await clean();
});
test('count hides time, closest to exact target; tie; rotation and replay',async({page})=>{
 const {one,two,arena,clean}=await open(page,390,844);
 await page.clock.install({time: 1000000});await page.clock.pauseAt(1001000);
 await page.locator('[data-game=count]').click();await page.locator('#start').dispatchEvent('click');
 await page.clock.runFor(9900);await page.keyboard.press('f');await expect(arena).not.toContainText('9.900');
 await page.setViewportSize({width:844,height:390});
 await page.clock.runFor(150);await page.keyboard.press('j');
 await expect(two).toHaveAttribute('data-result','win');
 await expect(one).toContainText('9.900 秒'); await expect(two).toContainText('10.050 秒');
 await page.locator('#start').dispatchEvent('click');await page.clock.runFor(10000);
 await page.keyboard.press('j');await page.keyboard.press('f');await expect(arena.locator('#signal')).toHaveText('引き分け');
 await clean();
});
test('counter landscape, keyboard false start, cancellation, simultaneous cue and replay',async({page})=>{
 const {arena,one,two,clean}=await open(page,640,320);
 await page.locator('input[value=counter]').check();
 await page.locator('[data-game=reflex]').click();
 const [a,b]=await Promise.all([one.boundingBox(),two.boundingBox()]);
 expect(a.x+a.width).toBeLessThan(b.x);expect(a.y).toBe(b.y);
 expect(await one.evaluate(n=>getComputedStyle(n).transform)).toBe('none');
 expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([640,320]);
 await page.clock.install({time: 2000000});await page.clock.pauseAt(2001000);
 await page.locator('#start').dispatchEvent('click');await page.keyboard.press('j');
 await expect(one).toHaveAttribute('data-result','win');await expect(two).toContainText('フライング');
 await page.locator('#start').dispatchEvent('click');await page.locator('#exit').dispatchEvent('click');await page.clock.runFor(2000);
 await expect(arena).toBeHidden();await expect(page.locator('[data-game=reflex]')).toBeFocused();
 await page.locator('[data-game=reflex]').dispatchEvent('click');await page.locator('#start').dispatchEvent('click');
 await expect(arena.locator('#signal')).toHaveText('合図を待って');if(shots)await page.screenshot({path:path.join(shots,'reflex-counter-640.png')});
 await page.clock.runFor(1600);await expect(one).toContainText('今だ！');await expect(two).toContainText('今だ！');
 await page.clock.runFor(220);await page.keyboard.press('f');await page.keyboard.press('j');await page.clock.runFor(18);await expect(arena.locator('#signal')).toHaveText('引き分け');
 await page.locator('#start').dispatchEvent('click');await page.clock.runFor(1820);await page.keyboard.press('j');await page.clock.runFor(18);await expect(two).toHaveAttribute('data-result','win');
 await clean();
});

for(const orientation of ['table','counter'])test('two simultaneous touch contacts '+orientation,async({page})=>{
 const [w,h]=orientation==='table'?[390,844]:[844,390];
 const {arena,one,two,clean}=await open(page,w,h);
 const session=await page.context().newCDPSession(page);
 await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 await page.locator('input[value='+orientation+']').check();
 await page.locator('[data-game=count]').click();
 const boxes=await Promise.all([one.boundingBox(),two.boundingBox()]);
 const point=(seat,id)=>({x:Math.round(boxes[seat].x+boxes[seat].width/2),y:Math.round(boxes[seat].y+boxes[seat].height/2),id,radiusX:2,radiusY:2,force:1});
 for(const first of [0,1]){
  await page.locator('#start').click();
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(first,1)]});
  await expect((first?two:one).locator('strong')).toHaveText('止めました');
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(first,1),point(1-first,2)]});
  await expect(arena).toHaveAttribute('data-phase','done');
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await clean();
});
test('curse prevents other seat and overshoot, loses on exactly 31 and alternates starter',async({page})=>{
 await open(page,320,568); await page.locator('[data-game=curse]').click(); await page.locator('#start').click();
 const a=page.locator('.extra.a'),b=page.locator('.extra.b');
 await expect(b.getByRole('button',{name:'+1',exact:true})).toBeDisabled();
 for(let i=0;i<10;i++) await (i%2?b:a).getByRole('button',{name:'+3',exact:true}).click();
 await expect(a.getByRole('button',{name:'+2',exact:true})).toBeDisabled();
 await a.getByRole('button',{name:'+1',exact:true}).click(); await expect(b).toHaveAttribute('data-result','win');
 await page.locator('#start').click();await expect(b.getByRole('button',{name:'+1',exact:true})).toBeEnabled();
});
test('flags read both labels, wrong hit never scores, alternating new targets, first to three',async({page})=>{
 const {clean}=await open(page,640,320);await page.locator('input[value=counter]').check();await page.locator('[data-game=flags]').click();await page.locator('#start').click();
 const a=page.locator('.extra.a'), b=page.locator('.extra.b');
 await b.getByRole('button',{name:'▲ 青'}).click();await expect(b).toContainText('0 点　違う旗');
 for(const f of ['● 赤','▲ 青','◆ 金']){await expect(a.locator('.flag-target')).toContainText(f);await a.getByRole('button',{name:f}).click();}
 await expect(a).toHaveAttribute('data-result','win');await expect(b).toHaveAttribute('data-result','lose');await clean();
});
test('memory presents same cue, scores independently and can tie on replay',async({page})=>{
 const {clean}=await open(page,390,844);await page.locator('[data-game=memory]').click();await page.locator('#start').click();
 const a=page.locator('.extra.a'), b=page.locator('.extra.b');
 await expect(a.locator('strong')).toHaveText('●');await expect(b.locator('strong')).toHaveText('●');
 await expect(a.getByRole('button',{name:'●'})).toBeEnabled();
 for(let i=0;i<4;i++){await a.getByRole('button',{name:'●'}).click();await b.getByRole('button',{name:'▲'}).click();}
 await expect(a).toHaveAttribute('data-result','win');await expect(b).toContainText('0 / 4 正解');
 await page.locator('#start').click();await expect(a.getByRole('button',{name:'●'})).toBeEnabled();
 for(let i=0;i<4;i++){await a.getByRole('button',{name:'●'}).click();await b.getByRole('button',{name:'●'}).click();}
 await expect(a).toContainText('引き分け');await clean();
});
for(const layout of ['table','counter'])test('curling: flick and keyboard throws, six throws, closest wins '+layout,async({page})=>{
 const vertical=layout==='table';const {clean}=await open(page,vertical?430:640,vertical?800:320);
 await page.locator('input[value='+layout+']').check();await page.locator('[data-game=curling]').click();await page.locator('#start').click();
 const a=page.locator('.extra.a'), b=page.locator('.extra.b');
 await expect(a).toHaveAttribute('data-turn','mine');await expect(b).toHaveAttribute('data-turn','theirs');
 // Dragging the coin backwards is not a throw, even in the turned-around 1P half (its screen-left is the lane's right).
 const coin=await a.locator('.curl-coin').boundingBox();
 const backwards=vertical?30:-30;
 await page.mouse.move(coin.x+coin.width/2,coin.y+coin.height/2);await page.mouse.down();
 await page.mouse.move(coin.x+coin.width/2+backwards,coin.y+coin.height/2,{steps:4});await page.mouse.up();
 await expect(a).toContainText('投数 0/3');await expect(a).toContainText('もっと勢いよく');
 // Keyboard power: 1P sets a strong enough throw once and keeps it; 2P throws with no power.
 for(let i=0;i<3;i++){
  const mine=a.locator('.curl-coin');await mine.focus();
  if(i===0)for(let k=0;k<16;k++)await mine.press('ArrowRight');
  await mine.press('Enter');
  const next=b.locator('.curl-coin');await expect(next).toBeVisible();await next.focus();await next.press('Enter');
  if(i<2)await expect(a.locator('.curl-coin')).toBeVisible();
 }
 await expect(a).toHaveAttribute('data-result','win');await expect(a).toContainText('投数 3/3');
 await expect(b).toContainText('投数 3/3');await expect(a.locator('.curl-landing.is-mine')).toHaveCount(3);await clean();
 if(shots)await page.screenshot({path:path.join(shots,'curling-'+layout+'.png')});
});
test('chooser fits 22 game links with mobile scrolling',async({page})=>{
 const {clean}=await open(page,390,844);await expect(page.locator('[data-game]')).toHaveCount(22);
 if(shots)await page.screenshot({path:path.join(shots,'six-chooser-390.png'),fullPage:true});
 await clean();
});

test('win count follows rematches, memory shows the answer, sound can be switched off',async({page})=>{
 const {clean}=await open(page,390,844);
 await page.locator('[data-game=memory]').click();
 const a=page.locator('.extra.a'), b=page.locator('.extra.b');
 for(let game=0;game<2;game++){
  await page.locator('#start').click();
  await expect(a.getByRole('button',{name:'●'})).toBeEnabled();
  for(let i=0;i<4;i++){await a.getByRole('button',{name:'●'}).click();await b.getByRole('button',{name:'▲'}).click();}
  await expect(a).toHaveAttribute('data-result','win');
  await expect(a.locator('.say')).toContainText('正解　● ● ● ●');
 }
 await expect(a.locator('.seat')).toHaveText('1P　2勝');await expect(b.locator('.seat')).toHaveText('2P');
 const sound=page.locator('#sound');await expect(sound).toHaveAttribute('aria-pressed','true');
 await sound.click();await expect(sound).toHaveAttribute('aria-pressed','false');
 // Choosing a game again starts the count afresh.
 await page.locator('#exit').click();await page.locator('[data-game=memory]').click();
 await expect(a.locator('.seat')).toHaveText('1P');
 await clean();
});

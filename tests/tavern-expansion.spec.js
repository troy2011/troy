const {test,expect}=require('@playwright/test');
const IDs=['tug-of-war','skull-bomb','quick-math','color-word','number-touch','cannon-power','shell-count','chest-shuffle','take-fifteen','pirate-dice','treasure-dig'];
const assets=new Set(['/tavern-minigames.html','/favicon.ico','/css/tavern-minigames-v1.css','/css/tavern-expansion-v1.css','/js/tavern-minigames-v1.js','/js/tavern-extra-v1.js','/js/tavern-fx-v1.js','/js/tavern-expansion-v1.js','/js/tavern-games-a-v1.js','/js/tavern-games-b-v1.js','/js/tavern-sea-games-v1.js','/css/tavern-sea-games-v1.css','/js/tavern-sea-deck-v1.js','/js/tavern-sea-crew-v1.js','/css/tavern-sea-crew-v1.css']);
const seat=(p,s)=>p.locator('.xgame-seat').nth(s);
const cmd=(p,s,n)=>seat(p,s).getByRole('button',{name:n,exact:typeof n==='string'}).click();
const uid=(p,s,i)=>seat(p,s).locator('button').nth(i).click();
const result=async(p,text)=>{await expect(p.locator('#arena')).toHaveAttribute('data-phase','done');await expect(p.locator('#signal')).toContainText(text);};
async function home(p){
  await p.addInitScript(()=>{Math.random=()=>0;});
  await p.goto('/tavern-minigames.html');
}
async function game(p,id){await p.locator('[data-game='+id+']').click();await p.locator('#start').click();}
for(const [layout,w,h] of [['table',320,640],['table',390,844],['table',430,884],['counter',844,390]])test('22 games chooser and all new boards: '+layout+' '+w,async({page})=>{
  const bad=[],errors=[];page.on('request',r=>{const u=new URL(r.url());if(u.hostname!=='127.0.0.1'||!assets.has(u.pathname))bad.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:w,height:h});
  await home(page);
  await expect(page.locator('#games button')).toHaveCount(22);
  expect(await page.locator('#games button').allTextContents()).not.toContain('じゃんけん');
  await page.locator('input[value='+layout+']').check();
  for(const id of IDs){
    await game(page,id);
    await expect(page.locator('#arena')).toHaveAttribute('data-newgame',id);
    expect(await seat(page,0).evaluate(e=>getComputedStyle(e).transform)).toBe(layout==='table'?'matrix(-1, 0, 0, -1, 0, 0)':'none');
    expect(await seat(page,1).evaluate(e=>getComputedStyle(e).transform)).toBe('none');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(w);
    expect(await page.locator('.xgame-seat button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44))).toBe(true);
    await page.locator('#exit').click();
  }
  expect(bad).toEqual([]);expect(errors).toEqual([]);
});
for(const id of IDs)test('actual completed outcome: '+id,async({page:p})=>{
  await p.clock.install();
  await home(p);await game(p,id);
  const step=ms=>p.clock.runFor(ms);
  switch(id){
    case 'tug-of-war':await step(1900);for(let i=0;i<15;i++)await cmd(p,0,'引く！');await result(p,'引き切った');break;
    case 'skull-bomb':await uid(p,0,0);await uid(p,0,0);await expect(seat(p,1).getByRole('button',{name:'的'})).toBeVisible();await step(8200);await result(p,'2P の手の中で爆発');break;
    case 'quick-math':for(let i=0;i<3;i++){await cmd(p,0,'4');await step(800);}await result(p,'3 対 0');break;
    case 'color-word':await cmd(p,1,'赤');await expect(seat(p,1)).toContainText('お手つき');for(let i=0;i<3;i++){await cmd(p,0,'青');await step(800);}await result(p,'3 対 0');break;
    case 'number-touch':await step(1900);await cmd(p,1,'2');await expect(seat(p,1)).toContainText('お手つき');for(let n=1;n<=9;n++)await cmd(p,0,String(n));await result(p,'1P が先に9まで');break;
    case 'cannon-power':for(let shot=0;shot<3;shot++){await cmd(p,0,'撃つ！');await step(200);await cmd(p,1,'撃つ！');await step(1200);}await result(p,'誤差の合計');break;
    case 'shell-count':
      for(const [show,a,b] of [[1450,'6','7'],[1150,'7','9'],[900,'8','8']]){await step(show);await cmd(p,0,a);await cmd(p,1,b);await step(1350);}
      await result(p,'合計 6 対 3');break;
    case 'chest-shuffle':
      for(const wait of [3800,4200,4200]){await step(wait);await cmd(p,0,'左の樽');await cmd(p,1,'右の樽');await step(1450);}
      await result(p,'合計 3 対 0');break;
    case 'take-fifteen':for(const [s,n] of [[0,1],[1,2],[0,5],[1,3],[0,9]])await cmd(p,s,String(n));await result(p,'15');break;
    case 'pirate-dice':
      await expect(seat(p,1).getByRole('button',{name:'振る'})).toHaveCount(0);
      await cmd(p,0,'振る');await step(500);await expect(p.locator('#signal')).toContainText('ドクロ');
      await p.evaluate(()=>{Math.random=()=>0.99;});
      for(let i=0;i<5;i++){await cmd(p,1,'振る');await step(500);}await result(p,'30 枚に到達');break;
    case 'treasure-dig':
      for(let i=0;i<40&&await p.locator('#arena').getAttribute('data-phase')==='play';i++){
        const mine=p.locator('.xgame-seat[data-turn=mine]');await mine.locator('.xgame-board button:not(:disabled)').first().click();
      }
      await result(p,'お宝');break;
  }
});
test('orientation and exit cancel old timers; replay alternates starter',async({page:p})=>{
  await p.setViewportSize({width:390,height:844});await p.clock.install();await home(p);await game(p,'tug-of-war');await p.clock.runFor(1900);await cmd(p,0,'引く！');
  await p.setViewportSize({width:844,height:390});
  await expect(p.locator('#arena')).toHaveAttribute('data-phase','idle');
  await p.clock.runFor(6000);await expect(p.locator('#arena')).toHaveAttribute('data-phase','idle');
  await p.locator('#exit').click();await game(p,'take-fifteen');
  for(const [s,n] of [[0,1],[1,2],[0,5],[1,3],[0,9]])await cmd(p,s,String(n));
  await result(p,'1P');await p.locator('#start').click();
  await expect(seat(p,1).getByRole('button',{name:'1',exact:true})).toBeEnabled();
  await expect(seat(p,0).getByRole('button',{name:'1',exact:true})).toBeDisabled();
});

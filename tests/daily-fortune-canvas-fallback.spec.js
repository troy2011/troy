const {test,expect}=require('@playwright/test');
const {installBaseAppMocks}=require('./helpers/main-app-harness');
test.use({serviceWorkers:'block'});
const result={cardId:'wand-7',cardNumber:7,suit:'Wand',isArcana:false,cardName:'Fixture Card',orientation:'upright',fortune:'Fixture full result',strikeLine:'Fixture full result',rewardType:'card',rewardPs:7,rewardItemName:'Fixture Card'};
async function setup(page,{failure='none',reducedMotion=false}={}){
 if(reducedMotion)await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(({failure})=>{
   const get=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(...args){if(failure==='init'&&this.classList.contains('tarot-fortune-fx-canvas'))throw Error('fixture init');return get.apply(this,args)};
   const clear=CanvasRenderingContext2D.prototype.clearRect;
   CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('tarot-fortune-fx-canvas')&&(failure==='draw'||window.__failFx))throw Error('fixture draw');return clear.apply(this,args)};
 },{failure});
 const context=page.context();
 await context.routeWebSocket('**/*',socket=>socket.close());
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'&&!url.pathname.startsWith('/api/')&&route.request().method()==='GET')return route.continue();return route.fulfill({status:501,json:{error:'UnmockedRequestBlocked'}})});
 await installBaseAppMocks(page,{});let drawn=false,calls=0;
 await page.route('**/api/tarot-fortune-status',r=>r.fulfill({json:drawn?{canDraw:false,result}:{canDraw:true}}));
 await page.route('**/api/tarot-fortune-draw',r=>{calls++;drawn=true;return r.fulfill({json:{ok:true,result,balance:257,dailyBountyReward:{awarded:true,alreadyClaimed:true,rank:2,rewardDayKey:'2026-10-29',items:[{itemId:'fixture-prize',amount:1}]}}})});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.myPlayFabId==='PF_PLAYWRIGHT');await expect(page.locator('#btnDailyFortune')).toBeEnabled();await page.locator('#btnDailyFortune').click();
 await expect(page.locator('.tarot-fortune-card-shell')).toHaveCount(3);
 return {draws:()=>calls,errors};
}
for(const failure of ['init','draw'])test(`${failure} failure shows the same complete result and cleans up`,async({page})=>{
 const s=await setup(page,{failure});await page.locator('.tarot-fortune-card-shell').first().click();
 await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine,{timeout:5000});
 await expect(page.locator('#dailyTarotFortuneReward')).toContainText('Fixture Card');await expect(page.locator('#dailyTarotFortuneBounty')).toContainText('fixture-prize');
 await expect(page.locator('.tarot-fortune-fx')).toHaveCount(0);await expect(page.locator('#dailyTarotFortuneOverlay')).not.toHaveClass(/is-fortune-charging/);
 expect(s.errors).toEqual([]);expect(s.draws()).toBe(1);
 await page.locator('.tarot-fortune-close').click();await page.locator('#btnDailyFortune').click();
 await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);expect(s.draws()).toBe(1);
});
test('closing and reopening during an interrupted effect does not touch the new result',async({page})=>{
 const s=await setup(page);await page.locator('.tarot-fortune-card-shell').first().click();await expect(page.locator('.tarot-fortune-fx')).toHaveCount(1);
 await page.locator('.tarot-fortune-close').click();await page.evaluate(()=>{window.__failFx=true});await page.locator('#btnDailyFortune').click();
 await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);await page.waitForTimeout(1000);
 await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);expect(s.draws()).toBe(1);expect(s.errors).toEqual([]);
});
for(const mode of ['account','session'])test(`${mode} change prevents a late failure from displaying the old result`,async({page})=>{
 const s=await setup(page);await page.locator('.tarot-fortune-card-shell').first().click();await expect(page.locator('.tarot-fortune-fx')).toHaveCount(1);
 await page.evaluate(mode=>{if(mode==='account')window.myPlayFabId='OTHER_FIXTURE';else window.isPlayerSessionCurrent=()=>false;window.__failFx=true},mode);
 await expect(page.locator('.tarot-fortune-fx')).toHaveCount(0);await page.waitForTimeout(1000);
 await expect(page.locator('#dailyTarotFortuneText')).not.toHaveClass(/is-result/);await expect(page.locator('#dailyTarotFortuneOverlay')).not.toHaveClass(/is-fortune-charging/);expect(s.draws()).toBe(1);expect(s.errors).toEqual([]);
});
test('reduced motion does not render a prior user result after session change',async({page})=>{
 const s=await setup(page,{reducedMotion:true});await page.evaluate(()=>{window.isPlayerSessionCurrent=()=>false});
 await page.locator('.tarot-fortune-card-shell').first().click();await expect(page.locator('#dailyTarotFortuneText')).not.toHaveClass(/is-result/);expect(s.draws()).toBe(1);
});
test('normal reveal keeps its timing and prevents repeated selection',async({page})=>{
 const s=await setup(page);const start=Date.now();await page.locator('.tarot-fortune-card-shell').first().click();
 await page.locator('.tarot-fortune-card-shell').evaluateAll(cards=>cards.forEach(card=>card.click()));
 await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine,{timeout:10000});const elapsed=Date.now()-start;
 expect(elapsed).toBeGreaterThan(2200);expect(elapsed).toBeLessThan(10000);expect(s.draws()).toBe(1);expect(s.errors).toEqual([]);console.log('normal reveal elapsed ms:',elapsed);
});
test('reduced motion still shows the result without effects',async({page})=>{
 const s=await setup(page,{reducedMotion:true});await page.locator('.tarot-fortune-card-shell').first().click();
 await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);await expect(page.locator('.tarot-fortune-fx')).toHaveCount(0);expect(s.draws()).toBe(1);
});

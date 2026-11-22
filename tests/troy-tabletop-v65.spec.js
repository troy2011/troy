const { test, expect } = require('@playwright/test');
const { bootstrapMainApp } = require('./helpers/main-app-harness');
const url = '/tarot-kingdom-table.html?v=65';

for (const width of [320, 390, 430]) {
  test('TROY ゲーム menu and offline v65 tabletop at '+width+'px', async ({page}) => {
    await page.setViewportSize({width,height:844});
    await bootstrapMainApp(page);
    await page.locator('#navTroy').click();
    await expect(page.locator('#navCompanions')).toHaveCount(0);
    await expect(page.locator('#troyTabletopV65')).toHaveCount(0);
    await page.locator('#navGames').click();
    await expect(page).toHaveURL(/#games$/);
    await expect(page.locator('#navGames')).toHaveClass(/active/);
    await page.goBack();
    await expect(page.locator('#navTroy')).toHaveClass(/active/);
    await page.goForward();
    await expect(page.locator('#navGames')).toHaveClass(/active/);
    const cta=page.locator('#tarotTabletopV65');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href',url);
    const contrast = await page.evaluate(() => {
      const l=(rgb)=>rgb.match(/[\d.]+/g).map(Number).slice(0,3).map(c=>c/255)
        .map(c=>c<=0.04045?c/12.92:((c+.055)/1.055)**2.4)
        .reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
      return ['#tarotModePoker','#tarotTabletopV65'].flatMap(selector=>{
        const card=document.querySelector(selector), bg=l(getComputedStyle(card).backgroundColor);
        return [...card.querySelectorAll('.tarot-mode-name,.tarot-mode-desc,.tarot-shared-lobby-note')].map(node=>{
          const c=getComputedStyle(node),fg=l(c.color);
          return { ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05), size:parseFloat(c.fontSize), shadow:c.textShadow };
        });
      });
    });
    for (const label of contrast) {
      expect(label.ratio).toBeGreaterThanOrEqual(4.5);
      expect(label.size).toBeGreaterThanOrEqual(14);
      expect(label.shadow).toBe('none');
    }
    await expect(page.locator('#tarotModeSpin,#tarotSpinRoot')).toHaveCount(0);
    if(width===390 && process.env.TROY_PORT_SHOTS) await page.screenshot({path:process.env.TROY_PORT_SHOTS+'/troy-entry.png'});
    await expect(page.locator('#tarotModePoker')).toBeVisible();
    await expect(page.locator('#tarotModeKingdom')).toBeHidden();
    await expect(page.locator('#tarotTabletopV65')).toHaveAttribute('href',url);
    const requests=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{ if(/\/tarot-kingdom-table|\/tabletop-v65\//.test(r.frame().url()) && /\/api\/|sign.?in|chatgpt\.site/.test(r.url())) requests.push(r.url()); });
    await cta.click();
    await expect(page).toHaveURL(new RegExp('tarot-kingdom-table\\.html\\?v=65$'));
    await expect(page.getByRole('button',{name:'CPU練習'})).toBeVisible();
    await expect(page.getByText('オンライン対戦',{exact:true})).toHaveCount(0);
    if(width===390 && process.env.TROY_PORT_SHOTS) await page.screenshot({path:process.env.TROY_PORT_SHOTS+'/troy-tabletop-menu.png'});
    await page.getByRole('link',{name:'ルール',exact:true}).click();
    await expect(page).toHaveURL(/tabletop-v65\/tarot-kingdom-table-rules/);
    await page.locator('[data-rule="eight"]').first().click();
    await expect(page).toHaveURL(/#eight$/);
    if(width===390 && process.env.TROY_PORT_SHOTS) await page.screenshot({path:process.env.TROY_PORT_SHOTS+'/troy-tabletop-rules.png'});
    await page.goto(url+'&room=123456&mode=cpu&rating-preview=1#online');
    await expect(page).toHaveURL(/\?v=65$/);
    await page.getByRole('button',{name:'CPU練習'}).click();
    await expect(page.locator('#ktStart')).toBeVisible();
    await page.locator('input[name=ktSeats][value="3"]').check();
    await page.locator('#ktStart').click();
    await expect(page.locator('#ktFelt')).toHaveAttribute('data-seats','3');
    await expect(page.locator('#ktHand .kt-card').first()).toBeVisible();
    if(width===390 && process.env.TROY_PORT_SHOTS) await page.screenshot({path:process.env.TROY_PORT_SHOTS+'/troy-tabletop-board.png'});
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test('old companion deep link returns home without fetching companion features', async ({page}) => {
  await bootstrapMainApp(page);
  await page.evaluate(() => { location.hash='companions'; });
  await expect(page).not.toHaveURL(/#companions$/);
  await expect(page.locator('#navHome')).toHaveClass(/active/);
  await expect(page.locator('#tabContentCompanions')).toBeHidden();
  await expect(page.locator('#btnOpenCompanionsFromQr')).toHaveCount(0);
  await page.evaluate(() => { location.hash='tarot'; });
  await expect(page.locator('#navGames')).toHaveClass(/active/);
  await expect(page.locator('#tarotModePoker')).toBeVisible();
  await page.locator('#tarotModePoker').click();
  await expect(page.locator('#tarotPokerRoot')).toBeVisible();
  await page.locator('#navGames').click();
  await expect(page.locator('#tarotModePoker')).toBeVisible();
  await expect(page.locator('#tarotModeSpin,#tarotSpinRoot')).toHaveCount(0);
});

test('legacy Spin URLs cannot open a game and the shared Tarot sprite remains', async ({ page, request }) => {
  for (const path of ['/spin-tarot-preview.html','/js/spinTarot.js?v=20260325a','/css/spin-tarot.css']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.get('/Sprites/Buildings/tarot.png')).status()).toBe(200);
  await bootstrapMainApp(page);
  await page.evaluate(() => { location.hash='spin-tarot'; });
  await expect(page).toHaveURL(/#games$/);
  await expect(page.locator('#navGames')).toHaveClass(/active/);
  await expect(page.locator('#tarotModeSpin,#tarotSpinRoot')).toHaveCount(0);
});

test('updated service worker removes only retired Spin cache entries', async ({page})=>{
  await page.goto('/tarot-kingdom-table.html');
  const result=await page.evaluate(async()=>{
    const name='troy-runtime-troy-app-v20261003-profile-cache-v2';
    const stale='/js/spinTarot.js?v=20260325a', shared='/Sprites/Buildings/tarot.png';
    const cache=await caches.open(name);
    await cache.put(stale,new Response('old spin'));
    await cache.put(shared,new Response('shared'));
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    return { stale:!!await cache.match(stale), shared:!!await cache.match(shared), status:(await fetch(stale)).status };
  });
  expect(result).toEqual({stale:false,shared:true,status:404});
});

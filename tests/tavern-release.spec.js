const {test,expect}=require('@playwright/test');
const {bootstrapMainApp}=require('./helpers/main-app-harness');

test('Games tab links to the offline-capable 22 game page',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await bootstrapMainApp(page);
    await page.locator('#navGames').click();
    const link=page.locator('#troyTavernMinigames');
    await expect(link).toHaveAttribute('href','/tavern-minigames.html');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.locator('#games button')).toHaveCount(22);
});

test('existing service worker uses new versioned assets and reopens a visited page offline',async({page,context})=>{
    await page.setViewportSize({width:320,height:700});
    await page.goto('/tarot-kingdom-table.html');
    await page.evaluate(async()=>{
      const old=await caches.open('troy-runtime-troy-app-v20261003-profile-cache-v2');
      await old.put('/tavern-minigames.html',new Response('retired shell'));
      await old.put('/js/tavern-minigames-v1.js?v=3',new Response('invalid retired script'));
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller) await new Promise(done=>navigator.serviceWorker.addEventListener('controllerchange',done,{once:true}));
    });
    await page.goto('/tavern-minigames.html');
    await expect(page.locator('#games button')).toHaveCount(22);
    await expect.poll(()=>page.evaluate(async()=>{
      const files=['/tavern-minigames.html', ...[...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(n=>n.src||n.href)];
      return (await Promise.all(files.map(f=>caches.match(f)))).every(Boolean);
    })).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#games button')).toHaveCount(22);
    await page.locator('[name=layout][value=counter]').check();
    await page.locator('#games button').first().click();
    await expect(page.locator('#arena')).toHaveAttribute('data-layout','counter');
    await page.locator('#start').click();
    await expect(page.locator('#arena')).not.toHaveAttribute('data-phase','idle');
});

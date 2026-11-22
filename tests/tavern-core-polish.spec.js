
const {test,expect}=require('@playwright/test');
const game=async(p,id,layout)=>{
 await p.setViewportSize({width:390,height:844});await p.addInitScript(()=>{Math.random=()=>0;});
 await p.goto('/tavern-minigames.html');await p.locator('input[value='+layout+']').check();
 await p.locator('[data-game='+id+']').click();await p.locator('#start').click();
};
test('Ten Count only shows early/late feedback after both players stop',async({page:p})=>{
 await p.clock.install();await game(p,'count','table');
 await p.clock.runFor(9890);await p.keyboard.press('f');
 await expect(p.locator('.core-game-feedback').first()).toBeHidden();
 await p.clock.runFor(300);await p.keyboard.press('j');
 await expect(p.locator('.core-game-feedback').first()).toContainText('早い');
 await expect(p.locator('.core-game-feedback').last()).toContainText('遅い');
 await p.keyboard.press('Escape');await expect(p.locator('[data-game=count]')).toBeFocused();
});
test('Reflex displays non-color labels and equal false starts draw regardless of event order',async({page:p})=>{
 await p.clock.install();await game(p,'reflex','counter');
 await expect(p.locator('.core-game-feedback').first()).toContainText('■');
 await p.keyboard.press('j');await p.keyboard.press('f');
 await expect(p.locator('#signal')).toHaveText('両者フライング。引き分け');
 await p.locator('#start').click();await p.clock.runFor(1650);
 await expect(p.locator('.core-game-feedback').first()).toContainText('●');
});
test('Memory shows each private input count and Curling shows actual shot history',async({page:p})=>{
 await p.clock.install();await game(p,'memory','table');
 await p.clock.runFor(330);
 await expect(p.locator('.tavern-memory-progress').first()).toHaveAttribute('aria-label','見る 1 / 4');
 await p.clock.runFor(2900);await p.locator('.extra.a .extra-actions button').first().click();
 await expect(p.locator('.tavern-memory-progress').first()).toHaveAttribute('aria-label','入力 1 / 4');
 await expect(p.locator('.tavern-memory-progress').last()).toHaveAttribute('aria-label','入力 0 / 4');
 await p.locator('#exit').click();await p.locator('[data-game=curling]').click();await p.locator('#start').click();
 const shots=p.locator('.tavern-curl-shots');
 await expect(shots.first()).toHaveAttribute('aria-label',/^残り 3投/);
 const coin=p.locator('.extra.a .curl-coin');await coin.press('ArrowRight');
 await coin.press('Enter');await p.clock.runFor(2000);
 await expect(shots.first()).toHaveAttribute('aria-label',/^残り 2投。1投目/);
 await expect(shots.last()).toHaveAttribute('aria-label',/^残り 3投/);
});

test('real mobile emulation begins at page scale 1 and physical taps reach control centers',async({browser,baseURL})=>{
 for(const [width,height] of [[320,640],[390,844]]){
  const screen={width,height};
  const c=await browser.newContext({viewport:screen,screen,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  try{
    const p=await c.newPage();await p.goto(baseURL+'/tavern-minigames.html');
    expect(await p.evaluate(()=>visualViewport.scale)).toBeCloseTo(1,2);
    for(const id of ['count','bell-rhythm','sail-patch']){
      await p.locator('[data-game='+id+']').tap();
      await p.locator('#start').tap();
      await expect(p.locator('#arena')).toBeVisible();
      await p.locator('#exit').tap();
      await expect(p.locator('#chooser')).toBeVisible();
    }
  }finally{await c.close();}
 }
});

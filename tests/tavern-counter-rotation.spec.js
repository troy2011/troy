
const {test,expect}=require('@playwright/test');
for(const [width,height] of [[320,640],[390,844]]) {
  test('portrait counter rotates once, bounds all game controls and restores chooser at '+width,async({page})=>{
    await page.setViewportSize({width,height});
    await page.goto('/tavern-minigames.html');
    const arena=page.locator('#arena');
    await page.locator('input[value=counter]').check();
    const ids=await page.locator('#games [data-game]').evaluateAll(rows=>rows.map(e=>e.dataset.game));
    expect(ids).toHaveLength(22);
    for(const id of ids) {
      await page.locator('[data-game='+id+']').click();
      await expect(arena).toHaveCSS('transform',/^matrix\(0, 1, -1, 0,/);
      const bounds=await arena.evaluate(e=>{
        const inside=node=>{
          const r=node.getBoundingClientRect();
          return r.width>0&&r.height>0&&r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5;
        };
        return {arena:inside(e),controls:['#exit','#start','#sound'].every(s=>inside(e.querySelector(s))),scroll:document.documentElement.scrollHeight,rotatedSeats:[...e.querySelectorAll('.player')].filter(n=>n.offsetWidth).some(n=>getComputedStyle(n).transform!=='none')};
      });
      expect(bounds,id).toEqual({arena:true,controls:true,scroll:height,rotatedSeats:false});
      await page.locator('#start').click();
      await page.locator('#exit').click();
      await expect(page.locator('[data-game='+id+']')).toBeFocused();
    }
    await page.locator('[data-game=count]').click();
    if(process.env.TROY_ROTATED_SHOT&&width===390) await page.screenshot({path:process.env.TROY_ROTATED_SHOT});
    await page.locator('#start').press('Enter');
    await page.keyboard.press('f');
    await page.keyboard.press('j');
    await expect(arena).toHaveAttribute('data-phase','done');
    await page.setViewportSize({width:height,height:width});
    await expect(arena).toHaveCSS('transform','none');
    await page.setViewportSize({width,height});
    await expect(arena).toHaveCSS('transform',/^matrix\(0, 1, -1, 0,/);
    await page.locator('#exit').press('Enter');
    await page.locator('input[value=table]').check();
    await page.locator('[data-game=count]').click();
    await expect(arena).toHaveCSS('transform','none');
    await expect(arena.locator('button.player.a')).toHaveCSS('transform','matrix(-1, 0, 0, -1, 0, 0)');
  });
}
test('curling projects swipes down the physical screen and drops held input on rotation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/tavern-minigames.html');
  await page.locator('input[value=counter]').check();
  await page.locator('[data-game=curling]').click();
  await page.locator('#start').click();
  const coin=page.locator('.extra.a .curl-coin');
  const box=await coin.boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('#arena')).toHaveCSS('transform','none');
  await page.mouse.up();
  await expect(coin).toBeEnabled();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#arena')).toHaveCSS('transform',/^matrix\(0, 1, -1, 0,/);
  const again=await coin.boundingBox();
  const cx=again.x+again.width/2,cy=again.y+again.height/2;
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx,cy+110,{steps:3});await page.mouse.up();
  await expect(page.locator('.extra.b .curl-coin')).toBeEnabled();
});

test('Ten Count previews same early time to both seats, fades and resets, without sharing stop times',async({page})=>{
  await page.clock.install();
  await page.setViewportSize({width:390,height:844});
  await page.goto('/tavern-minigames.html');
  await page.locator('input[value=counter]').check();
  await page.locator('[data-game=count]').click();
  const arena=page.locator('#arena');
  const previews=arena.locator('.count-preview');
  const labels=arena.locator('button.player small');
  await expect(previews.first()).toBeHidden();
  await page.locator('#start').click();
  await page.clock.runFor(1100);
  expect(await previews.first().textContent()).toBe(await previews.last().textContent());
  expect(parseFloat(await previews.first().textContent())).toBeGreaterThanOrEqual(1);
  await expect(previews.first()).toHaveAttribute('aria-hidden','true');
  await page.keyboard.press('f');
  await expect(labels.first()).toHaveText('');
  await page.clock.runFor(2200);
  await expect(arena).toHaveAttribute('data-count-preview','fade');
  await expect(previews.first()).toHaveCSS('transition-duration','0.75s, 0s');
  await expect(previews.first()).toBeHidden();
  await expect(previews.last()).toBeHidden();
  await expect(labels.first()).toHaveText('');
  await page.keyboard.press('j');
  await expect(arena).toHaveAttribute('data-phase','done');
  await expect(labels.first()).toContainText(/\d+\.\d{3}/);
  await expect(labels.last()).toContainText(/\d+\.\d{3}/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#start').click();
  await expect(arena).toHaveAttribute('data-count-preview','live');
  expect(parseFloat(await previews.first().textContent())).toBeLessThan(1);
  await page.clock.runFor(3130);
  await expect(previews.first()).toHaveCSS('transition-duration','0s');
  await expect(previews.first()).toBeHidden();
  await page.locator('#exit').click();
  await expect(arena).not.toHaveAttribute('data-count-preview',/./);
});

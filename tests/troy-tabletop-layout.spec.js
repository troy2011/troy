const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const root='public/tabletop-v65/js/kingdomTable/';
const dimensions=page=>page.evaluate(()=>{
  const rect=id=>{const r=(id==='ktMessage'?document.getElementById(id).parentElement:document.getElementById(id)).getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height};};
  return {height:innerHeight, scroll:document.scrollingElement.scrollHeight, table:rect('ktTable'), me:rect('ktMe'), message:rect('ktMessage'), actions:rect('ktActions')};
});
const fixture=String.raw`
window.turnLayoutFixture=(kind)=>{
  const card=id=>Rules.buildDeck().find(c=>c.id===id);
  const round=match.round;
  if (kind==='reason') {
    const ace=card('coin-15');
    Object.assign(round,{phase:'play',turn:ME,passed:[],direction:1,back:false,lock:null,cut:false,field:{kind:'normal',count:1,plays:[{by:1,cards:[ace]}]}});
    round.players[ME].hand=[card('major-13'),card('coin-4')];
    render();
  } else if(kind.startsWith('opponent:')) {
    NAMES[1]=kind.slice(9);
    render();
  } else if(kind==='pass' || kind==='reverse' || kind==='skip' || kind==='over') {
    const ace=card('coin-15');
    Object.assign(round,{phase:kind==='over'?'give':'play',turn:ME,last:2,direction:kind==='reverse'||kind==='skip'?-1:1,
      passed:kind==='skip'?[2]:[],field:{kind:'normal',count:1,plays:[{by:2,cards:[ace]}]}});
    if(kind==='pass' && !Rules.pass(round,ME).ok) throw new Error('fixture could not pass');
    render();
  } else if(kind==='long') {
    $('ktAvatarSeat').hidden=false;
    playerRating=98765;
    hint='説明の全文です。'.repeat(48);
    renderMe();
    renderMessage([],[]);
  }
};
`;
for(const [width,height] of [[320,568],[360,640],[390,844]])test('embedded TROY fixed practice table at '+width+' x '+height,async({page})=>{
  await page.setViewportSize({width,height});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/ui.js?v=moving-light-v1',route=>route.fulfill({contentType:'text/javascript',
    body:fs.readFileSync(root+'ui.js','utf8').replace('const ratingPreview = false;','const ratingPreview = true;')+fixture,
  }));
  await page.goto('/tarot-kingdom-table.html?v=65');
  await page.getByRole('button',{name:'CPU練習'}).click();
  await page.locator('input[name=ktSeats][value="3"]').check();
  await page.locator('#ktStart').click();
  await expect(page.locator('#ktTable')).toBeVisible();
  await page.evaluate(()=>window.turnLayoutFixture('reason'));
  await page.locator('#ktHand [data-card="major-13"]').click();
  await expect(page.locator('#ktMessage')).toContainText('この大札では小札Aに返せません（コインは大札18）。');
  await expect(page.locator('#ktMessage')).not.toContainText('悪魔');
  await expect(page.locator('.kt-your-turn-flag')).toHaveCount(0);
  await expect(page.locator('#ktTurnOrder')).toContainText('手番：あなた');
  expect(await page.locator('#ktTurnOrder').evaluate(el=>getComputedStyle(el).clipPath)).toBe('inset(50%)');
  const mark=seat=>page.locator(seat===0?'#ktMe':'[data-seat="'+seat+'"] .kt-seat-panel');
  await expect(mark(0)).toHaveAttribute('data-turn','current');
  const lighting = await mark(0).evaluate(panel=>{
    const read=()=>{const style=getComputedStyle(panel);const {width,height}=panel.getBoundingClientRect();return {width,height,border:style.borderColor,radius:style.borderRadius,background:style.backgroundImage};};
    const on=read();
    const glow=getComputedStyle(panel,'::before').borderColor;
    const next=panel.closest('#ktTable').querySelector('.kt-seat-panel[data-turn="next"]');
    const amber=getComputedStyle(next,'::before').backgroundImage;
    panel.dataset.turn='test-no-overlay';
    const unchanged=read();
    panel.dataset.turn='current';
    return {on,unchanged,glow,amber};
  });
  expect(lighting.on).toEqual(lighting.unchanged);
  expect(lighting.glow).toBe('rgba(72, 231, 214, 0.51)');
  expect(lighting.amber).toContain('radial-gradient');
  await expect(page.locator('.kt-turn-marker, .kt-turn-ornament')).toHaveCount(0);
  await page.evaluate(()=>window.turnLayoutFixture('reverse'));
  await expect(mark(2)).toHaveAttribute('data-turn','next');
  await page.evaluate(()=>window.turnLayoutFixture('skip'));
  await expect(mark(1)).toHaveAttribute('data-turn','next');
  await expect(mark(2)).not.toHaveAttribute('data-turn', /./);
  await page.evaluate(()=>window.turnLayoutFixture('pass'));
  await expect(mark(0)).not.toHaveAttribute('data-turn', /./);
  await expect(mark(1)).toHaveAttribute('data-turn','current');
  await expect(mark(2)).toHaveAttribute('data-turn','next');
  await page.evaluate(()=>window.turnLayoutFixture('over'));
  await expect(page.locator('.kt-seat-panel[data-turn], #ktMe[data-turn]')).toHaveCount(0);
  await page.evaluate(()=>window.turnLayoutFixture('reason'));
  const selfName=page.locator('#ktMe strong').first();
  await expect(selfName).toHaveText('あなた');
  expect(await selfName.evaluate(n=>n.scrollWidth===n.clientWidth && getComputedStyle(n).textOverflow!=='ellipsis')).toBe(true);
  const before=await dimensions(page);
  const opponent=page.locator('[data-seat="1"]');
  const playerName=opponent.locator('.kt-seat-name');
  const reveal=opponent.getByRole('button',{name:'2番席の名前を表示'});
  for(const alias of ['星月海賊船長黄金','WWWWWWWW','😀😀😀😀😀😀😀😀','🏴‍☠️🏴‍☠️🏴‍☠️🏴‍☠️🏴‍☠️🏴‍☠️🏴‍☠️🏴‍☠️']){
    await page.evaluate(name=>window.turnLayoutFixture('opponent:'+name),alias);
    await expect(playerName).toBeVisible();
    await expect(playerName).toHaveText(alias);
    await expect(reveal).not.toBeVisible();
    expect(await playerName.evaluate(n=>n.getBoundingClientRect().width<=n.parentElement.clientWidth)).toBe(true);
  }
  const wide='W'.repeat(10);
  await page.evaluate(name=>window.turnLayoutFixture('opponent:'+name),wide);
  if (width===320) expect(await playerName.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeLessThan(12);
  const legacy='長い海賊プレイヤー名'.repeat(5);
  await page.evaluate(name=>window.turnLayoutFixture('opponent:'+name),legacy);
  await expect(reveal).toBeVisible();
  await reveal.focus(); await page.keyboard.press('Enter');
  const fullName=page.getByRole('dialog',{name:'プレイヤー名'});
  await expect(fullName).toContainText(legacy);
  await page.keyboard.press('Escape'); await expect(fullName).not.toBeVisible();
  await page.evaluate(()=>window.turnLayoutFixture('long'));
  await expect(page.locator('#ktMe .kt-player-rating')).toHaveText('レート98765');
  const ratingFits=await page.locator('#ktMe .kt-player-rating').evaluate(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.right<=p.right && getComputedStyle(n).whiteSpace==='nowrap';});expect(ratingFits).toBe(true);
  const after=await dimensions(page);
  console.log(width,height,JSON.stringify({before,after}));
  expect(after.scroll).toBe(height);
  expect(after.actions.bottom).toBeLessThanOrEqual(height);
  expect(after.table.height).toBe(before.table.height);
  expect(after.me.height).toBe(before.me.height);
  expect(after.message.top).toBe(before.message.top);
  expect(after.actions.top).toBe(before.actions.top);
  const more=page.getByRole('button',{name:'説明の全文を表示'});
  await expect(more).toBeVisible();await more.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'説明'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('説明の全文です。'.repeat(48));
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});


test('one current light travels smoothly and keeps the next lamp static',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.route('**/ui.js?v=moving-light-v1',route=>route.fulfill({contentType:'text/javascript', body:fs.readFileSync(root+'ui.js','utf8')+fixture}));
  for (const quiet of [false,true]) {
    await page.goto('/tarot-kingdom-table.html'+(quiet?'?fast':''));
    await page.getByRole('button',{name:'CPU練習'}).click();
    await page.locator('input[name=ktSeats][value="3"]').check();
    await page.locator('#ktStart').click();
    await page.evaluate(()=>window.turnLayoutFixture('reason'));
    const panel=page.locator('#ktMe');
    const measure=()=>panel.evaluate(n=>{
      const travel=n.getAnimations({subtree:true}).filter(a=>a.animationName==='kt-current-light-lap');
      const speed=travel[0]?.effect.getTiming().duration;
      const samples=travel.map(a=>{
        a.pause();
        return [0,0.25,0.5,0.75].map(r=>{a.currentTime=r*speed;return getComputedStyle(n,'::after').offsetDistance});
      });
      return {speed,samples, fallback:getComputedStyle(n,'::before').borderStyle, next:getComputedStyle(document.querySelector('.kt-seat-panel[data-turn="next"]'),'::after').animationName};
    });
    if (!quiet) {
      expect(await measure()).toEqual({speed:3100,samples:[['0%','25%','50%','75%']],fallback:'solid',next:'none'});
      await page.emulateMedia({reducedMotion:'reduce'});
      expect(await measure()).toEqual({samples:[],fallback:'solid',next:'none'});
      await page.emulateMedia({reducedMotion:'no-preference'});
    } else expect(await measure()).toEqual({samples:[],fallback:'solid',next:'none'});
  }
});

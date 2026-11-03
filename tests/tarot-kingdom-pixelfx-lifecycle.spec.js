const { test, expect } = require('@playwright/test');

async function openFixture(page) {
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4179' || request.method() !== 'GET') return route.abort();
    if (url.pathname === '/pixelfx-fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <link rel="stylesheet" href="/style.css"><div id="tabContentTarot"><div id="tarotKingdomRoot" class="tarot-kingdom-reference-ui">
      <div id="tarotKingdomBattleStage" style="width:390px;height:300px;position:relative">
      <div id="actor" class="tarot-kingdom-battle-player-avatar" data-combat-status="blind" style="position:absolute;width:80px;height:120px">
      <span class="tarot-kingdom-status-accent" data-status="blind"></span></div></div></div></div>` });
    return route.continue();
  });
  await page.goto('/pixelfx-fixture');
}

for (const [label, suffix] of [['status', '/tarotKingdomStatusFx/blind.js'], ['core', '/vendor/pixelfx/core/index.js']]) {
  test(`${label} load failure retains the CSS status and retries`, async ({ page }) => {
    await openFixture(page);
    let attempts = 0;
    await page.route(`**${suffix}*`, route => {
      attempts += 1;
      return attempts === 1 ? route.abort() : route.continue();
    });
    const first = await page.evaluate(async () => {
      const api = await import('/js/tarotKingdomPixelFx.js');
      const stage = document.querySelector('#tarotKingdomBattleStage'), actor = document.querySelector('#actor');
      await api.syncTarotKingdomStatusFx(stage, 'player-0', actor, 'blind');
      return { status: actor.dataset.pixelStatus || '', visibility: getComputedStyle(actor.querySelector('.tarot-kingdom-status-accent')).visibility };
    });
    expect(first).toEqual({ status: '', visibility: 'visible' });
    await page.waitForTimeout(1100);
    const second = await page.evaluate(async () => {
      const api = await import('/js/tarotKingdomPixelFx.js');
      const stage = document.querySelector('#tarotKingdomBattleStage'), actor = document.querySelector('#actor');
      await api.syncTarotKingdomStatusFx(stage, 'player-0', actor, 'blind');
      return actor.dataset.pixelStatus || '';
    });
    expect(attempts).toBe(2);
    // A failed core URL can also be cached as a dependency of the status module.
    // In that case the CSS fallback must remain visible until a page reload.
    expect(second).toBe(label === 'core' ? '' : 'blind');
  });
}

test('a previous reduced-motion hit cannot fade the next hit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page);
  const opacity = await page.evaluate(async () => {
    const api = await import('/js/tarotKingdomPixelFx.js');
    const stage = document.querySelector('#tarotKingdomBattleStage'), actor = document.querySelector('#actor');
    await api.playTarotKingdomWeaponHitFx(stage, { targetEl: actor, impactAt: Date.now() });
    await new Promise(resolve => setTimeout(resolve, 200));
    await api.playTarotKingdomWeaponHitFx(stage, { targetEl: actor, impactAt: Date.now() });
    await new Promise(resolve => setTimeout(resolve, 250));
    return stage.querySelector('.tarot-kingdom-pixelfx-layer').style.opacity;
  });
  expect(opacity).toBe('');
});

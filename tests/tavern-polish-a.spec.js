const { test, expect } = require('@playwright/test');
const seat = (page, index) => page.locator('.xgame-seat').nth(index);
const choice = (page, index, name) => seat(page, index).getByRole('button', { name, exact: true });
const tap = locator => locator.evaluate(el => el.click());

async function start(page, id, mode = 'table', width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.clock.install();
  await page.goto('/tavern-minigames.html');
  await page.locator('input[value=' + mode + ']').check();
  await page.locator('[data-game=' + id + ']').click();
  await page.locator('#start').click();
}
test('綱引き shows the same deadline and mirrored lead, then awards the right seat', async ({ page }) => {
  await start(page, 'tug-of-war', 'counter', 844, 390);
  await page.clock.runFor(1810);
  await expect(seat(page, 0).locator('.xgame-a-clock')).toHaveText(/^残り (11|12) 秒$/);
  await tap(choice(page, 0, '引く！'));
  await expect(seat(page, 0).locator('.xgame-a-lead')).toHaveText('あと 14 回で引き切る');
  await expect(seat(page, 1).locator('.xgame-a-lead')).toHaveText('相手が 1 回リード');
  for (let i = 0; i < 14; i++) await tap(choice(page, 0, '引く！'));
  await expect(seat(page, 0)).toHaveAttribute('data-result', 'win');
});
test('ドクロ爆弾: second hit passes, and the original hidden fuse remains active', async ({ page }) => {
  await start(page, 'skull-bomb');
  await tap(choice(page, 0, '的'));
  await expect(seat(page, 0).locator('.xgame-a-bomb-stages')).toHaveAttribute('aria-label', '1 / 2 成功');
  await tap(choice(page, 0, '的'));
  await expect(seat(page, 1).locator('.xgame-a-bomb-stages')).toHaveAttribute('aria-label', '0 / 2 成功');
  await page.evaluate(() => {
    window.bombVibrations = [];
    Object.defineProperty(navigator, 'vibrate', { value: pattern => window.bombVibrations.push(pattern) });
  });
  await page.clock.runFor(7300);
  await expect(page.locator('#signal')).toContainText('2P の手の中で爆発');
  await expect(seat(page, 0)).not.toHaveAttribute('data-result', 'win');
  expect(await page.evaluate(() => window.bombVibrations)).toEqual([220]);
  await page.clock.runFor(600);
  await expect(seat(page, 0)).toHaveAttribute('data-result', 'win');
  expect(await page.evaluate(() => window.bombVibrations)).toEqual([220, [60, 50, 120]]);
  await page.locator('#start').click();
  await page.clock.runFor(7300);
  await expect(page.locator('#signal')).toContainText('爆発');
  await page.locator('#exit').click();
  await page.clock.runFor(600);
  expect(await page.evaluate(() => window.bombVibrations)).toEqual([220, [60, 50, 120], 220]);
});
for (const [id, bad, answer, prompt] of [
  ['quick-math', '3', '4', '2 × 2 ＝ ?'],
  ['color-word', '赤', '青', '赤']
]) {
  test(id + ' keeps opponent buttons alive, shows a neutral double miss, then reveals the correct answer on resolution', async ({ page }) => {
    await start(page, id, 'counter', 320, 680);
    await expect(seat(page, 0).locator('.xgame-a-quiz-prompt')).toContainText(prompt);
    const peer = await choice(page, 1, bad).elementHandle();
    await tap(choice(page, 0, bad));
    expect(await peer.evaluate(el => el.isConnected && !el.disabled)).toBe(true);
    await tap(choice(page, 1, bad));
    for (const s of [0,1]) {
      await expect(seat(page, s)).toContainText('ふたりともお手つき');
      await expect(seat(page, s)).toContainText('あなた 0 点');
      await expect(seat(page, s).getByRole('button')).toHaveCount(0);
    }
    await page.clock.runFor(710);
    await tap(choice(page, 1, answer));
    await expect(seat(page, 1)).toContainText('答え：' + answer + ' ／ あなた 1 点');
  });
}
test('数字タッチ preserves simultaneous independent input and clears its freeze', async ({ page }) => {
  await start(page, 'number-touch');
  await page.clock.runFor(1810);
  const peer = await choice(page, 1, '1').elementHandle();
  await tap(choice(page, 0, '2'));
  await expect(choice(page, 0, '1')).toBeDisabled();
  expect(await peer.evaluate(el => el.isConnected && !el.disabled)).toBe(true);
  await tap(choice(page, 1, '1'));
  await expect(seat(page, 1)).toContainText('次：2');
  await page.clock.runFor(920);
  await tap(choice(page, 0, '1'));
  await expect(choice(page, 0, '1')).toHaveClass(/xgame-a-done/);
});
test('大砲 stores one shot per player and reveals errors only after both stop', async ({ page }) => {
  await start(page, 'cannon-power', 'counter', 844, 390);
  await tap(choice(page, 0, '撃つ！'));
  await expect(choice(page, 0, '発射済み')).toBeDisabled();
  await expect(seat(page, 0)).toContainText('相手の発射を待っています');
  await tap(choice(page, 1, '撃つ！'));
  for (const s of [0,1]) await expect(seat(page, s).locator('.xgame-a-instruction')).toHaveText(/(今回の誤差|ど真ん中！).*合計/);
  await page.clock.runFor(1120);
  await expect(choice(page, 0, '撃つ！')).toBeEnabled();
});
test('貝殻 size and placement match on both halves, with no overlapping shells or early disclosure', async ({ page }) => {
  await start(page, 'shell-count', 'counter', 320, 680);
  for (const s of [0,1]) {
    const status = await seat(page, s).locator('.xgame-a-shell').evaluateAll(els => {
      const boxes = els.map(el=>el.getBoundingClientRect());
      const overlap=boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom));
      return {count:els.length,overlap,placements:els.map(el=>[el.style.left,el.style.top])};
    });
    expect(status.count).toBe(6);
    expect(status.overlap).toBe(false);
    expect(status.placements).toEqual(await seat(page, 1-s).locator('.xgame-a-shell').evaluateAll(els=>els.map(el=>[el.style.left,el.style.top])));
  }
  await page.clock.runFor(1450);
  await tap(choice(page,0,'6'));
  await expect(seat(page,0).locator('.xgame-text')).toHaveText('回答済み。相手を待っています');
  await expect(page.locator('#signal')).toHaveText('貝殻は何個？');
  await tap(choice(page,1,'7'));
  await expect(page.locator('#signal')).toHaveText('正解 6 個　2 対 1');
  await expect(seat(page,0)).toContainText('ぴったり ＋2点');
  await expect(seat(page,1)).toContainText('1つ違い ＋1点');
});
test('宝箱 never highlights the first choice and reports both after lock-in', async ({ page }) => {
  await start(page,'chest-shuffle');
  await expect(seat(page,0).locator('.xgame-a-chest-stage')).toHaveText('金貨の位置を覚える');
  await page.clock.runFor(3770);
  await tap(choice(page,0,'左の樽'));
  await expect(seat(page,0).locator('.xgame-a-chest-stage')).toHaveText('回答済み。相手を待っています');
  await expect(seat(page,0).locator('.is-picked, .is-right, .is-wrong')).toHaveCount(0);
  await expect(choice(page,1,'中央の樽')).toBeEnabled();
  await tap(choice(page,1,'中央の樽'));
  await expect(seat(page,0).locator('.xgame-a-chest-stage')).toHaveText('正解！ ＋1点');
  await expect(seat(page,1).locator('.xgame-a-chest-stage')).toHaveText('はずれ。金貨は表示の樽');
});

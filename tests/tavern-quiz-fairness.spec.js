
const { test, expect } = require('@playwright/test');

const seat = (page, index) => page.locator('.xgame-seat').nth(index);
const choice = (page, index, name) => seat(page, index).getByRole('button', { name, exact: true });
async function start(page, game, mode) {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.clock.install();
  await page.goto('/tavern-minigames.html');
  await page.locator('input[value=' + mode + ']').check();
  await page.locator('[data-game=' + game + ']').click();
  await page.locator('#start').click();
}
for (const [id, wrong, mode] of [['quick-math', '3', 'table'], ['color-word', '赤', 'counter']]) {
  test(id + ' renders both scores during a no-score double miss, then resumes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width:390, height:844 });
    await start(page, id, mode);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await choice(page, 0, wrong).evaluate(button => button.click());
    await choice(page, 1, wrong).evaluate(button => button.click());
    for (const index of [0, 1]) {
      await expect(seat(page, index)).toContainText('ふたりともお手つき');
      await expect(seat(page, index)).toContainText('あなた 0 点');
      await expect(seat(page, index).getByRole('button')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    await page.clock.runFor(710);
    await expect(page.locator('#signal')).toContainText('第 2 問');
    await expect(page.locator('#signal')).toContainText('0 対 0');
    for (const index of [0, 1]) await expect(seat(page, index).getByRole('button')).toHaveCount(4);
  });
}
for (const [mode, width, height] of [['table',390,844], ['counter',390,844], ['counter',844,390]]) {
  test('shell answers remain private until both commit at ' + mode + ' ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await start(page, 'shell-count', mode);
    await page.clock.runFor(1450);
    await choice(page, 0, '6').click();
    await expect(seat(page, 0).locator('.xgame-text')).toHaveText('回答済み。相手を待っています');
    await expect(seat(page, 1).locator('.xgame-text')).toHaveText('貝殻は何個？');
    await expect(choice(page, 0, '6')).toBeDisabled();
    await expect(choice(page, 1, '7')).toBeEnabled();
    await choice(page, 1, '7').click();
    await expect(page.locator('#signal')).toHaveText('正解 6 個　2 対 1');
    await expect(seat(page, 0)).toContainText('あなた 6');
    await expect(seat(page, 1)).toContainText('あなた 7');
  });
}

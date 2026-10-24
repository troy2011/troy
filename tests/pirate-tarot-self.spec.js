const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('../scripts/build-pirate-self-readings.cjs');
const root = path.resolve(__dirname, '..');
const evidence = process.env.PIRATE_TAROT_EVIDENCE;
const meanings = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pirate-self-readings.json')));
const artwork = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/pirate-tarot/manifest.json')));

async function guard(page) {
  const errors = [];
  const unexpected = [];
  const requests = [];
  page.on('pageerror', () => errors.push('pageerror'));
  page.on('console', (message) => { if (message.type() === 'error') errors.push('consoleerror'); });
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' || request.method() !== 'GET' || url.pathname.startsWith('/api/')) {
      unexpected.push({ method: request.method(), path: url.pathname });
      return route.abort();
    }
    requests.push(url.pathname);
    return route.continue();
  });
  return { errors, unexpected, requests };
}
async function shot(page, name) {
  if (!evidence) return;
  await page.waitForFunction(() => [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    return !image.hidden && rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
  }).every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(async () => {
    const images = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return !image.hidden && rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
    });
    await Promise.all(images.map((image) => image.decode()));
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: path.join(evidence, name), fullPage: false });
}

test('all 78 adopted fronts map uniquely and the 156 meanings match their source', () => {
  expect(meanings).toEqual(build(root));
  expect(new Set(artwork.cards.map((card) => card.id)).size).toBe(78);
  expect(artwork.cards.map((card) => card.id).sort()).toEqual(meanings.cards.map((card) => card.id).sort());
  for (const card of meanings.cards) {
    for (const orientation of ['upright', 'reversed']) {
      const reading = card.meanings[orientation];
      for (const value of Object.values(reading)) {
        expect(value).toBeTruthy();
        expect(value).not.toMatch(/undefined|\{[a-z]+\}|<script|LINE|お客様/);
      }
      expect(reading.action).not.toMatch(/投資|借金|治療|服薬|診断|資金/);
    }
    expect(card.meanings.upright).not.toEqual(card.meanings.reversed);
  }
  for (const card of artwork.cards) {
    for (const variant of ['cards', 'thumbs']) {
      const record = card[variant];
      const bytes = fs.readFileSync(path.join(root, 'public/assets/pirate-tarot', record.path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
      expect(bytes.length).toBe(record.bytes);
      expect(record.width / record.height).toBeCloseTo(card.sourceWidth / card.sourceHeight, 2);
    }
  }
  expect(artwork.cards.find((card) => card.id === 'major-6').selectedVersion).toBe('恋人・女性が天を見上げる版v1');
  expect(artwork.cards.find((card) => card.id === 'sword-3').sourceSha256).toBe('fdfdc5e9fc1cb4b4656a78576948c3aac29bcbe1c171622bd110c58187bbabdd');
  expect(artwork.cards.find((card) => card.id === 'pentacle-10').sourceSha256).toBe('67d45b651d94d48b7051ee6d7399aea7e5b6a098cd0750432f67ddd4ab8f093c');
  expect(artwork.cards.find((card) => card.id === 'pentacle-6').sourceSha256).toBe('be432b749135f1c525fb75c70024aed84bca1e6bce5ac675f6c2444504fb2820');
});

test('mobile physical-card flow handles orientation, rapid clicks, history and reselection without APIs', async ({ page }) => {
  const health = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pirate-tarot.html');
  await expect(page).toHaveTitle('海賊タロット｜一枚から、自分の航路へ');
  await expect(page.locator('#cardGrid button')).toHaveCount(78);
  await shot(page, 'self-mobile-picker.png');
  const historyLength = await page.evaluate(() => history.length);
  await page.locator('#cardSearch').fill('ソード3');
  await expect(page.locator('#cardGrid button')).toHaveCount(1);
  await page.locator('[data-card-id="sword-3"]').click();
  await expect(page.locator('#showReading')).toBeDisabled();
  await page.getByLabel('逆位置', { exact: false }).check();
  await expect(page.locator('#selectedArt img')).toHaveClass(/is-reversed/);
  await page.locator('#showReading').evaluate((button) => { button.click(); button.click(); button.click(); });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#resultLabel')).toHaveText('ソード 3');
  await expect(page.locator('#resultDirection')).toHaveText('逆位置');
  await expect(page.locator('#resultPoint')).toHaveText(meanings.cards.find((card) => card.id === 'sword-3').meanings.reversed.point);
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await shot(page, 'self-mobile-result.png');
  await page.goBack();
  await expect(page.locator('#picker')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#result')).toBeVisible();
  await page.reload();
  await expect(page.locator('#resultLabel')).toHaveText('ソード 3');
  await page.locator('#readAgain').evaluate((button) => { button.click(); button.click(); button.click(); });
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#selectedLabel')).toHaveText('ソード 3');
  await page.locator('#clearSearch').click();
  await page.locator('#cardSearch').fill('金貨 6');
  await page.locator('[data-card-id="pentacle-6"]').click();
  await expect(page.locator('#showReading')).toBeDisabled();
  await page.getByLabel('正位置', { exact: false }).check();
  await page.locator('#showReading').click();
  await expect(page.locator('#resultLabel')).toHaveText('ペンタクル 6');
  await expect(page.locator('#resultDirection')).toHaveText('正位置');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(health.errors).toEqual([]);
  expect(health.unexpected).toEqual([]);
  expect(health.requests).not.toContain('/js/tarotReading.js');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('desktop filters, court rank aliases and keyboard selection remain usable', async ({ page }) => {
  const health = await guard(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/pirate-tarot.html');
  await expect(page.locator('#cardGrid button')).toHaveCount(78);
  await shot(page, 'self-desktop-picker.png');
  await page.getByRole('button', { name: '大アルカナ', exact: true }).click();
  await expect(page.locator('#cardGrid button')).toHaveCount(22);
  await page.getByRole('button', { name: 'カップ', exact: true }).click();
  await expect(page.locator('#cardGrid button')).toHaveCount(14);
  await page.locator('#cardSearch').fill('カップ１４');
  await expect(page.locator('#cardGrid button')).toHaveCount(1);
  await page.locator('[data-card-id="cup-king"]').focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('正位置', { exact: false }).check();
  await page.locator('#showReading').click();
  await expect(page.locator('#resultLabel')).toHaveText('カップ キング');
  await shot(page, 'self-desktop-result.png');
  await page.getByRole('button', { name: 'カード・向きを選び直す' }).click();
  await page.locator('#clearSearch').click();
  await page.locator('#cardSearch').fill('存在しないカード');
  await expect(page.locator('#emptySearch')).toBeVisible();
  await page.locator('#clearSearch').click();
  await expect(page.locator('#cardGrid button')).toHaveCount(78);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(health.errors).toEqual([]);
  expect(health.unexpected).toEqual([]);
});

test('data loading failure can retry and missing artwork preserves the reading controls', async ({ page }) => {
  await guard(page);
  let fail = true;
  await page.route('**/data/pirate-self-readings.json', (route) => fail ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
  await page.route('**/assets/pirate-tarot/cards/major-0.webp*', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/pirate-tarot.html');
  await expect(page.locator('#retryLoad')).toBeVisible();
  fail = false;
  await page.locator('#retryLoad').click();
  await expect(page.locator('#cardGrid button')).toHaveCount(78);
  await page.locator('[data-card-id="major-0"]').click();
  await expect(page.locator('#selectedArt img')).toBeHidden();
  await expect(page.locator('#selectedLabel')).toHaveText('愚者');
  await page.getByLabel('正位置', { exact: false }).check();
  await page.locator('#showReading').click();
  await expect(page.locator('#resultPoint')).not.toBeEmpty();
});

test('staff artwork follows single and triple selections while sending remains untouched', async ({ page }) => {
  const calls = [];
  await page.route('**/api/**', (route) => {
    calls.push(route.request().url().split('/api/')[1]);
    return route.fulfill({ json: { success: true, customers: [], isOpen: false, enabled: false } });
  });
  await page.goto('/tarot-reading.html');
  await expect(page.locator('#tarotCardGrid button img')).toHaveCount(22);
  await page.locator('[data-card-id="major-6"]').click();
  await expect(page.locator('.pirate-tarot-staff-gallery img')).toHaveAttribute('src', /major-6\.webp\?v=/);
  await page.locator('[data-orientation="reversed"]').click();
  await expect(page.locator('.pirate-tarot-staff-gallery img')).toHaveClass(/is-reversed/);
  await page.locator('[data-spread-mode="triple"]').click();
  await page.locator('[data-card-id="major-16"]').click();
  await page.locator('[data-card-id="major-20"]').click();
  await expect(page.locator('.pirate-tarot-staff-gallery img')).toHaveCount(3);
  await expect(page.locator('#tarotStaffReadingText')).not.toBeEmpty();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.pirate-tarot-staff-gallery').scrollIntoViewIfNeeded();
  await shot(page, 'staff-mobile-artwork.png');
  expect(calls).not.toContain('tarot-reading/send');
});

test('artwork identity resolver covers catalog aliases and removes art for non-tarot details', async ({ page }) => {
  await guard(page);
  await page.goto('/pirate-tarot.html');
  const result = await page.evaluate(async () => {
    const art = await import('/js/pirateTarotArtwork.js');
    const ids = [];
    for (let number = 0; number <= 21; number++) ids.push(art.getPirateTarotCardId({ Category: 'TarotMajor', ArcanaNumber: number }));
    for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
      for (let rank = 1; rank <= 14; rank++) ids.push(art.getPirateTarotCardId({ Category: 'MinorArcana', ArcanaSuit: suit, ArcanaRank: rank }));
    }
    const modal = document.createElement('div');
    modal.innerHTML = '<p id="itemDetailDescription"></p>';
    art.renderInventoryTarotArtwork({ name: 'カップのキング', customData: { Category: 'TarotMinor', ArcanaSuit: 'cup', ArcanaRank: 'KING' } }, modal);
    const image = modal.querySelector('img').getAttribute('src');
    art.renderInventoryTarotArtwork({ customData: { Category: 'Weapon' } }, modal);
    return { ids, image, remaining: modal.querySelectorAll('img').length, invalid: [art.getPirateTarotCardId('../secret'), art.getPirateTarotCardId({ Category: 'TarotMajor' })] };
  });
  expect(new Set(result.ids).size).toBe(78);
  expect(result.ids).not.toContain(null);
  expect(result.image).toBe(`/assets/pirate-tarot/cards/cup-king.webp?v=${artwork.assetVersion}&delivery=20261025`);
  expect(result.remaining).toBe(0);
  expect(result.invalid).toEqual([null, null]);
});

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

// The table version of Tarot Kingdom is a static page: no account, no API, no storage.
const shots = process.env.KT_SHOTS;

async function observe(page) {
    const errors = [];
    const unexpected = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1' || route.request().method() !== 'GET' || url.pathname.startsWith('/api/')) {
            unexpected.push(url.pathname);
            return route.abort();
        }
        return route.continue();
    });
    return { errors, unexpected };
}

async function shot(page, name) {
    if (!shots) return;
    fs.mkdirSync(shots, { recursive: true });
    await page.evaluate(() => Promise.all([...document.images]
        .filter(img => img.complete && img.naturalWidth > 0)
        .map(img => img.decode().catch(() => {}))));
    await page.screenshot({ path: path.join(shots, name) });
}

async function sit(page, { seats = 4, seed = 3 } = {}) {
    await page.goto(`/tarot-kingdom-table.html?seed=${seed}&fast=1`);
    if (seats === 3) await page.locator('.kt-choice label', { hasText: '3人' }).click();
    await page.locator('#ktStart').click();
    await expect(page.locator('#ktTable')).toBeVisible();
}

// Plays your seat through the buttons a player has: take any allowed play, otherwise draw or pass.
async function playOn(page, until, { advance } = {}) {
    for (let i = 0; i < 4000; i += 1) {
        if (await until()) return;
        const moved = await page.evaluate(() => {
            const dialog = document.getElementById('ktDialog');
            if (!dialog.hidden) {
                const card = dialog.querySelector('button.kt-card:not(.is-zoomable)');
                (card || dialog.querySelector('.kt-dialog-actions button')).click();
                return true;
            }
            const play = document.getElementById('ktPlay');
            const pass = document.getElementById('ktPass');
            const draw = document.getElementById('ktDraw');
            const hand = [...document.querySelectorAll('#ktHand .kt-card')];
            if (!hand.length || hand[0].disabled) return false;
            hand.filter((el) => el.classList.contains('is-selected')).forEach((el) => el.click());
            const playable = document.querySelector('#ktHand .kt-card.is-playable');
            if (playable) {
                playable.click();
                if (!document.getElementById('ktPlay').disabled) { document.getElementById('ktPlay').click(); return true; }
                document.querySelector('#ktHand .kt-card.is-selected')?.click();
            }
            if (play.textContent === '除外する') { pass.click(); return true; }
            if (!draw.disabled) { draw.click(); return true; }
            if (!pass.disabled) { pass.click(); return true; }
            return false;
        });
        if (!moved) {
            if (advance) await advance();
            else await page.waitForTimeout(40);
        }
    }
    throw new Error('the match did not reach the expected state');
}

for (const width of [320, 390, 430]) {
    test(`the table fits a ${width}px phone and deals eight cards`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        const seen = await observe(page);
        await page.goto('/tarot-kingdom-table.html?seed=3&fast=1');
        await expect(page.locator('h1')).toContainText('タロットキングダム');
        await shot(page, `setup-${width}.png`);
        await page.locator('#ktStart').click();
        await expect(page.locator('#ktHand .kt-card')).toHaveCount(8);
        await expect(page.locator('.kt-seat:visible')).toHaveCount(3);
        await expect(page.locator('#ktFieldCards .kt-field-top .kt-card')).not.toHaveCount(0);
        await expect(page.locator('#ktRound')).toHaveText('第1局 / 4');
        await expect(page.locator('#ktPot')).toHaveText('場 80');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const box = await page.locator('#ktActions').boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(700);
        for (const button of await page.locator('.kt-actions .kt-button:visible').all()) {
            expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        // Artwork and portraits must arrive locally before the table is ready.
        await expect.poll(() => page.locator('#ktHand .kt-card-art').evaluateAll((list) => list.length === 8 && list.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
        await expect.poll(() => page.locator('.kt-seat:visible .kt-seat-portrait').evaluateAll((list) => list.length === 3 && list.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
        await expect(page.locator('#ktHand .kt-card-rank')).toHaveCount(8);
        const labels = await page.locator('#ktHand .kt-card-rank').allTextContents();
        expect(labels.every(label => /^(?:\d+|A)$/.test(label))).toBe(true);
        const artworkFillsFrames = await page.locator('#ktHand .kt-card, #ktFieldCards .kt-field-top .kt-card').evaluateAll(cards => cards.every(card => {
            const image = card.querySelector('.kt-card-art');
            const rank = card.querySelector('.kt-card-rank');
            return image.offsetLeft === 0 && image.offsetTop === 0
                && image.offsetWidth === card.clientWidth && image.offsetHeight === card.clientHeight
                && rank.offsetLeft >= 0 && rank.offsetTop >= 0
                && rank.offsetLeft + rank.offsetWidth <= image.offsetWidth
                && rank.offsetTop + rank.offsetHeight <= image.offsetHeight;
        }));
        expect(artworkFillsFrames).toBe(true);
        await shot(page, `table-${width}.png`);
        expect(seen.errors).toEqual([]);
        expect(seen.unexpected).toEqual([]);
    });
}

test('three players sit left and right and play three rounds', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page, { seats: 3 });
    await expect(page.locator('.kt-seat:visible')).toHaveCount(2);
    await expect(page.locator('#ktSeatTop')).toBeHidden();
    await expect(page.locator('#ktRound')).toHaveText('第1局 / 3');
    await expect(page.locator('#ktPot')).toHaveText('場 60');
    await expect(page.locator('.kt-seat:visible .kt-seat-portrait')).toHaveCount(2);
});

test('the table links to its current one-way equal-number suit cycle', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    const seen = await observe(page);
    await page.goto('/tarot-kingdom-table.html');
    await expect(page.locator('#ktSetup')).toContainText('同数字は弱点のスート、または大札で返せます');
    const guide = page.getByRole('link', { name: '札の出し方の説明書を読む' });
    await expect(guide).toHaveAttribute('href', 'tarot-kingdom-table-rules.html');
    await expect(page.locator('#ktTable a')).toHaveAttribute('href', 'tarot-kingdom-table-rules.html');
    await guide.click();
    await expect(page).toHaveTitle('卓上戦のルール — タロットキングダム');
    await expect(page.locator('h1')).toHaveText('卓上戦のルール');
    await expect(page.locator('main')).toContainText('ワンド←カップ←ソード←ペンタクル←ワンド');
    await expect(page.locator('main')).toContainText('大札入りの組は、スートを問わず返せます');
    await expect(page.locator('main')).toContainText('役も強さも同じなら返せません');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(seen.errors).toEqual([]);
    expect(seen.unexpected).toEqual([]);
});

test('the field shows the correct counter suit and excludes majors from an ace reply', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const seen = await observe(page);
    const time = new Date('2026-11-15T00:00:00Z');
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(time.getTime() + 1000));
    for (const sample of [
        { seed: 3, field: 'wand-13', hint: '同数字：カップ・大札' },
        { seed: 11, field: 'coin-4', hint: '同数字：ワンド・大札' },
        { seed: 13, field: 'cup-15', hint: '同じA：ソード' },
        { seed: 21, field: 'sword-15', hint: '同じA：ペンタクル' }
    ]) {
        await sit(page, { seed: sample.seed });
        await expect(page.locator('#ktFieldCards .kt-field-top .kt-card')).toHaveAttribute('data-card', sample.field);
        await expect(page.locator('#ktFieldState')).toContainText(sample.hint);
        await shot(page, `counter-hint-${sample.seed}.png`);
    }
    await sit(page, { seed: 6 });
    await expect(page.locator('#ktFieldState')).toContainText('8カット');
    await expect(page.locator('#ktFieldState')).not.toContainText('同数字');
    expect(seen.errors).toEqual([]);
    expect(seen.unexpected).toEqual([]);
});

test('only aces use letters and major arcana show their suit memberships on both frames', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const seen = await observe(page);
    const time = new Date('2026-11-15T00:00:00Z');
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(time.getTime() + 1000));
    const red = 'rgb(235, 112, 104)', blue = 'rgb(112, 179, 245)', green = 'rgb(119, 205, 146)';
    const yellow = 'rgb(239, 209, 100)', white = 'rgb(244, 243, 239)';
    const palette = { wand: red, cup: blue, coin: green, sword: yellow };
    const majorFrames = {
        1: [red, blue, green, yellow],
        16: [white, yellow, white, yellow], 17: [white, blue, white, blue],
        18: [white, green, white, green], 19: [white, red, white, red]
    };
    const coveredMajors = new Set(), coveredRanks = new Set();
    for (const seed of [36, 201, 628, 381]) {
        await sit(page, { seed });
        const cards = await page.locator('#ktHand .kt-card, #ktFieldCards .kt-field-top .kt-card').evaluateAll(nodes => nodes.map(node => {
            const rank = node.querySelector('.kt-card-rank');
            const sides = element => {
                const style = getComputedStyle(element);
                return [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor];
            };
            const value = getComputedStyle(rank.querySelector('.kt-card-value'));
            return { id: node.dataset.card, suit: node.dataset.suit, label: rank.textContent, cardFrame: sides(node), rankFrame: sides(rank), textColor: value.color, textGradient: value.backgroundImage, textClip: value.backgroundClip };
        }));
        for (const card of cards) {
            const num = Number(card.id.split('-').at(-1));
            const major = card.suit === 'major';
            expect(card.label).toBe(!major && num === 15 ? 'A' : String(num));
            const expected = major ? majorFrames[num] || Array(4).fill(white) : Array(4).fill(palette[card.suit]);
            expect(card.cardFrame).toEqual(expected);
            expect(card.rankFrame).toEqual(expected);
            if (major && num === 1) {
                expect(card.textColor).toBe('rgba(0, 0, 0, 0)');
                expect(card.textClip).toBe('text');
                for (const colour of [red, blue, green, yellow]) expect(card.textGradient).toContain(colour);
            } else {
                const majorText = { 16: yellow, 17: blue, 18: green, 19: red };
                expect(card.textColor).toBe(major ? majorText[num] || white : palette[card.suit]);
            }
            if (major && majorFrames[num]) coveredMajors.add(num);
            if (!major && num >= 11) coveredRanks.add(num);
            if (major && num === 15) coveredRanks.add('major-15');
        }
        await shot(page, `compound-suits-seed-${seed}.png`);
    }
    expect([...coveredMajors].sort((a, b) => a - b)).toEqual([1, 16, 17, 18, 19]);
    expect([...coveredRanks].sort()).toEqual([11, 12, 13, 14, 15, 'major-15'].sort());
    expect(seen.errors).toEqual([]);
    expect(seen.unexpected).toEqual([]);
});

test('opponent cards, counts and last-card emphasis stay in sync through a match', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 760 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const time = new Date('2026-11-14T00:00:00Z');
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(time.getTime() + 1000));
    // Seed 5 includes an opponent drawing during the match, as well as playing out.
    await sit(page, { seed: 5 });
    await expect.poll(() => page.locator('.kt-seat:visible img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await page.clock.runFor(16);
    const snapshot = () => page.evaluate(() => ({
        dialog: !document.getElementById('ktDialog').hidden,
        title: document.getElementById('ktDialogTitle').textContent,
        hands: [...document.querySelectorAll('.kt-seat:not([hidden])')].map(host => {
            const fan = host.querySelector('.kt-opponent-hand');
            return {
                seat: host.dataset.seat,
                count: Number(host.querySelector('.kt-seat-count').textContent),
                backs: fan.children.length,
                fanCount: Number(fan.dataset.count),
                hidden: fan.hidden,
                last: host.classList.contains('is-last-card'),
                backsOnly: [...fan.children].every(img => new URL(img.src).pathname.endsWith('/back.webp'))
            };
        })
    }));
    const initial = await snapshot();
    expect(initial.hands.map(hand => hand.count)).toEqual([8, 8, 8]);
    await shot(page, 'opponents-dealt-390.png');
    let previous = initial.hands;
    let capturedLast = false;
    const seen = { fewer: false, more: false, last: false, empty: false };
    await playOn(page, async () => {
        const state = await snapshot();
        for (const hand of state.hands) {
            expect(hand.backs).toBe(hand.count);
            expect(hand.fanCount).toBe(hand.count);
            expect(hand.hidden).toBe(hand.count === 0);
            expect(hand.last).toBe(hand.count === 1);
            expect(hand.backsOnly).toBe(true);
            const before = previous?.find(old => old.seat === hand.seat);
            if (before) {
                if (hand.count < before.count) seen.fewer = true;
                if (hand.count > before.count) seen.more = true;
            }
            if (hand.count === 1) seen.last = true;
            if (hand.count === 0) seen.empty = true;
        }
        // Reset across results/retrieve dialogs so a fresh deal does not count as drawing.
        previous = state.dialog ? null : state.hands;
        if (!capturedLast && !state.dialog && state.hands.some(hand => hand.count === 1)) {
            await shot(page, 'opponents-last-card-390.png');
            capturedLast = true;
        }
        return state.dialog && /勝ち/.test(state.title);
    }, { advance: () => page.clock.runFor(60) });
    expect(seen).toEqual({ fewer: true, more: true, last: true, empty: true });
});

test('a whole match can be played to the final ranking and all chips are accounted for', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 760 });
    const seen = await observe(page);
    await sit(page);
    const title = page.locator('#ktDialogTitle');
    await playOn(page, async () => /結果/.test(await title.textContent()) && await page.locator('#ktDialog').isVisible());
    await expect(page.locator('#ktDialogBody .kt-score li')).toHaveCount(4);
    await shot(page, 'result-390.png');
    await playOn(page, async () => /勝ち/.test(await title.textContent()));
    const chips = await page.locator('#ktDialogBody .kt-score-final li .kt-chip').allTextContents();
    expect(chips).toHaveLength(4);
    const total = chips.reduce((sum, text) => sum + Number(text), 0);
    // A drawn last round would leave its pot on the table; otherwise every chip is in someone's hands.
    expect(total).toBeLessThanOrEqual(4000);
    expect(total).toBeGreaterThan(3000);
    await shot(page, 'final-390.png');
    await page.locator('#ktDialogActions button', { hasText: 'もう一度' }).click();
    await expect(page.locator('#ktRound')).toHaveText('第1局 / 4');
    await expect(page.locator('#ktHand .kt-card')).toHaveCount(8);
    expect(seen.errors).toEqual([]);
    expect(seen.unexpected).toEqual([]);
});

test('changing the seat count after a match updates the portraits in both directions', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    for (const seats of [3, 4]) {
        await playOn(page, async () => await page.locator('#ktDialog').isVisible()
            && /勝ち/.test(await page.locator('#ktDialogTitle').textContent()));
        await page.locator('#ktDialogActions button', { hasText: '人数を選び直す' }).click();
        await expect(page.locator('#ktSetup')).toBeVisible();
        await page.locator('.kt-choice label', { hasText: `${seats}人` }).click();
        await page.locator('#ktStart').click();
        await expect(page.locator('.kt-seat:visible')).toHaveCount(seats - 1);
        await expect(page.locator('#ktSeatLeft')).toHaveAttribute('data-seat', seats === 3 ? '2' : '3');
        await expect(page.locator('#ktSeatLeft .kt-seat-portrait')).toHaveAttribute('src', new RegExp(`/${seats === 3 ? 'captain' : 'sailor'}\\.webp$`));
    }
});

test('an illegal selection is explained and cannot be played', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    await playOn(page, async () => await page.locator('#ktHand .kt-card:not(:disabled)').count() > 0
        && await page.locator('#ktDialog').isHidden());
    const cards = page.locator('#ktHand .kt-card');
    await cards.nth(0).click();
    await cards.nth(7).click();
    await expect(page.locator('#ktPlay')).toBeDisabled();
    await expect(page.locator('#ktMessage')).not.toHaveText('');
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard selection keeps focus and lets the player select the next card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    const cards = page.locator('#ktHand .kt-card');
    await expect(cards.first()).toBeEnabled();
    await cards.first().focus();
    await page.keyboard.press('Space');
    await expect(cards.first()).toBeFocused();
    await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expect(cards.nth(1)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ktSelection')).toHaveText('2枚を選択中');
});

for (const input of [
    { name: '320px touch', width: 320, height: 760, hasTouch: true },
    { name: '390px touch', width: 390, height: 844, hasTouch: true },
    { name: 'desktop mouse', width: 1440, height: 1000, hasTouch: false }
]) {
    test.describe(input.name, () => {
        test.use({ viewport: { width: input.width, height: input.height }, hasTouch: input.hasTouch });

        test('selecting a card leaves the neighbouring cards tappable', async ({ page }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await sit(page);
            const cards = page.locator('#ktHand .kt-card');
            await expect(cards.first()).toBeEnabled();
            // Use the exposed number strips, where a player taps overlapping cards.
            const points = await cards.locator('.kt-card-rank').evaluateAll(ranks => ranks.map(rank => {
                const rect = rank.getBoundingClientRect();
                return { x: rect.left + 10, y: rect.top + rect.height / 2 };
            }));
            const selected = [];
            for (const index of [3, 4, 2, 5, 1]) {
                const point = points[index];
                if (input.hasTouch) await page.touchscreen.tap(point.x, point.y);
                else await page.mouse.click(point.x, point.y);
                selected.push(index);
                for (const chosen of selected) await expect(cards.nth(chosen)).toHaveAttribute('aria-pressed', 'true');
                await expect(page.locator('#ktSelection')).toHaveText(`${selected.length}枚を選択中`);
            }
            await shot(page, `hand-multiselect-${input.width}.png`);
            // The exposed edge also remains usable to deselect a raised card.
            const point = points[3];
            if (input.hasTouch) await page.touchscreen.tap(point.x, point.y);
            else await page.mouse.click(point.x, point.y);
            await expect(cards.nth(3)).toHaveAttribute('aria-pressed', 'false');
            await expect(page.locator('#ktSelection')).toHaveText('4枚を選択中');
        });

        test('mixed numeric order supports manual drag, arrows and restoring order', async ({ page, context }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            const seen = await observe(page);
            const time = new Date('2026-11-15T00:00:00Z');
            await page.clock.install({ time });
            await page.clock.pauseAt(new Date(time.getTime() + 1000));
            await sit(page, { seed: 6 });
            const cards = page.locator('#ktHand .kt-card');
            const order = () => cards.evaluateAll(nodes => nodes.map(node => node.dataset.card));
            const before = await order();
            expect(before[0]).toBe('major-1');
            const numbers = before.map(id => Number(id.split('-').at(-1)));
            expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
            // The computer has the turn; arranging must still be available.
            await expect(cards.first()).toBeDisabled();
            await page.locator('#ktArrange').click();
            await expect(cards.first()).toBeEnabled();
            const source = await cards.last().locator('.kt-card-rank').boundingBox();
            const target = await cards.first().locator('.kt-card-rank').boundingBox();
            const start = { x: source.x + 10, y: source.y + source.height / 2 };
            const end = { x: Math.max(1, target.x - 10), y: start.y };
            if (input.hasTouch) {
                const cdp = await context.newCDPSession(page);
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x - 25, y: start.y, id: 1 }] });
                await expect(page.locator('.kt-hand-drag-card')).toBeVisible();
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
                expect(await order()).toEqual(before);
                await expect(page.locator('.kt-hand-drag-card, .kt-hand-drop-marker')).toHaveCount(0);
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
                for (let step = 1; step <= 8; step += 1) {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 8, y: start.y, id: 1 }] });
                }
                await expect(page.locator('.kt-hand-drag-card')).toBeVisible();
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await cdp.detach();
            } else {
                await page.mouse.move(start.x, start.y);
                await page.mouse.down();
                await page.mouse.move(end.x, end.y, { steps: 8 });
                await expect(page.locator('.kt-hand-drag-card')).toBeVisible();
                await page.mouse.up();
            }
            const moved = [before.at(-1), ...before.slice(0, -1)];
            expect(await order()).toEqual(moved);
            await expect(page.locator('.kt-hand-drag-card, .kt-hand-drop-marker')).toHaveCount(0);
            await expect(page.locator('#ktMoveLeft')).toBeDisabled();
            await page.locator('#ktMoveRight').click();
            expect(await order()).toEqual([moved[1], moved[0], ...moved.slice(2)]);
            if (!input.hasTouch) {
                const node = cards.nth(1);
                await node.focus();
                await page.keyboard.press('ArrowRight');
                await expect(cards.nth(2)).toBeFocused();
            }
            await shot(page, `manual-order-${input.width}.png`);
            await page.locator('#ktSortHand').click();
            expect(await order()).toEqual(before);
            await page.locator('#ktArrange').click();
            await expect(page.locator('#ktActions')).toBeVisible();
            await expect(page.locator('#ktHand .is-selected')).toHaveCount(0);
            await expect(page.locator('#ktSelection')).toHaveText('相手の手番');
            expect(seen.errors).toEqual([]);
            expect(seen.unexpected).toEqual([]);
        });
    });
}

test('manual order and selected cards survive drawing and returning to play', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sit(page);
    await playOn(page, async () => await page.locator('#ktDialog').isHidden()
        && await page.locator('#ktDraw').isEnabled());
    const cards = page.locator('#ktHand .kt-card');
    const order = () => cards.evaluateAll(nodes => nodes.map(node => node.dataset.card));
    const chosen = await cards.first().getAttribute('data-card');
    await cards.first().focus();
    await page.keyboard.press('Space');
    await page.locator('#ktArrange').click();
    const last = cards.last();
    await last.focus();
    await page.keyboard.press('ArrowLeft');
    const manual = await order();
    await page.locator('#ktArrange').click();
    await expect(page.locator(`#ktHand [data-card="${chosen}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#ktDraw').click();
    expect((await order()).slice(0, -1)).toEqual(manual);
    await expect(page.locator(`#ktHand [data-card="${chosen}"]`)).toHaveAttribute('aria-pressed', 'true');
});

test('the seat shows the han it would win with: one for going out, one more for the dealer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    const dealer = await page.locator('#ktMe .kt-badge-dealer').count();
    await expect(page.locator('#ktMe .kt-han-pill')).toHaveText(`${1 + dealer}翻`);
    await expect(page.locator('.kt-actions .kt-button:visible')).toHaveCount(3);
    await expect(page.locator('.kt-badge-dealer')).toHaveCount(1);
});

test('reduced motion removes the card movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    expect(await page.locator('#ktHand .kt-card').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    const opponentCard = page.locator('.kt-opponent-hand .kt-fan-card').first();
    expect(await opponentCard.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(await opponentCard.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('a field card opens its full artwork and closes again', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    await expect(page.locator('#ktHand .kt-card').first()).toBeEnabled();
    await page.locator('#ktFieldCards .kt-field-top .kt-card').first().click();
    const zoom = page.locator('#ktZoom');
    await expect(zoom).toBeVisible();
    await expect.poll(() => zoom.locator('img').evaluate((img) => img.complete && img.naturalWidth)).toBe(640);
    await zoom.click();
    await expect(zoom).toBeHidden();
    await expect(page.locator('#ktFieldCards .kt-field-top .kt-card').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(zoom).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(zoom).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(zoom).toBeHidden();
    await expect(page.locator('#ktFieldCards .kt-field-top .kt-card').first()).toBeFocused();
});

// Replace only the initial deal. The real rules still clear the field and move its cards.
async function installPileFixture(page, { call = false } = {}) {
    await page.route(/\/js\/kingdomTable\/rules\.js\?v=20261115-last-card-v1$/, route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            export * from '/js/kingdomTable/rules.js?fixture=pile-real';
            import { createRound as realRound, buildDeck, evaluateRole } from '/js/kingdomTable/rules.js?fixture=pile-real';
            export function createRound(options) {
                const state = realRound(options), deck = buildDeck();
                const card = id => deck.find(item => item.id === id);
                const hands = [['wand-9', 'major-21'], ['cup-10', 'coin-13'], ['coin-11', 'major-19'], ['sword-10', 'wand-11']];
                state.players = hands.map(hand => ({ hand: hand.map(card), grave: [], exiled: [] }));
                const plays = ${call ? JSON.stringify([
                    { by: 0, ids: ['sword-3'], start: true }, { by: 1, ids: ['wand-4'] },
                    { by: 3, ids: ['wand-5', 'wand-6', 'wand-7', 'wand-8'], call: true }
                ]) : JSON.stringify([
                    { by: 0, ids: ['wand-3'], start: true }, { by: 1, ids: ['major-4'] },
                    { by: 2, ids: ['cup-6'] }, { by: 3, ids: ['sword-8'] }
                ])}.map(({ ids, ...play }) => ({ ...play, cards: ids.map(card) }));
                const role = ${call} ? evaluateRole([...plays[1].cards, ...plays[2].cards]) : null;
                state.field = { kind: role ? 'role' : 'normal', count: role ? 5 : 1, role, plays };
                state.players[1].exiled = [card('cup-2')];
                const used = new Set([...hands.flat(), ...plays.flatMap(play => play.cards.map(card => card.id)), 'cup-2']);
                state.deck = deck.filter(card => !used.has(card.id)); state.aside = [];
                state.back = false; state.lock = null; state.cut = ${!call}; state.passed = [1, 2];
                state.trashBy = null; state.judgement = false; state.han = hands.map(() => 0); state.lastCardHan = 0;
                state.dealer = 0; state.last = 3; state.turn = 0; state.drew = false; state.ceded = 0;
                state.phase = 'play'; state.winner = null; state.lastPlay = { by: 3, type: role ? 'call' : 'normal', role };
                state.events = [];
                return state;
            }
        `
    }));
}

for (const width of [320, 390, 1440]) {
    test(`the ${width}px field keeps a stable pile and the graveyard shows cleared cards without advancing play`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const seen = await observe(page);
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        await installPileFixture(page);
        await sit(page);
        await expect(page.locator('#ktFieldCards .kt-field-past')).toHaveCount(3);
        await expect(page.locator('#ktFieldCards .kt-field-top .kt-card')).toHaveAttribute('data-card', 'sword-8');
        await expect(page.locator('#ktFieldCards button')).toHaveCount(1);
        const transforms = () => page.locator('.kt-field-play').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transform));
        const before = await transforms();
        expect(new Set(before).size).toBeGreaterThan(1);
        await page.locator('#ktHand [data-card="wand-9"]').click();
        expect(await transforms()).toEqual(before);
        await page.locator('#ktFieldCards button').click();
        await expect(page.locator('#ktZoom')).toBeVisible();
        await page.keyboard.press('Escape');
        await shot(page, `natural-pile-${width}.png`);
        await page.locator('#ktGrave').click();
        await expect(page.locator('#ktGraveBody [data-zone="grave-0"]')).toContainText('まだありません');
        await expect(page.locator('#ktGraveBody [data-zone="exiled-1"] .kt-card')).toHaveAttribute('data-card', 'cup-2');
        await page.locator('#ktGraveClose').click();
        await expect(page.locator('#ktHand [data-card="wand-9"]')).toHaveClass(/is-selected/);
        await page.locator('#ktPass').click();
        await expect(page.locator('#ktFieldCards .kt-card')).toHaveCount(0);
        await expect(page.locator('#ktGrave')).toHaveText('墓地・除外 5枚');
        await page.locator('#ktGrave').click();
        const grave = page.locator('#ktGraveDialog');
        await expect(grave).toBeVisible();
        await expect(page.locator('#ktGraveClose')).toBeFocused();
        for (const [zone, id] of [['grave-0', 'wand-3'], ['grave-2', 'cup-6'], ['grave-3', 'sword-8'], ['aside', 'major-4'], ['exiled-1', 'cup-2']]) {
            await expect(grave.locator(`[data-zone="${zone}"] .kt-card`)).toHaveAttribute('data-card', id);
        }
        await expect(grave.locator('.kt-card')).toHaveCount(5);
        const publicState = await page.locator('#ktTable').textContent();
        await page.clock.runFor(5000);
        expect(await page.locator('#ktTable').textContent()).toBe(publicState);
        await page.keyboard.press('Shift+Tab');
        await expect(grave.locator('.kt-card').last()).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#ktGraveClose')).toBeFocused();
        await shot(page, `graveyard-${width}.png`);
        const card = grave.locator('[data-zone="aside"] .kt-card');
        await card.click();
        await expect(page.locator('#ktZoom')).toBeVisible();
        await expect.poll(() => page.locator('#ktZoom img').evaluate(img => img.complete && img.naturalWidth)).toBe(640);
        await page.keyboard.press('Escape');
        await expect(grave).toBeVisible();
        await expect(card).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(grave).toBeHidden();
        await expect(page.locator('#ktGrave')).toBeFocused();
        await page.clock.runFor(60);
        await expect(page.locator('#ktFieldCards .kt-field-top .kt-card')).not.toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(seen.errors).toEqual([]);
        expect(seen.unexpected).toEqual([]);
    });
}

test('a called field card appears once in its five-card role and all six cards reach their own graveyard', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await installPileFixture(page, { call: true });
    await sit(page);
    await expect(page.locator('#ktFieldCards .kt-field-top .kt-card')).toHaveCount(5);
    await expect(page.locator('#ktFieldCards [data-card="wand-4"]')).toHaveCount(1);
    await expect(page.locator('#ktFieldCards .kt-field-past .kt-card')).toHaveCount(1);
    await shot(page, 'natural-pile-call-320.png');
    await page.locator('#ktPass').click();
    await page.locator('#ktGrave').click();
    await expect(page.locator('#ktGraveBody [data-zone="grave-0"] .kt-card')).toHaveCount(1);
    await expect(page.locator('#ktGraveBody [data-zone="grave-1"] .kt-card')).toHaveAttribute('data-card', 'wand-4');
    await expect(page.locator('#ktGraveBody [data-zone="grave-3"] .kt-card')).toHaveCount(4);
    await expect(page.locator('#ktGraveBody .kt-card')).toHaveCount(7);
    await page.locator('#ktGraveClose').click();
});

test('the result explains each payment as cards x han x rate', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 760 });
    await sit(page);
    await playOn(page, async () => /結果/.test(await page.locator('#ktDialogTitle').textContent()) && await page.locator('#ktDialog').isVisible());
    await page.keyboard.press('Tab');
    await expect(page.locator('#ktDialogActions button').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#ktDialogBody .kt-card').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#ktDialogActions button').last()).toBeFocused();
    const rows = await page.locator('#ktDialogBody .kt-result-row > p').allTextContents();
    expect(rows.length).toBe(3);
    for (const row of rows) {
        const [, cards, han, rate, paid] = row.match(/(\d+)枚 × (\d+)翻.* × (\d+) ＝ (\d+)/).map(Number);
        expect(paid).toBe(cards * han * rate);
    }
    await expect(page.locator('#ktDialogBody .kt-han-pill-big')).toHaveText(/^\d+翻$/);
    const note = await page.locator('#ktDialogBody').textContent();
    await page.getByRole('button', { name: '墓地・除外を見る', exact: true }).click();
    await expect(page.locator('#ktGraveDialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#ktGraveDialog')).toBeHidden();
    await expect(page.locator('#ktDialog')).toBeVisible();
    expect(await page.locator('#ktDialogBody').textContent()).toBe(note);
    await expect(page.getByRole('button', { name: '墓地・除外を見る', exact: true })).toBeFocused();
});

test('a final conditional major previews its bonus privately and explains the extra han in the result', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const seen = await observe(page);
    // Only replace the deal in this browser fixture; validation and settlement
    // still use the real module. No state-changing test hook is shipped.
    await page.route(/\/js\/kingdomTable\/rules\.js\?v=20261115-last-card-v1$/, route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            export * from '/js/kingdomTable/rules.js?fixture=last-card-real';
            import { createRound as realRound, buildDeck } from '/js/kingdomTable/rules.js?fixture=last-card-real';
            export function createRound(options) {
                const state = realRound(options);
                const deck = buildDeck(), card = id => deck.find(item => item.id === id);
                const hands = [['major-16'], ['major-17'], ['wand-3', 'cup-15'], ['wand-4', 'sword-3']];
                state.players = hands.map(hand => ({ hand: hand.map(card), grave: [], exiled: [] }));
                const field = card('cup-9');
                const used = new Set([...hands.flat(), field.id]);
                const unused = deck.filter(item => !used.has(item.id));
                state.deck = unused.slice(0, 45);
                state.aside = unused.slice(45).filter(item => item.major);
                state.players[1].grave = unused.slice(45).filter(item => !item.major);
                state.field = { kind: 'normal', count: 1, role: null, plays: [{ by: 1, cards: [field] }] };
                state.back = false; state.lock = null; state.cut = false;
                state.passed = [2, 3]; state.trashBy = null; state.judgement = false;
                state.han = hands.map(() => 0); state.lastCardHan = 0;
                state.dealer = 0; state.last = 1; state.turn = 0; state.drew = false; state.ceded = 0;
                state.phase = 'play'; state.winner = null;
                state.lastPlay = { by: 1, type: 'normal', role: null };
                state.events = [{ type: 'play', by: 1, kind: 'normal', cards: [field], role: null }];
                return state;
            }
        `
    }));
    await sit(page);
    await expect(page.locator('#ktHand .kt-card')).toHaveCount(1);
    await expect(page.locator('#ktMe .kt-han-pill')).toHaveText('3翻');
    // The opponent also holds a conditional last card, which must not leak via its han counter.
    await expect(page.locator('#ktSeatRight .kt-han-pill')).toHaveText('1翻');
    await page.locator('#ktHand .kt-card').click();
    await expect(page.locator('#ktPlay')).toBeEnabled();
    await expect(page.locator('#ktMessage')).toContainText('ラスト上がり +1翻');
    await page.locator('#ktPlay').click();
    await expect(page.locator('#ktDialog')).toBeVisible();
    await expect(page.locator('#ktDialogBody .kt-han-pill-big')).toHaveText('3翻');
    await expect(page.locator('#ktDialogBody .kt-result-note')).toContainText('上がり1 ＋ ラスト上がり1 ＋ 親1');
    const rows = await page.locator('#ktDialogBody .kt-result-row > p').allTextContents();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
        const [, count, han, rate, paid] = row.match(/(\d+)枚 × (\d+)翻.* × (\d+) ＝ (\d+)/).map(Number);
        expect(paid).toBe(count * han * rate);
    }
    await expect(page.locator('#ktMe .kt-me-chips')).toHaveText('1230');
    await expect(page.locator('#ktPlay')).toBeDisabled();
    await expect.poll(() => page.locator('#ktDialog img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await shot(page, 'last-card-bonus-result-390.png');
    expect(seen.errors).toEqual([]);
    expect(seen.unexpected).toEqual([]);
});

// Effects run only without ?fast=1. The page records every effect node it adds so the test can check them afterwards.
async function sitWithEffects(page, { seed = 3, reduced = false } = {}) {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
        window.__fx = [];
        new MutationObserver((list) => {
            for (const change of list) for (const node of change.addedNodes) {
                if (node.nodeType === 1 && node.parentElement?.classList.contains('kt-fx')) window.__fx.push({ cls: node.className, text: node.textContent });
            }
        }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`/tarot-kingdom-table.html?seed=${seed}`);
    await page.locator('#ktStart').click();
    await expect(page.locator('#ktTable')).toBeVisible();
}
// Passes (or draws) until it is your turn with a card you can play.
async function waitForPlayable(page) {
    for (let i = 0; i < 30; i += 1) {
        await expect(page.locator('#ktHand .kt-card').first()).toBeEnabled({ timeout: 15000 });
        if (await page.locator('#ktHand .kt-card.is-playable').count()) return;
        const draw = page.locator('#ktDraw');
        await (await draw.isEnabled() ? draw : page.locator('#ktPass')).click();
        await expect(page.locator('#ktHand .kt-card').first()).toBeDisabled();
    }
    throw new Error('no playable turn');
}
const fxSeen = (page, cls) => page.evaluate((name) => window.__fx.filter((entry) => entry.cls.split(' ').includes(name)).map((entry) => entry.text), cls);

test('your played card flies from the hand, lands on the field and nothing is left in the air', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    const seen = await observe(page);
    await sitWithEffects(page);
    // The deal: the first field card arrives from the deck.
    await expect(page.locator('#ktFieldCards .kt-field-top .kt-card.is-landed')).toHaveCount(1, { timeout: 4000 });
    await waitForPlayable(page);
    await expect.poll(() => fxSeen(page, 'kt-fx-light').then((list) => list.length)).toBeGreaterThan(0);
    const playable = page.locator('#ktHand .kt-card.is-playable').first();
    const id = await playable.getAttribute('data-card');
    await playable.click();
    await page.locator('#ktPlay').click();
    const landed = page.locator(`#ktFieldCards .kt-field-top .kt-card[data-card="${id}"]`);
    await expect(landed).toHaveClass(/is-arriving/);
    await expect(page.locator('.kt-fx .kt-fx-card')).not.toHaveCount(0);
    await expect(landed).toHaveClass(/is-landed/, { timeout: 2000 });
    await expect(landed).not.toHaveClass(/is-arriving/);
    await expect(page.locator('.kt-fx .kt-fx-card')).toHaveCount(0, { timeout: 2000 });
    expect(seen.errors).toEqual([]);
    expect(seen.unexpected).toEqual([]);
});

test('a round with effects shows passes, the win stamp and the chip shower, and the counters end on the real chips', async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 760 });
    const seen = await observe(page);
    await sitWithEffects(page, { seed: 5 });
    const title = page.locator('#ktDialogTitle');
    await playOn(page, async () => await page.locator('#ktDialog').isVisible() && /結果/.test(await title.textContent()));
    expect(await fxSeen(page, 'kt-fx-bubble')).toContain('パス');
    expect((await fxSeen(page, 'kt-fx-stamp')).some((text) => text === '上がり！')).toBe(true);
    expect((await fxSeen(page, 'kt-fx-coin')).length).toBeGreaterThan(0);
    // Every seat's counter has finished on the same value the result lists.
    const listed = await page.locator('#ktDialogBody .kt-score li').evaluateAll((items) => items.map((item) => [item.firstChild.textContent, item.querySelector('.kt-chip').textContent]));
    const mine = listed.find(([name]) => name === 'あなた')[1];
    await expect(page.locator('#ktMe .kt-chip')).toHaveText(mine);
    for (const [name, chips] of listed.filter(([name]) => name !== 'あなた')) {
        await expect(page.locator('.kt-seat-panel', { hasText: name }).locator('.kt-seat-chips')).toHaveText(chips);
    }
    // The deltas count up to the settled values.
    await expect.poll(() => page.locator('#ktDialogBody .kt-delta').allTextContents()).toEqual(
        await page.evaluate(() => [...document.querySelectorAll('#ktDialogBody .kt-delta')].map((node) => node.textContent)));
    expect(seen.errors).toEqual([]);
});

test('with reduced motion nothing flies or shakes, but passes and stamps are still shown', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sitWithEffects(page, { reduced: true });
    await waitForPlayable(page);
    const playable = page.locator('#ktHand .kt-card.is-playable').first();
    const id = await playable.getAttribute('data-card');
    await playable.click();
    await page.locator('#ktPlay').click();
    await expect(page.locator(`#ktFieldCards .kt-field-top .kt-card[data-card="${id}"]`)).not.toHaveClass(/is-arriving/);
    await page.waitForTimeout(1500);
    expect(await fxSeen(page, 'kt-fx-card')).toEqual([]);
    expect(await fxSeen(page, 'kt-fx-ring')).toEqual([]);
    expect(await fxSeen(page, 'kt-fx-flash')).toEqual([]);
    expect(await fxSeen(page, 'kt-fx-coin')).toEqual([]);
    expect(await page.evaluate(() => document.getElementById('ktFelt').getAnimations().length)).toBe(0);
});

test('the sound switch turns the effect sounds off and remembers it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await sitWithEffects(page);
    const sound = page.locator('#ktSound');
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await expect(sound).toHaveAttribute('aria-label', '効果音：オン');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await expect(sound).toHaveAttribute('aria-label', '効果音：オフ');
    await page.reload();
    await page.locator('#ktStart').click();
    await expect(page.locator('#ktSound')).toHaveAttribute('aria-pressed', 'false');
    const box = await sound.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
});

test('the deck count and the title stay readable over the portraits', async ({ page }) => {
    for (const width of [320, 430]) {
        await page.setViewportSize({ width, height: 760 });
        await sit(page);
        const deck = page.locator('#ktDeck');
        await expect(deck).toHaveText(/^山札 \d+$/);
        expect(await deck.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
        // The bar is drawn above every seat, so the portraits never cover the title or the deck.
        const covered = await page.evaluate(() => ['.kt-brand', '#ktDeck', '#ktSound'].map((selector) => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return hit.closest('.kt-bar') ? null : selector;
        }).filter(Boolean));
        expect(covered).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
});

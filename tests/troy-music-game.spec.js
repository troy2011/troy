const { test, expect } = require('@playwright/test');

const MUSIC_GAME_SONGS = [
  { title: '曲A', artist: '歌手A', songNumber: '100001', joysoundNaviGroupId: '900001', popularityRank: 1 },
  { title: '曲B', artist: '歌手B', songNumber: '100002', joysoundNaviGroupId: '900002', popularityRank: 200 },
  { title: '曲C', artist: '歌手C', songNumber: '100003', joysoundNaviGroupId: '900003', popularityRank: 450 },
  { title: '曲D', artist: '歌手D', songNumber: '100004', joysoundNaviGroupId: '900004', popularityRank: 750 }
];

function makeBootstrap(results = [], exclusions = [], catalogSongs = MUSIC_GAME_SONGS) {
  const excludedSongNumbers = new Set(exclusions.map((entry) => entry.songNumber));
  const songs = catalogSongs.filter((entry) => !excludedSongNumbers.has(entry.songNumber));
  return {
    staffPlayFabId: 'STAFF1',
    dayKey: '2026-08-20',
    participants: [
      { id: 'PLAYER1', displayName: '海風の船長' },
      { id: 'PLAYER2', displayName: '星見の航海士' }
    ],
    participantSource: 'existing',
    manifest: {
      version: 'test-catalog',
      updatedAt: '2026-08-20T10:00:00.000Z',
      songCount: songs.length,
      officialSongCount: catalogSongs.length,
      excludedSongCount: catalogSongs.length - songs.length,
      hasPopularityRanks: true,
      validationSuccess: true,
      source: 'joysound',
      status: 'ready'
    },
    songs,
    exclusions,
    results
  };
}

async function installMusicGameRoutes(page, state) {
  await page.route('**/api/troy-music-game/bootstrap', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(makeBootstrap(state.results, state.exclusions || [], state.catalogSongs || MUSIC_GAME_SONGS))
    });
  });
  await page.route('**/api/troy-music-game/results', async (route) => {
    const body = route.request().postDataJSON();
    const song = MUSIC_GAME_SONGS.find((entry) => entry.songNumber === body.songNumber);
    const result = {
      id: body.clientResultId,
      ...body,
      title: song.title,
      artist: song.artist,
      playedAtMs: Date.now(),
      playedAt: new Date().toISOString()
    };
    state.savedPayloads.push(body);
    state.results.unshift(result);
    await route.fulfill({
      status: 201,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ result, alreadySaved: false })
    });
  });
  await page.route('**/api/troy-music-game/skip', async (route) => {
    state.skips.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/troy-music-game/results/void-latest', async (route) => {
    const result = state.results.find((entry) => !entry.voidedAt);
    if (result) result.voidedAt = new Date().toISOString();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result, alreadyVoided: false }) });
  });
  await page.route('**/api/troy-music-game/results/update', async (route) => {
    const body = route.request().postDataJSON();
    const result = state.results.find((entry) => entry.id === body.resultId);
    Object.assign(result, body.score ? { score: Number(body.score) } : { outcome: body.outcome });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) });
  });
  await page.route('**/api/troy-music-game/catalog/refresh', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songCount: 4 }) });
  });
  await page.route('**/api/troy-music-game/catalog/exclusions', async (route) => {
    const song = MUSIC_GAME_SONGS.find((entry) => entry.songNumber === route.request().postDataJSON().songNumber);
    const exclusion = { ...song, reason: 'manual', excludedAt: '2026-08-20T10:30:00.000Z' };
    state.exclusions = [...(state.exclusions || []).filter((entry) => entry.songNumber !== exclusion.songNumber), exclusion];
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ exclusion }) });
  });
  await page.route('**/api/troy-music-game/catalog/exclusions/remove', async (route) => {
    const songNumber = route.request().postDataJSON().songNumber;
    state.exclusions = (state.exclusions || []).filter((entry) => entry.songNumber !== songNumber);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songNumber, removed: true }) });
  });
}

test('free challenge selects a song before a participant and saves one idempotent result', async ({ page }, testInfo) => {
  const state = { results: [], savedPayloads: [], skips: [] };
  await installMusicGameRoutes(page, state);
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'TROY MUSIC GAME' })).toBeVisible();
  await expect(page.locator('script[src*="line-scdn"]')).toHaveCount(0);
  await expect(page.getByText('ログイン不要')).toBeVisible();
  await expect(page.locator('.troy-music-game-brand-mic')).toHaveAttribute('src', '/assets/ui/icons/044.png');
  await expect(page.locator('.troy-music-game-mode-button')).toHaveCount(3);
  await expect(page.locator('.troy-music-game-difficulty-button')).toHaveCount(4);
  await expect(page.locator('#troyMusicGameParticipant')).toBeDisabled();
  await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
  await expect(page.getByRole('button', { name: '曲名をコピー（Switch用）' })).toBeVisible();
  await page.getByRole('button', { name: '曲名をコピー（Switch用）' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('switch-desktop.png') });
  await expect(page.locator('#troyMusicGameParticipant')).toBeEnabled();
  await page.selectOption('#troyMusicGameParticipant', 'PLAYER1');
  await page.locator('#troyMusicGameScore').fill('96.342');
  await expect(page.getByRole('button', { name: '結果を確定' })).toBeEnabled();
  await page.getByRole('button', { name: '結果を確定' }).click();

  expect(state.savedPayloads).toHaveLength(1);
  expect(state.savedPayloads[0]).toMatchObject({
    mode: 'sabikara_free',
    participantId: 'PLAYER1',
    participantName: '海風の船長',
    score: '96.342'
  });
  await expect(page.getByRole('button', { name: '次のゲームへ' })).toBeVisible();
});

test('difficulty uses cumulative JOYSOUND popularity ranks', async ({ page }) => {
  const state = { results: [], savedPayloads: [], skips: [] };
  await page.addInitScript(() => { Math.random = () => 0.99; });
  await installMusicGameRoutes(page, state);
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '少し易しい（1〜250位）' }).click();
  await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
  await expect(page.getByText('人気 200位')).toBeVisible();
});

test('three-song draw requires selecting one candidate before recording a result', async ({ page }) => {
  const state = { results: [], savedPayloads: [], skips: [] };
  await installMusicGameRoutes(page, state);
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '難しい（全曲）' }).click();
  await page.getByRole('button', { name: '3曲', exact: true }).click();
  await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
  await expect(page.getByText('3曲から歌う曲を選択してください')).toBeVisible();
  await expect(page.locator('[data-action="choose-drawn-song"]')).toHaveCount(3);
  await expect(page.locator('#troyMusicGameParticipant')).toBeDisabled();

  await page.locator('[data-action="choose-drawn-song"]').first().click();
  await expect(page.locator('#troyMusicGameParticipant')).toBeEnabled();
});

test('competitive mode requires the challenger before drawing and intro mode hides its answer', async ({ page }) => {
  const state = { results: [], savedPayloads: [], skips: [] };
  await installMusicGameRoutes(page, state);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'サビカラ真剣勝負', exact: true }).click();
  await expect(page.getByRole('button', { name: '🎲 曲を抽選する' })).toBeDisabled();
  await page.selectOption('#troyMusicGameParticipant', 'PLAYER2');
  await expect(page.getByRole('button', { name: '🎲 曲を抽選する' })).toBeEnabled();

  await page.getByRole('button', { name: 'イントロクイズ', exact: true }).click();
  await page.getByRole('button', { name: '🎲 問題曲を抽選する' }).click();
  await expect(page.getByText('曲名・歌手は非表示です。')).toBeVisible();
  await expect(page.locator('.troy-music-game-song h3')).toHaveCount(0);
  await expect(page.locator('.troy-music-game-song-artist')).toHaveCount(0);
  await expect(page.getByText(/JOYSOUND 曲番号：[0-9]+/)).toBeVisible();
  await expect(page.getByRole('button', { name: '曲名をコピー（Switch用）' })).toBeVisible();
  await expect(page.getByRole('button', { name: '答えを見る' })).toBeVisible();
  await page.getByRole('button', { name: '答えを見る' }).click();
  await expect(page.getByText('JOYSOUND 曲番号')).toBeVisible();
});

test('navi links select the official Android intent while retaining the iOS scheme', async ({ page }) => {
  const state = { results: [], savedPayloads: [], skips: [] };
  await installMusicGameRoutes(page, state);
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const src = document.querySelector('script[src*="troyMusicGame.js"]').src;
    const { normalizeSong, buildJoysoundNaviUrl } = await import(src);
    const song = normalizeSong({ title: 'カブトムシ', artist: 'aiko', songNumber: '497445', joysoundNaviGroupId: '92-2327' });
    return {
      song,
      androidUrl: buildJoysoundNaviUrl(song.joysoundNaviGroupId, 'Mozilla/5.0 (Linux; Android 15; Pixel 8)'),
      iosUrl: buildJoysoundNaviUrl(song.joysoundNaviGroupId, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
      desktopUrl: buildJoysoundNaviUrl(song.joysoundNaviGroupId, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    };
  });
  expect(result.song.joysoundNaviGroupId).toBe('922327');
  expect(result.androidUrl).toBe('intent://navigation?naviGrpId=922327&view=songDetails#Intent;scheme=xgi-js-spnavi;package=jp.co.xing.spnavi;end');
  expect(result.iosUrl).toBe('xgi-js-spnavi://navigation?view=songDetails&naviGrpId=922327');
  expect(result.desktopUrl).toBe(result.iosUrl);
});

test('Switch links use the song number and external-entry parameter only on Android', async ({ page }) => {
  const state = { results: [], savedPayloads: [], skips: [] };
  await installMusicGameRoutes(page, state);
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const src = document.querySelector('script[src*="troyMusicGame.js"]').src;
    const { buildJoysoundSwitchNaviUrl } = await import(src);
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 8)';
    return {
      android: buildJoysoundSwitchNaviUrl('497445', android),
      ios: buildJoysoundSwitchNaviUrl('497445', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
      desktop: buildJoysoundSwitchNaviUrl('497445', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      invalid: ['', null, '0', '-1', '497445&view=top', '2147483648'].map((value) => buildJoysoundSwitchNaviUrl(value, android))
    };
  });
  expect(result.android).toBe('intent://navigation?view=songDetails&slc=497445&backAppScheme=https#Intent;scheme=xgi-js-spnavi;package=jp.co.xing.spnavi;end');
  expect(result.android).not.toContain('naviGrpId');
  expect(result.ios).toBe('');
  expect(result.desktop).toBe('');
  expect(result.invalid).toEqual(['', '', '', '', '', '']);
});

test.describe('Switch reservation assistance', () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test('Switch is the default and copies the selected title without launching a mode-changing link', async ({ page }, testInfo) => {
    const state = {
      results: [], savedPayloads: [], skips: [],
      catalogSongs: [{ ...MUSIC_GAME_SONGS[0], joysoundNaviGroupId: '' }]
    };
    await page.addInitScript(() => {
      window.__copiedSongTitle = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__copiedSongTitle = text; } }
      });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await installMusicGameRoutes(page, state);
    await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('TROY MUSIC GAME');
    await expect(page.getByLabel('キョクナビの利用先')).toHaveValue('switch');
    await page.screenshot({ path: testInfo.outputPath('switch-first-viewport.png') });
    await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
    await expect(page.getByRole('heading', { name: '♪ 曲A' })).toBeVisible();
    await expect(page.getByRole('button', { name: '🎤 キョクナビで開く' })).toHaveCount(0);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const navigations = [];
    cdp.on('Page.frameRequestedNavigation', (event) => navigations.push(event.url));
    await page.getByRole('button', { name: '曲名をコピー（Switch用）' }).click();
    await expect(page.getByRole('status')).toHaveText('曲名をコピーしました。キョクナビをアプリ一覧から開き、Switchモードの検索欄に貼り付けて予約してください。');
    expect(await page.evaluate(() => window.__copiedSongTitle)).toBe('曲A');
    expect(navigations).toEqual([]);
    expect(state.savedPayloads).toHaveLength(0);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: '曲名をコピー（Switch用）' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('switch-copy-reservation.png') });
    await cdp.detach();
  });

  test('the target preference persists and switching targets keeps the drawn song', async ({ page }) => {
    const state = { results: [], savedPayloads: [], skips: [], catalogSongs: [MUSIC_GAME_SONGS[0]] };
    await installMusicGameRoutes(page, state);
    await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
    await page.getByLabel('キョクナビの利用先').selectOption('store');
    await expect(page.getByRole('heading', { name: '♪ 曲A' })).toBeVisible();
    await expect(page.getByRole('button', { name: '🎤 キョクナビで開く' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Switchモードでは使わないでください');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('キョクナビの利用先')).toHaveValue('store');
    await page.getByLabel('キョクナビの利用先').selectOption('switch');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('キョクナビの利用先')).toHaveValue('switch');
  });

  test('clipboard denial offers manual copying without claiming a successful copy', async ({ page }) => {
    const state = { results: [], savedPayloads: [], skips: [], catalogSongs: [MUSIC_GAME_SONGS[0]] };
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new DOMException('Clipboard denied', 'NotAllowedError'); } }
      });
    });
    await installMusicGameRoutes(page, state);
    await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
    const dialogPromise = page.waitForEvent('dialog');
    const clickPromise = page.getByRole('button', { name: '曲名をコピー（Switch用）' }).click();
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('prompt');
    expect(dialog.defaultValue()).toBe('曲A');
    await dialog.dismiss();
    await clickPromise;
    await expect(page.getByRole('status')).toHaveText('コピーをキャンセルしました。');
    expect(page.url()).toContain('/troy-music-game.html');
    expect(state.savedPayloads).toHaveLength(0);
  });

  test('copying an intro quiz title keeps the answer hidden on the game screen', async ({ page }) => {
    const state = { results: [], savedPayloads: [], skips: [], catalogSongs: [MUSIC_GAME_SONGS[0]] };
    await page.addInitScript(() => {
      window.__copiedSongTitle = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__copiedSongTitle = text; } }
      });
    });
    await installMusicGameRoutes(page, state);
    await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'イントロクイズ', exact: true }).click();
    await page.getByRole('button', { name: '🎲 問題曲を抽選する' }).click();
    await page.getByRole('button', { name: '曲名をコピー（Switch用）' }).click();
    await expect(page.getByRole('status')).toContainText('曲名をコピーしました');
    expect(await page.evaluate(() => window.__copiedSongTitle)).toBe('曲A');
    await expect(page.locator('.troy-music-game-song h3')).toHaveCount(0);
    await expect(page.locator('.troy-music-game-song-artist')).toHaveCount(0);
    await expect(page.getByText('曲名・歌手は非表示です。')).toBeVisible();
  });
});

test.describe('Android Kyokunavi handoff', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true
  });

  for (const mode of ['sabikara_free', 'intro_quiz']) {
    test(`Switch ${mode} sends the selected song number through the external-entry route`, async ({ page }, testInfo) => {
      const state = {
        results: [], savedPayloads: [], skips: [],
        catalogSongs: [{ ...MUSIC_GAME_SONGS[0], joysoundNaviGroupId: '' }]
      };
      const errors = [];
      const consoleErrors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await installMusicGameRoutes(page, state);
      await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle('TROY MUSIC GAME');
      await expect(page.getByLabel('キョクナビの利用先')).toHaveValue('switch');
      if (mode === 'intro_quiz') {
        await page.getByRole('button', { name: 'イントロクイズ', exact: true }).click();
        await page.getByRole('button', { name: '🎲 問題曲を抽選する' }).click();
        await expect(page.locator('.troy-music-game-song h3')).toHaveCount(0);
      } else {
        await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
        await expect(page.getByRole('heading', { name: '♪ 曲A' })).toBeVisible();
      }
      const button = page.getByRole('button', { name: 'Switchのキョクナビで開く' });
      await expect(button).toBeVisible();
      await expect(page.getByRole('button', { name: '🎤 キョクナビで開く', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '曲名をコピー（Switch用）' })).toBeVisible();
      await button.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('android-switch-link.png') });
      expect(consoleErrors).toEqual([]);

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.enable');
      const requestedNavigation = new Promise((resolve) => {
        cdp.on('Page.frameRequestedNavigation', (event) => {
          if (event.url.startsWith('intent://')) resolve(event);
        });
      });
      await button.click();
      const navigation = await requestedNavigation;
      expect(navigation.url).toBe('intent://navigation?view=songDetails&slc=100001&backAppScheme=https#Intent;scheme=xgi-js-spnavi;package=jp.co.xing.spnavi;end');
      expect(navigation.url).not.toContain('naviGrpId');
      expect(state.savedPayloads).toHaveLength(0);
      expect(state.skips).toHaveLength(0);
      expect(errors).toEqual([]);
      await expect(page.getByRole('status')).not.toContainText('予約成功');
      await cdp.detach();
    });
  }

  test('the Kyokunavi button sends the selected song to the Android package without saving a result', async ({ page }, testInfo) => {
    const state = { results: [], savedPayloads: [], skips: [], catalogSongs: [MUSIC_GAME_SONGS[0]] };
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await installMusicGameRoutes(page, state);
    await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('TROY MUSIC GAME');
    await page.getByLabel('キョクナビの利用先').selectOption('store');
    await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
    await expect(page.getByRole('heading', { name: '♪ 曲A' })).toBeVisible();
    const button = page.getByRole('button', { name: '🎤 キョクナビで開く' });
    await button.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('android-song-handoff.png') });
    expect(consoleErrors).toEqual([]);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const requestedNavigation = new Promise((resolve) => {
      cdp.on('Page.frameRequestedNavigation', (event) => {
        if (event.url.startsWith('intent://')) resolve(event);
      });
    });
    await button.click();
    const navigation = await requestedNavigation;
    expect(navigation.url).toBe('intent://navigation?naviGrpId=900001&view=songDetails#Intent;scheme=xgi-js-spnavi;package=jp.co.xing.spnavi;end');
    await expect(page.getByRole('heading', { name: '♪ 曲A' })).toBeVisible();
    expect(state.savedPayloads).toHaveLength(0);
    expect(errors).toEqual([]);
    await cdp.detach();
  });
});

test.describe('iOS Switch fallback', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });

  test('iOS offers copying without sending an unverified Switch deep link', async ({ page }) => {
    const state = { results: [], savedPayloads: [], skips: [] };
    await installMusicGameRoutes(page, state);
    await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
    await expect(page.getByRole('button', { name: '曲名をコピー（Switch用）' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switchのキョクナビで開く' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '🎤 キョクナビで開く' })).toHaveCount(0);
  });
});

test('song without a navi group ID shows a safe update message', async ({ page }) => {
  const state = {
    results: [], savedPayloads: [], skips: [],
    catalogSongs: [{ ...MUSIC_GAME_SONGS[0], joysoundNaviGroupId: '' }]
  };
  await installMusicGameRoutes(page, state);
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('キョクナビの利用先').selectOption('store');
  await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
  await page.getByRole('button', { name: '🎤 キョクナビで開く' }).click();
  await expect(page.getByRole('status')).toHaveText('キョクナビ用の楽曲IDがありません。JOYSOUND最新データに更新してください。');
  expect(page.url()).toContain('/troy-music-game.html');
});

test('skip does not save a result and the latest valid result can be voided', async ({ page }) => {
  const state = {
    results: [{
      id: 'music-result-12345678',
      clientResultId: 'music-result-12345678',
      mode: 'sabikara_free',
      participantId: 'PLAYER1',
      participantName: '海風の船長',
      title: '曲A',
      artist: '歌手A',
      songNumber: '100001',
      score: 92.5,
      playedAtMs: Date.now(),
      playedAt: new Date().toISOString()
    }],
    savedPayloads: [],
    skips: []
  };
  await installMusicGameRoutes(page, state);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
  await page.selectOption('#troyMusicGameSkipReason', 'not_found_on_joysound');
  await page.locator('[data-action="skip-song"]').click();
  expect(state.skips).toHaveLength(1);
  expect(state.savedPayloads).toHaveLength(0);

  await page.getByRole('button', { name: '直前を取り消す' }).click();
  await expect(page.getByText('本日の確定結果はまだありません。')).toBeVisible();
});

test('excluded songs stay out of the catalog after reload and can be restored', async ({ page }) => {
  const state = { results: [], savedPayloads: [], skips: [], exclusions: [] };
  await installMusicGameRoutes(page, state);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/troy-music-game.html', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '🎲 曲を抽選する' }).click();
  await page.getByRole('button', { name: 'この曲を抽選対象から除外' }).click();
  expect(state.exclusions).toHaveLength(1);
  await expect(page.getByText('抽選除外リスト（1曲）')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('抽選対象')).toBeVisible();
  await expect(page.getByText('抽選除外リスト（1曲）')).toBeVisible();
  await page.getByText('抽選除外リスト（1曲）').click();
  await page.getByRole('button', { name: '復帰' }).click();
  expect(state.exclusions).toHaveLength(0);
  await expect(page.getByText('抽選除外リスト（0曲）')).toBeVisible();
});

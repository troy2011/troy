const { test, expect } = require('@playwright/test');

const MUSIC_GAME_SONGS = [
  { title: '曲A', artist: '歌手A', songNumber: '100001', popularityRank: 1 },
  { title: '曲B', artist: '歌手B', songNumber: '100002', popularityRank: 200 },
  { title: '曲C', artist: '歌手C', songNumber: '100003', popularityRank: 450 },
  { title: '曲D', artist: '歌手D', songNumber: '100004', popularityRank: 750 }
];

function makeBootstrap(results = [], exclusions = []) {
  const excludedSongNumbers = new Set(exclusions.map((entry) => entry.songNumber));
  const songs = MUSIC_GAME_SONGS.filter((entry) => !excludedSongNumbers.has(entry.songNumber));
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
      officialSongCount: MUSIC_GAME_SONGS.length,
      excludedSongCount: MUSIC_GAME_SONGS.length - songs.length,
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
      body: JSON.stringify(makeBootstrap(state.results, state.exclusions || []))
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

test('free challenge selects a song before a participant and saves one idempotent result', async ({ page }) => {
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
  await expect(page.getByText(/JOYSOUND 曲番号：[0-9]+/)).toBeVisible();
  await expect(page.getByRole('button', { name: '答えを見る' })).toBeVisible();
  await page.getByRole('button', { name: '答えを見る' }).click();
  await expect(page.getByText('JOYSOUND 曲番号')).toBeVisible();
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

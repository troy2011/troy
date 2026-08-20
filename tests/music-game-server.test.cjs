const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractSearchResultSongs,
  fetchJoysoundSabikaraCatalog,
  filterExcludedSongs,
  getJoysoundSearchPageUrl,
  getTokyoDayKey,
  initializeMusicGameRoutes,
  normalizeScore,
  parseOfficialTotal,
  validateCatalog,
  validateResultInput
} = require('../server/musicGame');

test('music game routes register without Firebase or LINE authentication', () => {
  const registered = [];
  const app = {
    get(path) { registered.push(['GET', path]); },
    post(path) { registered.push(['POST', path]); }
  };
  initializeMusicGameRoutes(app, { firestore: {}, admin: {} });
  assert.equal(registered.some(([, path]) => path === '/api/troy-music-game/bootstrap'), true);
  assert.equal(registered.some(([, path]) => path === '/api/troy-music-game/catalog/refresh'), true);
  assert.equal(registered.some(([, path]) => path === '/api/troy-music-game/catalog/exclusions'), true);
  assert.equal(registered.some(([, path]) => path === '/api/troy-music-game/catalog/exclusions/remove'), true);
});

test('catalog validation accepts only a complete, unique export', () => {
  const songs = [
    { title: '曲A', artist: '歌手A', songNumber: '100001', popularityRank: 1 },
    { title: '曲B', artist: '歌手B', songNumber: '100002', popularityRank: 2 }
  ];
  assert.equal(validateCatalog(songs, 2, 2).success, true);
  assert.equal(validateCatalog(songs, 3, 2).success, false);
  assert.equal(validateCatalog([...songs, { ...songs[0] }], 3, 3).duplicateNumbers.length, 1);
  assert.equal(validateCatalog([...songs, { ...songs[0], songNumber: '100003' }], 3, 3).duplicatePopularityRanks.length, 1);
  assert.deepEqual(filterExcludedSongs(songs, [{ songNumber: '100002' }]), [songs[0]]);
});

test('JOYSOUND current search cards provide the required catalog fields', () => {
  const listHtml = `
    <h2>曲一覧(2件)</h2>
    <button data-tracking-song_no="123456" data-tracking-title="[サビカラ] 曲 A" data-tracking-artist="歌手 A"></button>
    <button data-tracking-song_no="654321" data-tracking-title="[サビカラ] 曲 B" data-tracking-artist="歌手 B"></button>`;
  assert.equal(parseOfficialTotal(listHtml), 2);
  assert.deepEqual(extractSearchResultSongs(listHtml), [
    { title: '曲 A', artist: '歌手 A', songNumber: '123456', popularityRank: 1, catalog: 'sabikara' },
    { title: '曲 B', artist: '歌手 B', songNumber: '654321', popularityRank: 2, catalog: 'sabikara' }
  ]);
  assert.equal(getJoysoundSearchPageUrl(1), 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3');
  assert.equal(getJoysoundSearchPageUrl(2), 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3&page=2');
});

test('catalog refresh collects every JOYSOUND search page without song detail requests', async () => {
  const card = (songNumber) => `<button data-tracking-song_no="${songNumber}" data-tracking-title="[サビカラ] 曲 ${songNumber}" data-tracking-artist="歌手 ${songNumber}"></button>`;
  const firstPage = `<h2>曲一覧(21件)</h2>${Array.from({ length: 20 }, (_, index) => card(100001 + index)).join('')}`;
  const secondPage = card(100021);
  const requestedUrls = [];
  const result = await fetchJoysoundSabikaraCatalog({
    delayMs: 0,
    fetchText: async (url) => {
      requestedUrls.push(url);
      return url.endsWith('&page=2') ? secondPage : firstPage;
    }
  });
  assert.equal(result.songs.length, 21);
  assert.equal(result.songs[0].popularityRank, 1);
  assert.equal(result.songs[20].popularityRank, 21);
  assert.equal(result.validation.success, true);
  assert.deepEqual(requestedUrls, [
    'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3',
    'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3&page=2'
  ]);
});

test('result validation preserves independent participant and song fields', () => {
  assert.equal(normalizeScore('96.342'), 96.342);
  assert.equal(normalizeScore('100.001'), null);
  assert.deepEqual(validateResultInput({
    clientResultId: 'music-result-12345678',
    mode: 'sabikara_free',
    participantId: 'guest-123',
    participantName: 'たろう',
    songNumber: '497445',
    score: '96.342'
  }), {
    clientResultId: 'music-result-12345678',
    mode: 'sabikara_free',
    participantId: 'guest-123',
    participantName: 'たろう',
    songNumber: '497445',
    score: 96.342
  });
  assert.equal(getTokyoDayKey(Date.UTC(2026, 7, 20, 15, 30)), '2026-08-21');
});

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
  publishCatalog,
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
    { title: '曲A', artist: '歌手A', songNumber: '100001', joysoundNaviGroupId: '900001', popularityRank: 1 },
    { title: '曲B', artist: '歌手B', songNumber: '100002', joysoundNaviGroupId: '900002', popularityRank: 2 }
  ];
  assert.equal(validateCatalog(songs, 2, 2).success, true);
  assert.equal(validateCatalog([{ ...songs[0], joysoundNaviGroupId: '' }, songs[1]], 2, 2).success, false);
  assert.equal(validateCatalog([{ ...songs[0], joysoundNaviGroupId: '90x001' }, songs[1]], 2, 2).success, false);
  assert.equal(validateCatalog(songs, 3, 2).success, false);
  assert.equal(validateCatalog([...songs, { ...songs[0] }], 3, 3).duplicateNumbers.length, 1);
  assert.equal(validateCatalog([...songs, { ...songs[0], songNumber: '100003' }], 3, 3).duplicatePopularityRanks.length, 1);
  assert.deepEqual(filterExcludedSongs(songs, [{ songNumber: '100002' }]), [songs[0]]);
});

test('JOYSOUND current search cards provide the required catalog fields', () => {
  const listHtml = `
    <h2>曲一覧(2件)</h2>
    <button data-tracking-song_no="123456" data-tracking-title="[サビカラ] 曲 A" data-tracking-artist="歌手 A" data-tracking-navi_gid="922327"></button>
    <button data-tracking-song_no="654321" data-tracking-title="[サビカラ] 曲 B" data-tracking-artist="歌手 B" data-tracking-navi_gid="922328"></button>`;
  assert.equal(parseOfficialTotal(listHtml), 2);
  assert.deepEqual(extractSearchResultSongs(listHtml), [
    { title: '曲 A', artist: '歌手 A', songNumber: '123456', joysoundNaviGroupId: '922327', popularityRank: 1, catalog: 'sabikara' },
    { title: '曲 B', artist: '歌手 B', songNumber: '654321', joysoundNaviGroupId: '922328', popularityRank: 2, catalog: 'sabikara' }
  ]);
  assert.equal(getJoysoundSearchPageUrl(1), 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3');
  assert.equal(getJoysoundSearchPageUrl(2), 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3&page=2');
});

test('catalog refresh collects every JOYSOUND search page without song detail requests', async () => {
  const card = (songNumber) => `<button data-tracking-song_no="${songNumber}" data-tracking-title="[サビカラ] 曲 ${songNumber}" data-tracking-artist="歌手 ${songNumber}" data-tracking-navi_gid="${songNumber + 800000}"></button>`;
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

test('catalog refresh rejects any song without a numeric navi group ID', async () => {
  const html = '<h2>曲一覧(1件)</h2><button data-tracking-song_no="123456" data-tracking-title="曲 A" data-tracking-artist="歌手 A" data-tracking-navi_gid="bad-id"></button>';
  await assert.rejects(fetchJoysoundSabikaraCatalog({ fetchText: async () => html, delayMs: 0 }), /JoysoundValidationFailed/);
});

test('published catalog stores the navi group ID and bootstrap returns it', async () => {
  const documents = new Map();
  const collection = (path) => ({
    doc: (id) => document(`${path}/${id}`),
    get: async () => ({ docs: [...documents.entries()]
      .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })) }),
    where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) })
  });
  const document = (path) => ({
    id: path.split('/').at(-1),
    get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }),
    set: async (data, options) => documents.set(path, options?.merge ? { ...documents.get(path), ...data } : data),
    collection: (name) => collection(`${path}/${name}`)
  });
  const firestore = {
    collection,
    batch: () => {
      const writes = [];
      return { set: (ref, data) => writes.push([ref, data]), commit: async () => {
        for (const [ref, data] of writes) await ref.set(data);
      } };
    }
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  const songs = [{ title: 'カブトムシ', artist: 'aiko', songNumber: '497445', joysoundNaviGroupId: '922327', popularityRank: 1 }];
  const validation = validateCatalog(songs, 1, 1);
  const published = await publishCatalog(firestore, admin, songs, validation, 'staff-portal');
  assert.equal(documents.get(`music_game_catalogs/sabikara/versions/${published.version}/songs/497445`).joysoundNaviGroupId, '922327');

  const routes = new Map();
  initializeMusicGameRoutes({ get: (path, handler) => routes.set(path, handler), post() {} }, { firestore, admin });
  let response;
  await routes.get('/api/troy-music-game/bootstrap')({}, { json: (body) => { response = body; } });
  assert.equal(response.songs[0].joysoundNaviGroupId, '922327');
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

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractSearchPageUrls,
  extractSongDetailUrls,
  getTokyoDayKey,
  initializeMusicGameRoutes,
  normalizeScore,
  parseOfficialTotal,
  parseSongDetail,
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
});

test('catalog validation accepts only a complete, unique export', () => {
  const songs = [
    { title: '曲A', artist: '歌手A', songNumber: '100001' },
    { title: '曲B', artist: '歌手B', songNumber: '100002' }
  ];
  assert.equal(validateCatalog(songs, 2, 2).success, true);
  assert.equal(validateCatalog(songs, 3, 2).success, false);
  assert.equal(validateCatalog([...songs, { ...songs[0] }], 3, 3).duplicateNumbers.length, 1);
});

test('JOYSOUND list and detail parsing normalize only required catalog fields', () => {
  const listHtml = `
    <h2>曲一覧(2件)</h2>
    <a href="/web/search/song/922327">song A</a>
    <a href="/web/search/song?genreCd=23700001&searchType=3&page=2">2</a>`;
  assert.equal(parseOfficialTotal(listHtml), 2);
  assert.deepEqual(extractSongDetailUrls(listHtml, 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3'), [
    'https://www.joysound.com/web/search/song/922327'
  ]);
  assert.deepEqual(extractSearchPageUrls(listHtml, 'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3'), [
    'https://www.joysound.com/web/search/song?genreCd=23700001&searchType=3&page=2'
  ]);
  assert.deepEqual(parseSongDetail(`
    <h1>新曲[サビカラ] 曲 A</h1>
    <table><tr><th>歌手名</th><td><a>歌手 A</a></td></tr></table>
    <p>曲番号: 123 456</p>`, 'https://www.joysound.com/web/search/song/922327'), {
    title: '曲 A',
    artist: '歌手 A',
    songNumber: '123456',
    catalog: 'sabikara'
  });
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

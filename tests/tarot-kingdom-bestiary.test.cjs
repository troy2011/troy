const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const JS_DIR = path.join(__dirname, '..', 'public', 'js');
const load = (file) => import(pathToFileURL(path.join(JS_DIR, file)).href);

// The repo is "type": "commonjs", but public/js holds browser ES modules (imported with ?v= cache keys).
const JS_DIR_URL = pathToFileURL(JS_DIR).href;
require('node:module').registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    const file = url.split('?')[0];
    return file.startsWith(JS_DIR_URL) && file.endsWith('.js') ? { ...result, format: 'module' } : result;
  }
});

test('every monster has a detail with its look, attacks and element', async () => {
  const { PIXEL_MONSTERS_ROSTER } = await load('pixelMonstersManifest.js');
  const { getTarotKingdomMonsterDetail } = await load('tarotKingdomBestiary.js');
  assert.equal(PIXEL_MONSTERS_ROSTER.length, 50);
  for (const monster of PIXEL_MONSTERS_ROSTER) {
    const detail = getTarotKingdomMonsterDetail(monster.id);
    assert.ok(detail, monster.id);
    assert.ok(detail.look && detail.singleAttack && detail.areaAttack, `${monster.name} has its notes`);
    assert.ok(detail.elementLabel, `${monster.name} has an element`);
  }
  assert.equal(getTarotKingdomMonsterDetail('unknown'), null);
});

test('the detail reads the battle data: Mokurin is a dark hand weak to light', async () => {
  const { getTarotKingdomMonsterDetail } = await load('tarotKingdomBestiary.js');
  const mokurin = getTarotKingdomMonsterDetail('ismartal-vol1-monster-08');
  assert.equal(mokurin.element, 'dark');
  assert.equal(mokurin.weakLabel, '光');
  assert.equal(mokurin.specialLabel, '影手の吸命');
  assert.deepEqual(mokurin.ailmentLabels, ['影縛り']);
  assert.ok(mokurin.weakWeaponLabels.length > 0);
});

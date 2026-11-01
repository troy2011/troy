const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'public', 'js');
const VENDOR = path.join(JS_DIR, 'vendor', 'pixelfx');
const importJs = (file) => import(pathToFileURL(file).href);

// The repo is "type": "commonjs", but public/js holds browser ES modules; load those files as ESM here.
const JS_DIR_URL = pathToFileURL(JS_DIR).href;
require('node:module').registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    return url.startsWith(JS_DIR_URL) && url.endsWith('.js') ? { ...result, format: 'module' } : result;
  }
});

const WEAPON_TYPES = ['unarmed', 'staff', 'wand', 'axe', 'axe_big', 'blunt', 'dagger', 'polearm', 'shield', 'sword', 'sword_big', 'gun', 'gun_big', 'bow'];
const ELEMENTS = ['neutral', 'fire', 'water', 'wind', 'earth', 'light', 'dark'];

async function loadRecipes() {
  const { __test } = await importJs(path.join(JS_DIR, 'tarotKingdomPixelFx.js'));
  return __test;
}

function allRecipes(tables) {
  return [
    ...tables.MAJOR_RECIPES,
    tables.CRITICAL_LAYER,
    ...Object.values(tables.WEAPON_RECIPES).flat(),
    ...Object.values(tables.ENEMY_SINGLE_RECIPES).flat(),
    ...Object.values(tables.ENEMY_AREA_RECIPES).flat()
  ];
}

test('every major arcana, weapon type and enemy element has a recipe', async () => {
  const tables = await loadRecipes();
  assert.equal(tables.MAJOR_RECIPES.length, 22);
  for (const weapon of WEAPON_TYPES) assert.ok(tables.WEAPON_RECIPES[weapon]?.length, `weapon ${weapon}`);
  for (const element of ELEMENTS) {
    assert.ok(tables.ENEMY_SINGLE_RECIPES[element]?.length, `single ${element}`);
    assert.ok(tables.ENEMY_AREA_RECIPES[element]?.length, `area ${element}`);
  }
  assert.equal(tables.normalizeElement('FIRE'), 'fire');
  assert.equal(tables.normalizeElement('unknown'), 'neutral');
});

test('every recipe effect is vendored and plays without errors', async () => {
  const tables = await loadRecipes();
  const core = await importJs(path.join(VENDOR, 'core', 'index.js'));
  const paths = [...new Set(allRecipes(tables).map((recipe) => recipe.path))];
  for (const effectPath of paths) {
    const file = path.join(VENDOR, 'fx', `${effectPath}.js`);
    assert.ok(fs.existsSync(file), `missing vendored effect ${effectPath}`);
    const mod = await importJs(file);
    const frame = core.createFrame(195, 160);
    const fx = core.createFx(mod, { x: 98, y: 120, flip: true, light: 0.8 });
    // step through the whole effect at 30 fps, drawing every frame
    const duration = Math.min(4, Number(mod.meta?.duration) || 1);
    for (let t = 0; t < duration; t += 1 / 30) {
      fx.update(1 / 30);
      core.clearFrame(frame);
      fx.draw(frame);
    }
  }
});

test('the vendored lightning keeps a single soft stroke (no strobe)', () => {
  const source = fs.readFileSync(path.join(VENDOR, 'fx', 'lightning', 'lightning-strike.js'), 'utf8');
  assert.match(source, /const STROKES = \[\{ t: 0\.76, k: 1 \}\];/);
  assert.match(source, /const FLICK = \[1, 0\.85, 0\.7, 0\.55, 0\.42, 0\.3, 0\.2\];/);
  assert.ok(fs.existsSync(path.join(VENDOR, 'LICENSE')), 'pixelfx MIT license ships with the code');
});

test('every major summon has its own motion timeline that reduced motion can switch off', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public', 'tarot-kingdom-summons.css'), 'utf8');
  for (let n = 0; n < 22; n += 1) {
    const id = String(n).padStart(2, '0');
    assert.ok(css.includes(`.is-summon-id-major_summon_${id} .tarot-kingdom-summon-figure { animation-name: tkMajor${id};`), `motion ${id}`);
    assert.ok(css.includes(`@keyframes tkMajor${id} {`), `keyframes ${id}`);
  }
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.tarot-kingdom-summon-figure,[\s\S]*?animation: none !important;/);
});

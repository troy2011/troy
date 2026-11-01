// Pixel-art battle effects for Tarot Kingdom, drawn with the vendored pixelfx library.
// Display only: these helpers never read or change damage, hit, reward or turn results. They are given
// the timeline the battle already decided (impactAt) and only paint on top of it.

// One art pixel covers this many CSS pixels; the canvas stays small (about 195x160 on a 390px phone)
// whatever the device pixel ratio, which keeps slow phones fast.
const DEFAULT_PIXEL_SCALE = 2;
// Effects fade over 0.3 s of their own time after stop(); the overlay is removed after this margin.
const FADE_MARGIN_MS = 360;
const REDUCED_MOTION_HOLD_MS = 400;
const REDUCED_MOTION_FADE_MS = 300;
// pixelfx simulations step at 120 Hz; never step more than one 30 fps frame at a time.
const MAX_STEP_SECONDS = 1 / 30;

// The major-arcana cutin lasts 2400 ms and the summon lunges at 66.67 % of it.
export const TAROT_KINGDOM_MAJOR_FX_HIT_MS = 1600;
const MAJOR_FX_STOP_MS = 2150;
// Long effects are squeezed into the cutin, never slower than real time nor faster than this.
const MAJOR_FX_MAX_SPEED = 1.7;
const MAJOR_FX_FIT_SECONDS = 2.2;
// Weapon and enemy hits stay on screen at most this long after the impact.
const HIT_FX_TAIL_MS = 900;

const PALETTES = Object.freeze({
  gold: ['#1e1206', '#4a2c08', '#86520c', '#c48412', '#f0b424', '#ffe066', '#fff6c4', '#ffffff'],
  sky: ['#081830', '#0e2e5a', '#14508c', '#1c76bc', '#36a2e0', '#78ccf4', '#c4ecff', '#ffffff'],
  leaf: ['#0c1a0e', '#163418', '#225224', '#357530', '#4f9a3a', '#7cc048', '#b4e070', '#e4ffb0'],
  blood: ['#14040a', '#3a0a14', '#6a101c', '#a01824', '#d42a30', '#ff5a50', '#ff9a8a'],
  sun: ['#2a0a04', '#6a1c06', '#b4400a', '#f07a14', '#ffb02a', '#ffe066', '#fff8d6', '#ffffff'],
  steel: ['#0c0e14', '#1c2230', '#2e3648', '#4a5468', '#6e7a90', '#9aa6ba', '#d0d8e6', '#ffffff']
});

// Element tints for slashes and sparks (dark → bright ramps).
const ELEMENT_PALETTES = Object.freeze({
  fire: ['#1f0b10', '#4a1118', '#8c1d1c', '#cc3a1a', '#f2701f', '#ffae35', '#ffe27a', '#fff8d6'],
  water: ['#081830', '#0e2e5a', '#14508c', '#1c76bc', '#36a2e0', '#78ccf4', '#c4ecff', '#ffffff'],
  wind: ['#041418', '#08303a', '#0c5260', '#108088', '#18b4b0', '#4ce8d8', '#b4fff0', '#ffffff'],
  earth: ['#140e0a', '#2a1e14', '#47321e', '#69492a', '#8e6638', '#b88a52', '#dcb47c', '#fff2d0'],
  light: PALETTES.gold,
  dark: ['#050308', '#0f0a18', '#1c1230', '#2c1a4a', '#432468', '#5e3290', '#8048b8', '#d0a8ff']
});

/*
 * Recipes. Offsets are in art pixels from the anchor:
 *   dx: towards the right of the screen, up: above the anchor's feet line.
 *   hit: the effect's own second that lines up with the impact; speed: playback rate.
 * Major-arcana anchors are the enemy's feet; the enemy stands on the left of the stage.
 */
const MAJOR_RECIPES = Object.freeze([
  { path: 'explosions/firework-burst', dx: 4, up: 43, hit: 1.0 },
  { path: 'arcane/mana-burst', dx: 0, up: -6, hit: 0.24, scale: 3, speed: 1, light: 1 },
  { path: 'arcane/magic-circle-cast', dx: 0, up: -5, hit: 2.4, palette: PALETTES.sky },
  { path: 'nature/thorns', dx: 72, up: -5, hit: 1.0, flip: true, palette: PALETTES.leaf },
  { path: 'holy/smite', dx: 0, up: -5, hit: 0.56, light: 1 },
  { path: 'scifi/emp-blast', dx: 0, up: 1, hit: 1.0, palette: PALETTES.gold },
  { path: 'holy/feather-burst', dx: 0, up: 43, hit: 0.12, opts: { glow: '#ffc0d8' } },
  { path: 'impacts/ground-slam', dx: 0, up: -5, hit: 0.2 },
  { path: 'impacts/crit-hit', dx: -4, up: 9, hit: 0.05, scale: 3, speed: 1, light: 1 },
  { path: 'shadow/hex-sigil', dx: 0, up: -5, hit: 3.0, palette: PALETTES.sky },
  { path: 'arcane/rune-circle', dx: 0, up: -8, hit: 1.2, palette: PALETTES.gold },
  { path: 'impacts/parry', dx: 0, up: 3, hit: 0.05, scale: 3, speed: 1, light: 1 },
  { path: 'shadow/black-hole', dx: 0, up: -34, hit: 1.0, speed: 1.2, light: 1 },
  { path: 'shadow/dark-explosion', dx: 0, up: -8, hit: 1.6 },
  { path: 'water/geyser', dx: 0, up: -8, hit: 1.35, speed: 1.7 },
  { path: 'shadow/grasping-hands', dx: 0, up: -8, hit: 0.5, palette: PALETTES.blood },
  { path: 'lightning/lightning-strike', dx: 0, up: -5, hit: 0.76, light: 0.55 },
  { path: 'arcane/star-fall', dx: 0, up: -8, hit: 0.75, speed: 1, light: 1.2 },
  { path: 'shadow/eclipse', dx: 0, up: 46, hit: 1.0 },
  { path: 'explosions/plasma-explosion', dx: 0, up: 22, hit: 0.1, palette: PALETTES.sun },
  { path: 'holy/holy-pillar', dx: 0, up: -5, hit: 1.5 },
  { path: 'arcane/time-stop', dx: 0, up: -4, hit: 2.42, scale: 3 }
]);

// Party weapon hits. The party stands on the right, so directional effects are mirrored (flip) and
// `back` is measured from the enemy's feet towards the attacker.
const CRITICAL_LAYER = Object.freeze({ path: 'impacts/crit-hit', back: -6, up: 14, hit: 0.05 });
const WEAPON_RECIPES = Object.freeze({
  unarmed: [{ path: 'impacts/blunt-hit', back: 4, up: 4, hit: 0 }],
  dagger: [{ path: 'melee/dagger-flurry', back: 37, up: -8, hit: 0.12, flip: true, tint: true }],
  wand: [{ path: 'impacts/hit-spark', back: 9, up: 8, hit: 0, flip: true, opts: { palette: PALETTES.gold }, tint: true }],
  gun: [{ path: 'impacts/bullet-impact', back: 13, up: 8, hit: 0, flip: true }],
  shield: [
    { path: 'impacts/blunt-hit', back: 4, up: 4, hit: 0, opts: { warm: '#cfe6ff' } },
    { path: 'impacts/hit-spark', back: 9, up: 11, hit: 0, flip: true }
  ],
  sword: [{ path: 'melee/sword-slash', back: 39, up: -8, hit: 0.03, flip: true, tint: true }],
  polearm: [{ path: 'melee/thrust', back: 72, up: 1, hit: 0.14, flip: true, tint: true }],
  staff: [{ path: 'projectiles/magic-missile', back: 84, up: -8, hit: 0.97, speed: 2, flip: true, opts: { reach: 80 }, tint: true }],
  bow: [
    { path: 'projectiles/arrow', fly: { ms: 170, up: 14 } },
    { path: 'impacts/hit-spark', back: 9, up: 11, hit: 0, flip: true, tint: true }
  ],
  axe: [{ path: 'melee/heavy-cleave', back: 45, up: -12, hit: 0.5, speed: 1.6, flip: true, tint: true }],
  blunt: [{ path: 'melee/hammer-smash', back: 45, up: -12, hit: 0.3, speed: 1.4, flip: true, tint: true }],
  gun_big: [{ path: 'explosions/small-explosion', back: 0, up: -12, hit: 0.03, speed: 1.8 }],
  sword_big: [{ path: 'melee/double-slash', back: 43, up: -12, hit: 0.3, flip: true, opts: { palette: PALETTES.steel }, tint: true }],
  axe_big: [
    { path: 'melee/heavy-cleave', back: 49, up: -15, hit: 0.5, speed: 1.3, flip: true, tint: true },
    { path: 'impacts/ground-slam', back: 0, up: -8, hit: 0.15, speed: 1.4 }
  ]
});

// Enemy attacks on the party. The enemy is on the left, so effects keep their natural right-facing
// direction. Single attacks anchor on the target's feet; area attacks on the party's lowest feet line.
const ENEMY_SINGLE_RECIPES = Object.freeze({
  neutral: [{ path: 'melee/claw-swipe', back: 20, up: -9, hit: 0.1 }],
  fire: [
    { path: 'fire/fireball', fly: { ms: 260, up: 10 } },
    { path: 'impacts/hit-spark', back: 12, up: 4, hit: 0 }
  ],
  water: [
    { path: 'water/water-jet', jet: true, up: 13, hit: 0.18, until: 260 },
    { path: 'water/splash', back: 0, up: -9, hit: 0.02, speed: 1.6 }
  ],
  wind: [{ path: 'lightning/zap-hit', back: 0, up: 7, hit: 0.12 }],
  earth: [{ path: 'nature/earth-spike', back: 0, up: -16, hit: 0.9, speed: 2 }],
  light: [{ path: 'holy/smite', back: 0, up: -10, hit: 0.56 }],
  dark: [{ path: 'shadow/shadow-tendrils', back: 0, up: -16, hit: 0.7, speed: 1.8 }]
});
const ENEMY_AREA_RECIPES = Object.freeze({
  neutral: [{ path: 'impacts/ground-slam', back: 0, up: 0, hit: 0.15, speed: 1.3 }],
  fire: [{ path: 'fire/fire-breath', breath: true, hit: 0.35, until: 520, light: 0.7 }],
  water: [{ path: 'water/splash', each: true, up: -9, hit: 0.02, speed: 1.6, staggerMs: 50 }],
  wind: [{ path: 'nature/tornado', back: 0, up: -9, hit: 0.3, until: 700, drift: 16 }],
  earth: [{ path: 'nature/quake', back: 8, up: -3, hit: 0.6, speed: 1.6 }],
  light: [{ path: 'arcane/star-fall', back: 0, up: -9, hit: 0.75, palette: PALETTES.gold }],
  dark: [{ path: 'shadow/dark-explosion', back: 0, up: -9, hit: 1.6, speed: 1.7 }]
});

const moduleCache = new Map();
let corePromise = null;

function loadCore() {
  // Relative dynamic imports resolve against this module's URL, so no bundler or path config is needed.
  if (!corePromise) corePromise = import('./vendor/pixelfx/core/index.js');
  return corePromise;
}

function loadEffect(path) {
  if (!moduleCache.has(path)) {
    const promise = import(`./vendor/pixelfx/fx/${path}.js`);
    // A failed load must not stay cached forever; the next battle can try again.
    promise.catch(() => moduleCache.delete(path));
    moduleCache.set(path, promise);
  }
  return moduleCache.get(path);
}

/** Starts fetching the core early so the first hit of a battle is not late. */
export function warmTarotKingdomPixelFx() {
  return loadCore().catch(() => null);
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function normalizeElement(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ELEMENT_PALETTES, key) ? key : 'neutral';
}

/*
 * A player owns one canvas and every effect layer currently on it. Each layer knows the wall-clock time
 * (Date.now) its effect starts, so effects stay in sync with the battle timeline even when a frame is late
 * or the modules finished loading after the start: they simply join part-way through.
 */
function createPlayer(canvas, scale, core, { removeWhenDone = false } = {}) {
  const width = Math.max(1, Math.ceil(canvas.clientWidth / scale));
  const height = Math.max(1, Math.ceil(canvas.clientHeight / scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const frame = core.createFrame(width, height);
  const image = new ImageData(width, height);
  const layers = [];
  let rafId = 0;

  const draw = () => {
    core.clearFrame(frame);
    layers.forEach((layer) => { if (layer.visible) layer.fx.draw(frame); });
    core.composite(frame, image.data, null);
    ctx.putImageData(image, 0, 0);
  };

  const step = (now) => {
    layers.forEach((layer) => {
      layer.visible = now >= layer.startAt && now < layer.endAt;
      if (layer.fly && layer.visible) {
        const progress = Math.min(1, (now - layer.startAt) / Math.max(1, layer.fly.ms));
        layer.fx.options.x = Math.round(layer.fly.fromX + ((layer.fly.toX - layer.fly.fromX) * progress));
        layer.fx.options.y = Math.round(layer.fly.fromY + ((layer.fly.toY - layer.fly.fromY) * progress));
      }
      if (layer.drift) {
        const progress = Math.min(1, Math.max(0, (now - layer.startAt) / 900));
        layer.fx.options.x = Math.round(layer.baseX - (layer.drift * progress));
      }
      if (!layer.stopped && now >= layer.stopAt) {
        layer.fx.stop();
        layer.stopped = true;
      }
      const targetSeconds = Math.max(0, ((now - layer.startAt) / 1000) * layer.speed);
      while (layer.fx.t < targetSeconds - 1e-6) {
        layer.fx.update(Math.min(MAX_STEP_SECONDS, targetSeconds - layer.fx.t));
      }
    });
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      if (now >= layers[index].endAt) layers.splice(index, 1);
    }
    draw();
  };

  const tick = () => {
    rafId = 0;
    if (!canvas.isConnected) {
      layers.length = 0;
      return;
    }
    step(Date.now());
    if (layers.length > 0) {
      rafId = requestAnimationFrame(tick);
    } else if (removeWhenDone) {
      canvas.remove();
    }
  };

  return {
    width,
    height,
    scale,
    add(layer) {
      layers.push(layer);
      if (!rafId) rafId = requestAnimationFrame(tick);
    },
    // Reduced motion: paint one quiet still of the contact frame, then fade it away.
    still(at) {
      // cancel the pending frame first, or it would repaint the now-empty layer list over the still
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      step(at);
      layers.length = 0;
      canvas.style.transition = `opacity ${REDUCED_MOTION_FADE_MS}ms ease-out`;
      setTimeout(() => { canvas.style.opacity = '0'; }, REDUCED_MOTION_HOLD_MS);
      setTimeout(() => {
        // a shared stage canvas is reused by the next hit, so leave it blank rather than just invisible
        ctx.clearRect(0, 0, width, height);
        if (removeWhenDone) canvas.remove();
      }, REDUCED_MOTION_HOLD_MS + REDUCED_MOTION_FADE_MS + 40);
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      layers.length = 0;
    }
  };
}

function buildLayer(core, mod, recipe, { x, y, impactAt, flip = false, stopAt = Infinity, endAt = Infinity, palette = null }) {
  const speed = Number(recipe.speed) || 1;
  const options = {
    x: Math.round(x),
    y: Math.round(y),
    flip,
    light: recipe.light ?? 0.8,
    ...(recipe.palette ? { palette: recipe.palette } : {}),
    ...(recipe.opts || {}),
    ...(palette ? { palette } : {})
  };
  const fx = core.createFx(mod, options);
  const startAt = impactAt - ((Number(recipe.hit) || 0) / speed) * 1000;
  const naturalEnd = recipe.until
    ? startAt + ((Number(recipe.hit) || 0) / speed) * 1000 + recipe.until
    : startAt + ((Number(mod.meta?.duration) || 1) * 1000) / speed;
  return {
    fx,
    speed,
    startAt,
    stopAt: Math.min(stopAt, recipe.until ? naturalEnd : Infinity),
    endAt: Math.min(endAt, naturalEnd + (recipe.until ? FADE_MARGIN_MS : 0)),
    baseX: options.x,
    drift: Number(recipe.drift) || 0,
    visible: false,
    stopped: false
  };
}

function rectIn(stageRect, element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    cx: rect.left - stageRect.left + (rect.width / 2),
    cy: rect.top - stageRect.top + (rect.height / 2),
    feet: rect.bottom - stageRect.top,
    width: rect.width
  };
}

function ensureStageCanvas(stageEl) {
  let canvas = stageEl.querySelector(':scope > .tarot-kingdom-pixelfx-layer');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'tarot-kingdom-pixelfx-layer';
    canvas.setAttribute('aria-hidden', 'true');
    stageEl.appendChild(canvas);
  }
  return canvas;
}

const stagePlayers = new WeakMap();
function getStagePlayer(stageEl, core) {
  const canvas = ensureStageCanvas(stageEl);
  canvas.style.opacity = '';
  canvas.style.transition = '';
  let entry = stagePlayers.get(stageEl);
  // The canvas resolution follows the stage size; rebuild the player when the stage was resized.
  const width = Math.ceil(canvas.clientWidth / DEFAULT_PIXEL_SCALE);
  if (!entry || entry.canvas !== canvas || entry.player.width !== width) {
    entry?.player.stop();
    entry = { canvas, player: createPlayer(canvas, DEFAULT_PIXEL_SCALE, core) };
    stagePlayers.set(stageEl, entry);
  }
  return entry.player;
}

async function addLayers(player, core, specs, { reducedMotion, impactAt }) {
  const loaded = await Promise.all(specs.map((spec) => loadEffect(spec.recipe.path).catch(() => null)));
  loaded.forEach((mod, index) => {
    if (!mod) return;
    const spec = specs[index];
    const layer = buildLayer(core, mod, spec.recipe, spec);
    if (spec.fly) {
      layer.startAt = impactAt - spec.fly.ms;
      layer.endAt = impactAt;
      layer.stopAt = Infinity;
      layer.fly = spec.fly;
    }
    if (Date.now() < layer.endAt) player.add(layer);
  });
  if (reducedMotion) player.still(impactAt + 40);
}

/**
 * Major-arcana summon: paints the arcana's own effect on a canvas inside the cutin.
 * elapsedMs is how far into the 2400 ms cutin we already are (a re-render can join part-way).
 */
export async function playTarotKingdomMajorFx(canvas, majorNumber, { elapsedMs = 0, enemyEl = null, stageEl = null } = {}) {
  const recipe = MAJOR_RECIPES[Math.max(0, Math.min(21, Math.floor(Number(majorNumber) || 0)))];
  if (!canvas || !recipe) return;
  try {
    const [core, mod] = await Promise.all([loadCore(), loadEffect(recipe.path)]);
    if (!canvas.isConnected) return;
    const scale = recipe.scale || DEFAULT_PIXEL_SCALE;
    const player = createPlayer(canvas, scale, core);
    const stageRect = (stageEl || canvas.parentElement)?.getBoundingClientRect?.();
    const enemy = stageRect ? rectIn(stageRect, enemyEl) : null;
    // Without an enemy on screen, aim where the enemy usually stands.
    const feetX = enemy ? enemy.cx / scale : player.width * 0.25;
    const feetY = enemy ? enemy.feet / scale : player.height * 0.7;
    const cutinStartAt = Date.now() - Math.max(0, Number(elapsedMs) || 0);
    const duration = Number(mod.meta?.duration) || 1;
    const fitted = {
      ...recipe,
      speed: recipe.speed ?? Math.min(MAJOR_FX_MAX_SPEED, Math.max(1, duration / MAJOR_FX_FIT_SECONDS))
    };
    const layer = buildLayer(core, mod, fitted, {
      x: feetX + recipe.dx,
      y: feetY - recipe.up,
      flip: !!recipe.flip,
      impactAt: cutinStartAt + TAROT_KINGDOM_MAJOR_FX_HIT_MS,
      stopAt: cutinStartAt + MAJOR_FX_STOP_MS
    });
    if (prefersReducedMotion()) {
      player.add(layer);
      player.still(cutinStartAt + TAROT_KINGDOM_MAJOR_FX_HIT_MS + 80);
      return;
    }
    player.add(layer);
  } catch (error) {
    // Effects are decoration; a failed load leaves the cutin as it was.
    console.warn('[TarotKingdom] pixelfx major effect skipped', error);
  }
}

/** Party weapon hit on the enemy, landing exactly on impactAt (Date.now clock). */
export async function playTarotKingdomWeaponHitFx(stageEl, {
  weaponType = 'sword', impactAt = Date.now(), attackerEl = null, targetEl = null, critical = false, element = ''
} = {}) {
  if (!stageEl || !targetEl) return;
  try {
    const core = await loadCore();
    const player = getStagePlayer(stageEl, core);
    const stageRect = stageEl.getBoundingClientRect();
    const target = rectIn(stageRect, targetEl);
    if (!target) return;
    const attacker = rectIn(stageRect, attackerEl);
    const scale = player.scale;
    const feetX = target.cx / scale;
    const feetY = target.feet / scale;
    // `back` points from the target towards the attacker (the party is on the right).
    const towards = attacker && attacker.cx < target.cx ? -1 : 1;
    const tint = ELEMENT_PALETTES[normalizeElement(element)] || null;
    const recipes = [...(WEAPON_RECIPES[weaponType] || WEAPON_RECIPES.sword), ...(critical ? [CRITICAL_LAYER] : [])];
    const endAt = impactAt + HIT_FX_TAIL_MS;
    const specs = recipes.map((recipe) => {
      const spec = {
        recipe,
        x: feetX + (towards * (recipe.back || 0)),
        y: feetY - (recipe.up || 0),
        flip: towards > 0 ? !!recipe.flip : false,
        impactAt,
        endAt,
        stopAt: endAt - FADE_MARGIN_MS,
        palette: recipe.tint ? tint : null
      };
      if (recipe.fly) {
        spec.fly = {
          ms: recipe.fly.ms,
          fromX: (attacker ? attacker.cx : target.cx + (towards * 120)) / scale,
          fromY: feetY - recipe.fly.up,
          toX: feetX,
          toY: feetY - recipe.fly.up
        };
        spec.flip = towards > 0;
      }
      return spec;
    });
    await addLayers(player, core, specs, { reducedMotion: prefersReducedMotion(), impactAt });
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx weapon hit skipped', error);
  }
}

/** Enemy attack on one or more party members, landing exactly on impactAt (Date.now clock). */
export async function playTarotKingdomEnemyAttackFx(stageEl, {
  attackMode = 'single', element = '', impactAt = Date.now(), enemyEl = null, targetEls = []
} = {}) {
  const targetsInput = (Array.isArray(targetEls) ? targetEls : []).filter(Boolean);
  if (!stageEl || targetsInput.length === 0) return;
  try {
    const core = await loadCore();
    const player = getStagePlayer(stageEl, core);
    const stageRect = stageEl.getBoundingClientRect();
    const scale = player.scale;
    const targets = targetsInput.map((el) => rectIn(stageRect, el)).filter(Boolean);
    if (targets.length === 0) return;
    const enemy = rectIn(stageRect, enemyEl);
    const elementKey = normalizeElement(element);
    const area = attackMode === 'area';
    const recipes = (area ? ENEMY_AREA_RECIPES : ENEMY_SINGLE_RECIPES)[elementKey]
      || (area ? ENEMY_AREA_RECIPES.neutral : ENEMY_SINGLE_RECIPES.neutral);
    const anchorX = targets.reduce((sum, t) => sum + t.cx, 0) / targets.length / scale;
    const anchorFeet = Math.max(...targets.map((t) => t.feet)) / scale;
    const anchorMidY = targets.reduce((sum, t) => sum + t.cy, 0) / targets.length / scale;
    // -1 when the enemy is to the left of the party (the usual layout). `back` moves towards the enemy,
    // and right-facing effects are mirrored only when the enemy stands on the right.
    const towardsEnemy = enemy && enemy.cx > anchorX * scale ? 1 : -1;
    const sourceX = enemy
      ? (enemy.cx - (towardsEnemy * enemy.width * 0.3)) / scale
      : anchorX + (towardsEnemy * 100);
    const endAt = impactAt + HIT_FX_TAIL_MS;
    const specs = [];
    recipes.forEach((recipe) => {
      const base = { recipe, impactAt, endAt, stopAt: endAt - FADE_MARGIN_MS, flip: towardsEnemy > 0 };
      if (recipe.each) {
        targets.forEach((t, index) => specs.push({
          ...base,
          impactAt: impactAt + (index * (recipe.staggerMs || 0)),
          x: t.cx / scale,
          y: (t.feet / scale) - recipe.up,
          recipe: { ...recipe, opts: { ...(recipe.opts || {}), seed: 3 + index } }
        }));
        return;
      }
      if (recipe.fly) {
        const t = targets[0];
        specs.push({
          ...base,
          x: sourceX,
          y: (t.feet / scale) - recipe.fly.up,
          fly: { ms: recipe.fly.ms, fromX: sourceX, fromY: (t.feet / scale) - recipe.fly.up - 6, toX: t.cx / scale, toY: (t.feet / scale) - recipe.fly.up }
        });
        return;
      }
      if (recipe.jet || recipe.breath) {
        // Streams leave the enemy and reach the target line.
        const reach = Math.max(24, Math.abs((anchorX - sourceX)) + 8);
        specs.push({
          ...base,
          x: sourceX,
          y: recipe.jet ? (targets[0].feet / scale) - recipe.up : anchorMidY + 6,
          recipe: recipe.jet ? { ...recipe, opts: { ...(recipe.opts || {}), length: reach } } : recipe
        });
        return;
      }
      specs.push({
        ...base,
        x: anchorX + (towardsEnemy * (recipe.back || 0)),
        y: anchorFeet - (recipe.up || 0),
        // the tornado drifts towards the enemy side
        recipe: recipe.drift ? { ...recipe, drift: towardsEnemy < 0 ? recipe.drift : -recipe.drift } : recipe
      });
    });
    await addLayers(player, core, specs, { reducedMotion: prefersReducedMotion(), impactAt });
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx enemy attack skipped', error);
  }
}

/** Clears the stage overlay (battle end, page exit). */
export function stopTarotKingdomPixelFx(stageEl) {
  if (!stageEl) return;
  stagePlayers.get(stageEl)?.player.stop();
  stagePlayers.delete(stageEl);
  stageEl.querySelector(':scope > .tarot-kingdom-pixelfx-layer')?.remove();
}

export const __test = { MAJOR_RECIPES, WEAPON_RECIPES, ENEMY_SINGLE_RECIPES, ENEMY_AREA_RECIPES, CRITICAL_LAYER, normalizeElement };

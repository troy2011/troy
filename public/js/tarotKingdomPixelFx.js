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
// Status loops alone redraw at about 20 fps (pixelfx poses hold on 12 fps steps anyway).
const LOOP_FRAME_MS = 50;
// Summon effects (marked calm) redraw at 30 fps, the rate pixelfx effects are drawn for.
const CALM_FRAME_MS = 33;
// Knock-back on a hit: a small push away from the attacker, then back. No screen shake.
const KNOCKBACK_PX = Object.freeze({ enemy: 5, enemyCritical: 8, ally: 4 });
const KNOCKBACK_MS = 260;

// The major-arcana cutin lasts 2400 ms and the summon lunges at 66.67 % of it.
export const TAROT_KINGDOM_MAJOR_FX_HIT_MS = 1600;
const MAJOR_FX_STOP_MS = 2150;
// Long effects are squeezed into the cutin, never slower than real time nor faster than this.
const MAJOR_FX_MAX_SPEED = 1.7;
const MAJOR_FX_FIT_SECONDS = 2.2;
// A normal 5-card summon cutin lasts 4500 ms and the summon lunges at 66.67 % of it; the party is back on
// stage from 3800 ms, so effects on the party land just after that.
export const TAROT_KINGDOM_SUMMON_FX_HIT_MS = 3000;
const SUMMON_FX_STOP_MS = 4100;
const SUMMON_FX_END_MS = 4500;
const SUMMON_PARTY_FX_AT_MS = 3850;
const SUMMON_PARTY_FX_TAIL_MS = 1400;
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

/*
 * Normal 5-card summons, by effect. `hit` layers paint on the cutin, anchored like the major arcana on the
 * enemy's feet (`delay` ms after the impact; `fly` comes in from the summon on the right; `actor` wraps the
 * enemy's real sprite). `party` layers land on each standing party member once the party is back, for the
 * effects that heal, guard or power it up. The role's own damage always lands on the enemy at the impact.
 */
const SEA_PALETTE = ['#06142a', '#0a2a50', '#0e4a80', '#1673b0', '#2ea3d8', '#6fd2f0', '#bff0ff', '#ffffff'];
const SUMMON_RECIPES = Object.freeze({
  // 破城強襲 + 崩し: a stone spike rams up under the enemy as the floor is slammed
  rupture: {
    hit: [
      { path: 'nature/earth-spike', dx: 0, up: -8, hit: 0.9, speed: 1.6 },
      { path: 'impacts/ground-slam', dx: 0, up: -5, hit: 0.15, speed: 1.3 }
    ]
  },
  // 爆炎砲撃 + 火傷: a fireball lobbed from the summon bursts on the enemy
  inferno: {
    hit: [
      { path: 'fire/fireball', fly: { ms: 320, up: 18 } },
      { path: 'explosions/small-explosion', dx: 0, up: -8, hit: 0.03, speed: 1.6 }
    ]
  },
  // 怒涛連撃: two blazing cleaves, then a hammer blow with a shockwave, a spark on each
  barrage: {
    hit: [
      { path: 'melee/heavy-cleave', dx: 45, up: -12, hit: 0.5, speed: 1.6, flip: true },
      { path: 'melee/heavy-cleave', dx: 45, up: -6, hit: 0.5, speed: 1.6, flip: true, delay: 200 },
      { path: 'melee/hammer-smash', dx: 45, up: -12, hit: 0.3, speed: 1.4, flip: true, delay: 400 },
      { path: 'impacts/hit-spark', dx: 8, up: 16, hit: 0, flip: true },
      { path: 'impacts/hit-spark', dx: 4, up: 22, hit: 0, flip: true, delay: 200 },
      { path: 'impacts/hit-spark', dx: 10, up: 10, hit: 0, flip: true, delay: 400 }
    ]
  },
  // 深海拘束 (麻痺): sea-green roots burst up and cinch round the enemy
  bind: {
    hit: [
      { path: 'nature/root-snare', dx: 0, up: 0, hit: 1.0, actor: true, palette: SEA_PALETTE },
      { path: 'water/splash', dx: 0, up: -8, hit: 0.02, speed: 1.6 }
    ]
  },
  // 奈落暗転 (暗闇): a black orb swallows the light over the enemy's head
  eclipse: {
    hit: [{ path: 'shadow/void-orb', dx: 0, up: 0, hit: 0.63, light: 0.6 }]
  },
  // 亡霊攪乱 (混乱): ghost skulls circle the enemy
  chaos: {
    hit: [{ path: 'shadow/necro-skulls', dx: 0, up: -35, hit: 0.6 }]
  },
  // 生命潮 (回復): a wave breaks on the enemy, then the party is healed
  tide: {
    hit: [{ path: 'water/splash', dx: 0, up: -8, hit: 0.02, speed: 1.4 }],
    party: [{ path: 'holy/heal', palette: SEA_PALETTE, opts: { drain: 0 } }]
  },
  // 海神障壁 (防御): a blow on the enemy, then a golden bubble round each party member
  aegis: {
    hit: [{ path: 'impacts/blunt-hit', dx: 4, up: 4, hit: 0, opts: { warm: '#ffe9a8' } }],
    party: [{ path: 'holy/divine-shield', opts: { radius: 16 } }]
  },
  // 艦隊号令 (次の攻撃強化): a salvo on the enemy, then a cone of light on each party member
  command: {
    hit: [
      { path: 'explosions/small-explosion', dx: 0, up: -8, hit: 0.03, speed: 1.8 },
      { path: 'impacts/hit-spark', dx: 12, up: 20, hit: 0, flip: true, delay: 160 }
    ],
    party: [{ path: 'holy/blessing' }]
  },
  // 四象召喚: the flush suit's element on the enemy, and its blessing on the party
  'flush:Wand': {
    hit: [{ path: 'fire/flame-pillar', dx: 0, up: -8, hit: 0.68, speed: 1.4, light: 0.3, until: 700 }],
    party: [{ path: 'holy/blessing', palette: PALETTES.sun }]
  },
  'flush:Cup': {
    hit: [{ path: 'water/wave-crash', dx: 10, up: -8, hit: 1.3, speed: 1.4, flip: true }],
    party: [{ path: 'holy/heal', palette: SEA_PALETTE, opts: { drain: 0 } }]
  },
  'flush:Sword': {
    hit: [{ path: 'nature/tornado', dx: 0, up: -9, hit: 0.3, until: 900 }],
    party: [{ path: 'holy/blessing', palette: ELEMENT_PALETTES.wind }]
  },
  'flush:Pentacle': {
    hit: [
      { path: 'nature/boulder', dx: 0, up: -8, hit: 0.52, flip: true },
      { path: 'impacts/ground-slam', dx: 0, up: -5, hit: 0.15, speed: 1.3 }
    ],
    party: [{ path: 'holy/divine-shield', palette: ELEMENT_PALETTES.earth, opts: { radius: 16 } }]
  }
});

/*
 * Minor-arcana resonance attacks, by resonanceId. They ride on the card's weapon hit, a beat after it, and sit
 * between a weapon hit and a summon in size: the summons keep the biggest effects. Anchored like the summons
 * on the enemy's feet (`dx` towards the party on the right; `delay` ms after the resonance's own start; `fly`
 * comes in from the attacker). Resonances without an entry fall back to their element.
 */
const WIND = ELEMENT_PALETTES.wind;
const RESONANCE_RECIPES = Object.freeze({
  'sword-1': [{ path: 'projectiles/energy-disc', fly: { ms: 220, up: 16 }, palette: WIND }],
  'sword-2': [
    { path: 'melee/scythe-reap', dx: 2, up: -10, hit: 0.5, speed: 1.8, flip: true, palette: WIND },
    { path: 'melee/scythe-reap', dx: -2, up: -4, hit: 0.5, speed: 1.8, palette: WIND, delay: 160 }
  ],
  'sword-3': [
    { path: 'melee/spear-sweep', dx: 40, up: 2, hit: 0.1, speed: 1.6, flip: true, palette: WIND },
    { path: 'impacts/hit-spark', dx: 6, up: 12, hit: 0, flip: true, delay: 120 },
    { path: 'impacts/hit-spark', dx: 2, up: 18, hit: 0, flip: true, delay: 240 }
  ],
  'sword-4': [{ path: 'nature/leaf-storm', dx: 0, up: 0, hit: 0.3, speed: 1.3, until: 800, palette: WIND }],
  'sword-5': [{ path: 'water/whirlpool', dx: 0, up: -4, hit: 0.3, speed: 1.4, until: 800, palette: WIND }],
  'sword-6': [
    { path: 'melee/scythe-reap', dx: 2, up: -10, hit: 0.5, speed: 1.8, flip: true, palette: PALETTES.leaf },
    { path: 'nature/acid-splash', dx: 0, up: 0, hit: 0.6, speed: 1.6, until: 700, delay: 120 }
  ],
  'sword-7': [{ path: 'fire/fire-tornado', dx: 0, up: 0, hit: 0.3, speed: 1.3, until: 900, palette: WIND }],
  'sword-8': [{ path: 'melee/uppercut', dx: 0, up: 0, hit: 0.07, palette: WIND }],
  'sword-9': [
    { path: 'melee/spin-slash', dx: 0, up: -6, hit: 0.15, speed: 1.4, palette: WIND },
    { path: 'melee/spin-slash', dx: 0, up: 4, hit: 0.15, speed: 1.4, flip: true, palette: WIND, delay: 220 }
  ],
  'sword-10': [
    { path: 'melee/scythe-reap', dx: 2, up: -10, hit: 0.5, speed: 1.8, flip: true, palette: PALETTES.steel },
    { path: 'melee/scythe-reap', dx: -2, up: -10, hit: 0.5, speed: 1.8, palette: PALETTES.steel, delay: 120 }
  ],
  'sword-12': [
    { path: 'explosions/implosion', dx: 0, up: 18, hit: 0.7, speed: 1.6, palette: WIND },
    { path: 'melee/spin-slash', dx: 0, up: -2, hit: 0.15, speed: 1.4, palette: WIND, delay: 150 }
  ],
  'sword-13': [{ path: 'lightning/thunderclap', dx: 0, up: 0, hit: 0.1 }],
  'sword-14': [
    { path: 'water/whirlpool', dx: 0, up: -4, hit: 0.3, speed: 1.4, until: 900, palette: WIND },
    { path: 'fire/fire-tornado', dx: 0, up: 0, hit: 0.3, speed: 1.3, until: 900, palette: WIND, delay: 120 }
  ],
  'wand-1': [{ path: 'fire/flamethrower', dx: 70, up: 14, hit: 0.2, until: 500, flip: true }],
  'wand-2': [{ path: 'arcane/arcane-missiles', dx: 0, up: 20, hit: 0.4, speed: 1.5, palette: ELEMENT_PALETTES.fire }],
  'wand-3': [
    { path: 'fire/spirit-flame', dx: 0, up: 0, hit: 0.3, speed: 1.4, until: 700, palette: ELEMENT_PALETTES.fire },
    { path: 'impacts/hit-spark', dx: 4, up: 14, hit: 0, flip: true, opts: { palette: PALETTES.sun } }
  ],
  'wand-4': [{ path: 'fire/flamethrower', dx: 80, up: 10, hit: 0.2, until: 900, flip: true }],
  'wand-5': [{ path: 'fire/fire-ring', dx: 0, up: 0, hit: 0.5, speed: 1.4, until: 900 }],
  'wand-7': [{ path: 'fire/meteor', dx: 0, up: 0, hit: 0.7, speed: 1.3, until: 1100 }],
  'wand-8': [{ path: 'arcane/arcane-beam', dx: 78, up: 8, hit: 0.3, speed: 1.4, until: 700, flip: true, palette: PALETTES.sun }],
  'wand-9': [{ path: 'holy/sunburst', dx: 0, up: 18, hit: 0.2, speed: 1.4, until: 800, palette: PALETTES.sun }],
  'wand-13': [{ path: 'fire/fire-tornado', dx: 0, up: 0, hit: 0.3, speed: 1.3, until: 1000 }],
  'wand-14': [
    { path: 'fire/fire-ring', dx: 0, up: 0, hit: 0.5, speed: 1.4, until: 1100 },
    { path: 'fire/meteor', dx: 0, up: 0, hit: 0.7, speed: 1.3, until: 1100, delay: 150 }
  ],
  'pentacle-9': [{ path: 'explosions/implosion', dx: 0, up: 18, hit: 0.7, speed: 1.6, palette: ELEMENT_PALETTES.earth }]
});
const RESONANCE_ELEMENT_RECIPES = Object.freeze({
  wind: [{ path: 'melee/spin-slash', dx: 0, up: -2, hit: 0.15, speed: 1.4, palette: WIND }],
  fire: [{ path: 'fire/spirit-flame', dx: 0, up: 0, hit: 0.3, speed: 1.4, until: 600, palette: ELEMENT_PALETTES.fire }],
  water: [{ path: 'water/whirlpool', dx: 0, up: -4, hit: 0.3, speed: 1.4, until: 600 }],
  earth: [{ path: 'impacts/heavy-landing', dx: 0, up: 0, hit: 0.1 }]
});
// A resonance starts this long after the weapon hit and stays at most this long after its own start.
const RESONANCE_FX_DELAY_MS = 160;
const RESONANCE_FX_TAIL_MS = 1500;

// Party weapon hits. The party stands on the right, so directional effects are mirrored (flip) and
// `back` is measured from the enemy's feet towards the attacker. Normal hits stay small and quick: the showier
// cleaves, shockwaves and explosions are kept for the summons.
const CRITICAL_LAYER = Object.freeze({ path: 'impacts/crit-hit', back: -6, up: 14, hit: 0.05 });
const GUARD_LAYER = Object.freeze({ path: 'impacts/parry', back: 0, up: 14, hit: 0.05, opts: { palette: PALETTES.steel } });
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
  axe: [
    { path: 'melee/sword-slash', back: 39, up: -10, hit: 0.03, flip: true, opts: { palette: PALETTES.steel }, tint: true },
    { path: 'impacts/hit-spark', back: 9, up: 11, hit: 0, flip: true }
  ],
  blunt: [
    { path: 'impacts/blunt-hit', back: 4, up: 4, hit: 0 },
    { path: 'impacts/hit-spark', back: 9, up: 11, hit: 0, flip: true, tint: true }
  ],
  gun_big: [
    { path: 'impacts/bullet-impact', back: 13, up: 8, hit: 0, flip: true },
    { path: 'impacts/hit-spark', back: 9, up: 14, hit: 0, flip: true }
  ],
  sword_big: [{ path: 'melee/double-slash', back: 43, up: -12, hit: 0.3, flip: true, opts: { palette: PALETTES.steel }, tint: true }],
  axe_big: [
    { path: 'melee/double-slash', back: 43, up: -14, hit: 0.3, flip: true, opts: { palette: PALETTES.steel }, tint: true },
    { path: 'impacts/blunt-hit', back: 4, up: 4, hit: 0, opts: { warm: '#cfe6ff' } }
  ]
});

// Enemy attacks on the party. The enemy is on the left, so effects keep their natural right-facing
// direction. Single attacks anchor on the target's feet; area attacks on the party's lowest feet line.
// These are the fallbacks by element for a monster without its own entry in MONSTER_ATTACK_RECIPES; like
// those, they leave the summons' and the major arcana's effects alone.
const ENEMY_SINGLE_RECIPES = Object.freeze({
  neutral: [{ path: 'melee/claw-swipe', back: 20, up: -9, hit: 0.1 }],
  fire: [{ path: 'fire/fire-breath', breath: true, hit: 0.3, until: 360, light: 0.7 }],
  water: [
    { path: 'water/water-jet', jet: true, up: 13, hit: 0.18, until: 260 },
    { path: 'water/ripples', back: 0, up: 0, hit: 0.2, speed: 1.4, until: 500 }
  ],
  wind: [{ path: 'lightning/zap-hit', back: 0, up: 7, hit: 0.12 }],
  earth: [{ path: 'ice/ice-spikes', back: 10, up: 0, hit: 0.5, speed: 1.6, until: 500, palette: ELEMENT_PALETTES.earth }],
  light: [{ path: 'ice/snowflake-burst', back: 0, up: 0, hit: 0.3, speed: 1.6, until: 500, palette: PALETTES.gold }],
  dark: [{ path: 'shadow/shadow-tendrils', back: 0, up: -16, hit: 0.7, speed: 1.8 }]
});
const ENEMY_AREA_RECIPES = Object.freeze({
  neutral: [{ path: 'impacts/heavy-landing', each: true, up: 0, hit: 0.1, staggerMs: 60 }],
  fire: [{ path: 'fire/fire-breath', breath: true, hit: 0.35, until: 520, light: 0.7 }],
  water: [{ path: 'water/rain-splash', back: 0, up: 0, hit: 0.4, speed: 1.4, until: 600 }],
  wind: [{ path: 'ice/blizzard-vortex', back: 0, up: 0, hit: 0.3, until: 600, drift: 16, palette: ELEMENT_PALETTES.wind }],
  earth: [{ path: 'nature/quake', back: 8, up: -3, hit: 0.6, speed: 1.6 }],
  light: [{ path: 'ice/frost-nova', back: 0, up: 0, hit: 0.7, speed: 1.6, until: 500, palette: PALETTES.gold }],
  dark: [{ path: 'shadow/shadow-flames', each: true, up: 0, hit: 0.4, speed: 1.4, until: 500, staggerMs: 60 }]
});

/*
 * Each monster's own attack, by monster id: `single` lands on the one target, `area` on the party line (or
 * on every target with `each`). Fields as for the enemy fallbacks above. Monsters that throw their own
 * projectile sprite (see tarotKingdomMonsterMotions.js) keep it; their `fly` and `jet` layers are then skipped.
 */
const EP = ELEMENT_PALETTES;
const INK = ['#05030a', '#120c22', '#221838', '#34264f', '#4a3a6a', '#665490', '#8c78b8', '#c4b4e8'];
const MONSTER_ATTACK_RECIPES = Object.freeze({
  // ── earth ──
  // トゲマル: its spikes ricochet off the target / spikes burst from the ground
  'ismartal-vol1-monster-01': {
    single: [{ path: 'impacts/ricochet', back: 8, up: 10, hit: 0.05 }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0 }],
    area: [{ path: 'ice/ice-spikes', back: 40, up: 0, hit: 0.5, speed: 1.6, until: 500, palette: EP.earth }]
  },
  // マシュロン: a mushroom puffs spores
  'ismartal-vol1-monster-07': {
    single: [{ path: 'nature/spore-burst', back: 0, up: 0, hit: 1.0, speed: 2, until: 600 }],
    area: [{ path: 'nature/spore-burst', each: true, up: 0, hit: 1.0, speed: 2, until: 600, staggerMs: 90 }]
  },
  // モクリン: a creeping vine lashes out / vines lash the whole party
  'ismartal-vol1-monster-08': {
    single: [{ path: 'nature/vine-whip', back: 26, up: 0, hit: 0.55, speed: 1.4 }],
    area: [{ path: 'nature/vine-whip', each: true, back: 26, up: 0, hit: 0.55, speed: 1.4, staggerMs: 80 }]
  },
  // カブロン: the beetle's horn tosses dirt / the ground quakes
  'ismartal-vol2-monster-04': {
    single: [{ path: 'explosions/dirt-explosion', back: 0, up: 0, hit: 0.1, speed: 1.6, until: 500 }],
    area: [{ path: 'nature/quake', back: 8, up: -3, hit: 0.6, speed: 1.6 }]
  },
  // バルガン (boss): a crushing blow in a burst of dirt / spikes and a quake
  'ismartal-vol2-monster-07': {
    single: [
      { path: 'explosions/dirt-explosion', back: 0, up: 0, hit: 0.1, speed: 1.4, until: 600 },
      { path: 'impacts/heavy-landing', back: 0, up: 0, hit: 0.1 }
    ],
    area: [
      { path: 'nature/quake', back: 8, up: -3, hit: 0.6, speed: 1.6 },
      { path: 'ice/ice-spikes', back: 14, up: 0, hit: 0.5, speed: 1.6, until: 600, palette: EP.earth }
    ]
  },
  // ノッカ: a knock — POW / a thud under every member
  'ismartal-vol2-monster-09': {
    single: [{ path: 'explosions/cartoon-pow', back: 0, up: 8, hit: 0.1, speed: 1.4 }],
    area: [{ path: 'impacts/heavy-landing', each: true, up: 0, hit: 0.1, staggerMs: 70 }]
  },
  // ウッドラ: a twig lash / leaves come down on the party
  'ismartal-vol2-monster-10': {
    single: [{ path: 'nature/vine-whip', back: 26, up: 0, hit: 0.55, speed: 1.4, palette: EP.earth }],
    area: [{ path: 'weather/falling-leaves', back: 0, up: 0, hit: 0.6, speed: 1.6, until: 700 }]
  },
  // コロック: a pebble ricochets / a burst of dirt
  'ismartal-vol2-monster-13': {
    single: [{ path: 'impacts/ricochet', back: 8, up: 4, hit: 0.05, palette: EP.earth }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0 }],
    area: [{ path: 'explosions/dirt-explosion', back: 0, up: 0, hit: 0.1, speed: 1.6, until: 600 }]
  },
  // スパイナ: its thrown spike sticks / a field of spikes
  'ismartal-vol2-monster-14': {
    single: [{ path: 'impacts/hit-spark', back: 4, up: 12, hit: 0 }, { path: 'impacts/ricochet', back: 6, up: 10, hit: 0.05, palette: EP.earth }],
    area: [{ path: 'ice/ice-spikes', each: true, back: 10, up: 0, hit: 0.5, speed: 1.8, until: 450, staggerMs: 60, palette: EP.earth }]
  },
  // グラヴァ: a rock falls on the target / on each member
  'ismartal-vol3-monster-01': {
    single: [{ path: 'ice/icicle-fall', back: 0, up: 0, hit: 1.0, speed: 1.8, until: 450, palette: EP.earth }],
    area: [{ path: 'ice/icicle-fall', each: true, up: 0, hit: 1.0, speed: 1.8, until: 450, staggerMs: 80, palette: EP.earth }]
  },
  // キノガル: its spore shot bursts in ghostly flame / a poison fog
  'ismartal-vol3-monster-08': {
    single: [{ path: 'shadow/shadow-flames', back: 0, up: 0, hit: 0.4, speed: 1.6, until: 500, palette: PALETTES.leaf }],
    area: [{ path: 'nature/poison-cloud', back: 0, up: 8, hit: 0.4, speed: 1.4, until: 600 }]
  },
  // ── dark ──
  // グリモア: the spellbook casts / a curse sigil on each member
  'ismartal-vol1-monster-02': {
    single: [{ path: 'arcane/spell-charge', back: 0, up: 0, hit: 0.4, speed: 1.6, until: 500, palette: EP.dark }],
    area: [{ path: 'arcane/spell-charge', each: true, up: 0, hit: 0.4, speed: 1.6, until: 500, staggerMs: 70, palette: EP.dark }]
  },
  // ボーンテイル: its thrown bone drains a soul / souls rise from the party
  'ismartal-vol1-monster-03': {
    single: [{ path: 'shadow/shadow-tendrils', back: 0, up: -16, hit: 0.7, speed: 1.8 }],
    area: [{ path: 'spawn/soul-rise', each: true, up: 0, hit: 0.6, speed: 1.8, until: 500, staggerMs: 70 }]
  },
  // ゲルバット: a vampire bite / a swarm of bats
  'ismartal-vol1-monster-06': {
    single: [{ path: 'shadow/life-steal', back: 0, up: 0, hit: 0.9, speed: 1.8, until: 500 }],
    area: [{ path: 'critters/bat', each: true, up: 6, hit: 0.3, speed: 1.4, until: 500, staggerMs: 60 }]
  },
  // アビソス (boss): the abyss drains the target / dark flames under the party
  'ismartal-vol2-monster-15': {
    single: [{ path: 'shadow/soul-drain', back: 0, up: 0, hit: 0.4, speed: 1.4, until: 600 }],
    area: [
      { path: 'shadow/shadow-flames', each: true, up: 0, hit: 0.4, speed: 1.4, until: 600, staggerMs: 60 },
      { path: 'shadow/shadow-tendrils', back: 0, up: -16, hit: 0.7, speed: 1.8 }
    ]
  },
  // ネブラ: its shot bursts into dark flame / a rift opens under the party
  'ismartal-vol2-monster-20': {
    single: [{ path: 'shadow/shadow-flames', back: 0, up: 0, hit: 0.4, speed: 1.6, until: 500 }],
    area: [{ path: 'spawn/spawn-portal', back: 0, up: 0, hit: 1.25, speed: 1.6, until: 500 }]
  },
  // グールン: a rotten claw / a cloud of rot
  'ismartal-vol3-monster-07': {
    single: [{ path: 'melee/claw-swipe', back: 20, up: -9, hit: 0.1, palette: PALETTES.leaf }],
    area: [{ path: 'nature/poison-cloud', back: 0, up: 8, hit: 0.4, speed: 1.4, until: 600, palette: PALETTES.leaf }]
  },
  // クロモ: a shadow bite / a smoke bomb
  'ismartal-vol3-monster-09': {
    single: [{ path: 'melee/claw-swipe', back: 20, up: -9, hit: 0.1, palette: EP.dark }],
    area: [{ path: 'explosions/smoke-bomb', back: 30, up: 0, hit: 1.2, speed: 1.8, until: 500, palette: INK }]
  },
  // ノクス: its dark shot strikes / crows dive on each member
  'ismartal-vol3-monster-10': {
    single: [{ path: 'arcane/blink-in', back: 0, up: 0, hit: 0.35, speed: 1.4, palette: EP.dark }],
    area: [{ path: 'critters/bird', each: true, up: 8, hit: 0.3, speed: 1.6, until: 500, staggerMs: 60, palette: EP.dark }]
  },
  // ── water ──
  // ツノガイ: a water jet / ripples under each member
  'ismartal-vol1-monster-04': {
    single: [{ path: 'water/water-jet', jet: true, up: 13, hit: 0.18, until: 260 }, { path: 'water/ripples', back: 0, up: 0, hit: 0.2, speed: 1.4, until: 500 }],
    area: [{ path: 'water/ripples', each: true, up: 0, hit: 0.2, speed: 1.4, until: 500, staggerMs: 60 }]
  },
  // ミドロ: a water snake bites / a downpour
  'ismartal-vol1-monster-13': {
    single: [{ path: 'critters/snake', back: 10, up: 0, hit: 0.4, speed: 1.6, until: 500, palette: EP.water }],
    area: [{ path: 'water/rain-splash', back: 0, up: 0, hit: 0.4, speed: 1.4, until: 600 }]
  },
  // ポルポ: an ink jet / ink ripples under each member
  'ismartal-vol1-monster-14': {
    single: [{ path: 'water/water-jet', jet: true, up: 13, hit: 0.18, until: 260, palette: INK }, { path: 'water/ripples', back: 0, up: 0, hit: 0.2, speed: 1.4, until: 500, palette: INK }],
    area: [{ path: 'water/ripples', each: true, up: 0, hit: 0.2, speed: 1.4, until: 500, staggerMs: 60, palette: INK }]
  },
  // アクエル: a water orb drops / a waterfall crashes down
  'ismartal-vol1-monster-20': {
    single: [{ path: 'water/water-orb', back: 0, up: 0, hit: 0.3, speed: 1.6, until: 450 }, { path: 'water/ripples', back: 0, up: 0, hit: 0.1, speed: 1.4, until: 500 }],
    area: [{ path: 'water/waterfall', back: 0, up: 0, hit: 0.2, speed: 1.4, until: 550 }]
  },
  // フロス: an ice lance / a frost nova
  'ismartal-vol2-monster-01': {
    single: [{ path: 'ice/ice-lance', back: 30, up: 12, hit: 0.5, speed: 1.6 }],
    area: [{ path: 'ice/frost-nova', back: 0, up: 0, hit: 0.7, speed: 1.6, until: 500 }]
  },
  // ルビット: frost breath / a blizzard
  'ismartal-vol2-monster-08': {
    single: [{ path: 'ice/frost-breath', breath: true, hit: 0.3, until: 400 }],
    area: [{ path: 'ice/blizzard-vortex', back: 0, up: 0, hit: 0.3, until: 600, drift: 16 }]
  },
  // ケロッツ: a tongue lash / frogs leap on each member
  'ismartal-vol2-monster-12': {
    single: [{ path: 'melee/whip-crack', back: 40, up: 12, hit: 0.2, speed: 1.3, palette: PALETTES.blood }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0.05 }],
    area: [{ path: 'critters/frog', each: true, up: 0, hit: 1.5, speed: 1.6, until: 450, staggerMs: 80 }]
  },
  // プルン: a slime blob lands / slimes drop on each member
  'ismartal-vol3-monster-04': {
    single: [{ path: 'critters/slime', back: 0, up: 0, hit: 1.05, speed: 1.6, until: 450, palette: EP.water }],
    area: [{ path: 'critters/slime', each: true, up: 0, hit: 1.05, speed: 1.6, until: 450, staggerMs: 70, palette: EP.water }]
  },
  // ── neutral ──
  // ピコアイ: an eye glares at the target / at every member
  'ismartal-vol1-monster-05': {
    single: [{ path: 'critters/eyeball', back: 0, up: 0, hit: 0.3, speed: 1.4, until: 500 }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0.1 }],
    area: [{ path: 'critters/eyeball', each: true, up: 0, hit: 0.3, speed: 1.4, until: 500, staggerMs: 70 }]
  },
  // メカノ: its bullet hits / a laser grid
  'ismartal-vol2-monster-17': {
    single: [{ path: 'impacts/bullet-impact', back: 13, up: 8, hit: 0 }, { path: 'impacts/ricochet', back: 8, up: 10, hit: 0.05 }],
    area: [{ path: 'scifi/laser-grid', back: 0, up: 0, hit: 0.5, speed: 1.4, until: 550 }]
  },
  // ── fire ──
  // ホタルビ: a fire wisp darts in / wisps on each member
  'ismartal-vol1-monster-09': {
    single: [{ path: 'critters/wisp', back: 0, up: 0, hit: 0.5, speed: 1.6, until: 450, palette: EP.fire }],
    area: [{ path: 'critters/wisp', each: true, up: 0, hit: 0.5, speed: 1.6, until: 450, staggerMs: 60, palette: EP.fire }]
  },
  // ガルネズ: fire breath / a fire bomb lands in the party
  'ismartal-vol1-monster-11': {
    single: [{ path: 'fire/fire-breath', breath: true, hit: 0.3, until: 360, light: 0.7 }],
    area: [{ path: 'explosions/grenade', back: 30, up: 0, hit: 1.75, speed: 1.4, until: 500 }]
  },
  // ガブリラ: a burning vine / lava pools under each member
  'ismartal-vol1-monster-15': {
    single: [{ path: 'nature/vine-whip', back: 26, up: 0, hit: 0.55, speed: 1.4, palette: EP.fire }],
    area: [{ path: 'nature/toxic-puddle', each: true, up: 0, hit: 0.4, speed: 1.4, until: 600, staggerMs: 60, palette: EP.fire }]
  },
  // ビズン: its stinger burns / flares come down on each member
  'ismartal-vol2-monster-11': {
    single: [{ path: 'impacts/ricochet', back: 8, up: 10, hit: 0.05, palette: PALETTES.sun }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0, opts: { palette: PALETTES.sun } }],
    area: [{ path: 'projectiles/flare', each: true, up: 0, hit: 0.3, speed: 1.4, until: 500, staggerMs: 60 }]
  },
  // フレマ: a fire bolt / a burning barrel blows
  'ismartal-vol2-monster-18': {
    single: [{ path: 'projectiles/plasma-shot', back: 20, up: 12, hit: 0.2, speed: 1.4, until: 400, palette: EP.fire }],
    area: [{ path: 'explosions/barrel-explosion', back: 0, up: 0, hit: 1.25, speed: 1.6, until: 600 }]
  },
  // バクス: the mimic bites / spits its coins at the party
  'ismartal-vol2-monster-19': {
    single: [{ path: 'melee/claw-swipe', back: 20, up: -9, hit: 0.1, palette: PALETTES.sun }],
    area: [{ path: 'spawn/coin-drop', back: 0, up: 0, hit: 0.3, speed: 1.4, until: 700 }]
  },
  // イグニス: a jet of flame / a long sweep of flame over the party
  'ismartal-vol3-monster-02': {
    single: [{ path: 'fire/fire-breath', breath: true, hit: 0.3, until: 400, light: 0.8 }],
    area: [{ path: 'fire/fire-breath', breath: true, hit: 0.35, until: 640, light: 0.9 }]
  },
  // ヨミル: a ghost fire / every member burns away for a moment
  'ismartal-vol3-monster-06': {
    single: [{ path: 'shadow/shadow-flames', back: 0, up: 0, hit: 0.4, speed: 1.6, until: 500, palette: EP.fire }],
    area: [{ path: 'spawn/dissolve-burn', each: true, up: 0, hit: 1.0, speed: 2, until: 450, staggerMs: 70 }]
  },
  // ── wind ──
  // リーフロ: a leaf lash / petals in a gust
  'ismartal-vol1-monster-10': {
    single: [{ path: 'melee/whip-crack', back: 40, up: 12, hit: 0.2, speed: 1.3, palette: PALETTES.leaf }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0.05, opts: { palette: PALETTES.leaf } }],
    area: [{ path: 'weather/cherry-blossoms', back: 0, up: 0, hit: 0.6, speed: 1.6, until: 700, palette: PALETTES.leaf }]
  },
  // コバット: a shock bite / bats on each member
  'ismartal-vol1-monster-17': {
    single: [{ path: 'lightning/zap-hit', back: 0, up: 7, hit: 0.12 }],
    area: [{ path: 'critters/bat', each: true, up: 6, hit: 0.3, speed: 1.4, until: 500, staggerMs: 60, palette: EP.wind }]
  },
  // ラムネロ: a ball of lightning / chain lightning through the party
  'ismartal-vol1-monster-18': {
    single: [{ path: 'lightning/ball-lightning', back: 0, up: 0, hit: 2.25, speed: 2, until: 400 }],
    area: [{ path: 'lightning/chain-lightning', back: 40, up: 10, hit: 0.3, speed: 1.4, until: 500 }]
  },
  // チュロ: a static jolt / a storm cloud
  'ismartal-vol1-monster-19': {
    single: [{ path: 'lightning/charge-up', back: 0, up: 0, hit: 1.6, speed: 2, until: 400 }],
    area: [{ path: 'lightning/storm-cloud', back: 0, up: 0, hit: 1.75, speed: 1.4, until: 500 }]
  },
  // パピル: its shot bursts into scales / butterflies on each member
  'ismartal-vol2-monster-02': {
    single: [{ path: 'ice/snowflake-burst', back: 0, up: 0, hit: 0.3, speed: 1.6, until: 450, palette: EP.wind }],
    area: [{ path: 'critters/butterfly', each: true, up: 0, hit: 0.75, speed: 1.6, until: 500, staggerMs: 70, palette: EP.wind }]
  },
  // モスガン: poison scales / a cloud of scales
  'ismartal-vol2-monster-03': {
    single: [{ path: 'ice/snowflake-burst', back: 0, up: 0, hit: 0.3, speed: 1.6, until: 450, palette: PALETTES.gold }],
    area: [{ path: 'nature/poison-cloud', back: 0, up: 8, hit: 0.4, speed: 1.4, until: 600, palette: PALETTES.gold }]
  },
  // グリバト: its seed glows and bursts / spores over each member
  'ismartal-vol2-monster-06': {
    single: [{ path: 'arcane/spell-charge', back: 0, up: 0, hit: 0.4, speed: 1.6, until: 500, palette: PALETTES.leaf }],
    area: [{ path: 'nature/spore-burst', each: true, up: 0, hit: 1.0, speed: 2, until: 600, staggerMs: 90, palette: PALETTES.leaf }]
  },
  // トルネ: a whirlwind / a whirlwind on each member
  'ismartal-vol3-monster-03': {
    single: [{ path: 'ice/blizzard-vortex', back: 0, up: 0, hit: 0.3, until: 500, palette: EP.wind }],
    area: [{ path: 'ice/blizzard-vortex', each: true, up: 0, hit: 0.3, until: 500, staggerMs: 60, palette: EP.wind }]
  },
  // モクモ: a lightning bolt / a storm over each member
  'ismartal-vol3-monster-05': {
    single: [{ path: 'lightning/storm-cloud', back: 0, up: 0, hit: 1.75, speed: 1.4, until: 450 }],
    area: [{ path: 'lightning/storm-cloud', each: true, up: 0, hit: 1.75, speed: 1.4, until: 450, staggerMs: 80 }]
  },
  // ── light ──
  // フェリカ: a dive / feathers of light burst round the party
  'ismartal-vol1-monster-12': {
    single: [{ path: 'critters/bird', back: 0, up: 8, hit: 0.3, speed: 1.6, until: 450, palette: PALETTES.gold }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0.2, opts: { palette: PALETTES.gold } }],
    area: [{ path: 'ice/snowflake-burst', each: true, up: 0, hit: 0.3, speed: 1.6, until: 450, staggerMs: 60, palette: PALETTES.gold }]
  },
  // ツキバネ: a moth of light strikes / light spikes round the party
  'ismartal-vol1-monster-16': {
    single: [{ path: 'critters/butterfly', back: 0, up: 0, hit: 0.75, speed: 1.6, until: 450, palette: PALETTES.gold }, { path: 'impacts/hit-spark', back: 4, up: 12, hit: 0.1, opts: { palette: PALETTES.gold } }],
    area: [{ path: 'ice/frost-nova', back: 0, up: 0, hit: 0.7, speed: 1.6, until: 500, palette: PALETTES.gold }]
  },
  // リルフィ: its shot lights a wisp / every member flickers with light
  'ismartal-vol2-monster-05': {
    single: [{ path: 'critters/wisp', back: 0, up: 0, hit: 0.5, speed: 1.6, until: 450, palette: PALETTES.gold }],
    area: [{ path: 'arcane/blink-in', each: true, up: 0, hit: 0.35, speed: 1.4, staggerMs: 60, palette: PALETTES.gold }]
  },
  // オルビス (boss): a laser bolt and a scan / a laser grid of light
  'ismartal-vol2-monster-16': {
    single: [
      { path: 'projectiles/laser-bolt', back: 20, up: 12, hit: 0.2, speed: 1.4, until: 300, palette: PALETTES.gold },
      { path: 'ice/snowflake-burst', back: 0, up: 0, hit: 0.3, speed: 1.6, until: 450, palette: PALETTES.gold }
    ],
    area: [
      { path: 'scifi/laser-grid', back: 0, up: 0, hit: 0.5, speed: 1.4, until: 550, palette: PALETTES.gold },
      { path: 'ice/frost-nova', back: 0, up: 0, hit: 0.7, speed: 1.6, until: 500, palette: PALETTES.gold }
    ]
  }
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
    const promise = path.startsWith('troy/')
      ? import(`./tarotKingdomStatusFx/${path.slice('troy/'.length)}.js`)
      : import(`./vendor/pixelfx/fx/${path}.js`);
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
  let blank = true;

  const draw = () => {
    const shown = layers.filter((layer) => layer.visible);
    // nothing to show and nothing left on the canvas: skip the full-canvas upload
    if (!shown.length && blank) return;
    core.clearFrame(frame);
    shown.forEach((layer) => layer.fx.draw(frame));
    core.composite(frame, image.data, null);
    ctx.putImageData(image, 0, 0);
    blank = !shown.length;
  };

  const step = (now) => {
    layers.forEach((layer) => {
      layer.visible = now >= layer.startAt && now < layer.endAt;
      if (layer.follow) {
        // status loops stay on their actor while it lunges, recoils or the layout changes
        const anchor = layer.follow();
        if (anchor) {
          layer.fx.options.x = Math.round(anchor.x);
          layer.fx.options.y = Math.round(anchor.y);
        } else {
          layer.visible = false;
        }
      }
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
      const targetSeconds = Math.min(layer.holdAt ?? Infinity, Math.max(0, ((now - layer.startAt) / 1000) * layer.speed));
      while (layer.fx.t < targetSeconds - 1e-6) {
        layer.fx.update(Math.min(MAX_STEP_SECONDS, targetSeconds - layer.fx.t));
      }
    });
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      if (now >= layers[index].endAt) layers.splice(index, 1);
    }
    draw();
  };

  let lastStepAt = 0;
  const tick = () => {
    rafId = 0;
    if (!canvas.isConnected) {
      layers.length = 0;
      return;
    }
    const now = Date.now();
    // With only status loops or summon effects on screen, redraw at a calmer rate to spare slow phones.
    const onlyLoops = layers.length > 0 && layers.every((layer) => layer.loop);
    const onlyCalm = layers.length > 0 && layers.every((layer) => layer.loop || layer.calm);
    const frameMs = onlyLoops ? LOOP_FRAME_MS : (onlyCalm ? CALM_FRAME_MS : 0);
    if (now - lastStepAt >= frameMs) {
      lastStepAt = now;
      step(now);
    }
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
    has(layer) {
      return layers.includes(layer);
    },
    // Let a layer fade out (0.3 s of its own time) and then drop it.
    retire(layer, now = Date.now()) {
      if (!layer || !layers.includes(layer)) return;
      if (!layer.stopped) {
        layer.fx.stop();
        layer.stopped = true;
      }
      layer.endAt = Math.min(layer.endAt, now + FADE_MARGIN_MS);
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
// stage → Map(actorKey → { statusKey, layer }) for the status loops on that stage
const stageStatusLayers = new WeakMap();
function getStagePlayer(stageEl, core) {
  const canvas = ensureStageCanvas(stageEl);
  canvas.style.opacity = '';
  canvas.style.transition = '';
  let entry = stagePlayers.get(stageEl);
  // The canvas resolution follows the stage size; rebuild the player when the stage was resized.
  const width = Math.ceil(canvas.clientWidth / DEFAULT_PIXEL_SCALE);
  if (!entry || entry.canvas !== canvas || entry.player.width !== width) {
    if (entry) {
      entry.player.stop();
      // the old player's status loops went with it; the next status sync adds them again
      stageStatusLayers.delete(stageEl);
    }
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
    layer.calm = !!spec.calm;
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

export function getTarotKingdomSummonFxKey(effectKey, flushSuit = '') {
  const key = effectKey === 'flushElemental' ? `flush:${flushSuit}` : String(effectKey || '');
  return Object.prototype.hasOwnProperty.call(SUMMON_RECIPES, key) ? key : '';
}

/**
 * Normal 5-card summon: paints the summon's effect on a canvas inside the 4500 ms cutin, and, for effects
 * that help the party, a short effect on each standing party member (partyEls) once the party is back.
 * elapsedMs is how far into the cutin we already are (a re-render can join part-way).
 */
export async function playTarotKingdomSummonFx(canvas, {
  effectKey = '', flushSuit = '', elapsedMs = 0, enemyEl = null, stageEl = null, partyEls = []
} = {}) {
  const recipe = SUMMON_RECIPES[getTarotKingdomSummonFxKey(effectKey, flushSuit)];
  if (!canvas || !recipe) return;
  const cutinStartAt = Date.now() - Math.max(0, Number(elapsedMs) || 0);
  const impactAt = cutinStartAt + TAROT_KINGDOM_SUMMON_FX_HIT_MS;
  const reducedMotion = prefersReducedMotion();
  try {
    const core = await loadCore();
    if (!canvas.isConnected) return;
    const player = createPlayer(canvas, DEFAULT_PIXEL_SCALE, core);
    const stageRect = (stageEl || canvas.parentElement)?.getBoundingClientRect?.();
    const enemy = stageRect ? rectIn(stageRect, enemyEl) : null;
    const scale = player.scale;
    // Without an enemy on screen, aim where the enemy usually stands.
    const feetX = enemy ? enemy.cx / scale : player.width * 0.25;
    const feetY = enemy ? enemy.feet / scale : player.height * 0.7;
    const wrap = recipe.hit.some((layer) => layer.actor) && enemyEl
      ? await snapshotActor(enemyEl, scale).catch(() => null)
      : null;
    const specs = recipe.hit.map((layer) => {
      const at = impactAt + (layer.delay || 0);
      const spec = {
        recipe: layer.actor ? { ...layer, opts: { ...layer.opts, actor: wrap?.actor || capsuleActor(16, 24) } } : layer,
        x: feetX + (layer.dx || 0),
        y: feetY - (layer.up || 0),
        flip: !!layer.flip,
        impactAt: at,
        stopAt: cutinStartAt + SUMMON_FX_STOP_MS,
        endAt: cutinStartAt + SUMMON_FX_END_MS,
        calm: true
      };
      if (layer.fly) {
        // from the summon's chest, on the right of the stage
        spec.fly = {
          ms: layer.fly.ms,
          fromX: player.width * 0.72,
          fromY: player.height * 0.42,
          toX: feetX,
          toY: feetY - layer.fly.up
        };
      }
      return spec;
    });
    if (reducedMotion) {
      // the cutin holds one still pose from the start, so paint one quiet still of the contact frame at once;
      // the party effects are left out
      await addLayers(player, core, specs, { reducedMotion: true, impactAt });
      return;
    }
    await addLayers(player, core, specs, { reducedMotion: false, impactAt });
    if (recipe.party?.length && stageEl) {
      setTimeout(() => {
        if (canvas.isConnected) void playSummonPartyFx(stageEl, core, recipe.party, partyEls);
      }, Math.max(0, cutinStartAt + SUMMON_PARTY_FX_AT_MS - Date.now()));
    }
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx summon effect skipped', error);
  }
}

// Resolves once the element is shown again (the party is hidden for most of the cutin), or after maxMs.
function whenVisible(el, maxMs = 600) {
  const until = Date.now() + maxMs;
  return new Promise((resolve) => {
    const check = () => {
      if (!el.isConnected || getComputedStyle(el).visibility === 'visible' || Date.now() >= until) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

// An actor's real sprite as a pixelfx actor, and its feet in art pixels on the stage overlay; a capsule
// stands in when the sprite cannot be read. Null when the element is not laid out.
async function wrapActor(el, stageRect, scale) {
  const rect = el?.isConnected ? el.getBoundingClientRect() : null;
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const snapshot = await snapshotActor(el, scale).catch(() => null);
  return {
    actor: snapshot?.actor || capsuleActor((rect.width * 0.5) / scale, (rect.height * 0.78) / scale),
    // false when the capsule stands in: effects that repaint the body would paint a grey capsule
    real: !!snapshot,
    x: (rect.left - stageRect.left + (snapshot ? snapshot.feet.x : rect.width / 2)) / scale,
    y: (rect.top - stageRect.top + (snapshot ? snapshot.feet.y : rect.height * 0.94)) / scale,
    // the party stands on the right and faces left
    facesLeft: rect.left + (rect.width / 2) > stageRect.left + (stageRect.width / 2)
  };
}

/*
 * One-shot effects on a single actor, for results outside the summon cutin: heals, shields, buffs,
 * cleanses and revivals on the party, an enemy powering itself up, and a debuff cast on a party member.
 * (A defeated enemy gets none: its own death sheet already ends in smoke.) `until` cuts a looping effect off after that many ms; `shield` sizes the bubble to the actor;
 * `body` effects repaint the actor's own pixels and are skipped when its sprite cannot be read.
 */
const ACTOR_FX_RECIPES = Object.freeze({
  heal: { path: 'holy/heal', body: true, opts: { drain: 0 } },
  regen: { path: 'holy/heal', body: true, palette: PALETTES.leaf, opts: { drain: 0 } },
  shield: { path: 'holy/divine-shield', shield: true },
  buff: { path: 'holy/blessing' },
  cleanse: { path: 'holy/halo', until: 1000 },
  revive: { path: 'spawn/respawn-beam', body: true, speed: 1.4 },
  enemyBuff: { path: 'status/rage', body: true, until: 1100 },
  enemyHeal: { path: 'holy/heal', body: true, palette: PALETTES.leaf, opts: { drain: 0 } },
  curse: { path: 'shadow/curse', body: true, speed: 1.5 }
});
const ACTOR_FX_KEY_LIMIT = 64;
// stage → event keys whose actor effect already played, so a re-render does not replay it
const playedActorFx = new WeakMap();

export function hasTarotKingdomActorFx(kind) {
  return Object.prototype.hasOwnProperty.call(ACTOR_FX_RECIPES, String(kind || ''));
}

/** Plays one actor effect on the stage overlay, once per key. Skipped for reduced motion. */
export async function playTarotKingdomActorFx(stageEl, actorEl, kind, { key = '' } = {}) {
  const recipe = ACTOR_FX_RECIPES[kind];
  if (!stageEl || !actorEl || !recipe || prefersReducedMotion()) return;
  if (key) {
    let played = playedActorFx.get(stageEl);
    if (!played) playedActorFx.set(stageEl, (played = new Set()));
    if (played.has(key)) return;
    played.add(key);
    if (played.size > ACTOR_FX_KEY_LIMIT) played.delete(played.values().next().value);
  }
  try {
    // read the sprite now, before awaiting anything: a defeated enemy fades out right after this call
    const wrapping = wrapActor(actorEl, stageEl.getBoundingClientRect(), DEFAULT_PIXEL_SCALE);
    const [core, mod, wrapped] = await Promise.all([loadCore(), loadEffect(recipe.path), wrapping]);
    if (!wrapped || !actorEl.isConnected || (recipe.body && !wrapped.real)) return;
    const player = getStagePlayer(stageEl, core);
    const { actor, x, y, facesLeft } = wrapped;
    const opts = { ...recipe.opts, actor, ...(recipe.shield ? { radius: Math.max(12, Math.min(34, Math.round(actor.h * 0.62))) } : {}) };
    const startAt = Date.now();
    const layer = buildLayer(core, mod, { ...recipe, opts }, { x, y, flip: facesLeft, impactAt: startAt });
    layer.calm = true;
    player.add(layer);
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx actor effect skipped', error);
  }
}

// The party's half of a summon effect, on the stage overlay, wrapped round each member's real sprite.
async function playSummonPartyFx(stageEl, core, recipes, partyEls) {
  // the snapshot only sees sprite layers that are shown
  if (partyEls[0]) await whenVisible(partyEls[0]);
  const player = getStagePlayer(stageEl, core);
  const scale = player.scale;
  const stageRect = stageEl.getBoundingClientRect();
  const mods = await Promise.all(recipes.map((recipe) => loadEffect(recipe.path).catch(() => null)));
  await Promise.all(partyEls.map(async (el, index) => {
    const wrapped = await wrapActor(el, stageRect, scale);
    // heal repaints the body; without the real sprite it would paint a grey capsule
    if (!wrapped || (!wrapped.real && recipes.some((recipe) => recipe.path === 'holy/heal'))) return;
    const { actor, x, y } = wrapped;
    // members light up one after another, down the party
    const startAt = Date.now() + (index * 90);
    mods.forEach((mod, layerIndex) => {
      if (!mod) return;
      const recipe = recipes[layerIndex];
      const layer = buildLayer(core, mod, { ...recipe, opts: { ...recipe.opts, actor } }, {
        x, y, flip: true, impactAt: startAt, endAt: startAt + SUMMON_PARTY_FX_TAIL_MS, stopAt: startAt + SUMMON_PARTY_FX_TAIL_MS - FADE_MARGIN_MS
      });
      layer.calm = true;
      player.add(layer);
    });
  }));
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
export function hasTarotKingdomResonanceFx(resonanceId, element = '') {
  return !!(RESONANCE_RECIPES[String(resonanceId || '')] || RESONANCE_ELEMENT_RECIPES[normalizeElement(element)]);
}

/** A minor-arcana resonance attack on the enemy, a beat after the card's weapon hit (impactAt). */
export async function playTarotKingdomResonanceFx(stageEl, {
  resonanceId = '', element = '', impactAt = Date.now(), attackerEl = null, targetEl = null
} = {}) {
  const recipes = RESONANCE_RECIPES[String(resonanceId || '')] || RESONANCE_ELEMENT_RECIPES[normalizeElement(element)];
  if (!stageEl || !targetEl || !recipes) return;
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
    const startAt = impactAt + RESONANCE_FX_DELAY_MS;
    const endAt = startAt + RESONANCE_FX_TAIL_MS;
    const specs = recipes.map((recipe) => {
      const at = startAt + (recipe.delay || 0);
      const spec = {
        recipe,
        x: feetX + (recipe.dx || 0),
        y: feetY - (recipe.up || 0),
        flip: !!recipe.flip,
        impactAt: at,
        endAt,
        stopAt: endAt - FADE_MARGIN_MS
      };
      if (recipe.fly) {
        spec.fly = {
          ms: recipe.fly.ms,
          fromX: (attacker ? attacker.cx : target.cx + 120) / scale,
          fromY: feetY - recipe.fly.up,
          toX: feetX,
          toY: feetY - recipe.fly.up
        };
        spec.flip = true;
      }
      return spec;
    });
    await addLayers(player, core, specs, { reducedMotion: prefersReducedMotion(), impactAt: startAt });
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx resonance skipped', error);
  }
}

export async function playTarotKingdomEnemyAttackFx(stageEl, {
  attackMode = 'single', monsterId = '', element = '', impactAt = Date.now(), enemyEl = null, targetEls = [], critical = false, guarded = false, ownProjectile = false
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
    const recipes = MONSTER_ATTACK_RECIPES[String(monsterId || '')]?.[area ? 'area' : 'single']
      || (area ? ENEMY_AREA_RECIPES : ENEMY_SINGLE_RECIPES)[elementKey]
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
      // the monster's own projectile sprite already flies; do not send a second one
      if (ownProjectile && (recipe.fly || recipe.jet)) return;
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
    // A critical hit flares on top; a hit taken by a guard or cover clashes like a parry instead.
    if (critical || guarded) {
      targets.forEach((t) => specs.push({
        recipe: guarded ? GUARD_LAYER : CRITICAL_LAYER,
        x: t.cx / scale,
        // both effects draw their flare a set height above the origin (crit-hit 26, parry 30 art px),
        // so put the origin that far below the actor's middle
        y: (t.cy / scale) + (guarded ? 22 : 18),
        flip: false,
        impactAt,
        endAt,
        stopAt: endAt - FADE_MARGIN_MS
      }));
    }
    await addLayers(player, core, specs, { reducedMotion: prefersReducedMotion(), impactAt });
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx enemy attack skipped', error);
  }
}

/**
 * Knock-back: nudges an actor away from the hit and back, landing on impactAt. It animates the
 * independent `translate` property, so it adds to the actor's own transform animations instead of
 * replacing them. Skipped for reduced motion.
 */
export function nudgeTarotKingdomActor(element, { dx = 0, impactAt = Date.now() } = {}) {
  if (!element?.animate || !dx || prefersReducedMotion()) return;
  const delay = Math.max(0, impactAt - Date.now());
  element.animate([
    { translate: '0 0' },
    { translate: `${dx}px 0`, offset: 0.25 },
    { translate: '0 0' }
  ], { duration: KNOCKBACK_MS, delay, easing: 'cubic-bezier(.2,.8,.3,1)' });
}

export const TAROT_KINGDOM_KNOCKBACK_PX = KNOCKBACK_PX;

const WET_PALETTE = Object.freeze(['#0a1a33', '#0f2f5c', '#1d5b9a', '#2f8fd0', '#62c8f4', '#bdefff']);

// Petrify holds once the statue has cracked all over, on a frame where its shudder is at rest, before it
// would burst into chunks (at 2.2 s).
const PETRIFY_HOLD_SECONDS = 2.06;
const STONE_PALETTE = Object.freeze(['#141414', '#2a2a2a', '#454545', '#626262', '#808080', '#a2a2a2', '#c8c8c8', '#ececec']);

// One looping effect per negative status, drawn on and around the actor; while it runs, the CSS accent
// and tint stand down (see [data-pixel-status] in style.css). Effects that repaint the body get the
// actor's real sprite pixels, cut from its layers by snapshotActor, so they follow its outline.
// 'troy/…' effects are our own (public/js/tarotKingdomStatusFx/), written where no pixelfx status fits:
// pixelfx has no blind, fear, vulnerable or silence, and its rune circle and clock are drawn too big for
// a party slot. holdAt stops a one-shot at that second.
const STATUS_RECIPES = Object.freeze({
  paralysis: { path: 'lightning/electrified' },
  freeze: { path: 'status/frozen' },
  sleep: { path: 'status/sleep' },
  petrify: { path: 'status/petrified', palette: STONE_PALETTE, holdAt: PETRIFY_HOLD_SECONDS },
  silence: { path: 'troy/silence' },
  seal: { path: 'troy/seal' },
  confusion: { path: 'status/confused' },
  poison: { path: 'status/poisoned' },
  burn: { path: 'status/burning' },
  fear: { path: 'troy/fear' },
  blind: { path: 'troy/blind' },
  wet: { path: 'status/bleeding', palette: WET_PALETTE },
  vulnerable: { path: 'troy/vulnerable' },
  slow: { path: 'troy/slow' },
  curse: { path: 'status/cursed' }
});

export function hasTarotKingdomStatusFx(statusKey) {
  return Object.prototype.hasOwnProperty.call(STATUS_RECIPES, String(statusKey || ''));
}

const spriteImages = new Map();
function loadSpriteImage(url) {
  let pending = spriteImages.get(url);
  if (!pending) {
    const image = new Image();
    image.src = url;
    pending = image.decode().then(() => image, () => null);
    spriteImages.set(url, pending);
  }
  return pending;
}

// A CSS background length ("12px", "50%", "auto") resolved against the box and the image size.
function backgroundLength(value, box, image, fallback) {
  if (!value || value === 'auto') return fallback;
  if (value.endsWith('%')) return ((box - image) * parseFloat(value)) / 100;
  return parseFloat(value) || 0;
}

function backgroundSize(style, box, image) {
  const [w = 'auto', h = 'auto'] = style.backgroundSize.split(',')[0].trim().split(/\s+/);
  if (w === 'cover' || w === 'contain') {
    const fit = (w === 'cover' ? Math.max : Math.min)(box.w / image.w, box.h / image.h);
    return { w: image.w * fit, h: image.h * fit };
  }
  const size = (v, b) => (v.endsWith('%') ? (b * parseFloat(v)) / 100 : parseFloat(v));
  const width = w === 'auto' ? NaN : size(w, box.w);
  const height = h === 'auto' ? NaN : size(h, box.h);
  if (Number.isFinite(width) && Number.isFinite(height)) return { w: width, h: height };
  if (Number.isFinite(width)) return { w: width, h: (image.h * width) / image.w };
  if (Number.isFinite(height)) return { w: (image.w * height) / image.h, h: height };
  return { ...image };
}

const isMirrored = (style) => {
  const scale = style.scale && style.scale !== 'none' ? parseFloat(style.scale) : 1;
  const matrix = style.transform && style.transform !== 'none' ? new DOMMatrixReadOnly(style.transform) : null;
  return (scale < 0) !== ((matrix?.a ?? 1) < 0);
};

/**
 * Cuts the actor's current look out of its sprite layers (each a background-image sprite sheet) into
 * a pixelfx actor: mask, pixels (ABGR, as ImageData stores them) and where its feet are within the
 * element. Returns null when nothing is drawn, so the caller can fall back to a capsule.
 */
async function snapshotActor(actorEl, scale) {
  const rect = actorEl.getBoundingClientRect();
  const w = Math.ceil(rect.width / scale);
  const h = Math.ceil(rect.height / scale);
  if (w <= 0 || h <= 0) return null;
  const layers = [actorEl, ...actorEl.querySelectorAll('*')].map((el) => {
    const style = getComputedStyle(el);
    const url = /url\("?([^")]+)"?\)/.exec(style.backgroundImage)?.[1];
    const box = el.getBoundingClientRect();
    if (!url || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return null;
    if (box.width <= 0 || box.height <= 0) return null;
    return { el, style, url, box };
  }).filter(Boolean);
  if (!layers.length) return null;
  const images = await Promise.all(layers.map((layer) => loadSpriteImage(layer.url)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.scale(1 / scale, 1 / scale);
  layers.forEach(({ el, style, box }, index) => {
    const image = images[index];
    if (!image) return;
    // the layer's box in the actor, and how much its own transforms scale it
    const x = box.left - rect.left;
    const y = box.top - rect.top;
    const sx = box.width / (el.offsetWidth || box.width);
    const sy = box.height / (el.offsetHeight || box.height);
    const layout = { w: el.offsetWidth || box.width, h: el.offsetHeight || box.height };
    const natural = { w: image.naturalWidth, h: image.naturalHeight };
    const size = backgroundSize(style, layout, natural);
    const [px = '0%', py = '0%'] = style.backgroundPosition.split(',')[0].trim().split(/\s+/);
    const left = backgroundLength(px, layout.w, size.w, 0);
    const top = backgroundLength(py, layout.h, size.h, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, box.width, box.height);
    ctx.clip();
    if (isMirrored(style)) {
      ctx.translate((2 * x) + box.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, x + (left * sx), y + (top * sy), size.w * sx, size.h * sy);
    ctx.restore();
  });
  const all = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer);
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let i = 0; i < all.length; i += 1) {
    if ((all[i] >>> 24) < 128) continue;
    const px = i % w; const py = Math.floor(i / w);
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  if (x1 < 0) return null;
  const mw = x1 - x0 + 1;
  const mh = y1 - y0 + 1;
  const data = new Uint8Array(mw * mh);
  const pixels = new Uint32Array(mw * mh);
  for (let my = 0; my < mh; my += 1) {
    for (let mx = 0; mx < mw; mx += 1) {
      const c = all[((y0 + my) * w) + x0 + mx];
      if ((c >>> 24) < 128) continue;
      data[(my * mw) + mx] = 1;
      pixels[(my * mw) + mx] = (c | 0xff000000) >>> 0;
    }
  }
  const half = Math.floor(mw / 2);
  return {
    actor: { mask: { w: mw, h: mh, data }, pixels, x: -half, y: -mh, w: mw, h: mh, k: 0, head: [0, -mh], chest: [0, -Math.round(mh * 0.65)] },
    // the feet (the effect origin) in CSS px from the element's top-left corner
    feet: { x: (x0 + half) * scale, y: (y1 + 1) * scale }
  };
}

// A rough body silhouette (a capsule) in art pixels, shaped like the pixelfx stock actor:
// feet at the origin, mask laid out from (x, y) = (-w/2, -h). Used when an actor has no sprite layers.
const actorCache = new Map();
function capsuleActor(width, height) {
  const w = Math.max(10, Math.min(64, Math.round(width)));
  const h = Math.max(12, Math.min(72, Math.round(height)));
  const key = `${w}x${h}`;
  if (actorCache.has(key)) return actorCache.get(key);
  const data = new Uint8Array(w * h);
  // electrified reads the body's colors; a capsule is a flat mid grey
  const pixels = new Uint32Array(w * h);
  const cx = (w - 1) / 2;
  const r = w * 0.42;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const yy = Math.min(Math.max(y, r), h - 1 - (r * 0.6));
      if (((x - cx) ** 2) + (((y - yy) * 1.1) ** 2) > r * r) continue;
      data[(y * w) + x] = 1;
      pixels[(y * w) + x] = 0xff6b6b6b;
    }
  }
  const actor = { mask: { w, h, data }, pixels, x: -Math.floor(w / 2), y: -h, w, h, k: 0, head: [0, -h], chest: [0, -Math.round(h * 0.65)] };
  actorCache.set(key, actor);
  return actor;
}

/**
 * Keeps one looping status effect on an actor (the actor's highest-priority negative status).
 * Call it on every status render; it only changes something when the status key changes.
 */
export async function syncTarotKingdomStatusFx(stageEl, actorKey, actorEl, statusKey = '') {
  if (!stageEl || !actorKey) return;
  const wanted = !prefersReducedMotion() && actorEl && hasTarotKingdomStatusFx(statusKey) ? String(statusKey) : '';
  let map = stageStatusLayers.get(stageEl);
  const current = map?.get(actorKey);
  if ((current?.statusKey || '') === wanted) return;
  if (!map) {
    map = new Map();
    stageStatusLayers.set(stageEl, map);
  }
  const entry = { statusKey: wanted, layer: null };
  map.set(actorKey, entry);
  if (actorEl) {
    if (wanted) actorEl.dataset.pixelStatus = wanted;
    else delete actorEl.dataset.pixelStatus;
  }
  try {
    const core = await loadCore();
    const player = getStagePlayer(stageEl, core);
    if (current?.layer) player.retire(current.layer);
    if (!wanted) return;
    const recipe = STATUS_RECIPES[wanted];
    const mod = await loadEffect(recipe.path);
    // the status may have changed again while the effect was loading
    if (stageStatusLayers.get(stageEl)?.get(actorKey) !== entry || !actorEl.isConnected) return;
    const scale = player.scale;
    const startRect = actorEl.getBoundingClientRect();
    if (startRect.width <= 0 || startRect.height <= 0) return;
    const snapshot = await snapshotActor(actorEl, scale).catch(() => null);
    if (stageStatusLayers.get(stageEl)?.get(actorKey) !== entry || !actorEl.isConnected) return;
    const actor = snapshot?.actor || capsuleActor((startRect.width * 0.5) / scale, (startRect.height * 0.78) / scale);
    // the feet as a share of the element, so the effect stays on them while the element scales
    const feetX = snapshot ? snapshot.feet.x / startRect.width : 0.5;
    const feetY = snapshot ? snapshot.feet.y / startRect.height : 0.94;
    const follow = () => {
      const stageRect = stageEl.getBoundingClientRect();
      const rect = actorEl.getBoundingClientRect();
      if (!actorEl.isConnected || rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: (rect.left - stageRect.left + (rect.width * feetX)) / scale,
        y: (rect.top - stageRect.top + (rect.height * feetY)) / scale
      };
    };
    const start = follow();
    if (!start) return;
    const fx = core.createFx(mod, {
      x: Math.round(start.x),
      y: Math.round(start.y),
      actor,
      light: 0.7,
      // the enemy faces right and the party faces left, so trails (slow) fall behind on opposite sides
      trail: actorKey === 'enemy' ? -1 : 1,
      ...(recipe.palette ? { palette: recipe.palette } : {})
    });
    entry.layer = {
      fx,
      speed: 1,
      holdAt: recipe.holdAt,
      startAt: Date.now(),
      stopAt: Infinity,
      endAt: Infinity,
      loop: true,
      follow,
      visible: false,
      stopped: false
    };
    player.add(entry.layer);
  } catch (error) {
    console.warn('[TarotKingdom] pixelfx status skipped', error);
  }
}

/** Clears the stage overlay (battle end, page exit). */
export function stopTarotKingdomPixelFx(stageEl) {
  if (!stageEl) return;
  stagePlayers.get(stageEl)?.player.stop();
  stagePlayers.delete(stageEl);
  stageStatusLayers.delete(stageEl);
  stageEl.querySelectorAll('[data-pixel-status]').forEach((el) => { delete el.dataset.pixelStatus; });
  stageEl.querySelector(':scope > .tarot-kingdom-pixelfx-layer')?.remove();
}

export const __test = { MAJOR_RECIPES, SUMMON_RECIPES, RESONANCE_RECIPES, RESONANCE_ELEMENT_RECIPES, MONSTER_ATTACK_RECIPES, ACTOR_FX_RECIPES, WEAPON_RECIPES, ENEMY_SINGLE_RECIPES, ENEMY_AREA_RECIPES, CRITICAL_LAYER, GUARD_LAYER, STATUS_RECIPES, normalizeElement, capsuleActor };

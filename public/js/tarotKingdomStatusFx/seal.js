// Tarot Kingdom's own pixelfx status loop (not part of the vendored library): seal.
// A rune circle sized to the actor; the vendored one is drawn wide enough to cover the next party row.
import { fit, TAU, WHITE, clamp } from '../vendor/pixelfx/core/index.js';
import { floorRing, glyph, sigil } from '../vendor/pixelfx/fx/arcane/_lib.js';

export const meta = {
  name: 'Seal',
  desc: 'A small rune circle turns under the feet and a sealing sigil hangs over the head, glowing slowly.',
  duration: 4,
  loop: true,
  actor: 2,
  options: { palette: ['#1e1206', '#4a2c08', '#86520c', '#c48412', '#f0b424', '#ffe066', '#fff6c4', '#ffffff'], seed: 8 }
};

const D = meta.duration, SY = 0.32, RUNES = 6;

function circle(p, C, t, a, far) {
  const R = clamp(a.w * 0.55, 9, 28), spin = ((t / D) * TAU) / 2;
  const keep = far ? (g) => Math.sin(g) < 0 : (g) => Math.sin(g) >= 0;
  floorRing(p, 0, 0, R, SY, far ? C[4] : C[5], 1, keep);
  floorRing(p, 0, 0, R * 0.55, SY, far ? C[3] : C[4], 1, keep);
  for (let k = 0; k < RUNES; k += 1) {
    const g = spin + ((k * TAU) / RUNES);
    if ((Math.sin(g) < 0) !== far) continue;
    glyph(p, k, Math.cos(g) * R * 0.78, Math.sin(g) * R * 0.78 * SY, far ? C[4] : C[6], 1, far ? C[2] : C[3]);
  }
}

export function drawBack(p, t, o) {
  const C = fit(o.palette, 8), a = o.actor, pulse = 0.85 + (0.15 * Math.sin((t / D) * TAU * 2));
  p.glow(0, 0, clamp(a.w * 0.7, 12, 34), C[4], 0.22 * pulse);
  circle(p, C, t, a, true);
}

export function draw(p, t, o) {
  const C = fit(o.palette, 8), a = o.actor, pulse = 0.5 + (0.5 * Math.sin((t / D) * TAU * 2));
  circle(p, C, t, a, false);
  const x = a.x + (a.w / 2), y = a.y - 6 + (Math.sin((t / D) * TAU) * 0.8);
  p.glow(x, y, 8, C[5], 0.2 + (0.15 * pulse));
  sigil(p, 5, x, y, pulse > 0.8 ? WHITE : C[6], 1, C[2]);
}

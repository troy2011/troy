// Tarot Kingdom's own pixelfx status loop (not part of the vendored library): fear.
import { cycle, fit, mix, TAU } from '../vendor/pixelfx/core/index.js';
import { shape, colorAt } from '../vendor/pixelfx/fx/status/_lib.js';

export const meta = {
  name: 'Fear',
  desc: 'Drained cold: the body pales blue, gloom lines hang down over the face, cold sweat runs off the temples and falls.',
  duration: 2,
  loop: true,
  actor: 2,
  options: { palette: ['#0d0a1f', '#241a4a', '#3b2d78', '#5a4cb0', '#9fb4ff', '#e6f0ff'], seed: 6 }
};

const D = meta.duration;

export function draw(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, S = shape(a);
  const depth = S.h * 0.6, sway = 0.85 + (0.15 * Math.sin((t / D) * TAU));
  for (const [mx, my] of S.body) {
    // the blood drains: the sprite's own colours washed cold and dim
    let c = mix(colorAt(a, mx, my), C[2], 0.38);
    // gloom lines: every other column darkened from the top of the head, fading out below the chest
    const u = (my - S.top[mx]) / depth;
    if (u < 1 && mx % 2 === 0) c = mix(c, C[0], 0.9 * (1 - u) * sway);
    p.px(a.x + mx, a.y + my, c);
  }
  // shivers: little pairs of strokes beside the body, flicking from side to side four times a second
  const mid = Math.round(S.h * 0.35), [l, r] = S.rows[mid];
  if (l >= 0) {
    const side = Math.floor(t * 4) % 2 ? 1 : -1, x = a.x + (side < 0 ? l - 2 : r + 2);
    for (const dy of [-3, -2, 2, 3]) p.px(x + (side * (Math.abs(dy) === 3 ? 1 : 0)), a.y + mid + dy, C[4]);
  }
  // cold sweat: drops bead at the temples, run down the side of the face and drop off
  cycle(t, D, 3, o.seed, (r) => r.range(0.9, 1.3), (age, life, r, i) => {
    const u = age / life, side = i % 2 ? 1 : -1, y0 = Math.round(S.h * r.range(0.12, 0.22));
    const run = Math.min(1, u / 0.55), fall = Math.max(0, (u - 0.55) / 0.45);
    const my = Math.min(S.h - 1, Math.round(y0 + (run * S.h * 0.16)));
    const [l, rr] = S.rows[my][0] >= 0 ? S.rows[my] : S.rows[y0];
    const x = a.x + (side < 0 ? l - 1 : rr + 1) + (side * fall * 2);
    const y = a.y + y0 + (run * S.h * 0.16) + (fall * fall * 16);
    const k = 1 - fall;
    p.dot(x, y, C[4], k);
    p.dot(x, y + 1, C[3], k);
    if (u < 0.55) p.dot(x, y - 1, C[5], k);
  });
}

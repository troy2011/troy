// Tarot Kingdom's own pixelfx status loop (not part of the vendored library): vulnerability.
import { Rng, cycle, fit, TAU } from '../vendor/pixelfx/core/index.js';
import { shape, bitmap, icon } from '../vendor/pixelfx/fx/status/_lib.js';

export const meta = {
  name: 'Vulnerable',
  desc: 'Defences broken: red cracks run through the body, little shards flake off its edge and fall, and a cracked shield hangs over the head.',
  duration: 2.4,
  loop: true,
  actor: 2,
  options: { palette: ['#1a0406', '#4a0a10', '#8a1420', '#d0283a', '#ff6a6a', '#ffd0c8'], seed: 5 }
};

const D = meta.duration;
const SHIELD = bitmap([
  '###.###',
  '###.###',
  '##.####',
  '###.###',
  '.##.##.',
  '..#.#..',
  '...#...'
]);

// cracks: short random walks through the body from a few points, worked out once per actor
const CRACKS = new WeakMap();
function cracks(a, S, seed) {
  if (CRACKS.has(a.mask)) return CRACKS.get(a.mask);
  const R = new Rng(seed), list = [];
  for (const [fx, fy] of [[0.42, 0.3], [0.6, 0.55], [0.35, 0.72]]) {
    let x = S.w * fx, y = S.h * fy, ang = R.range(0, TAU);
    for (let s = 0; s < Math.max(5, S.h * 0.22); s += 1) {
      if (!S.on(Math.floor(x), Math.floor(y))) break;
      list.push([Math.floor(x), Math.floor(y)]);
      ang += R.range(-0.7, 0.7);
      x += Math.cos(ang) * 1.3;
      y += Math.sin(ang) * 1.3;
    }
  }
  CRACKS.set(a.mask, list);
  return list;
}

export function draw(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, S = shape(a), pulse = 0.5 + (0.5 * Math.sin((t / D) * TAU));
  // a slow red edge, never a flash
  p.outline(a.mask, a.x, a.y, C[3], 0.3 + (0.25 * pulse));
  for (const [mx, my] of cracks(a, S, o.seed)) {
    p.px(a.x + mx, a.y + my, C[1]);
    p.dot(a.x + mx + 1, a.y + my, C[4], 0.35 + (0.3 * pulse));
  }
  // shards breaking off the edge and tumbling down
  cycle(t, D, 7, o.seed + 2, (r) => r.range(0.7, 1.1), (age, life, r) => {
    const u = age / life, [ex, ey] = S.side[Math.floor(r.next() * S.side.length)] || [0, 0];
    const dir = ex < S.w / 2 ? -1 : 1;
    const x = a.x + ex + (dir * u * r.range(3, 7)), y = a.y + ey + (u * u * 18) - (u * 3);
    const k = 1 - (u * u);
    p.dot(x, y, C[4], k);
    if (r.next() < 0.5) p.dot(x + dir, y, C[3], k);
  });
  // the cracked shield over the head, bobbing gently
  const bob = Math.sin((t / D) * TAU) * 0.8;
  icon(p, a.x + (a.w / 2), a.y - 6 + bob, 4, SHIELD, [C[0], C[2], C[3], C[4]], 0.95);
}

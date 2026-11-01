// Tarot Kingdom's own pixelfx status loop (not part of the vendored library): slow.
import { fit, hex, TAU } from '../vendor/pixelfx/core/index.js';
import { shape, bitmap, icon } from '../vendor/pixelfx/fx/status/_lib.js';

export const meta = {
  name: 'Slow',
  desc: 'Dragging behind: two pale after-images trail the body, and an hourglass over the head lets its sand run down.',
  duration: 3,
  loop: true,
  actor: 2,
  // trail: which side the after-images fall behind on (1 right, -1 left)
  options: { palette: ['#081a24', '#165a6e', '#2a8a9a', '#52bcc4', '#9ee6e0', '#e2fff8'], sand: '#f0c060', seed: 7, trail: 1 }
};

const D = meta.duration;
const GLASS = bitmap([
  '#######',
  '#.....#',
  '.#...#.',
  '..#.#..',
  '.#...#.',
  '#.....#',
  '#######'
]);
// the chambers' cells: the upper drains top-down, the lower fills bottom-up
const TOP = [[-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [-1, -1], [0, -1], [1, -1]];
const BOTTOM = [[-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [-1, 1], [0, 1], [1, 1]];

export function drawBack(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, S = shape(a), dir = o.trail < 0 ? -1 : 1;
  // after-images, drawn only where they stick out past the body
  for (const [step, k] of [[3, 0.4], [6, 0.2]]) {
    const off = dir * step;
    for (const [mx, my] of S.body) {
      if (S.on(mx + off, my)) continue;
      p.dot(a.x + mx + off, a.y + my, C[3], k);
    }
  }
}

export function draw(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, u = t / D;
  const x = Math.round(a.x + (a.w / 2)), y = Math.round(a.y - 7 + (Math.sin(u * TAU) * 0.6));
  icon(p, x, y, 4, GLASS, [C[0], C[2], C[4], C[5]], 0.95);
  const fell = Math.floor(u * TOP.length), sand = hex(o.sand);
  TOP.slice(fell).forEach(([dx, dy]) => p.px(x + dx, y + dy, sand));
  BOTTOM.slice(0, fell).forEach(([dx, dy]) => p.px(x + dx, y + dy, sand));
  if (Math.floor(t * 6) % 2 === 0) p.px(x, y, sand);
}

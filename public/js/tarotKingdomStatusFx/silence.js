// Tarot Kingdom's own pixelfx status loop (not part of the vendored library): silence.
import { fit, TAU } from '../vendor/pixelfx/core/index.js';
import { bitmap, icon } from '../vendor/pixelfx/fx/status/_lib.js';

export const meta = {
  name: 'Silence',
  desc: 'A speech bubble over the head tries to speak, one dot after another, but a bar across it keeps it shut.',
  duration: 2.4,
  loop: true,
  actor: 2,
  options: { palette: ['#0c1424', '#2c3a52', '#6c84a8', '#c4d4ec', '#ffffff', '#ff6a7a', '#a0283a'], seed: 2 }
};

const D = meta.duration;
const BUBBLE = bitmap([
  '..#########..',
  '.###########.',
  '#############',
  '#############',
  '#############',
  '.###########.',
  '..#########..',
  '...###.......',
  '...##........',
  '...#.........'
]);

export function draw(p, t, o) {
  const C = fit(o.palette, 7), a = o.actor, ph = t / D;
  const x = Math.round(a.x + (a.w * 0.62)), y = Math.round(a.y - 8 + (Math.sin(ph * TAU) * 0.8));
  icon(p, x, y, 7, BUBBLE, [C[0], C[2], C[3], C[4]], 0.95);
  // the dots come one by one, then all go together
  const shown = Math.floor(ph * 4);
  for (let i = 0; i < 3; i += 1) if (i < shown) p.px(x - 4 + (i * 4), y - 2, C[1]);
  // the bar that keeps it shut
  p.line(x - 6, y + 1, x + 6, y - 5, C[6]);
  p.line(x - 6, y + 2, x + 6, y - 4, C[5]);
}

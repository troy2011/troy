// Tarot Kingdom's own pixelfx status loop (not part of the vendored library): blindness.
import { cycle, fit, mix, luma, TAU } from '../vendor/pixelfx/core/index.js';
import { shape, haze, colorAt } from '../vendor/pixelfx/fx/status/_lib.js';

export const meta = {
  name: 'Blind',
  desc: 'A band of black mist lies across the eyes and wisps of it drift off to both sides; a dim veil hangs round the head.',
  duration: 2.4,
  loop: true,
  actor: 2,
  options: { palette: ['#05040a', '#100c1c', '#1f1733', '#33264f', '#5a4880', '#9a88c0'], seed: 4 }
};

const D = meta.duration;

// The eye line in mask rows. Eyes are small dark blobs closed in by lighter body: much darker than the
// body's typical shade (so a grey monster's dark-grey eyes count), not touching the outline, and not too
// big. The line runs through the top pair of blobs side by side (a mouth sits lower); one blob will do.
// pixelfx's eyes() is not used: it only looks in the top 40 % and only for near-black pixels, so it took
// a round monster's spikes for eyes. Falls back to 30 % down.
const EYE_LINES = new WeakMap();
function eyeLine(a, S) {
  if (EYE_LINES.has(a.mask)) return EYE_LINES.get(a.mask);
  const shade = (x, y) => luma(colorAt(a, x, y));
  const lumas = S.body.map(([x, y]) => shade(x, y)).sort((p, q) => p - q);
  const dark = lumas[Math.floor(lumas.length / 2)] * 0.55;
  const isDark = (x, y) => S.on(x, y) && shade(x, y) < dark;
  const maxSize = Math.max(12, S.w * S.h * 0.03);
  const seen = new Set(), blobs = [];
  for (const [x0, y0] of S.body) {
    const key0 = (y0 * S.w) + x0;
    if (seen.has(key0) || !isDark(x0, y0) || y0 > S.h * 0.65) continue;
    seen.add(key0);
    const queue = [[x0, y0]], ys = [];
    let closed = true;
    while (queue.length) {
      const [x, y] = queue.pop();
      ys.push(y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = (ny * S.w) + nx;
        if (!S.on(nx, ny)) closed = false;
        else if (!seen.has(key) && isDark(nx, ny)) (seen.add(key), queue.push([nx, ny]));
      }
    }
    if (closed && ys.length <= maxSize) blobs.push({ y0: Math.min(...ys), y1: Math.max(...ys) });
  }
  blobs.sort((p, q) => p.y0 - q.y0);
  const pair = blobs.find((b, i) => blobs.some((c, j) => j !== i && c.y0 <= b.y1 && c.y1 >= b.y0));
  const eye = pair || blobs[0];
  const line = eye ? Math.round((eye.y0 + eye.y1) / 2) : Math.round(S.h * 0.3);
  EYE_LINES.set(a.mask, line);
  return line;
}

export function drawBack(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, S = shape(a), y = a.y + eyeLine(a, S);
  const breath = 0.85 + (0.15 * Math.sin((t / D) * TAU));
  haze(p, a.x + (a.w / 2), y, a.w * 0.75, Math.max(5, a.h * 0.22), C[1], 0.4 * breath);
}

export function draw(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, S = shape(a), line = eyeLine(a, S);
  const half = Math.max(2, a.h * 0.07);
  // the band: thick black over the eyes, thinning at its edges, rippling slowly across the face
  for (const [mx, my] of S.body) {
    const d = Math.abs(my - line - (Math.sin(((t / D) * TAU) + (mx * 0.35)) * 0.7));
    if (d < half + 1) p.px(a.x + mx, a.y + my, mix(colorAt(a, mx, my), C[0], d < half * 0.6 ? 0.95 : 0.6));
  }
  // wisps pulled off the band to either side, rising as they thin out
  const [left, right] = S.rows[line] || [0, a.w - 1];
  cycle(t, D, 12, o.seed, (r) => r.range(1.1, 1.8), (age, life, r) => {
    const u = age / life, side = r.next() < 0.5 ? -1 : 1;
    const x = a.x + (side < 0 ? left : right) + (side * u * r.range(5, 12));
    const y = a.y + line + r.range(-1, 1) - (u * r.range(3, 9));
    haze(p, x, y, 2 + (3 * u), 1.3 + (1.4 * u), u < 0.4 ? C[1] : C[2], 0.7 * Math.sin(Math.PI * u));
  });
  // a few dull motes sinking through the veil
  cycle(t, D, 6, o.seed + 3, D, (age, life, r) => {
    const u = age / life, x = a.x + (a.w * r.range(0, 1)), y = a.y + line - 6 + (u * 12);
    p.dot(x, y, C[4], 0.5 * Math.sin(Math.PI * u));
  });
}

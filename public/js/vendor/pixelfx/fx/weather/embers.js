// troy: not upstream. Embers rising off a lava field, built the same way as snow.js (depth layers on trips(), a
// sway, a gusty wind) but rising from below and cooling as they go: white-hot, then yellow, orange, a dull red.
import { fit, rand, wrap, TAU, WHITE } from "../../core/index.js";
import { clip, trips } from "./_lib.js";

export const meta = {
  name: "Embers",
  desc: "Embers at three depths rise off the ground on the heat, swaying and cooling from white-hot to dull red before they go out.",
  tags: ["weather", "embers", "sparks", "fire", "lava", "ambient", "loop"],
  size: [320, 180],
  origin: [160, 170],
  duration: 12,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    // cold to hot: ash, dull red, red, orange, amber, yellow, pale yellow
    palette: ["#2a1410", "#5a1c12", "#9a2a14", "#d8541a", "#f28a24", "#ffc24a", "#fff0a8"],
    seed: 9,
  },
};

const D = 12;
const gust = (t) => 7 * Math.sin((TAU * t) / D + 1.1) + 3 * Math.sin((TAU * 3 * t) / D + 0.2);
// far to near: how many, rises a loop, how high they get before going out (share of the canvas), sway, wind
const LAYERS = [
  { n: 120, m: [2, 3], top: [0.5, 1.15], sway: [1, 3], wind: 2, gust: 0.4 },
  { n: 64, m: [2, 3], top: [0.45, 1], sway: [3, 6], wind: 4, gust: 0.7 },
  { n: 18, m: [1, 2], top: [0.4, 0.85], sway: [6, 11], wind: 6, gust: 1 },
];

export function draw(p, t, o) {
  const q = clip(p, meta), S = o.seed, C = fit(o.palette, 7);
  for (let L = 0; L < LAYERS.length; L++) layer(q, t, S, C, L);
}

// hot to cold along a rise: u 0..1
function heat(C, u) {
  return C[Math.max(1, 6 - Math.floor(u * 6))];
}

function layer(q, t, S, C, L) {
  const Ly = LAYERS[L], sd = S * 17 + L;
  trips(t, D, Ly.n, sd, Ly.m[0], Ly.m[1], (u, k, m, i) => {
    const j = wrap(k, m), dur = D / m, R = (n) => rand(sd, i, j, n);
    const rise = 176 * (Ly.top[0] + R(1) * (Ly.top[1] - Ly.top[0]));
    const sw = Ly.sway[0] + R(3) * (Ly.sway[1] - Ly.sway[0]), f = 0.3 + R(4) * 0.5, ph = R(5) * TAU, a = u * dur;
    // they leave the heat fast and slow as they cool
    const e = 1 - (1 - u) * (1 - u);
    const x = -170 + R(2) * 340 + Ly.wind * a + (gust(t) - gust(t - a)) * Ly.gust + sw * Math.sin(TAU * f * a + ph);
    const y = 8 - rise * e;
    const fade = Math.min(1, u * 8, (1 - u) * 3), c = heat(C, u);
    if (L === 0) return void q.dot(x, y, c, fade);
    // a flicker: the hot ones wink every few frames
    const lit = u < 0.6 && Math.sin(TAU * (3 + R(6) * 3) * a + ph) > 0.2;
    if (L === 1) {
      // a spark: a hot point with a cooler one trailing under it
      q.dot(x, y, lit ? WHITE : c, fade);
      q.dot(x + 1, y, c, fade * 0.7);
      if (u < 0.6) q.dot(x, y + 1, heat(C, u + 0.25), fade * 0.7);
      q.glow(x + 0.5, y + 0.5, 4, C[4], 0.35 * fade * (1 - u));
      return;
    }
    // a near ember: a hot heart, a cooler rim, a short trail and a warm glow
    q.dot(x, y, lit ? WHITE : heat(C, u * 0.7), fade);
    q.dot(x + 1, y, c, fade * 0.8);
    q.dot(x, y + 1, c, fade * 0.8);
    q.dot(x + 1, y + 1, heat(C, u + 0.2), fade * 0.7);
    q.dot(x, y + 2, heat(C, u + 0.35), fade * 0.4);
    q.glow(x + 1, y + 1, 7, C[4], 0.45 * fade * (1 - u));
  });
}

// Tarot Kingdom table sounds, made on the spot with Web Audio: no sound files are downloaded.
// The aim is the real thing on a tavern table: paper cards, an oak table, coins, and a ship's bell.
// Every sound varies a little each time it plays (weight, pitch, timing, side), so it never repeats exactly.

const D4 = 293.66;
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
// The n-th note of D dorian counted from D4: 0 = D4, 7 = D5, -7 = D3.
export const scale = (n) => D4 * 2 ** ((Math.floor(n / 7) * 12 + DORIAN[((n % 7) + 7) % 7]) / 12);

let ctx = null;
let bus = null;
let roomIn = null;
let destination = null;
// The trim of the sound being scheduled; see LEVEL.
let lvl = 1;
const buffers = new Map();

const rand = (a, b) => a + Math.random() * (b - a);
const vary = (x, amount) => x * (1 + (Math.random() * 2 - 1) * amount);
const time = (at) => ctx.currentTime + Math.max(0, at);

// ---- The room ---------------------------------------------------------------

// A small tavern: a few early bounces off the table and the beams, then a short tail that darkens as it dies.
function tavern() {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 1.2);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch += 1) {
        const d = buf.getChannelData(ch);
        let low = 0;
        for (let i = 0; i < n; i += 1) {
            const t = i / sr;
            const k = Math.min(0.94, 0.2 + t * 1.5);
            low += (1 - k) * ((Math.random() * 2 - 1) - low);
            d[i] = low * Math.exp(-t * 6.5);
        }
        for (const [ms, a] of [[3, 0.9], [7, 0.6], [11 + ch * 2, 0.5], [17, 0.4], [23 + ch * 3, 0.35], [31, 0.25]]) {
            d[Math.floor((sr * ms) / 1000)] += a * (ch ? -1 : 1) * rand(0.7, 1);
        }
    }
    return buf;
}

// Connects the sounds to `context`, played into `into` (a gain the caller owns, or the speakers).
export function attach(context, into = context.destination) {
    if (ctx === context && destination === into) return;
    ctx = context;
    destination = into;
    buffers.clear();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    limiter.connect(into);
    bus = ctx.createGain();
    bus.connect(limiter);
    const verb = ctx.createConvolver();
    verb.normalize = true;
    verb.buffer = tavern();
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    roomIn = ctx.createGain();
    roomIn.connect(verb).connect(wet).connect(limiter);
}

function out(node, pan = 0, wet = 0.2) {
    let tail = node;
    if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        node.connect(p);
        tail = p;
    }
    tail.connect(bus);
    if (wet > 0) {
        const g = ctx.createGain();
        g.gain.value = wet;
        tail.connect(g).connect(roomIn);
    }
}

// A gain that rises in `attack`, holds, then dies away over `decay`.
function env(at, decay, gain, attack = 0.002, hold = 0) {
    const g = ctx.createGain();
    const s = time(at);
    const peak = Math.max(0.0002, gain * lvl);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(peak, s + attack);
    if (hold) g.gain.setValueAtTime(peak, s + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, s + attack + hold + decay);
    return g;
}

// ---- Raw material -----------------------------------------------------------

function noiseBuffer(color) {
    const key = `noise:${color}`;
    if (!buffers.has(key)) {
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * 2, sr);
        const d = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, last = 0;
        for (let i = 0; i < d.length; i += 1) {
            const w = Math.random() * 2 - 1;
            if (color === 'pink') {
                b0 = 0.99765 * b0 + w * 0.099046;
                b1 = 0.963 * b1 + w * 0.2965164;
                b2 = 0.57 * b2 + w * 1.0526913;
                d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
            } else if (color === 'brown') {
                last = (last + 0.02 * w) / 1.02;
                d[i] = last * 3.5;
            } else d[i] = w;
        }
        buffers.set(key, buf);
    }
    return buffers.get(key);
}

// Filtered noise: paper, air, dust, the crack of wood.
function hiss(at, decay, { gain = 0.3, type = 'bandpass', freq = 2000, to = 0, q = 0.8, attack = 0.001, hold = 0, color = 'white', pan = 0, wet = 0.15 } = {}) {
    const s = time(at);
    const end = attack + hold + decay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(color);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, s);
    if (to) f.frequency.exponentialRampToValueAtTime(to, s + end);
    const g = env(at, decay, gain, attack, hold);
    src.connect(f).connect(g);
    out(g, pan, wet);
    src.start(s, rand(0, 1.4));
    src.stop(s + end + 0.05);
}

// Struck things ring at a few frequencies of their own, each dying at its own pace: [freq, amount, decay].
function ring(at, partials, { gain = 0.2, pan = 0, wet = 0.2, attack = 0.001 } = {}) {
    const s = time(at);
    const top = ctx.sampleRate / 2.2;
    for (const [freq, amp, decay] of partials) {
        if (freq > top || amp <= 0) continue;
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        const g = env(at, decay, gain * amp, attack);
        o.connect(g);
        out(g, pan, wet);
        o.start(s);
        o.stop(s + attack + decay + 0.05);
    }
}

// The low body of a hit: a short sine falling in pitch.
function thump(at, freq, decay, { gain = 0.5, drop = 0.55, pan = 0, wet = 0.2 } = {}) {
    const s = time(at);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, s);
    o.frequency.exponentialRampToValueAtTime(freq * drop, s + decay);
    const g = env(at, decay, gain, 0.003);
    o.connect(g);
    out(g, pan, wet);
    o.start(s);
    o.stop(s + decay + 0.05);
}

// A knuckle or a card on the oak table.
function woodKnock(at, { freq = 210, gain = 0.4, hard = 1, pan = 0, wet = 0.25 } = {}) {
    const f = vary(freq, 0.05);
    ring(at, [[f, 1, 0.11], [f * 2.41, 0.55, 0.06], [f * 3.93, 0.35, 0.04], [f * 5.8, 0.18, 0.025]], { gain, pan, wet });
    hiss(at, 0.014, { gain: gain * 0.9 * hard, type: 'lowpass', freq: 1800 + 1800 * hard, q: 0.5, pan, wet });
}

// A thin gold or silver coin: a few out-of-tune rings, two of them close enough to beat.
function coin(at, { freq = 2900, gain = 0.15, ringFor = 0.5, pan = 0, wet = 0.25 } = {}) {
    const f = vary(freq, 0.07);
    ring(at, [[f, 1, ringFor], [f * 1.004, 0.6, ringFor * 0.9], [f * 2.31, 0.55, ringFor * 0.6], [f * 3.62, 0.38, ringFor * 0.4], [f * 5.18, 0.22, ringFor * 0.25]], { gain, pan, wet });
    hiss(at, 0.006, { gain: gain * 1.5, type: 'highpass', freq: 5000, q: 0.7, pan, wet: 0 });
}

// A heavy clay chip: a short dull clack.
function clay(at, { freq = 3400, gain = 0.3, pan = 0 } = {}) {
    const f = vary(freq, 0.08);
    ring(at, [[f, 1, 0.035], [f * 1.52, 0.6, 0.025], [f * 2.4, 0.35, 0.016]], { gain, pan, wet: 0.12 });
    hiss(at, 0.018, { gain: gain * 1.2, freq: 3800, q: 1.4, pan, wet: 0.1 });
}

// A ship's bell: the hum an octave down, the tierce and the quint, all slightly off.
function bell(at, freq, { gain = 0.12, ringFor = 2.2, pan = 0, wet = 0.4 } = {}) {
    const f = vary(freq, 0.004);
    ring(at, [
        [f * 0.5, 0.35, ringFor * 1.2], [f, 1, ringFor], [f * 1.003, 0.45, ringFor], [f * 1.19, 0.45, ringFor * 0.6],
        [f * 1.5, 0.35, ringFor * 0.5], [f * 2, 0.4, ringFor * 0.45], [f * 2.52, 0.18, ringFor * 0.3], [f * 2.67, 0.22, ringFor * 0.28],
        [f * 3.01, 0.12, ringFor * 0.2], [f * 4.08, 0.08, ringFor * 0.15]
    ], { gain, pan, wet });
    hiss(at, 0.02, { gain: gain * 1.2, type: 'highpass', freq: 3000, pan, wet: 0.1 });
}

// Two pewter mugs knocked together.
function mug(at, { freq = 1250, gain = 0.15, pan = 0 } = {}) {
    const f = vary(freq, 0.05);
    ring(at, [[f, 1, 0.35], [f * 1.68, 0.6, 0.25], [f * 2.73, 0.4, 0.18], [f * 3.9, 0.2, 0.12]], { gain, pan, wet: 0.3 });
    hiss(at, 0.01, { gain: gain * 1.5, freq: 3000, q: 0.8, pan, wet: 0 });
}

// A card meeting the table: the crisp slap of the paper, the air under it, the table answering.
function cardSlap(at, power = 1, pan = 0) {
    const p = [0, 0.55, 0.8, 1][Math.min(3, Math.max(1, power))] * rand(0.85, 1.1);
    hiss(at, vary(0.03, 0.2), { gain: 0.55 * p, type: 'highpass', freq: vary(2000, 0.2), q: 0.6, attack: 0.0008, pan, wet: 0.12 });
    hiss(at, 0.05, { gain: 0.3 * p, freq: vary(950, 0.15), q: 0.8, pan, wet: 0.15, color: 'pink' });
    woodKnock(at + 0.001, { freq: vary(170, 0.08), gain: 0.18 * p, hard: 0.4, pan });
}

// Paper sliding over cloth or wood.
function slide(at, decay, { gain = 0.2, freq = 3800, to = 2600, pan = 0 } = {}) {
    hiss(at, decay * 0.45, { gain, freq: vary(freq, 0.1), to: vary(to, 0.1), q: 0.6, attack: decay * 0.55, color: 'pink', pan, wet: 0.12 });
}

// Something passing through the air. `flutter` is how fast a spinning card beats the air.
function whoosh(at, decay, { gain = 0.25, from = 700, to = 2600, flutter = 0, pan = 0 } = {}) {
    const s = time(at);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer('pink');
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(from, s);
    f.frequency.exponentialRampToValueAtTime(to, s + decay * 0.6);
    f.frequency.exponentialRampToValueAtTime(from * 1.3, s + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * lvl), s + decay * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, s + decay);
    src.connect(f).connect(g);
    let tail = g;
    if (flutter) {
        const am = ctx.createGain();
        am.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(flutter, s);
        lfo.frequency.linearRampToValueAtTime(flutter * 0.6, s + decay);
        const depth = ctx.createGain();
        depth.gain.value = 0.5;
        lfo.connect(depth).connect(am.gain);
        g.connect(am);
        tail = am;
        lfo.start(s);
        lfo.stop(s + decay + 0.05);
    }
    out(tail, pan, 0.15);
    src.start(s, rand(0, 1.4));
    src.stop(s + decay + 0.05);
}

// A ship's gun some way off: the crack, the boom, the rumble, the bits coming down.
function cannon(at, gain = 0.9, pan = 0) {
    hiss(at, 0.09, { gain: gain * 0.9, type: 'lowpass', freq: 3500, q: 0.4, pan, wet: 0.3 });
    thump(at, 72, 0.9, { gain: gain * 0.9, drop: 0.45, pan, wet: 0.4 });
    hiss(at + 0.01, 1.4, { gain: gain * 0.8, type: 'lowpass', freq: 500, to: 70, q: 0.5, attack: 0.012, color: 'brown', pan, wet: 0.6 });
    for (let i = 0; i < 7; i += 1) {
        hiss(at + rand(0.08, 0.7), 0.01, { gain: gain * rand(0.04, 0.12), freq: rand(1500, 4000), q: 1, pan: pan + rand(-0.4, 0.4), wet: 0.4 });
    }
}

// A fist on the table.
function fist(at, gain = 0.6, pan = 0) {
    thump(at, vary(105, 0.06), 0.28, { gain, drop: 0.5, pan, wet: 0.3 });
    woodKnock(at, { freq: vary(150, 0.06), gain: gain * 0.6, hard: 0.6, pan });
    hiss(at, 0.05, { gain: gain * 0.4, type: 'lowpass', freq: 900, pan, wet: 0.2, color: 'pink' });
}

// Coins on the table jumping and landing.
function coinsJump(at, count, gain = 0.08, spread = 0.05) {
    for (let i = 0; i < count; i += 1) {
        coin(at + i * spread * rand(0.6, 1.4), { freq: rand(2400, 3600), gain: gain * rand(0.6, 1), ringFor: rand(0.15, 0.35), pan: rand(-0.5, 0.5) });
    }
}

// ---- The sounds of the game, each with a few takes to choose from ------------

const power = (value) => [0, 0.6, 0.85, 1][Math.min(3, Math.max(1, value))];

export const SCENES = [
    {
        name: 'card', label: '札を出す', note: 'いちばん多く鳴る音。強さ1〜3（数字が大きい札・枚数が多いほど強い）',
        args: [['軽く', [1]], ['強め', [2]], ['いちばん強く', [3]]],
        takes: {
            a: ['木の卓にパシッ', (at, p = 1) => {
                cardSlap(at, p, rand(-0.15, 0.15));
                if (p >= 3) { fist(at, 0.3); coinsJump(at + 0.03, 2, 0.05); }
            }],
            b: ['フェルトにスッと置く', (at, p = 1) => {
                const k = power(p);
                slide(at - 0.05, 0.06, { gain: 0.12 * k, freq: 3000, to: 2200 });
                hiss(at, 0.04, { gain: 0.35 * k, type: 'lowpass', freq: vary(1400, 0.15), q: 0.6, color: 'pink', wet: 0.12 });
                thump(at, vary(120, 0.08), 0.08, { gain: 0.25 * k, drop: 0.6 });
                if (p >= 3) fist(at, 0.4);
            }],
            c: ['バシンと叩きつける', (at, p = 1) => {
                const k = [0, 0.75, 0.95, 1.15][Math.min(3, Math.max(1, p))];
                hiss(at, 0.012, { gain: 0.6 * k, type: 'highpass', freq: 4200, q: 0.7, wet: 0.1 });
                hiss(at, 0.06, { gain: 0.45 * k, freq: vary(1300, 0.15), q: 0.7, wet: 0.15 });
                woodKnock(at, { freq: vary(160, 0.08), gain: 0.32 * k, hard: 0.8 });
                if (p >= 2) thump(at, 95, 0.18, { gain: 0.3 * k });
                if (p >= 3) coinsJump(at + 0.03, 3, 0.06);
            }]
        }
    },
    {
        name: 'deal', label: '札を配る・引く', note: '配るときは8回続けて鳴る',
        takes: {
            a: ['山から1枚はじく', (at) => {
                const pan = rand(-0.3, 0.3);
                hiss(at, 0.007, { gain: 0.25, type: 'highpass', freq: 5500, q: 0.7, pan, wet: 0 });
                slide(at + 0.005, 0.07, { gain: 0.16, freq: 4200, to: 3000, pan });
            }],
            b: ['さらっと滑らせる', (at) => slide(at, 0.12, { gain: 0.14, freq: 3200, to: 2400, pan: rand(-0.3, 0.3) })],
            c: ['指で弾いて飛ばす', (at) => {
                const pan = rand(-0.3, 0.3);
                hiss(at, 0.005, { gain: 0.3, freq: vary(3800, 0.1), q: 2, pan, wet: 0 });
                hiss(at + 0.012, 0.006, { gain: 0.18, freq: vary(2600, 0.1), q: 2, pan, wet: 0 });
                slide(at + 0.02, 0.05, { gain: 0.1, pan });
            }]
        }
    },
    {
        name: 'throw', label: '札が飛ぶ', note: '相手の札が卓へ飛んでくる間',
        takes: {
            a: ['風を切る', (at) => whoosh(at, vary(0.16, 0.15), { gain: 0.2, from: 600, to: vary(2400, 0.2), pan: rand(-0.3, 0.3) })],
            b: ['回りながらヒラヒラ', (at) => whoosh(at, vary(0.18, 0.15), { gain: 0.22, from: 600, to: vary(2200, 0.2), flutter: vary(28, 0.2), pan: rand(-0.3, 0.3) })]
        }
    },
    {
        name: 'pass', label: 'パス', note: '',
        takes: {
            a: ['札をスッと引く', (at, own = true) => {
                // Short broad paper friction only; no oscillators or table strike.
                hiss(at, 0.079, { gain: own ? 1.19 : 0.86, freq: 3100, to: 1600, q: 0.68,
                    attack: 0.042, color: 'pink', wet: 0.02 });
            }],
            b: ['指で卓をトン', (at) => woodKnock(at, { freq: vary(260, 0.06), gain: 0.3, hard: 0.6, pan: rand(-0.2, 0.2) })],
            c: ['札の縁でトントン', (at) => {
                const pan = rand(-0.2, 0.2);
                for (const i of [0, 1]) {
                    const t = at + i * vary(0.09, 0.1);
                    hiss(t, 0.012, { gain: 0.3 * (1 - i * 0.2), freq: vary(2300, 0.08), q: 1.6, pan, wet: 0.15 });
                    woodKnock(t, { freq: vary(320, 0.05), gain: 0.12, hard: 0.3, pan });
                }
            }]
        }
    },
    {
        name: 'clear', label: '場が流れる', note: '',
        takes: {
            a: ['札をまとめて払う', (at) => {
                slide(at, 0.38, { gain: 0.22, freq: 2200, to: 3600 });
                for (let i = 0; i < 3; i += 1) cardSlap(at + 0.3 + i * vary(0.045, 0.3), 1, rand(-0.2, 0.2));
            }],
            b: ['札束をトントンそろえる', (at) => {
                for (let i = 0; i < 3; i += 1) {
                    const t = at + i * vary(0.08, 0.1);
                    thump(t, vary(260, 0.05), 0.06, { gain: 0.18, drop: 0.7 });
                    hiss(t, 0.03, { gain: 0.25, freq: vary(1600, 0.1), q: 0.8, color: 'pink' });
                }
            }],
            c: ['払って脇にドン', (at) => { slide(at, 0.3, { gain: 0.2, freq: 2000, to: 3400 }); fist(at + 0.3, 0.3); }]
        }
    },
    {
        name: 'chip', label: 'チップ', note: 'チップが勝者へ飛ぶとき、続けて何度も鳴る',
        takes: {
            a: ['金貨', (at) => coin(at, { freq: rand(2600, 3300), gain: 0.12, ringFor: rand(0.35, 0.55), pan: rand(-0.3, 0.3) })],
            b: ['粘土のチップ', (at) => {
                const pan = rand(-0.3, 0.3);
                clay(at, { gain: 0.3, pan });
                if (Math.random() < 0.6) clay(at + rand(0.03, 0.06), { gain: 0.14, freq: 3700, pan });
            }],
            c: ['銀貨', (at) => coin(at, { freq: rand(3800, 4600), gain: 0.1, ringFor: rand(0.2, 0.32), pan: rand(-0.3, 0.3) })]
        }
    },
    {
        name: 'han', label: '翻が増える', note: '増える翻が多いほど長くなる（1〜4）',
        args: [['少し', [1]], ['普通', [2]], ['たくさん', [4]]],
        takes: {
            a: ['金貨を積む', (at, steps = 2) => {
                for (let i = 0; i < Math.min(6, steps + 1); i += 1) coin(at + i * 0.085, { freq: (2500 + i * 180) * vary(1, 0.03), gain: 0.11, ringFor: 0.3, pan: rand(-0.2, 0.2) });
            }],
            b: ['金貨袋をドサッ', (at, steps = 2) => {
                thump(at, vary(140, 0.05), 0.12, { gain: 0.3, drop: 0.6 });
                hiss(at, 0.08, { gain: 0.3, type: 'lowpass', freq: 1200, color: 'pink' });
                coinsJump(at + 0.01, 5 + steps * 2, 0.06, 0.025);
            }],
            c: ['硬貨が順に落ちる', (at, steps = 2) => coinsJump(at, steps + 1, 0.05)]
        }
    },
    {
        name: 'turn', label: 'あなたの番', note: '',
        takes: {
            a: ['木のコンコン（代替）', (at) => {
                woodKnock(at, { freq: 207, gain: 0.28, hard: 0.65, wet: 0.02 });
                woodKnock(at + 0.16, { freq: 190, gain: 0.24, hard: 0.58, wet: 0.02 });
            }],
            b: ['小さな木の合図', (at) => woodKnock(at, { gain: 0.28, wet: 0.04 })],
            c: ['ジョッキをカチン', (at) => { mug(at, { gain: 0.13 }); mug(at + vary(0.012, 0.3), { gain: 0.08, freq: 1400 }); }]
        }
    },
    {
        name: 'last-card', label: '残り1枚', note: '乾いた札の弾け音。合図の木音とは別。',
        takes: {
            a: ['札のパシッ', (at) => {
                hiss(at, 0.064, { gain: 0.38, type: 'bandpass', freq: 1900, q: 0.75 });
                thump(at + 0.007, 115, 0.085, { gain: 0.24, drop: 0.55, wet: 0.04 });
            }]
        }
    },
    {
        name: 'stamp', label: 'スタンプ', note: '11バック・スキップ・ロックなどの文字が押されるとき',
        takes: {
            a: ['封蝋をドンと押す', (at) => {
                thump(at, vary(90, 0.05), 0.22, { gain: 0.5, drop: 0.55, wet: 0.3 });
                hiss(at, 0.08, { gain: 0.3, freq: vary(1100, 0.1), q: 0.7, color: 'pink' });
                hiss(at + 0.01, 0.04, { gain: 0.15, type: 'highpass', freq: 3000 });
            }],
            b: ['木槌で打つ', (at) => { woodKnock(at, { freq: vary(150, 0.05), gain: 0.5, hard: 0.9 }); thump(at, 120, 0.15, { gain: 0.3, drop: 0.6 }); }],
            c: ['拳で卓をドン', (at) => { fist(at, 0.6); coinsJump(at + 0.02, 2, 0.04); }]
        }
    },
    {
        name: 'slash', label: '斬撃', note: '8カット・コールの一閃',
        takes: {
            a: ['カトラスの一閃（刃が鳴る）', (at) => {
                whoosh(at, 0.22, { gain: 0.32, from: 500, to: 4200 });
                ring(at + 0.13, [[3150, 1, 0.6], [3163, 0.6, 0.6], [4470, 0.7, 0.45], [5830, 0.5, 0.35], [7900, 0.3, 0.25]], { gain: 0.04, wet: 0.35 });
            }],
            b: ['風切りだけ', (at) => whoosh(at, 0.2, { gain: 0.35, from: 400, to: 5000 })]
        }
    },
    {
        name: 'take', label: 'コールで札を取る', note: '',
        takes: { a: ['つまみ上げる', (at) => { slide(at, 0.08, { gain: 0.12, freq: 3000, to: 4600 }); hiss(at + 0.08, 0.008, { gain: 0.2, type: 'highpass', freq: 4500, wet: 0 }); }] }
    },
    {
        name: 'snap', label: '取った札をはめる', note: '',
        takes: {
            a: ['パチンとはめる', (at) => {
                hiss(at, 0.006, { gain: 0.5, type: 'highpass', freq: 3500, q: 0.8, wet: 0.05 });
                hiss(at + 0.002, 0.03, { gain: 0.25, freq: vary(1800, 0.1), q: 1.2, wet: 0.1 });
                woodKnock(at, { freq: vary(240, 0.05), gain: 0.15, hard: 0.5 });
            }]
        }
    },
    {
        name: 'step', label: 'ストレートの1枚ごと', note: '札が1枚降りるたびに音が1つ上がる（試聴では5枚分）',
        sequence: [0, 1, 2, 3, 4],
        takes: { b: ['短い木のコツ', (at, index = 0) => {
            const step = Math.min(4, Math.max(0, index));
            woodKnock(at, { freq: 235, gain: 0.28 + step * 0.025, hard: 0.65, wet: 0.04 });
        }] }
    },
    {
        name: 'role', label: '5枚役の名乗り', note: 'ザ・ワールド・ファイブカードなどの帯が出るとき',
        takes: {
            b: ['拳と鐘', (at) => { fist(at, 0.45); bell(at + 0.02, scale(7), { gain: 0.1, ringFor: 2 }); }]
        }
    },
    {
        name: 'legend', label: '伝説の役', note: '10翻クラスの大役',
        takes: {
            a: ['大砲2発と鐘とリュート', (at) => {
                cannon(at, 0.8, -0.3);
                cannon(at + 0.45, 0.85, 0.3);
                bell(at + 0.1, scale(7), { gain: 0.12, ringFor: 2.6 });
                coinsJump(at + 0.55, 8, 0.05, 0.04);
            }]
        }
    },
    {
        name: 'straight', label: 'ストレート', note: '',
        takes: { a: ['札が木の上を滑る', (at) => slide(at, 0.13, { gain: 0.22, freq: 2300, to: 1400 })] }
    },
    {
        name: 'flush', label: 'フラッシュ', note: '',
        takes: { a: ['布が鳴る', (at) => hiss(at, 0.15, { gain: 0.34, freq: 2000, q: 0.8, color: 'pink' })] }
    },
    {
        name: 'fullhouse', label: 'フルハウス', note: '',
        takes: { a: ['木箱を閉める', (at) => fist(at, 0.62) ] }
    },
    {
        name: 'four', label: 'フォーカード', note: '',
        takes: { a: ['木と金具', (at) => { fist(at, 0.5); clay(at + 0.12, { gain: 0.22 }); }] }
    },
    {
        name: 'straightflush', label: 'ストレートフラッシュ', note: '',
        takes: { a: ['布と木', (at) => { slide(at, 0.15, { gain: 0.22 }); woodKnock(at + 0.15, { gain: 0.4 }); }] }
    },
    {
        name: 'finishWindup', label: '上がり：振りかぶる', note: '最後の1枚を掲げたとき',
        takes: { a: ['振りかぶる風切り', (at) => whoosh(at, 0.18, { gain: 0.35, from: 300, to: 1900 })] }
    },
    {
        name: 'finish', label: '上がり：叩きつける', note: '最後の1枚が卓に落ちたとき',
        takes: {
            a: ['卓が割れる一撃', (at) => {
                fist(at, 1);
                // 70 Hz exactly: the tests find the finishing blow by this note.
                thump(at, 70, 0.6, { gain: 0.7, drop: 0.5, wet: 0.5 });
                hiss(at, 0.05, { gain: 0.6, type: 'highpass', freq: 2500 });
                for (let i = 0; i < 5; i += 1) hiss(at + rand(0, 0.04), 0.012, { gain: rand(0.15, 0.3), freq: rand(1500, 4500), q: 2 });
                hiss(at + 0.01, 0.3, { gain: 0.35, type: 'lowpass', freq: 700, to: 150, color: 'brown', wet: 0.5 });
                coinsJump(at + 0.06, 6, 0.07, 0.045);
                mug(at + 0.08, { gain: 0.06 });
            }]
        }
    },
    {
        name: 'toss', label: '負けた手札を放り投げる', note: '',
        takes: {
            a: ['舞い上がって散らばる', (at) => {
                for (let i = 0; i < 9; i += 1) whoosh(at + i * 0.03 * rand(0.5, 1.5), rand(0.15, 0.3), { gain: 0.06, from: rand(600, 1200), to: rand(2000, 3600), flutter: rand(18, 32), pan: rand(-0.6, 0.6) });
                for (let i = 0; i < 8; i += 1) cardSlap(at + 0.7 + i * rand(0.04, 0.09), 1, rand(-0.6, 0.6));
            }]
        }
    },
    {
        name: 'win', label: '勝ち', note: '',
        takes: { b: ['同じ鐘を3回と硬貨', (at) => {
            [0, 0.18, 0.36].forEach((t) => bell(at + t, scale(14), { gain: 0.09, ringFor: 1.4 }));
            coinsJump(at + 0.4, 10, 0.06, 0.04);
        }] }
    },
    {
        name: 'lose', label: '負け', note: '',
        takes: {
            a: ['札を手元に引く', (at) => {
                slide(at, 0.14, { gain: 0.15, freq: 1800, to: 1050, wet: 0.03 });
                woodKnock(at + 0.13, { freq: 165, gain: 0.25, hard: 0.35, wet: 0.05 });
            }],
            b: ['低い鐘を1回', (at) => bell(at, scale(0), { gain: 0.12, ringFor: 2.5 })]
        }
    }
];

// More takes for the scenes that first had only one (2026-11-19).
const MORE = {
    take: {
        b: ['指でスッと引き抜く', (at) => slide(at, 0.14, { gain: 0.14, freq: 2400, to: 4200 })],
        c: ['爪でカッと弾き上げる', (at) => { hiss(at, 0.006, { gain: 0.3, freq: vary(3200, 0.1), q: 2, wet: 0 }); whoosh(at + 0.01, 0.12, { gain: 0.15, from: 900, to: 3200 }); }]
    },
    snap: {
        b: ['カチッと小さく', (at) => { hiss(at, 0.004, { gain: 0.4, freq: vary(4200, 0.08), q: 3, wet: 0.05 }); hiss(at + 0.004, 0.012, { gain: 0.15, freq: 2600, q: 2, wet: 0.05 }); }],
        c: ['トンと収める', (at) => { woodKnock(at, { freq: vary(200, 0.05), gain: 0.3, hard: 0.4 }); hiss(at, 0.04, { gain: 0.2, freq: vary(1300, 0.1), q: 0.8, color: 'pink' }); }]
    },
    legend: {
        b: ['鐘の連打と大砲1発', (at) => {
            [0, 0.16, 0.32, 0.48].forEach((t, i) => bell(at + t, scale(14), { gain: 0.1, ringFor: 1.8 }));
            cannon(at + 0.62, 0.9);
            coinsJump(at + 0.7, 10, 0.05, 0.035);
        }],
        c: ['拳の連打と金貨の雨', (at) => {
            [0, 0.14, 0.28, 0.42].forEach((t, i) => fist(at + t, 0.45 + i * 0.12, (i % 2 ? 0.2 : -0.2)));
            coinsJump(at + 0.56, 16, 0.05, 0.03);
        }]
    },
    straight: { b: ['木のコツ', (at) => woodKnock(at, { gain: 0.32, wet: 0.05 })] },
    flush: {

        c: ['金貨がザラッと流れて鐘1打', (at) => { coinsJump(at, 12, 0.05, 0.022); bell(at + 0.3, scale(14), { gain: 0.09, ringFor: 1.8 }); }]
    },
    fullhouse: { c: ['留め具2つと木のふた', (at) => { clay(at, { gain: 0.16 }); clay(at + 0.08, { gain: 0.14 }); woodKnock(at + 0.29, { gain: 0.38, freq: 150 }); }] },
    four: {
        b: ['拳4連打と大砲', (at) => { [0, 0.11, 0.22, 0.33].forEach((t, i) => fist(at + t, 0.35 + i * 0.1)); cannon(at + 0.45, 0.75); }],
        c: ['大砲2発（遠くと近く）', (at) => { cannon(at, 0.5, -0.4); cannon(at + 0.35, 0.85, 0.2); }]
    },
    straightflush: { b: ['札がまとまる', (at) => { slide(at, 0.18, { gain: 0.22 }); clay(at + 0.18, { gain: 0.25 }); }] },
    finishWindup: {
        b: ['低くうなる風', (at) => whoosh(at, 0.24, { gain: 0.35, from: 180, to: 900 })],
        c: ['短く鋭い風', (at) => whoosh(at, 0.12, { gain: 0.3, from: 700, to: 3800 })]
    },
    finish: {
        b: ['拳で一撃、金貨が跳ねる', (at) => {
            fist(at, 1);
            thump(at, 70, 0.4, { gain: 0.5, drop: 0.6, wet: 0.4 });
            coinsJump(at + 0.04, 9, 0.07, 0.04);
        }],
        c: ['大砲のような重い一撃', (at) => {
            fist(at, 0.9);
            thump(at, 70, 0.9, { gain: 0.8, drop: 0.4, wet: 0.6 });
            hiss(at + 0.01, 1, { gain: 0.5, type: 'lowpass', freq: 500, to: 70, q: 0.5, color: 'brown', wet: 0.6 });
        }]
    },
    toss: {
        b: ['バサッと一度に投げる', (at) => {
            whoosh(at, 0.25, { gain: 0.25, from: 500, to: 2600 });
            hiss(at + 0.55, 0.2, { gain: 0.25, freq: 1800, q: 0.6, color: 'pink', wet: 0.3 });
            for (let i = 0; i < 5; i += 1) cardSlap(at + 0.6 + i * rand(0.02, 0.05), 1, rand(-0.5, 0.5));
        }],
        c: ['ひらひら長く舞う', (at) => {
            for (let i = 0; i < 8; i += 1) whoosh(at + i * 0.09 * rand(0.6, 1.4), rand(0.3, 0.5), { gain: 0.05, from: rand(500, 900), to: rand(1600, 2800), flutter: rand(10, 18), pan: rand(-0.7, 0.7) });
            for (let i = 0; i < 6; i += 1) cardSlap(at + 1.1 + i * rand(0.08, 0.16), 1, rand(-0.6, 0.6));
        }]
    }
};
for (const scene of SCENES) Object.assign(scene.takes, MORE[scene.name] || {});

// ---- The grandest roles (2026-11-19): longer, layered celebrations ------------

// Fists drumming on the table, faster and harder until the shot.
function drumRoll(at, length, gain = 0.4) {
    let t = 0;
    let gap = 0.13;
    while (t < length) {
        const k = 0.4 + 0.6 * (t / length);
        thump(at + t, vary(110, 0.06), 0.12, { gain: gain * k, drop: 0.55, pan: rand(-0.25, 0.25), wet: 0.3 });
        hiss(at + t, 0.03, { gain: gain * 0.4 * k, type: 'lowpass', freq: 900, color: 'pink', wet: 0.2 });
        t += gap;
        gap = Math.max(0.035, gap * 0.86);
    }
}

// The same bell, repeated on both sides of the harbour.
function peal(at, notes, gap = 0.12, gain = 0.08) {
    notes.forEach((n, i) => bell(at + i * gap * rand(0.9, 1.1), scale(7), { gain, ringFor: 2.2, pan: i % 2 ? 0.45 : -0.45 }));
}

// A long shower of coins: thick in the middle, thinning at the end.
function coinRain(at, length, count, gain = 0.06) {
    for (let i = 0; i < count; i += 1) {
        const x = Math.random();
        const t = length * (x < 0.5 ? 2 * x * x : 1 - (2 - 2 * x) ** 2 / 2);
        coin(at + t, { freq: rand(2300, 4200), gain: gain * rand(0.5, 1), ringFor: rand(0.15, 0.45), pan: rand(-0.8, 0.8) });
    }
}

// A few bright metallic ticks over the top.
function sparkle(at, length, count, gain = 0.03) {
    for (let i = 0; i < count; i += 1) coin(at + rand(0, length), { freq: rand(3600, 4600), gain: gain * rand(0.5, 1), ringFor: 0.14, pan: rand(-0.9, 0.9), wet: 0.1 });
}


Object.assign(SCENES.find((scene) => scene.name === 'legend').takes, {
    d: ['太鼓の連打から祝砲3発、鐘の大合奏', (at) => {
        drumRoll(at, 0.6, 0.45);
        cannon(at + 0.6, 0.8, -0.5);
        cannon(at + 0.85, 0.8, 0.5);
        cannon(at + 1.1, 0.95, 0);
        peal(at + 0.62, [14, 13, 11, 10, 9, 8, 7], 0.13, 0.07);
        coinRain(at + 0.9, 1.4, 26);
    }],
    e: ['宝箱が開いて金貨があふれる', (at) => {
        thump(at, 85, 0.3, { gain: 0.6, drop: 0.6, wet: 0.4 });
        woodKnock(at, { freq: 140, gain: 0.5, hard: 0.8 });
        hiss(at + 0.05, 0.5, { gain: 0.15, type: 'highpass', freq: 5000, attack: 0.2, wet: 0.5 });
        coinRain(at + 0.1, 1.8, 44, 0.065);
        sparkle(at + 0.2, 1.6, 14);
        woodKnock(at + 1.6, { freq: 145, gain: 0.45, hard: 0.65 });
    }],
    f: ['港じゅうの祝砲と鐘', (at) => {
        [0, 0.28, 0.56, 0.84, 1.12].forEach((t, i) => {
            cannon(at + t, 0.45 + i * 0.12, [-0.7, 0.7, -0.35, 0.35, 0][i]);
            bell(at + t + 0.02, scale(7), { gain: 0.08, ringFor: 2, pan: [-0.6, 0.6, -0.3, 0.3, 0][i] });
        });
        coinRain(at + 1.15, 1.2, 22);
        sparkle(at + 1.2, 1.2, 10);
    }]
});

const TAKES = Object.fromEntries(SCENES.map((scene) => [scene.name, scene.takes]));

// The take the game uses for each sound, as chosen by ear in the sound lab (2026-11-19, third round).
const PICKED = {
    card: 'b', deal: 'b', throw: 'a', pass: 'a', clear: 'a', chip: 'a', han: 'b', turn: 'a', 'last-card': 'a', stamp: 'a', slash: 'a', take: 'c', snap: 'a',
    step: 'b', role: 'b', legend: 'e', straight: 'b', flush: 'c', fullhouse: 'c', four: 'b', straightflush: 'b', finishWindup: 'c',
    finish: 'b', toss: 'c', win: 'b', lose: 'a'
};
export const choice = Object.fromEntries(SCENES.map((scene) => [scene.name, PICKED[scene.name] || Object.keys(scene.takes)[0]]));

// Volume trims so that every take sits at the loudness its scene should have (measured with `measure`).
export const LEVEL = {
    'card.a': 5.95,
    'card.b': 4.4,
    'card.c': 1.41,
    'deal.a': 5.2,
    'deal.b': 3.37,
    'deal.c': 8.05,
    'throw.a': 2.62,
    'throw.b': 7,
    'pass.a': 0.65,
    'pass.b': 3.05,
    'pass.c': 1.43,
    'clear.a': 1.26,
    'clear.b': 1.15,
    'clear.c': 0.32,
    'chip.a': 1.2,
    'chip.b': 2.7,
    'chip.c': 3.8,
    'han.a': 1.12,
    'han.b': 1.65,
    'han.c': 1.49,
    'turn.a': 0.77,
    'turn.b': 1.31,
    'turn.c': 1.24,
    'stamp.a': 1.37,
    'stamp.b': 2.05,
    'stamp.c': 0.91,
    'slash.a': 1.66,
    'slash.b': 3.32,
    'take.a': 1.73,
    'snap.a': 3.58,
    'step.a': 3,
    'step.b': 1.3,
    'role.a': 1.04,
    'role.b': 0.96,
    'legend.a': 0.5,
    'straight.a': 1.55,
    'flush.a': 1.38,
    'fullhouse.a': 0.76,
    'four.a': 0.52,
    'straightflush.a': 0.58,
    'finishWindup.a': 2.24,
    'finish.a': 0.68,
    'toss.a': 1.42,
    'win.a': 1,
    'win.b': 0.9,
    'lose.a': 0.98,
    'lose.b': 0.59,
    'legend.d': 0.3,
    'legend.e': 0.42,
    'legend.f': 0.29,
    'take.b': 1.99,
    'take.c': 3.82,
    'snap.b': 15,
    'snap.c': 2.13,
    'legend.b': 0.3,
    'legend.c': 0.7,
    'straight.b': 1.54,
    'straight.c': 1.04,
    'flush.b': 1.24,
    'flush.c': 1.03,
    'fullhouse.b': 0.4,
    'fullhouse.c': 0.89,
    'four.b': 0.41,
    'four.c': 0.47,
    'straightflush.b': 0.32,
    'straightflush.c': 0.47,
    'finishWindup.b': 1.69,
    'finishWindup.c': 3.23,
    'finish.b': 0.82,
    'finish.c': 0.56,
    'toss.b': 1.26,
    'toss.c': 1.72,
};

// The loudness each scene should have, as the loudest 50 ms in dB below full scale.
export const TARGET = {
    card: -24, deal: -30, throw: -32, pass: -26, clear: -24, chip: -28, han: -22, turn: -24, 'last-card': -23, stamp: -20, slash: -22,
    take: -30, snap: -26, step: -24, role: -18, legend: -14, straight: -18, flush: -18, fullhouse: -18, four: -16,
    straightflush: -16, finishWindup: -26, finish: -15, toss: -22, win: -18, lose: -22
};

export function playTake(name, take, at = 0, ...args) {
    const fn = TAKES[name]?.[take]?.[1];
    if (!ctx || !fn) return;
    lvl = LEVEL[`${name}.${take}`] ?? 1;
    try { fn(at, ...args); } finally { lvl = 1; }
}

// A soft echo from the old finishing cue, without its extra tabletop strike.
export function playFinishCoins(at) {
    if (ctx) coinsJump(at, 6, 0.035, 0.033);
}

export function play(name, at = 0, ...args) {
    playTake(name, choice[name], at, ...args);
}

export function choose(name, take) {
    if (TAKES[name]?.[take]) choice[name] = take;
}

// Renders one take offline a few times and returns its loudness (loudest 50 ms, dB) and its peak.
export async function measure(name, take, args = [], { runs = 4, raw = false } = {}) {
    const back = ctx ? [ctx, destination] : null;
    const sr = 44100;
    let loud = 0;
    let peak = 0;
    for (let r = 0; r < runs; r += 1) {
        const off = new OfflineAudioContext(2, sr * 5, sr);
        attach(off);
        const keep = LEVEL[`${name}.${take}`];
        if (raw) delete LEVEL[`${name}.${take}`];
        playTake(name, take, 0, ...args);
        if (raw && keep !== undefined) LEVEL[`${name}.${take}`] = keep;
        const buf = await off.startRendering();
        const left = buf.getChannelData(0);
        const right = buf.getChannelData(1);
        const w = Math.floor(sr * 0.05);
        let best = 0;
        for (let i = 0; i + w < left.length; i += Math.floor(w / 2)) {
            let sum = 0;
            for (let j = i; j < i + w; j += 1) {
                const v = (left[j] + right[j]) / 2;
                sum += v * v;
            }
            best = Math.max(best, Math.sqrt(sum / w));
        }
        for (let i = 0; i < left.length; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        loud += 20 * Math.log10(best || 1e-6);
    }
    ctx = null;
    if (back) attach(...back);
    return { loud: loud / runs, peak };
}

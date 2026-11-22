// D dorian, the scale of most shanties.
const N = {
    D3: 146.83, A3: 220, Cs4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392, A4: 440, B4: 493.88, C5: 523.25,
    D5: 587.33, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, F6: 1396.91, A6: 1760
};
const RUN = [N.D4, N.E4, N.F4, N.G4, N.A4, N.B4, N.C5, N.D5, N.E5, N.F5, N.G5, N.A5];

let context = null;
let master = null;
let room = null;

// The level of the sound being scheduled; see LEVEL.
let level = 1;

// A short wooden room: decaying noise as the impulse of a small reverb.
function roomImpulse(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.9);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    return buffer;
}

// dry: the sound itself. send: what also goes to the room. A limiter keeps cannon shots from clipping.
function wire(ctx) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(limiter);
    const send = ctx.createGain();
    const verb = ctx.createConvolver();
    const back = ctx.createGain();
    verb.buffer = roomImpulse(ctx);
    back.gain.value = 0.2;
    send.connect(verb).connect(back).connect(limiter);
    return { dry, send };
}

function out(node, send) {
    node.connect(master);
    if (send) {
        const amount = context.createGain();
        amount.gain.value = send;
        node.connect(amount).connect(room);
    }
}

function tone(freq, at, length, { type = 'sine', gain = 0.2, slide = 0, attack = 0.006, cutoff = 0, detune = 0, send = 0 } = {}) {
    const start = context.currentTime + at;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq + slide), start + length);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain * level, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    if (cutoff) {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        osc.connect(filter).connect(amp);
    } else osc.connect(amp);
    out(amp, send);
    osc.start(start);
    osc.stop(start + length + 0.02);
}

let noiseBuffer = null;
let noiseRate = 0;
function noise(at, length, { gain = 0.25, from = 1800, to = 0, kind = 'bandpass', q = 0.9, send = 0 } = {}) {
    if (!noiseBuffer || noiseRate !== context.sampleRate) {
        noiseRate = context.sampleRate;
        noiseBuffer = context.createBuffer(1, Math.floor(noiseRate * 1.2), noiseRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    const start = context.currentTime + at;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = kind;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, start);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, start + length);
    amp.gain.setValueAtTime(gain * level, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter).connect(amp);
    out(amp, send);
    source.start(start, Math.random() * 0.2);
    source.stop(start + length + 0.02);
}

// No two knocks on a table sound the same.
const vary = (amount) => 1 + (Math.random() - 0.5) * amount;

// ---- Instruments ----------------------------------------------------------

// A squeeze-box chord: two reeds a few cents apart on every note.
function squeeze(freqs, at, length, gain = 0.05) {
    for (const freq of freqs) {
        tone(freq, at, length, { type: 'sawtooth', gain, attack: 0.035, cutoff: 2400, detune: -7, send: 0.35 });
        tone(freq, at, length, { type: 'sawtooth', gain, attack: 0.035, cutoff: 2400, detune: 8, send: 0.35 });
    }
}

function pluck(freq, at, gain = 0.12, length = 0.26) {
    tone(freq, at, length, { type: 'triangle', gain, send: 0.3 });
    tone(freq * 2, at, length * 0.5, { type: 'square', gain: gain * 0.18, cutoff: 3200 });
}

function drum(at, gain = 0.4, pitch = 150) {
    tone(pitch, at, 0.2, { gain, slide: -(pitch - 48), send: 0.25 });
    noise(at, 0.09, { gain: gain * 0.5, from: 320, kind: 'lowpass', send: 0.25 });
}

function cannon(at, gain = 0.8) {
    noise(at, 0.05, { gain: gain * 0.5, from: 2200, kind: 'highpass' });
    tone(96, at, 0.75, { gain, slide: -68, send: 0.6 });
    noise(at, 0.65, { gain: gain * 0.6, from: 900, to: 90, kind: 'lowpass', send: 0.6 });
    noise(at + 0.12, 0.5, { gain: gain * 0.15, from: 180, kind: 'lowpass', send: 0.8 });
}

// A ship's bell: slightly out-of-tune partials.
function bell(at, freq = 1318, gain = 0.1, length = 0.9) {
    [[1, 1], [2.01, 0.5], [2.76, 0.35], [4.1, 0.18]].forEach(([ratio, level]) =>
        tone(freq * ratio, at, length / Math.sqrt(ratio), { gain: gain * level, attack: 0.002, send: 0.5 }));
}

// One coin on another.
function clink(at, gain = 0.07) {
    const base = 2700 + Math.random() * 900;
    [[1, 1], [1.47, 0.7], [2.09, 0.45]].forEach(([ratio, level]) => tone(base * ratio, at, 0.09, { gain: gain * level, attack: 0.001, send: 0.2 }));
}

// A drawn cutlass.
function shing(at, pitch = 1) {
    noise(at, 0.17, { gain: 0.3, from: 7500, to: 1500, kind: 'highpass', q: 0.6, send: 0.3 });
    tone(3100 * pitch, at + 0.02, 0.3, { gain: 0.05, slide: -500, attack: 0.002, send: 0.5 });
    tone(4650 * pitch, at + 0.02, 0.22, { gain: 0.03, attack: 0.002, send: 0.5 });
}

function whoosh(at, length = 0.16, gain = 0.12, from = 500, to = 2600) {
    noise(at, length, { gain, from, to, q: 1.4 });
}

function run(notes, at, gap, gain = 0.1) {
    notes.forEach((freq, i) => pluck(freq, at + i * gap, gain));
}

// ---- Sounds ---------------------------------------------------------------

const SOUNDS={
    card: (at, power = 1) => {
        noise(at, 0.035, { gain: 0.24 + power * 0.05, from: 2600, kind: 'highpass' });
        tone((215 - power * 22) * vary(0.14), at, 0.075, { type: 'triangle', gain: 0.26, slide: -90 });
        tone(122, at, 0.1 + power * 0.04, { gain: 0.14 + power * 0.13, slide: -74, send: 0.2 });
        if (power >= 3) drum(at, 0.45, 110);
    },
    throw: (at) => whoosh(at, 0.14, 0.1, 500, 2600 * vary(0.3)),
    // Knuckles on the table, twice.
    take: (at) => { whoosh(at, 0.1, 0.4, 1800, 5200); noise(at + 0.08, 0.02, { gain: 0.3, from: 4200, kind: 'highpass' }); },
    // And snapped into the row.
    snap: (at) => {
        noise(at, 0.022, { gain: 0.6, from: 3600, kind: 'highpass' });
        tone(310 * vary(0.08), at, 0.05, { type: 'triangle', gain: 0.3, slide: -140 });
        clink(at + 0.01, 0.04);
    },
    step: (at, index = 0) => pluck(RUN[Math.min(RUN.length - 1, index * 2)], at, 0.13),
    straight: (at) => { squeeze([N.D4, N.A4, N.D5], at, 0.45); run([N.D5, N.F5, N.A5, N.D6], at, 0.05, 0.08); },
    flush: (at) => {
        whoosh(at, 0.5, 0.2, 400, 5200);
        run([N.D5, N.F5, N.A5, N.D6, N.F6], at + 0.05, 0.045, 0.09);
        squeeze([N.D4, N.F4, N.A4], at + 0.05, 0.6);
    },
    fullhouse: (at) => { drum(at, 0.6, 120); squeeze([N.D4, N.F4, N.A4, N.D5], at, 0.6, 0.055); bell(at + 0.05, N.D5, 0.07, 0.7); },
    four: (at) => { cannon(at); squeeze([N.D3, N.A3, N.D4, N.A4], at + 0.05, 0.7, 0.06); },
    straightflush: (at) => {
        cannon(at, 0.7);
        run([N.D5, N.F5, N.A5, N.D6, N.F6], at, 0.035, 0.09);
        squeeze([N.D4, N.F4, N.A4, N.D5], at, 0.8, 0.055);
    },
    // Original ending sound signatures. The windup plays during flight; the crash waits for actual landing.
    // The last card: the whole fist comes down on the table, and the boards crack.
    finishWindup: (at) => whoosh(at, 0.16, 0.5, 300, 1800),
    finish: (at) => {
        drum(at, 0.9, 120);
        tone(70, at, 0.5, { gain: 0.6, slide: -40, send: 0.5 });
        noise(at, 0.06, { gain: 0.6, from: 2400, kind: 'highpass' });
        noise(at + 0.01, 0.25, { gain: 0.4, from: 700, to: 200, kind: 'lowpass', send: 0.5 });
        // Mugs and coins jump.
        for (let i = 0; i < 4; i += 1) clink(at + 0.07 + i * 0.05, 0.05);
    },
    // Hands thrown in the air: a flutter of cards, then they hit the floor.
    toss: (at) => {
        whoosh(at, 0.3, 0.5, 500, 3000);
        for (let i = 0; i < 9; i += 1) noise(at + 0.05 + i * 0.045 * vary(0.5), 0.03, { gain: 0.5, from: 2600 * vary(0.6) });
        for (let i = 0; i < 6; i += 1) noise(at + 0.75 + i * 0.07 * vary(0.6), 0.035, { gain: 0.35, from: 1500 * vary(0.5), send: 0.3 });
    },
    // You went out: the end of a jig.
    win: (at) => {
        run([N.A4, N.D5, N.F5, N.A5], at, 0.1, 0.13);
        squeeze([N.D4, N.A4], at, 0.38, 0.045);
        pluck(N.D6, at + 0.42, 0.16, 0.7);
        squeeze([N.D4, N.Fs4, N.A4, N.D5], at + 0.42, 0.8, 0.055);
        drum(at + 0.42, 0.5);
        for (let i = 0; i < 5; i += 1) clink(at + 0.5 + i * 0.07, 0.05);
    },
    lose: (at) => {
        squeeze([N.D4, N.F4], at, 0.32, 0.05);
        squeeze([N.Cs4, N.E4], at + 0.3, 0.6, 0.05);
        drum(at + 0.3, 0.3, 100);
    }
};

const LEVEL = {
    card: 2.5, deal: 4.4, throw: 14, pass: 1.2, clear: 2.6, chip: 3.5, stamp: 2.6, slash: 2, call: 0.73, turn: 2.8, step: 3.5, han: 1.4,
    role: 0.63, straight: 1.9, four: 0.95, fullhouse: 1.5, straightflush: 1.3, legend: 0.5, win: 0.6, lose: 0.7, finish: 1.5, finishWindup: 1.5, toss: 0.6, take: 1.6, snap: 1.2
};

export function playRoleSound(ctx,name, ...args) {
    if (!SOUNDS[name]) return;
    if (context!==ctx) { context=ctx; ({dry:master,send:room}=wire(ctx)); noiseBuffer=null; }
    level=LEVEL[name]||1;
    try { SOUNDS[name](0,...args); } finally { level=1; }
}

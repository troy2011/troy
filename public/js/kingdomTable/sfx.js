// Tarot Kingdom, table version: short sounds made on the spot with Web Audio, so no sound files are downloaded.
// The audio context is only created from a tap (browsers refuse to start it otherwise), and every failure is silent.

const STORAGE_KEY = 'troy:kingdom-table:sound';
const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093 };

let context = null;
let master = null;
let enabled = readPreference();

function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export const isOn = () => enabled;

export function setOn(value) {
    enabled = !!value;
    // The preference is a per-device convenience only.
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* Keep it for this visit. */ }
    if (enabled) unlock();
}

// Call from a tap or click.
export function unlock() {
    if (!enabled) return;
    try {
        if (!context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            context = new AudioContext();
            master = context.createGain();
            master.gain.value = 0.45;
            master.connect(context.destination);
        }
        if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { context = null; }
}

function ready() {
    return enabled && context && context.state === 'running';
}

function tone(freq, at, length, { type = 'sine', gain = 0.2, slide = 0 } = {}) {
    const start = context.currentTime + at;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), start + length);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
}

let noiseBuffer = null;
function noise(at, length, { gain = 0.25, from = 1800, to = 0, kind = 'bandpass', q = 0.9 } = {}) {
    if (!noiseBuffer) {
        noiseBuffer = context.createBuffer(1, context.sampleRate * 0.6, context.sampleRate);
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
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
    source.stop(start + length + 0.02);
}

const SOUNDS = {
    card: (at) => { noise(at, 0.07, { gain: 0.35, from: 2600 }); tone(140, at, 0.09, { gain: 0.25, slide: -60 }); },
    deal: (at) => noise(at, 0.04, { gain: 0.16, from: 3200 }),
    pass: (at) => tone(330, at, 0.08, { type: 'triangle', gain: 0.1, slide: -80 }),
    clear: (at) => noise(at, 0.36, { gain: 0.22, from: 400, to: 3400 }),
    chip: (at) => { tone(2400 + Math.random() * 300, at, 0.05, { type: 'triangle', gain: 0.09 }); tone(3300, at + 0.025, 0.06, { type: 'triangle', gain: 0.06 }); },
    stamp: (at) => { tone(110, at, 0.16, { type: 'square', gain: 0.08, slide: -40 }); noise(at, 0.1, { gain: 0.2, from: 900 }); },
    slash: (at) => noise(at, 0.18, { gain: 0.3, from: 6000, to: 900, kind: 'highpass', q: 0.6 }),
    turn: (at) => { tone(NOTE.A5, at, 0.18, { gain: 0.08 }); tone(NOTE.E6, at + 0.07, 0.24, { gain: 0.06 }); },
    han: (at, steps = 3) => {
        const notes = [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7];
        for (let i = 0; i < Math.min(notes.length, steps); i += 1) tone(notes[i], at + i * 0.07, 0.22, { type: 'triangle', gain: 0.11 });
    },
    role: (at) => { tone(NOTE.C5 / 2, at, 0.4, { type: 'sawtooth', gain: 0.06 }); tone(NOTE.G5 / 2, at, 0.4, { type: 'sawtooth', gain: 0.05 }); noise(at, 0.3, { gain: 0.18, from: 300, to: 2400 }); },
    legend: (at) => {
        [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((freq, i) => tone(freq, at + i * 0.06, 0.5, { type: 'triangle', gain: 0.1 }));
        noise(at, 0.6, { gain: 0.2, from: 200, to: 5000 });
    },
    win: (at) => {
        [NOTE.C5, NOTE.E5, NOTE.G5].forEach((freq, i) => tone(freq, at + i * 0.11, 0.16, { type: 'triangle', gain: 0.13 }));
        tone(NOTE.C6, at + 0.33, 0.6, { type: 'triangle', gain: 0.15 });
        tone(NOTE.E6, at + 0.33, 0.6, { type: 'sine', gain: 0.07 });
    },
    lose: (at) => { tone(NOTE.E5 / 2, at, 0.22, { type: 'triangle', gain: 0.1 }); tone(NOTE.C5 / 2, at + 0.2, 0.4, { type: 'triangle', gain: 0.1 }); }
};

// Plays a named sound `at` seconds from now.
export function play(name, at = 0, ...args) {
    if (!ready()) return;
    try { SOUNDS[name]?.(Math.max(0, at), ...args); } catch { /* Sound is never essential. */ }
}

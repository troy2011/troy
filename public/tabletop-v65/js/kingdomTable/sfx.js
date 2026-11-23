import * as Real from './sfxReal.js?v=seat-feedback-v1';
import {roleAccent, roleAccentClips} from './roleAccents.js?v=role-foley-v1';
// Web Audio synthesizes the base sounds; four role completions add short recorded foley.
// The audio context is only created from a tap (browsers refuse to start it otherwise), and every failure is silent.

// The source is intentionally dark and quiet; boost only the ambience bus.
const AMBIENCE_GAIN = 2;

const STORAGE_KEY = 'troy:kingdom-table:sound';

let context = null;
let master = null;
const recorded = new Map();
const scheduled = new Set();
let activeTable = false;
const cheers = new Set();
let cheerUntil = 0;
let roomTone = null;
let roleAccentUntil = 0;
let enabled = readPreference();

function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export const isOn = () => enabled;

export function setOn(value) {
    enabled = !!value;
    if (!enabled) {
        roleAccentUntil = 0;
        cancelCheers();
        for (const source of scheduled) { try { source.stop(); } catch {} }
    }
    // The preference is a per-device convenience only.
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* Keep it for this visit. */ }
    if (enabled) unlock();
    syncAmbience();
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
            master.gain.value = 0.7;
            master.connect(context.destination);
            Real.attach(context, master);
            void loadRoleAccents(context);
            void loadCheerAssets(context);
            void loadImpactAssets(context);
            void loadCueAsset(context, new URL('../../assets/tarot-kingdom-table/turn-pass-v1/', import.meta.url), 'self-turn', 'self-turn.mp3');
        }
        if (context.state === 'suspended') void context.resume().then(syncAmbience).catch(() => {});
        else syncAmbience();
    } catch { context = null; }
}

function ready() {
    return enabled && context && context.state === 'running';
}

// Plays a named sound `at` seconds from now.
export function play(name, at = 0, ...args) {
    if (!ready()) return;
    try {
        if (name === 'turn' && playRecorded('self-turn', Math.max(0, at))) return;
        if (name !== 'win' || !playRecorded('bell', Math.max(0, at, roleAccentUntil - context.currentTime))) Real.play(name, Math.max(0, at), ...args);
    } catch { /* Sound is never essential. */ }
}

// The sounds of the five-card role path and the end of a round, played now.
export function roleSound(name, ...args) {
    play(name, 0, ...args);
}

async function loadRoleAccents(ctx) {
    const base = new URL('../../assets/tarot-kingdom-table/role-foley-v1/', import.meta.url);
    await Promise.allSettled(roleAccentClips.map(async key => {
        const response = await fetch(new URL(key + '.mp3', base));
        if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (context === ctx) { recorded.set(key, buffer); if (key === 'ambience') syncAmbience(); }
    }));
}

const cheerBase = new URL('../../assets/tarot-kingdom-table/cheers-v1/', import.meta.url);
async function loadCueAsset(ctx, base, key, file) {
    try {
        const response = await fetch(new URL(file, base));
        if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (context === ctx) recorded.set(key, buffer);
    } catch { /* Leave failed audio optional. */ }
}
async function loadCheerAssets(ctx) {
    await Promise.all(['a','d','e','j','r'].map(key => loadCueAsset(ctx, cheerBase, 'cheer-' + key, key + '.mp3')));
}
const impactBase = new URL('../../assets/tarot-kingdom-table/impacts-v1/', import.meta.url);
async function loadImpactAssets(ctx) {
    await Promise.all(['role','single'].map(key => loadCueAsset(ctx, impactBase, 'impact-' + key, key + '.mp3')));
}

// Return the end of this exact play's impact, not a shared time from another play.
export function playTableImpact(kind) {
    if (!ready()) return null;
    const key = 'impact-' + kind;
    try {
        if (playRecorded(key, 0)) {
            const end = context.currentTime + recorded.get(key).duration;
            if (kind === 'single') {
                Real.playFinishCoins(0.14);
                roleAccentUntil = Math.max(roleAccentUntil, end + 0.08);
            }
            return end;
        }
        Real.play('finish', 0);
    } catch { /* The card presentation must continue. */ }
    return context.currentTime;
}
export function cancelCheers() {
    for (const cue of cheers) { try { cue.stop(); } catch {} }
    cheers.clear();
    cheerUntil = 0;
}
function playCheer(key, earliest) {
    if (!key || document.hidden) return;
    const name = 'cheer-' + key;
    const at = Math.max(earliest, cheerUntil - context.currentTime);
    if (playRecorded(name, at, 1, cheers)) cheerUntil = context.currentTime + at + recorded.get(name).duration + 0.06;
}
export function playMatchVictory() {
    if (!ready()) return;
    cancelCheers();
    playCheer('j', Math.max(0.12, roleAccentUntil - context.currentTime));
}
export function completeRole(role, impactUntil = null, cheer) {
    const foley = roleAccent(role);
    if (!foley || !ready()) return;
    try {
        const end = impactUntil ?? playTableImpact('role') ?? context.currentTime;
        const accentAt = Math.max(foley[1], end - context.currentTime);
        const clip = recorded.get(foley[0]);
        const played = playRecorded(foley[0], accentAt, foley[2]);
        const length = played ? clip.duration / foley[2] : 0.24;
        if (played) roleAccentUntil = Math.max(roleAccentUntil, context.currentTime + accentAt + length + 0.08);
        else Real.play('step', accentAt, 0); // Missing recordings use the same dry wood, never an old chord.
        playCheer(cheer, accentAt + length + 0.08);
    } catch { /* Sound is optional; the table interaction must keep going. */ }
}

function playRecorded(key, offset, rate = 1, group = null) {
    const buffer = recorded.get(key);
    if (!buffer) return false;
    const cue = context.createBufferSource();
    cue.buffer = buffer;
    cue.playbackRate.value = rate;
    cue.connect(master);
    scheduled.add(cue);
    group?.add(cue);
    cue.onended = () => { scheduled.delete(cue); group?.delete(cue); cue.disconnect(); };
    cue.start(context.currentTime + offset);
    return true;
}

function syncAmbience() {
    const buffer = recorded.get('ambience');
    if (!activeTable || document.hidden || !ready() || !buffer) {
        if (roomTone) {
            const {source,gain} = roomTone;
            roomTone = null;
            const now = context.currentTime;
            if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(now);
            else { gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value, now); }
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
            source.stop(now + 0.12);
        }
        return;
    }
    if (roomTone) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(master);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(AMBIENCE_GAIN, context.currentTime + 0.25);
    roomTone = {source,gain};
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
}

export function setTableAudio(active) {
    activeTable = active;
    syncAmbience();
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) cancelCheers(); syncAmbience(); });

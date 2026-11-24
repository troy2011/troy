import * as Real from './sfxReal.js?v=seat-feedback-v1';
import {roleAccent, roleAccentClips} from './roleAccents.js?v=role-foley-v1';
import { crowdPreviewActive, readCrowdCatalog, readCrowdCategories, selectCrowdVoices, selectRoundVoice, roundOutTier } from './roleCrowdPreview.js?v=round-score-v1';
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
const cheerEnvelopes = new Map();
// These recordings still carry audible signal close to their decoded file end.
const clippedCheerTails = new Set([
    'preview-large-264377.mp3',
    'preview-opponent-open-medium-2.mp3',
    'preview-opponent-open-small-2.mp3',
    'preview-opponent-open-small.mp3',
    'preview-opponent-reply-neutral-2.mp3',
    'preview-opponent-reply-neutral-3.mp3',
    'preview-opponent-reply-neutral.mp3',
    'preview-self-open-big-2.mp3',
    'preview-self-open-big-3.mp3',
    'preview-self-open-big.mp3',
    'preview-self-open-medium.mp3',
    'preview-self-open-small.mp3',
    'preview-self-reply-big-2.mp3',
    'preview-self-reply-big.mp3',
    'preview-self-reply-climax.mp3',
    'preview-self-reply-medium-2.mp3',
    'preview-self-reply-medium-4.mp3',
    'preview-self-reply-small-2.mp3',
    'preview-self-reply-small.mp3',
]);
let cheerUntil = 0;
let roomTone = null;
let roleAccentUntil = 0;
let previewCategories = readCrowdCategories(null);
const previewTails = new Set();
let lastVoices = [];
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
            if (crowdPreviewActive) void loadPreviewCrowd(context);
            void loadImpactAssets(context);
            for (const file of rulePropSounds) void loadCueAsset(context, propSoundBase, "prop-" + file, file + ".mp3");
            void loadCueAsset(context, new URL('../../assets/tarot-kingdom-table/turn-pass-v1/', import.meta.url), 'self-turn', 'self-turn.mp3');
        }
        if (context.state === 'suspended') void context.resume().then(syncAmbience).catch(() => {});
        else syncAmbience();
    } catch { context = null; }
}

function ready() {
    return enabled && context && context.state === 'running';
}

const propSoundBase = new URL('../../assets/tarot-kingdom-table/prop-foley-v1/', import.meta.url);
const rulePropSounds = ['knife','hourglass','mug-coin','mug-sword','mug-wand','mug-cup'];
export function playRuleProp(kind, suit) {
    if (!activeTable || document.hidden || !ready()) return;
    const key = kind === 'cut' ? 'knife' : kind === 'back' ? 'hourglass' : kind === 'lock' ? 'mug-' + suit : '';
    if (rulePropSounds.includes(key)) playRecorded('prop-' + key, 0);
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
const previewBase = new URL('../../assets/tarot-kingdom-table/role-crowd-preview/', import.meta.url);
async function loadPreviewCrowd(ctx) {
    let catalog = null;
    try {
        const res = await fetch(new URL('catalog.json', previewBase), { cache: 'no-store' });
        if (res.ok) catalog = await res.json();
    } catch { /* Default names still work if the preview has no manifest. */ }
    const sanitized = readCrowdCatalog(catalog);
    const categories = readCrowdCategories(catalog);
    if (context === ctx) previewCategories = categories;
    const files = new Set([...Object.values(sanitized).flat(),...Object.values(categories.groups).flat(),...Object.values(categories.roundOut).flat()]);
    await Promise.allSettled([...files].map(file => loadCueAsset(ctx, previewBase, 'preview-' + file, file)));
}
function playPreviewCrowd(cue, earliest) {
    if (document.hidden) return true;
    const {primary, backing} = selectCrowdVoices(cue, file=>recorded.has('preview-' + file),previewCategories,lastVoices);
    const now = context.currentTime;
    const start = Math.max(now + earliest, cheerUntil - .16);
    // Never queue a new reaction behind older crowds. Cancel pending sympathy from an
    // interrupted play and let an audible old voice release into the next hit.
    for (const tail of previewTails) {
        if (tail.until <= now + earliest || tail.retired) continue;
        tail.retired = true;
        if (tail.far && tail.start >= now + earliest) {
            try { tail.source.stop(now + earliest); } catch {}
        } else {
            const fade = Math.max(now + earliest, tail.start + (tail.far ? 0 : .145));
            tail.gain.gain.setTargetAtTime(0, fade, .018);
            try { tail.source.stop(fade + .065); } catch {}
        }
    }
    const at = Math.min(start - now, earliest + .055);
    let until = now + at;
    const playVoice = (file, offset, level, far = false) => {
        if (!file) return false;
        const id = 'preview-' + file;
        const voice = playRecorded(id, offset, 1, cheers, level, true, far);
        if (!voice) return false;
        const end = now + offset + recorded.get(id).duration;
        previewTails.add({...voice, start:now + offset, until:end, far});
        until = Math.max(until,end);
        return true;
    };
    const first = playVoice(primary, at, cue.level);
    const second = first && backing && playVoice(backing, at + cue.backing.offset, cue.backing.level, true);
    lastVoices = [first && primary, second && backing].filter(Boolean);
    if (first || second) cheerUntil = until + .025;
    return first;
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
export function cancelCheers(release = false) {
    for (const cue of cheers) {
        try {
            const envelope = release && cheerEnvelopes.get(cue);
            const now = context?.currentTime ?? 0;
            if (envelope && envelope.begin < now && envelope.end > now + .012) {
                const param = envelope.gain.gain;
                const end = Math.min(now + .10, envelope.end);
                if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
                else {
                    const current = param.value;
                    param.cancelScheduledValues(now);
                    param.setValueAtTime(current, now);
                }
                param.linearRampToValueAtTime(0, end);
                cue.stop(end);
            } else cue.stop();
        } catch {}
    }
    cheers.clear();
    cheerUntil = 0;
    previewTails.clear();
    lastVoices = [];
}
function playCheer(key, earliest, gain = 1) {
    if (!key || document.hidden) return;
    const name = 'cheer-' + key;
    const at = Math.max(earliest, cheerUntil - context.currentTime);
    if (playRecorded(name, at, 1, cheers, gain)) cheerUntil = context.currentTime + at + recorded.get(name).duration + 0.06;
}
export function playRoundVictory(own, variant = 0, winnerHan) {
    if (!ready() || document.hidden) return;
    // The round-only pool is distinct from the match-only J.
    // Do not wait behind a long preceding role crowd.
    const at = Math.max(.12, Math.min(.40, cheerUntil - context.currentTime));
    const requestedTier = roundOutTier(winnerHan);
    const file = selectRoundVoice(variant, name=>recorded.has('preview-' + name),previewCategories,lastVoices,requestedTier);
    const tier = file ? ['short','applause','exceptional'].find(name=>previewCategories.roundOut[name].includes(file)) ?? 'short' : 'short';
    const key = file ? 'preview-' + file : 'cheer-d';
    const levels = tier === 'exceptional' ? [1,.78] : tier === 'applause' ? [.86,.65] : [.68,.53];
    const cap = tier === 'short' ? .95 : Infinity;
    if (playRecorded(key, at, 1, cheers, levels[own?0:1],false,false,cap)) {
        lastVoices = file ? [file] : [];
        cheerUntil = Math.max(cheerUntil, context.currentTime + at + Math.min(cap,recorded.get(key).duration) + .06);
    }
}
export function playMatchVictory() {
    if (!ready()) return;
    cancelCheers(true);
    playCheer('j', Math.max(0.12, roleAccentUntil - context.currentTime));
}
export function completeRole(role, impactUntil = null, cheer) {
    const foley = roleAccent(role);
    if (!foley || !ready()) return;
    try {
        const end = impactUntil ?? playTableImpact('role') ?? context.currentTime;
        if (cheer?.crowdPreview) {
            if (!cheer.cue) return; // The sole match-victory cheer is still J.
            if (playPreviewCrowd(cheer.cue, Math.max(.08, end - context.currentTime + cheer.cue.offset))) return;
            // A missing recording must not quiet a play: old accent + one suitable legacy voice.
        }
        const accentAt = Math.max(foley[1], end - context.currentTime);
        const clip = recorded.get(foley[0]);
        const played = playRecorded(foley[0], accentAt, foley[2]);
        const length = played ? clip.duration / foley[2] : 0.24;
        if (played) roleAccentUntil = Math.max(roleAccentUntil, context.currentTime + accentAt + length + 0.08);
        else Real.play('step', accentAt, 0); // Missing recordings use the same dry wood, never an old chord.
        playCheer(cheer?.crowdPreview ? cheer.cue.fallback : cheer, accentAt + length + 0.08, cheer?.crowdPreview ? cheer.cue.level : 1);
    } catch { /* Sound is optional; the table interaction must keep going. */ }
}

function playRecorded(key, offset, rate = 1, group = null, volume = 1, asPreview = false, far = false, cap = Infinity) {
    const buffer = recorded.get(key);
    if (!buffer) return false;
    const cue = context.createBufferSource();
    cue.buffer = buffer;
    cue.playbackRate.value = rate;
    const isCheer = group === cheers;
    const gain = volume === 1 && !asPreview && !isCheer ? null : context.createGain();
    const filter = far ? context.createBiquadFilter() : null;
    if (filter) { filter.type = 'lowpass'; filter.frequency.value = 3100; filter.Q.value = .45; filter.connect(master); }
    if (gain) { gain.gain.value = volume; cue.connect(gain); gain.connect(filter || master); }
    else cue.connect(master);
    scheduled.add(cue);
    group?.add(cue);
    cue.onended = () => { scheduled.delete(cue); group?.delete(cue); cheerEnvelopes.delete(cue); cue.disconnect(); gain?.disconnect(); filter?.disconnect(); for (const tail of previewTails) if (tail.source === cue) previewTails.delete(tail); };
    const begin = context.currentTime + offset;
    const duration = buffer.duration / rate;
    const capped = cap < duration;
    const end = begin + Math.min(cap, duration);
    if (isCheer) cheerEnvelopes.set(cue, {gain, begin, end});
    const release = capped ? .22 : isCheer && clippedCheerTails.has(key) ? .16 : 0;
    if (gain && release) {
        gain.gain.setValueAtTime(volume, Math.max(begin, end - release));
        gain.gain.linearRampToValueAtTime(0, end);
    }
    cue.start(begin);
    if (gain && capped) cue.stop(end);
    return asPreview ? {source: cue, gain} : true;
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

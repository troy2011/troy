import { roleAccentKey } from './roleAccents.js?v=role-foley-v1';

export const crowdPreviewActive = true;


const ranks = Object.freeze({
    straight:[0, 88, 0],
    highStraight:[1, 122, 1],
    flush:[0, 175, 2],
    highFlush:[1, 206, 2],
    fullhouse:[1, 68, 0], // FinishRole fires at the second landing (2 then 3); the crowd follows the triplet.
    highFullHouse:[2, 86, 1],
    four:[1, 108, 2],
    elemental:[2, 154, 2],
    world:[2, 234, 0],
    straightflush:[2, 115, 1],
    five:[2, 124, 1],
    royal:[3, 184, 1],
    highElemental:[3, 225, 2],
    highFive:[3, 163, 2],
    highWorld:[3, 267, 0],
});
export const CROWD_FAMILIES = Object.freeze([
    'self-open-small', 'self-open-medium', 'self-open-big',
    'self-reply-small', 'self-reply-medium', 'self-reply-big', 'self-reply-climax',
    'opponent-open-small', 'opponent-open-medium', 'opponent-open-big', 'opponent-reply-neutral',
]);
const TIERS = ['small','medium','big','climax'];
const eventRoleKey = role => roleAccentKey(role) || 'straight';
const seedFor = (index, stage, signature, strength) => (index + stage + strength * 3 + signature * 5) >>> 0;
export const CROWD_CATEGORIES = Object.freeze(['small','medium','large','round-out']);

function chooseTone(enemy, neutralReply, boost, strength) {
    const tier = Math.min(2, Math.min(2,strength) + Number(boost));
    const level = neutralReply ? [.46,.51,.55][tier] : enemy ? [.57,.64,.70][tier] : [.68,.78,.91][tier];
    return {tier, category:CROWD_CATEGORIES[tier], level, fallback:enemy ? 'e' : tier === 2 ? 'r' : 'd'};
}

export function previewCrowdPlan(events,{from=0,silent=null,viewer=0}={}) {
    const results = new Map();
    let previous = null, stage = 0;
    for (const [index,event] of events.entries()) {
        if (event.type === 'clear' || (event.type === 'play' && event.kind === 'normal')) {
            previous = null; stage = 0;
        }
        if (event.type !== 'play' || !event.role || !['role','call'].includes(event.kind)) continue;
        const before = previous;
        previous = event.by;
        stage++;
        if (index < from || event.kind === 'call') continue;
        const enemy = event.by !== viewer;
        if (event === silent) { results.set(event, { crowdPreview: true, cue: null }); continue; }
        const neutralReply = enemy && before != null && before !== viewer && before !== event.by;
        const roleKey = eventRoleKey(event.role);
        const [strength, delay, signature] = ranks[roleKey] || ranks.straight;
        const reply = before != null && before !== event.by;
        const notableReply = reply && !neutralReply && stage >= 3;
        const tone = chooseTone(enemy,neutralReply,notableReply,strength);
        const variant = seedFor(index,stage,signature,strength);
        // Before a rival's response, the viewer's own prior role makes the nearby supporters more audible.
        const backing = enemy ? {
            family: 'opponent-open-' + TIERS[Math.min(2, strength)],
            level: before === viewer ? .45 : neutralReply ? .24 : .32,
            offset: (.12 + (variant % 5) * .04), variant: variant + 7,
        } : null;
        const cue = { ...tone, roleKey, stage, offset: delay / 1000, variant, backing, enemy, neutralReply };
        results.set(event,{ crowdPreview: true, cue });
    }
    return results;
}

export function readCrowdCatalog(source) {
    return Object.fromEntries(CROWD_FAMILIES.map(family => {
        const candidates = Array.isArray(source?.[family]) ? source[family] : [family + '.mp3'];
        const filenames = [...new Set(candidates.filter(name => typeof name === 'string'
            && name.startsWith(family) && /^[\w-]+\.mp3$/u.test(name)))].slice(0,6);
        return [family, filenames];
    }));
}


// Separate recordings or performances, not just edited filenames. Adjacent uses from a
// common recording are deliberately avoided even if one edit was quieter or shorter.
const sources = [
    ['self-open-medium','self-reply-small'],
    ['self-open-big-2','self-reply-big','self-reply-climax-3'],
    ['self-open-small-3','opponent-open-big-2','opponent-reply-neutral-2'],
    ['opponent-open-small-2','opponent-open-big'],
    ['opponent-open-small','opponent-open-medium-2'],
    ['self-open-big-3','self-reply-big-2','self-reply-climax-2'],
    ['self-open-big','self-reply-small-2'],
    ['self-open-small','self-open-small-2','self-open-medium-2','self-reply-small-3','self-reply-big-3','self-reply-climax','opponent-open-medium','opponent-open-big-3','opponent-reply-neutral','opponent-reply-neutral-3'],
];
const recording = new Map(sources.flatMap((files,n)=>files.map(file=>[file+'.mp3',n])));
const nearby = ['self-open-small-3','self-open-medium-4','self-reply-small-2','self-reply-climax-4','self-open-medium','self-reply-small-3'].map(file=>file+'.mp3');
const sympathizers = ['opponent-open-small-2','opponent-open-small','opponent-open-medium-2','opponent-open-big'].map(file=>file+'.mp3');
const fallbackCategories = Object.freeze({
    small: ['self-open-small-3','self-reply-small-2','self-reply-small-3','self-open-medium-4'],
    medium: ['self-open-medium','self-open-big','self-reply-big-3','self-reply-climax-4'],
    large: ['self-reply-big','self-reply-big-2','self-reply-climax','self-reply-big-4','self-reply-medium-5'],
    'round-out': ['self-open-big-2','self-reply-climax-2','self-reply-medium-4'],
});
const roundOutDefaults = Object.freeze({"short":["out-333386.mp3","out-333387.mp3"],"applause":["out-555456.mp3","self-reply-medium-4.mp3"],"exceptional":["out-581617.mp3","self-open-big-2.mp3","self-reply-climax-2.mp3"]});
const roundOutOrder = ['short','applause','exceptional'];
export function roundOutTier(winnerHan) {
    if (!Number.isFinite(winnerHan)) return 'short';
    return winnerHan >= 10 ? 'exceptional' : winnerHan >= 4 ? 'applause' : 'short';
}
const validFilename = file => typeof file === 'string' && /^[\w-]+\.mp3$/u.test(file);
export function readCrowdCategories(source) {
    const groups = Object.fromEntries(CROWD_CATEGORIES.map(key=>[
        key,[...new Set((Array.isArray(source?.categories?.[key]) ? source.categories[key]
            : fallbackCategories[key].map(name=>name+'.mp3')).filter(validFilename))].slice(0,28),
    ]));
    const origins = Object.fromEntries(Object.entries(source?.origins || {}).filter(([file,id])=>validFilename(file)
        && typeof id==='string' && /^[\w-]{1,80}$/u.test(id)));
    const roundOut = Object.fromEntries(roundOutOrder.map(key=>[
        key,[...new Set((Array.isArray(source?.roundOut?.[key]) ? source.roundOut[key] : roundOutDefaults[key]).filter(validFilename))].slice(0,12),
    ]));
    return {groups,origins,roundOut};
}

function pickVoice(pool, playable, origin, tracked, extra, seed) {
    const filtered = [...new Set(pool)].filter(file=>playable(file));
    if (!filtered.length) return null;
    const start = seed % filtered.length;
    const shifted = [...filtered.slice(start), ...filtered.slice(0,start)];
    return shifted.find(file=>!tracked.has(origin(file)) && origin(file)!==extra)
        || shifted.find(file=>origin(file)!==extra) || null;
}

export function selectCrowdVoices(cue, playable, categories, prior=[]) {
    const {groups,origins} = categories;
    const origin = file => origins[file] ?? recording.get(file) ?? file;
    const tracked = new Set(prior.map(origin));
    const pick = (pool,extra,seed) => pickVoice(pool,playable,origin,tracked,extra,seed);
    const group = groups[cue.category] || [];
    // Keep the perceived intensity tier rather than jumping straight to unrelated fallback clips.
    // The near accent fades in level for opponents, who also get a separate, delayed sigh.
    const primary = pick(group, null, cue.variant) || pick(nearby,null,cue.variant);
    const backing = cue.backing && pick(sympathizers, primary ? origin(primary) : null, cue.backing.variant);
    return {primary, backing};
}

export function selectRoundVoice(variant, playable, categories, prior=[], tier='short') {
    const {origins,roundOut} = categories;
    const origin = file => origins[file] ?? recording.get(file) ?? file;
    const tracked = new Set(prior.map(origin));
    // Missing media can only lower the intensity, never turn an ordinary finish into a fanfare.
    for(let i=Math.max(0,roundOutOrder.indexOf(tier));i>=0;i--) {
        const file=pickVoice(roundOut[roundOutOrder[i]],playable,origin,tracked,null,variant >>> 0);
        if(file) return file;
    }
    return null;
}

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
const chooseTone = (own, reply, strength, stage) => {
    if (!own) return { family: 'opponent-open-' + TIERS[Math.min(2, strength)], level: [.55,.59,.62][Math.min(2,strength)], fallback: 'e' };
    if (!reply) return { family: 'self-open-' + TIERS[Math.min(2, strength)], level: [.67,.72,.77][Math.min(2,strength)], fallback: 'd' };
    const tier = Math.min(3, strength + (stage >= 3 ? 1 : 0) + (stage >= 4 ? 1 : 0));
    return { family: 'self-reply-' + TIERS[tier], level: [.80,.84,.92,1][tier], fallback: stage >= 3 ? 'r' : 'd' };
};

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
        const tone = neutralReply ? { family: 'opponent-reply-neutral', level: .46, fallback: 'e' } : chooseTone(!enemy,reply,strength,stage);
        const variant = seedFor(index,stage,signature,strength);
        const noteworthy = !enemy && (strength === 3 || (reply && (strength >= 2 || stage >= 3)));
        // Before a rival's response, the viewer's own prior role makes the nearby supporters more audible.
        const backing = enemy ? {
            family: 'opponent-open-' + TIERS[Math.min(2, strength)],
            level: before === viewer ? .45 : neutralReply ? .24 : .32,
            offset: (.12 + (variant % 5) * .04), variant: variant + 7,
        } : null;
        const cue = { ...tone, roleKey, stage, offset: delay / 1000, variant, backing, noteworthy, enemy, neutralReply };
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
const origin = file => recording.get(file) ?? file;
const nearby = [
    'self-open-small-3','self-open-medium-4','self-reply-small-2','self-reply-climax-4','self-open-medium','self-reply-small-3',
].map(file=>file+'.mp3');
const neutral = ['opponent-reply-neutral-2','opponent-reply-neutral','opponent-reply-neutral-3','self-open-small-3'].map(file=>file+'.mp3');
const sympathizers = ['opponent-open-small-2','opponent-open-small','opponent-open-medium-2','opponent-open-big'].map(file=>file+'.mp3');

export function selectCrowdVoices(cue, playable, catalog, prior=[]) {
    const tracked = new Set(prior.map(origin));
    const choose = (pool, extra, seed) => {
        const filtered = [...new Set(pool)].filter(file=>playable(file));
        if (!filtered.length) return null;
        const start = seed % filtered.length;
        const shifted = [...filtered.slice(start), ...filtered.slice(0,start)];
        return shifted.find(file=>!tracked.has(origin(file)) && origin(file)!==extra)
            || shifted.find(file=>origin(file)!==extra) || null;
    };
    // The stronger own replies may use actual applause; opener and opponent plays
    // instead read as people beside the table, with a separate quiet supporter behind.
    const primary = choose(cue.noteworthy ? [...(catalog[cue.family] || []), ...nearby]
        : cue.neutralReply ? neutral : nearby, null, cue.variant);
    const backing = cue.backing && choose(sympathizers, primary ? origin(primary) : null, cue.backing.variant);
    return {primary, backing};
}

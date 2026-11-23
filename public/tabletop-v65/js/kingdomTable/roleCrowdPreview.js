import { roleAccentKey } from './roleAccents.js?v=role-foley-v1';

export const crowdPreviewOn = search => new URLSearchParams(search).get('crowdPreview') === '1';
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
        const cue = { ...tone, roleKey, stage, offset: delay / 1000, variant: seedFor(index,stage,signature,strength) };
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

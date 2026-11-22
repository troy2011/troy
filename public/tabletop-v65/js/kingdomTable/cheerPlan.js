// Derive the sequence from authoritative public history, not local counters.
export function roleCheers(events, {from = 0, silent = null, viewer = 0} = {}) {
    const cues = new Map();
    let count = 0;
    let previousFive = null;
    events.forEach((event, i) => {
        if (event.type === 'clear') { count = 0; previousFive = null; }
        if (event.type === 'play' && event.kind === 'normal') previousFive = null;
        if (event.type !== 'play' || !event.role || (event.kind !== 'role' && event.kind !== 'call')) return;
        count++;
        const opposite = event.by !== viewer;
        const oppositeReply = opposite && previousFive !== null && previousFive !== viewer && previousFive !== event.by;
        previousFive = event.by;
        if (i >= from && event !== silent && !oppositeReply) cues.set(event, opposite ? 'e' : event.kind === 'call' ? 'a' : count >= 3 ? 'r' : 'd');
    });
    return cues;
}

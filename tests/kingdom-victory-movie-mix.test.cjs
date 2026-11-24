const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const ui = readFileSync(join(__dirname, '../public/tabletop-v65/js/kingdomTable/ui.js'), 'utf8');
const movieSource = ui.slice(ui.indexOf('function victoryMovie('), ui.indexOf('function pauseVictoryMovie('));
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ reduced = false, failures = 0, effects = true } = {}) {
    const timers = new Set(), created = [], playStates = [];
    let cues = 0;
    function element(tag, className) {
        const events = {};
        const node = {
            tag, className, isConnected: true, muted: false, children: [],
            setAttribute() {}, addEventListener(type, cb) { events[type] = cb; },
            emit(type) { events[type]?.(); },
            append(child) { this.children.push(child); },
            insertBefore(child) { this.children.unshift(child); },
            remove() { this.isConnected = false; }, pause() {},
            play() { playStates.push(this.muted); return failures-- > 0 ? Promise.reject(new Error('Autoplay blocked')) : Promise.resolve(); }
        };
        created.push(node);
        return node;
    }
    const context = {
        VICTORY_MOVIE_DIR: '/movies', FULL_HEIGHT_MOVIE_V2: new Set(), el: element,
        avatarImage: (_, cls) => element('img', cls), Sfx: { isOn: () => effects },
        $: () => ({ hidden: false }), document: { hidden: false }, reducedMotion: () => reduced,
        queueMicrotask, setTimeout: (cb) => { timers.add(cb); return cb; }, clearTimeout: cb => timers.delete(cb)
    };
    const movie = vm.runInNewContext(movieSource + '\nvictoryMovie', context);
    movie({ id: 0, name: 'Player' }, '/still.webp', () => { cues++; });
    return { created, playStates, timers, get cues() { return cues; } };
}
test('starts result music on playing, before movie ends; controller-free video set to 28%', async () => {
    const h = harness();
    await flush();
    assert.deepEqual(h.playStates, [false]);
    const video = h.created.find(e => e.tag === 'video');
    assert.equal(video.controls, false);
    assert.equal(video.playsInline, true);
    assert.equal(video.volume, .28);
    assert.equal(h.created.some(e => e.tag === 'button'), false);
    assert.equal(h.cues, 0);
    video.emit('playing');
    assert.equal(h.cues, 1);
    video.emit('playing'); video.emit('ended');
    assert.equal(h.cues, 1);
    assert.equal(h.timers.size, 0);
});
test('muted autoplay fallback still starts music only once at playback; double rejection leaves poster and starts music', async () => {
    const h = harness({ failures: 1 });
    await flush();
    assert.deepEqual(h.playStates, [false, true]);
    h.created.find(e => e.tag === 'video').emit('playing');
    assert.equal(h.cues, 1);
    const blocked = harness({ failures: 2 });
    await flush();
    assert.equal(blocked.cues, 1);
    assert.equal(blocked.created.find(e => e.tag === 'video').isConnected, false);
});
test('reduced animation shows a still and starts BGM; slow video cannot suppress BGM indefinitely', async () => {
    const reduced = harness({ reduced: true });
    await flush();
    assert.equal(reduced.cues, 1);
    assert.equal(reduced.created.some(e => e.tag === 'video'), false);
    const slow = harness();
    await flush();
    slow.timers.forEach(cb => cb());
    assert.equal(slow.cues, 1);
    slow.created.find(e => e.tag === 'video').emit('playing');
    assert.equal(slow.cues, 1);
});

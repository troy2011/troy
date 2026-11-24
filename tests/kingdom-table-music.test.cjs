const { test } = require('node:test');
const assert = require('node:assert/strict');
const flush = () => new Promise(resolve => setImmediate(resolve));
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const setup = async (fetchAudio) => {
    const { createMusic } = await import(pathToFileURL(resolve(__dirname, '../public/tabletop-v65/js/kingdomTable/music.js')));
    const starts = [];
    const gains = [];
    const makeNode = () => ({ connect() {}, disconnect() {} });
    const context = {
        state: 'running', currentTime: 1, destination: {},
        resume() { this.state = 'running'; return Promise.resolve(); },
        suspend() { this.state = 'suspended'; return Promise.resolve(); },
        decodeAudioData(name) { return Promise.resolve({ duration: 180, name }); },
        createGain() {
            const node = Object.assign(makeNode(), { gain: {
                setTargetAtTime(value) { gains.push(value); },
                setValueAtTime() {}, linearRampToValueAtTime() {}
            } });
            return node;
        },
        createBufferSource() {
            return Object.assign(makeNode(), {
                start(_when, offset) { this.seekOffset = offset; starts.push(this); },
                stop() { this.onended?.(); }
            });
        }
    };
    const player = createMusic({ makeContext: () => context, fetchAudio: fetchAudio ?? (async url => url.pathname.split('/').at(-1)) });
    return { player, starts, gains, context };
};
test('gesture unlock, stale title download cannot bleed into a match, repeat events cannot restart a playing track', async () => {
    let deliverTitle;
    const { player, starts } = await setup(async url => {
        const name = url.pathname.split('/').at(-1);
        return name === 'title.mp3' ? new Promise(resolve => { deliverTitle = () => resolve(name); }) : name;
    });
    player.scene('title');
    await flush();
    assert.equal(starts.length, 0);
    player.unlock();
    await flush();
    player.scene('match');
    player.scene('match');
    await flush();
    deliverTitle();
    await flush();
    assert.deepEqual(starts.map(s => s.buffer.name), ['match.mp3']);
    assert.deepEqual([starts[0].loop, starts[0].loopStart, starts[0].loopEnd], [true, 37.384, 86.912]);
});
test('audible final movie defers one-shot; muted or ended movie releases sound; repeated result does not replay', async () => {
    const { player, starts, gains, context } = await setup();
    player.unlock();
    player.scene('match'); await flush();
    player.ducked(true);
    assert.equal(gains.at(-1), 0.10);
    player.scene('victory', 'one'); await flush();
    assert.equal(starts.length, 1);
    player.ducked(false); await flush();
    assert.equal(starts.at(-1).buffer.name, 'victory.mp3');
    assert.equal(starts.at(-1).loop, undefined);
    player.visible(false); assert.equal(context.state, 'suspended');
    player.visible(true); await flush();
    starts.at(-1).onended();
    player.scene('victory', 'one'); await flush();
    assert.equal(starts.length, 2);
    player.scene('defeat', 'two'); await flush();
    assert.equal(starts.at(-1).buffer.name, 'defeat.mp3');
    assert.equal(starts.length, 3);
});
test('music mute prevents title starts and title asset has no boundary jump', async () => {
    const { player, starts } = await setup();
    player.enabled(false);
    player.scene('title');
    player.unlock();
    await flush();
    assert.equal(starts.length, 0);
    player.enabled(true);
    player.unlock();
    await flush();
    assert.equal(starts.at(-1).buffer.name, 'title.mp3');
    assert.equal(starts.at(-1).loop, undefined);
});

test('title handoff resumes the actual position, including after leaving home app tabs', async () => {
    const { player, starts, context } = await setup();
    player.scene('title');
    player.unlock(); await flush();
    context.currentTime += 18;
    assert.equal(player.titlePosition(), 18);
    player.scene(null);
    assert.equal(player.titlePosition(), 18);
    player.scene('title'); await flush();
    assert.equal(starts.at(-1).seekOffset, 18);
    context.currentTime += 3;
    const nextPage = await setup();
    nextPage.player.restoreTitle(player.titlePosition());
    nextPage.player.scene('title');
    await flush();
    assert.equal(nextPage.starts.length, 0);
    nextPage.player.unlock(); await flush();
    assert.equal(nextPage.starts[0].seekOffset, 21);
});
test('home and tabletop share BGM mute and tab-local title position', async () => {
    const { bindMusicSession, readTitleBookmark } = await import(pathToFileURL(resolve(__dirname, '../public/tabletop-v65/js/kingdomTable/musicSession.js')));
    const fakeTarget = () => {
        const events = {};
        return {
            addEventListener(type, fn) { (events[type] ||= []).push(fn); },
            emit(type, event = {}) { events[type]?.forEach(fn => fn(event)); }
        };
    };
    const memoryStorage = () => {
        const items = new Map();
        return { getItem: k => items.get(k) ?? null, setItem: (k,v) => items.set(k,v) };
    };
    const preferences = memoryStorage(), session = memoryStorage();
    const bind = (s) => {
        const doc = Object.assign(fakeTarget(), { hidden: false });
        const win = Object.assign(fakeTarget(), { localStorage: preferences, sessionStorage: session });
        const checkbox = fakeTarget();
        bindMusicSession({ player: s.player, checkbox, doc, win, syncScene: () => s.player.scene('title') });
        return { doc, win, checkbox };
    };
    const homePlayer = await setup();
    const home = bind(homePlayer);
    home.doc.emit('click', { isTrusted: false }); await flush();
    assert.equal(homePlayer.starts.length, 0);
    home.doc.emit('click', { isTrusted: true }); await flush();
    homePlayer.context.currentTime += 27;
    home.win.emit('pagehide');
    assert.equal(readTitleBookmark(session), 27);
    assert.equal(readTitleBookmark(session, Date.now() + 31 * 60 * 1000), null);
    const tablePlayer = await setup();
    const table = bind(tablePlayer); await flush();
    assert.equal(tablePlayer.starts[0].seekOffset, 27);
    table.checkbox.checked = false;
    table.checkbox.emit('change', { isTrusted: true });
    table.win.emit('pagehide');
    home.win.emit('pageshow', { persisted: true }); await flush();
    assert.equal(home.checkbox.checked, false);
    assert.equal(homePlayer.starts.length, 1);
});

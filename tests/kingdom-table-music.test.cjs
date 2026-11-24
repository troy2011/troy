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
                start() { starts.push(this); },
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

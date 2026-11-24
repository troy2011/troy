const ROOT = new URL('../../assets/tarot-kingdom-table/music-v1/', import.meta.url);
export const TRACKS = {
    title: { file: 'title.mp3', gain: 0.24, repeatAfter: 0.4 },
    match: { file: 'match.mp3', gain: 0.16, loop: [37.384, 86.912] },
    victory: { file: 'victory.mp3', gain: 0.25, oneShot: true },
    defeat: { file: 'defeat.mp3', gain: 0.25, oneShot: true }
};

export function createMusic({ makeContext, fetchAudio, tracks = TRACKS, onError = () => {} }) {
    let context, bus, voice, gap = 0, revision = 0, loading = null;
    let scene = null, resultKey = null, enabled = true, visible = true;
    let titleBookmark = null;
    const buffers = new Map();
    const played = new Set();

    const clear = () => {
        revision += 1;
        clearTimeout(gap);
        gap = 0;
        loading = null;
        if (voice) {
            const { source, gain } = voice;
            voice = null;
            source.onended = () => { source.disconnect(); gain.disconnect(); };
            try {
                gain.gain.setTargetAtTime(0, context.currentTime, 0.025);
                source.stop(context.currentTime + 0.075);
            } catch {
                source.disconnect();
                gain.disconnect();
            }
        }
    };

    function volume() {
        if (bus) bus.gain.setTargetAtTime(!enabled || !visible ? 0 : 1, context.currentTime, 0.04);
    }

    function load(config) {
        if (!buffers.has(config.file)) {
            const buffer = Promise.resolve().then(() => fetchAudio(new URL(config.file, ROOT))).then(bytes => context.decodeAudioData(bytes));
            buffers.set(config.file, buffer);
            buffer.catch(() => { if (buffers.get(config.file) === buffer) buffers.delete(config.file); });
        }
        return buffers.get(config.file);
    }

    function sync() {
        const config = tracks[scene];
        if (!enabled || !visible || !context || context.state !== 'running' || !config || voice || gap || loading !== null) return;
        if (config.oneShot && played.has(resultKey)) return;
        const token = revision;
        const key = resultKey;
        loading = token;
        void load(config).then(buffer => {
            if (token !== revision || !enabled || !visible) return;
            const source = context.createBufferSource();
            const gain = context.createGain();
            source.buffer = buffer;
            gain.gain.setValueAtTime(0, context.currentTime);
            gain.gain.linearRampToValueAtTime(config.gain, context.currentTime + 0.08);
            if (config.loop && config.loop[0] >= 0 && config.loop[1] <= buffer.duration && config.loop[0] < config.loop[1]) {
                source.loop = true;
                [source.loopStart, source.loopEnd] = config.loop;
            }
            source.connect(gain);
            gain.connect(bus);
            source.onended = () => {
                source.disconnect(); gain.disconnect();
                if (voice?.source !== source) return;
                voice = null;
                if (scene === 'title') titleBookmark = 0;
                if (!config.oneShot) {
                    gap = setTimeout(() => { gap = 0; sync(); }, (config.repeatAfter ?? 0.7) * 1000);
                }
            };
            const offset = scene === 'title' && titleBookmark != null && titleBookmark + 0.15 < buffer.duration ? titleBookmark : 0;
            source.start(0, offset);
            voice = { source, gain, offset, startedAt: context.currentTime };
            if (scene === 'title') titleBookmark = offset;
            if (config.oneShot) played.add(key);
        }).catch(onError).finally(() => { if (loading === token) loading = null; });
    }

    return {
        unlock() {
            if (!enabled) return;
            try {
                if (!context) {
                    context = makeContext();
                    if (!context) return;
                    bus = context.createGain();
                    bus.connect(context.destination);
                    volume();
                    context.addEventListener?.('statechange', sync);
                }
                if (context.state === 'running') sync();
                else void context.resume().then(sync, onError);
            } catch (error) { onError(error); }
        },
        titlePosition() {
            if (scene === 'title' && voice) return Math.max(0, voice.offset + context.currentTime - voice.startedAt);
            return titleBookmark;
        },
        restoreTitle(offset) {
            if (!Number.isFinite(offset) || offset < 0) return;
            if (scene === 'title' && voice && Math.abs(this.titlePosition() - offset) > .15) clear();
            titleBookmark = offset;
            sync();
        },
        scene(next, key = null) {
            if (scene !== next || resultKey !== key) {
                if (scene === 'title') titleBookmark = this.titlePosition();
                scene = next;
                resultKey = key;
                clear();
            }
            sync();
        },
        enabled(next) {
            if (enabled !== next) {
                enabled = next;
                if (!enabled) {
                    if (scene === 'title') titleBookmark = this.titlePosition();
                    clear();
                }
                volume();
            }
            sync();
        },
        visible(next) {
            visible = next;
            volume();
            if (context && !visible && context.state === 'running') void context.suspend().catch(onError);
            if (context && visible && enabled && context.state === 'suspended') void context.resume().then(sync, onError);
            sync();
        },
        prepare(next) {
            if (enabled && context && tracks[next]) void load(tracks[next]).catch(onError);
        }
    };
}

export const Music = createMusic({
    makeContext: () => {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        return Audio ? new Audio() : null;
    },
    fetchAudio: async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Music unavailable: ' + response.status);
        return response.arrayBuffer();
    }
});

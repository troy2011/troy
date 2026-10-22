const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL, fileURLToPath } = require('node:url');
function seeded(seed) { let n = seed >>> 0; return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
async function loadKingdomEngine(root, options = {}) {
    if (!vm.SourceTextModule)
        throw Error('Run Node with --experimental-vm-modules');
    const publicRoot = path.resolve(root, 'public');
    const sourcePath = options.sourcePath || path.join(publicRoot, 'js/tarotKingdom.js');
    let now = 1000000, timerId = 0;
    const timers = new Map();
    const noop = () => { };
    const element = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, append: noop, appendChild: noop, remove: noop, setAttribute: noop, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 0, height: 0 }), addEventListener: noop });
    const document = { hidden: true, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: element, addEventListener: noop, documentElement: element(), body: element() };
    const math = Object.create(Math);
    math.random = seeded(1);
    class TestDate extends Date {
        static now() { return now; }
    }
    const context = vm.createContext({
        console: { log: noop, warn: noop, error: noop }, document, Math: math, Date: TestDate,
        URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone, Set, Map,
        performance: { now: () => now }, crypto: { randomUUID: () => 'local-simulation-only' },
        location: { search: '', href: 'http://127.0.0.1/tarot-kingdom-preview.html' },
        navigator: { vibrate: noop },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        setTimeout: (fn, ms = 0) => { const id = ++timerId; timers.set(id, { fn, at: now + Number(ms || 0) }); return id; },
        clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval: noop,
        requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
        fetch: async (url) => {
            const u = new URL(String(url), 'http://local.invalid/');
            if (u.origin !== 'http://local.invalid' && u.protocol !== 'file:')
                throw Error('Network forbidden in engine simulation');
            const file = u.protocol === 'file:' ? fileURLToPath(u) : path.resolve(publicRoot, '.' + u.pathname);
            if (!file.startsWith(publicRoot + path.sep))
                throw Error('Invalid local fixture path');
            const text = fs.readFileSync(file, 'utf8');
            return { ok: true, json: async () => JSON.parse(text), text: async () => text };
        },
        Image: class {
            set src(_value) { }
        }
    });
    context.window = context;
    context.window.__TAROT_KINGDOM_PREVIEW__ = true;
    context.window.addEventListener = noop;
    const modules = new Map(), sources = new Map();
    function importNames(source, specifier) {
        const names = new Set();
        for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
            if (m[2] === specifier)
                for (const name of m[1].split(',')) {
                    const key = name.trim().split(/\s+as\s+/)[0];
                    if (key)
                        names.add(key);
                }
        }
        return [...names];
    }
    const hook = `
    // Test-only adapter is appended in memory; no debug mutation API is shipped.
    render = () => {}; scheduleNpc = () => {}; triggerKingdomActionFx = () => {};
    triggerKingdomTrickSceneFlash = () => {}; startDrawHandFlip = () => {};
    onPlayerDrewCard = () => {}; captureKingdomCardDealFx = () => null;
    preloadKingdomMonsterAnimations = async () => {};
    let testMetrics, seenWorldOpenings=new Set();
    const actualDrawOne = drawOneKingdomMixedCard;
    drawOneKingdomMixedCard = (pi, reason) => { const result=actualDrawOne(pi,reason); if(result) {testMetrics.forcedDraws++; if(reason==='blocked-leader')testMetrics.leaderDraws++; if(reason==='world')testMetrics.worldDraws++;} return result; };
    globalThis.__kingdomLog = text => { if(testMetrics && String(text).includes('親流れ'))testMetrics.leaderPasses++; };
    const actualOpeningCheck = hasLegalKingdomOpening;
    hasLegalKingdomOpening = pi => {
      const result=actualOpeningCheck(pi), hand=s?.players?.[pi]?.hand;
      if(!s.trick && hand?.length===1 && hand[0].kind==='major' && Number(hand[0].number)===21){
        const key=s.revision+':'+pi;
        if(!seenWorldOpenings.has(key)){
          seenWorldOpenings.add(key);testMetrics.worldLastOpeningChecks++;
          if(result)testMetrics.worldLastOpeningLegal++;else testMetrics.worldLastOpeningBlocked++;
        }
      }
      return result;
    };
    const actualRecord = recordKingdomBlockedLeaderDraw;
    recordKingdomBlockedLeaderDraw = pi => { const r=actualRecord(pi); if(r.knockedOut)testMetrics.forcedDrawKos++; return r; };
    const actualRetry = startKingdomDrawRetry;
    startKingdomDrawRetry = () => {
      const seats=getActionableKingdomSeats(), visited=s.blockedLeaderSeats||[];
      const blockedAll=seats.every(seat=>visited.includes(seat));
      const canDraw=s.drawDeck.length>0 && seats.some(seat=>s.players[seat].hand.length<getKingdomHandLimit());
      testMetrics.retryReason=blockedAll&&!canDraw ? 'draw-no-opening-no-refill' : 'unresolved-retry-guard';
      actualRetry();
    };
    export const testEngine = {
      resetMetrics: () => { seenWorldOpenings=new Set();testMetrics={forcedDraws:0,leaderDraws:0,worldDraws:0,leaderPasses:0,forcedDrawKos:0,worldLastOpeningChecks:0,worldLastOpeningLegal:0,worldLastOpeningBlocked:0,retryReason:null}; return testMetrics; },
      metrics: () => testMetrics,
      state: () => s, freshState: () => initState(),
      scenario: options => { seenWorldOpenings=new Set();testMetrics={forcedDraws:0,leaderDraws:0,worldDraws:0,leaderPasses:0,forcedDrawKos:0,worldLastOpeningChecks:0,worldLastOpeningLegal:0,worldLastOpeningBlocked:0,retryReason:null}; kingdomExplorationSession=null; return buildTarotKingdomDebugBattleState(options); },
      setExploration: context => { kingdomExplorationSession=context ? {context} : null; },
      deck: () => mkDrawDeck(),
      setup: deck => setupHand({ drawDeck: deck }),
      startOpening: () => playOpeningDealCinematic(),
      legal: pi => [...setMoves(pi),...roleMoves(pi),...callMoves(pi)],
      set: (pi,indexes) => { const b=buildSetPlay(pi,indexes); return b.ok ? {...b,validation:validatePlay(b.play,'normal')} : b; },
      validate: (play,mode='normal') => validatePlay(play,mode),
      rebuild: (pi,selectedCardIds) => rebuildKingdomPlayFromAction(pi,{selectedCardIds}),
      play: (pi,play) => applyPlay(pi,play),
      pass: pi => passAction(pi),
      resolveLeader: pi => resolveEmptyFieldLeader(pi),
      drawPlan: pi => npcChooseDrawPlan(pi),
      skipDraw: pi => skipDrawChoice(pi),
      skipJudgment: () => skipJudgmentPick(),
      trashOptions: pi => twelveTrashOptions(pi),
      trash: id => applyTwelveTrashPick(id),
      resolveTransition: () => {if(s.transition){s.transition.endsAt=0; resolveKingdomTransition();}},
      effects: play => applySetEffects(play),
      publicState: () => serializeStateForNet(),
      deserialize: payload => deserializeStateFromNet(payload)
      , random: fn => { kingdomCombatRandom=fn; kingdomNpcRandom=fn; }
    };
  `;
    async function getModule(file, isEntry = false) {
        const key = path.resolve(file);
        if (modules.has(key))
            return modules.get(key);
        let source = isEntry ? (options.sourceText || fs.readFileSync(sourcePath, 'utf8')) : fs.readFileSync(key, 'utf8');
        if (isEntry)
            source = source.replace('const log = (m) => {', 'const log = (m) => { globalThis.__kingdomLog?.(m);') + hook;
        const mod = new vm.SourceTextModule(source, { context, identifier: pathToFileURL(key).href, initializeImportMeta: meta => { meta.url = pathToFileURL(key).href; } });
        modules.set(key, mod);
        sources.set(mod.identifier, source);
        return mod;
    }
    async function linker(specifier, referencing) {
        const stripped = specifier.split('?')[0];
        if (stripped.startsWith('.') && /\/(?:tarotKingdom[^/]*|pixelMonstersManifest|avatarCombat)\.js$/.test(stripped)) {
            return getModule(path.resolve(path.dirname(fileURLToPath(referencing.identifier)), stripped));
        }
        const names = importNames(sources.get(referencing.identifier) || '', specifier);
        const values = Object.fromEntries(names.map(name => [name, name === 'PIXEL_MONSTER_COMPANION_OFFSET_Y' ? 0 : name === 'PIXEL_MONSTER_COMPANION_SCALE' ? 1 : name.startsWith('getMy') ? (() => ({})) : (() => { throw Error('External/presentation dependency called: ' + name); })]));
        const stub = new vm.SyntheticModule(names, function () { for (const name of names)
            this.setExport(name, values[name]); }, { context });
        return stub;
    }
    const entry = await getModule(path.join(publicRoot, 'js/tarotKingdom.js'), true);
    await entry.link(linker);
    await entry.evaluate();
    const ready = modules.get(path.resolve(publicRoot, 'js/tarotKingdomEffects.js'))?.namespace.TAROT_KINGDOM_ARCANA_EFFECTS_READY;
    if (ready)
        await ready;
    const api = entry.namespace.testEngine;
    api.resetMetrics();
    return {
        api, context,
        seed: seed => { math.random = seeded(seed); now = 1000000; timers.clear(); },
        tickTimer: () => {
            const pending = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
            if (!pending)
                return false;
            timers.delete(pending[0]);
            now = Math.max(now, pending[1].at);
            pending[1].fn();
            return true;
        },
        clearTimers: () => timers.clear()
    };
}
module.exports = { loadKingdomEngine, seeded };

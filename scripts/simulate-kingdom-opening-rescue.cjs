// Uses the actual browser rules in an isolated VM. Only presentation, clocks,
// network adapters and fixture construction are replaced; rules are not reimplemented.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const { loadKingdomEngine, seeded } = require('../tests/helpers/kingdom-engine-vm.cjs');
const root = path.resolve(__dirname, '..');
function arg(name, fallback) { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; }
const seedCount = Number(arg('seeds', 100)), maxTurns = Number(arg('max-turns', 1000));
const baseline = arg('baseline', '2c385002b1c9d075d17c696ad691349e189f3992');
const output = path.resolve(arg('out', path.join(root, 'test-results/kingdom-opening-rescue-simulation.json')));
const modes = arg('modes', 'hp-zero,hand-empty').split(','), policies = arg('policies', 'shed,conserve').split(',');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function pick(plays, policy) {
    return plays.sort((a, b) => {
        const ac = a.selectedIds?.length || a.cardsHand.length, bc = b.selectedIds?.length || b.cardsHand.length;
        return (policy === 'shed' ? bc - ac : ac - bc) || Number(a.setPower ?? a.role?.strength ?? 0) - Number(b.setPower ?? b.role?.strength ?? 0) || a.selectedIds.join('|').localeCompare(b.selectedIds.join('|'));
    })[0];
}
function percentile(xs, q) { if (!xs.length)
    return null; const a = [...xs].sort((x, y) => x - y); return a[Math.ceil(q * a.length) - 1]; }
async function runRound(engine, deck, config) {
    const { api } = engine;
    engine.seed(config.seed + 100000);
    api.random(seeded(config.seed + 200000));
    api.scenario({ withTrick: false, playerCount: config.players, rules: { openingRescueVersion: config.variant === 'proposal' ? 1 : 0, enemyDefeatMode: config.mode } });
    const uniform = structuredClone(api.state().players[0].character);
    api.state().players.forEach(p => { p.character = structuredClone(uniform); p.maxHp = uniform.combat.maxHp; p.hp = p.maxHp; });
    api.setup(deck);
    const state = api.state(), hands = state.players.map(p => p.hand.slice());
    state.players.forEach((p, i) => { p.hand = hands[(i + config.rotation) % config.players]; });
    const initialHash = sha(JSON.stringify({ hands: state.players.map(p => p.hand.map(c => c.id)), deck: state.drawDeck.map(c => c.id), field: state.trick?.cardsTable?.map(c => c.id), turn: state.turn }));
    const worldInitial = state.players.flatMap((p, i) => p.hand.some(c => c.kind === 'major' && c.number === 21) ? [i] : []);
    const worldEver = new Set(worldInitial);
    api.startOpening();
    for (let i = 0; i < 100 && ['openingDeal', 'openingCinematic'].includes(api.state().phase); i++)
        if (!await engine.tickTimer())
            break;
    let actions = 0, budgetSteps = 0, worldLastOpening = 0, status = 'turn-limit', winner = null;
    const trace = [];
    try {
        while (budgetSteps++ < maxTurns * 8) {
            const s = api.state();
            s.players.forEach((p, i) => { if (p.hand.some(c => c.kind === 'major' && c.number === 21))
                worldEver.add(i); });
            if (s.phase === 'roundOutCinematic') {
                status = 'winner';
                winner = s.turn;
                break;
            }
            if (s.phase === 'roundDraw' || s.transition?.kind === 'roundDrawRetry') {
                status = api.metrics().retryReason || 'unresolved-round-draw';
                break;
            }
            if (s.battle?.outcome === 'defeat') {
                status = 'party-defeat';
                break;
            }
            if (actions + api.metrics().leaderPasses + api.metrics().forcedDrawKos >= maxTurns)
                break;
            if (s.transition) {
                api.resolveTransition();
                continue;
            }
            if (s.phase === 'draw') {
                api.skipDraw(s.pendingDraw);
                continue;
            }
            if (s.phase === 'judgment') {
                api.skipJudgment();
                continue;
            }
            if (s.phase === 'trash') {
                const choices = api.trashOptions(s.pendingTrash);
                if (!choices.length) {
                    status = 'unresolved-trash';
                    break;
                }
                api.trash(choices[0].cardId);
                continue;
            }
            if (s.phase !== 'turn') {
                status = 'unresolved-phase:' + s.phase;
                break;
            }
            if (!s.trick) {
                api.resolveLeader(s.turn);
                if (s.phase !== 'turn' || s.transition)
                    continue;
            }
            const pi = s.turn, plays = api.legal(pi);
            const lastWorld = !s.trick && s.players[pi].hand.length === 1 && s.players[pi].hand[0].kind === 'major' && s.players[pi].hand[0].number === 21;
            if (lastWorld)
                worldLastOpening++;
            actions++;
            if (plays.length) {
                const chosen = pick(plays, config.policy);
                if (trace.length < 6)
                    trace.push({ actor: pi, cards: chosen.selectedIds.slice() });
                api.play(pi, chosen);
            }
            else
                api.pass(pi);
        }
    }
    catch (error) {
        status = 'engine-error';
        trace.push({ error: error.stack });
    }
    const s = api.state(), metrics = { ...api.metrics() };
    const worldWinningPlay = status === 'winner' && s.lastPlay?.cardsHand?.some(c => c.kind === 'major' && c.number === 21) || false;
    return { ...config, initialHash, status, winner, actions, turns: actions + metrics.leaderPasses + metrics.forcedDrawKos, ...metrics, worldInitial, worldEver: [...worldEver], worldLastOpening, worldWinningPlay, winnerRemainingCards: winner == null ? null : s.players[winner].hand.length, worldFinish: worldWinningPlay && s.players[winner].hand.length === 0, finalWorldSeats: s.players.flatMap((p, i) => p.hand.some(c => c.kind === 'major' && c.number === 21) ? [i] : []), trace };
}
async function main() {
    const started = Date.now();
    const oldSource = cp.execFileSync('git', ['show', baseline + ':public/js/tarotKingdom.js'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
    const engines = { current: await loadKingdomEngine(root, { sourceText: oldSource }), proposal: await loadKingdomEngine(root) };
    const rows = [];
    for (const players of [3, 4])
        for (const mode of modes)
            for (const policy of policies) {
                for (let seed = 1; seed <= seedCount; seed++) {
                    const random = seeded(seed), deck = engines.current.api.deck().map(c => ({ ...c }));
                    for (let i = deck.length - 1; i > 0; i--) {
                        const j = Math.floor(random() * (i + 1));
                        [deck[i], deck[j]] = [deck[j], deck[i]];
                    }
                    const rotations = arg('rotations', 'all') === 'one' ? 1 : players;
                    for (let rotation = 0; rotation < rotations; rotation++) {
                        const pair = [];
                        for (const variant of ['current', 'proposal'])
                            pair.push(await runRound(engines[variant], deck, { players, mode, policy, seed, rotation, variant }));
                        if (pair[0].initialHash !== pair[1].initialHash)
                            throw Error('Paired initial states differ');
                        rows.push(...pair);
                    }
                }
                console.log(JSON.stringify({ players, mode, policy, pairedRounds: rows.filter(r => r.players === players && r.mode === mode && r.policy === policy && r.variant === 'current').length, elapsedMs: Date.now() - started }));
            }
    const groups = [];
    for (const players of [3, 4])
        for (const mode of modes)
            for (const policy of policies)
                for (const variant of ['current', 'proposal']) {
                    const rs = rows.filter(r => r.players === players && r.mode === mode && r.policy === policy && r.variant === variant), wins = rs.filter(r => r.status === 'winner');
                    const statuses = {};
                    rs.forEach(r => statuses[r.status] = (statuses[r.status] || 0) + 1);
                    const completed = rs.filter(r => ['winner', 'party-defeat', 'draw-no-opening-no-refill'].includes(r.status)).length;
                    groups.push({ players, mode, policy, variant, trials: rs.length, completed, completionRate: completed / rs.length, winners: wins.length, noWinnerCompleted: completed - wins.length, noWinnerRate: (completed - wins.length) / rs.length, unfinished: rs.length - completed, statuses, forcedDraws: rs.reduce((a, r) => a + r.forcedDraws, 0), leaderDraws: rs.reduce((a, r) => a + r.leaderDraws, 0), forcedDrawKos: rs.reduce((a, r) => a + r.forcedDrawKos, 0), turnsMedian: percentile(wins.map(r => r.turns), .5), turnsP95: percentile(wins.map(r => r.turns), .95), turnsMax: Math.max(0, ...rs.map(r => r.turns)), seatWins: Array.from({ length: players }, (_, i) => wins.filter(r => r.winner === i).length), worldInitiallyHeldRounds: rs.filter(r => r.worldInitial.length).length, worldInitialHolderWins: wins.filter(r => r.worldInitial.includes(r.winner)).length, worldFinishWins: wins.filter(r => r.worldFinish).length, worldLastOpeningCases: rs.reduce((a, r) => a + r.worldLastOpening, 0), worldStillHeldNoWinner: rs.filter(r => r.status !== 'winner' && r.finalWorldSeats.length).length });
                }
    for (const group of groups) {
        const rs = rows.filter(r => r.players === group.players && r.mode === group.mode && r.policy === group.policy && r.variant === group.variant);
        group.worldLastOpeningChecks = rs.reduce((a, r) => a + r.worldLastOpeningChecks, 0);
        group.worldLastOpeningLegal = rs.reduce((a, r) => a + r.worldLastOpeningLegal, 0);
        group.worldLastOpeningBlocked = rs.reduce((a, r) => a + r.worldLastOpeningBlocked, 0);
    }
    const report = { baselineCommit: baseline, baselineSourceSha256: sha(oldSource), proposalSourceSha256: sha(fs.readFileSync(path.join(root, 'public/js/tarotKingdom.js'))), seedCount, pairedInitialStatesVerified: true, totalRoundRuns: rows.length, maxTurns, elapsedMs: Date.now() - started, unit: 'one actual app round, stopped before settlement; not a four-round reward match', policies: 'Always play if legal: shed maximizes removed hand cards, conserve minimizes them; both choose lower power on ties, skip optional draws and Judgment, choose first legal 12-trash card.', profiles: 'All seats use the same existing preview character; real combat, opening, effects, draw/clear and game-end functions run. hp-zero is the current default; hand-empty is an existing rule configuration sensitivity case.', turnDefinition: 'play/pass decisions + forced blocked-parent handoffs + forced-draw KOs; popup/animation steps excluded', handLimit: 'Existing eight-card cap unchanged; exhaustive opening legality shows only six blocked cards in the unique 78-card deck, so a naturally dealt all-blocked eight-card hand is unreachable.', limitations: ['Simulation is not evidence of human enjoyment', 'No real network, rewards or four-round settlement', 'No human or strategic optional-pass policies', 'Turn limits and unresolved/error states never count as normal completion'], groups, examples: rows.filter(r => r.worldFinish || r.worldLastOpening || r.status !== 'winner').slice(0, 24), rows };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, totalRoundRuns: rows.length, elapsedMs: report.elapsedMs, groups }));
    if (rows.some(r => r.status === 'engine-error'))
        process.exitCode = 1;
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });

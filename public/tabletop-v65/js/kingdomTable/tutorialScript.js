// Tarot Kingdom tutorial: fixed deals and a fixed script, played on the real rule engine.
// Pure logic: no DOM. The page (tutorial.js) and the tests drive the same session.
import * as Rules from './rules.js?v=sites-death-devil-v1';
import { createMatch, startRound, settleRound } from './match.js?v=sites-death-devil-v1-no-stock-v1';

export const ME = 0;
export const SEATS = 3;
export const NAMES = ['あなた', 'カイ', 'ミナ'];

const me = (type, cards, before, after, rules = []) => ({ seat: ME, type, cards, before, after, rules });
const cpu = (seat, type, cards = [], after = '', rules = []) => ({ seat, type, cards, after, rules });
const pass = (seat, after = '', rules = []) => cpu(seat, 'pass', [], after, rules);

// Hands list the cards that matter; the rest of each hand is filled with unused pairs.
export const CHAPTERS = [
    {
        id: 'basics',
        title: '基本の出し方',
        intro: '先に手札を出し切った人の勝ちです。場の札より強い札を、場と同じ枚数で出していきます。親のミナが最初の場札「ワンドの6」をめくりました。',
        dealer: 2,
        start: 'wand-6',
        hands: { 0: ['cup-9', 'coin-9', 'sword-7', 'coin-7', 'coin-15', 'wand-2', 'cup-3', 'sword-10'], 1: ['sword-9'], 2: ['major-9', 'wand-4', 'cup-4'] },
        steps: [
            me('play', ['cup-9'], '場は「ワンドの6」の1枚です。光っている「カップの9」を選んで「出す」を押してください。', '6より大きい9で返しました。これが通常出しです。', ['normal']),
            cpu(1, 'play', ['sword-9'], 'カイは同じ数字の「ソードの9」で返しました。同じ数字は、相性の良いスートなら返せます。ワンド←カップ←ソード←ペンタクル←ワンド。カップにはソードで返せます。', ['counter']),
            pass(2),
            me('play', ['coin-9'], 'ソードにはペンタクルで返せます。「ペンタクルの9」を出してください。', '同じ9でも、相性の向きどおりなら返せます。', ['counter']),
            pass(1),
            cpu(2, 'play', ['major-9'], 'ミナは大札の「隠者9」を出しました。大札入りの組は、スートに関係なく同じ数字へ返せます。逆に、大札の9へ小札の9だけでは返せません。', ['majorSame']),
            me('pass', [], '返せる札がありません。出せる札があってもパスできます。「パス」を押してください。', '', ['pass']),
            pass(1, '最後に出したミナ以外が全員パスしたので、場が流れました。最後に出したミナが次の親です。', ['clear']),
            cpu(2, 'play', ['wand-4', 'cup-4'], 'ミナは4を2枚出しました。同じ数字なら1〜3枚まとめて出せます。', ['multi']),
            me('play', ['sword-7', 'coin-7'], '2枚の場には2枚で返します。「ソードの7」と「ペンタクルの7」を選んで「出す」を押してください。', '', ['multi']),
            pass(1),
            pass(2, '全員がパスして場が流れ、あなたが親です。空の場には好きな札を出せます。', ['clear']),
            me('play', ['coin-15'], '小札のAは通常時、小札で一番強い札です。「ペンタクルのA」を出してください。', '', ['ace']),
            pass(1),
            pass(2, 'Aは誰も返せませんでした。通常時、Aに返せる大札は同じスート色の16〜19です（ペンタクルのAには月18）。', ['clear'])
        ],
        outro: '通常出し、同じ数字の相性、大札の同数字返し、パスと場流しを体験しました。'
    },
    {
        id: 'numbers',
        title: '数字の効果',
        intro: '5・8・11・13・14には、出したときの効果があります。最初の場札は「ソードの3」です。',
        dealer: 2,
        start: 'sword-3',
        hands: { 0: ['wand-5', 'cup-7', 'wand-8', 'cup-8', 'coin-10', 'major-14', 'coin-8', 'sword-2'], 1: ['coin-13'], 2: ['cup-11'] },
        steps: [
            me('play', ['wand-5'], '「ワンドの5」を出してください。', '5は、出した枚数ぶん次の人を飛ばします。カイの番を飛ばして、ミナの番です。', ['skip']),
            cpu(2, 'play', ['cup-11'], 'ミナが11を出しました。11バックで、数字の強弱が逆になります。今は小さい数字ほど強い状態です。', ['back']),
            me('play', ['cup-7'], '11バック中なので、11より小さい「カップの7」で返せます。出してください。', '', ['back']),
            pass(1),
            pass(2, '場が流れると11バックは解除されます。', ['clear']),
            me('play', ['wand-8', 'cup-8'], '8を2枚以上出すと、その場ですぐに場が流れます。「ワンドの8」と「カップの8」を出してください。', '8の2枚出しで場が流れ、あなたがそのまま親です。', ['clear8']),
            me('play', ['coin-10'], '「ペンタクルの10」を出してください。', '', ['normal']),
            cpu(1, 'play', ['coin-13'], 'カイが同じスートの1枚場に「ペンタクルの13」を出したので、ペンタクルでロックされました。ロック中はペンタクルでしか返せません。', ['lock']),
            pass(2),
            me('play', ['major-14'], 'ロックは大札の「節制14」で解除できます。節制はロック中でも出せます。「節制14」を出してください。', 'ロックが解除されました。コールや場流しでも解除されます。節制14は、11バック・逆回り・審判の効果も解除できます。', ['unlock']),
            pass(1),
            pass(2),
            me('play', ['coin-8'], '8を1枚だけ出すと「8カット」です。次の人はコールかパスしかできません。「ペンタクルの8」を出してください。', '', ['cut8']),
            pass(1),
            pass(2, '8カットで誰も返せず、場が流れました。', ['clear'])
        ],
        outro: '5のスキップ、11バック、8の効果、13のロックと節制14の解除を体験しました。小札12のバニッシュでは、場を流したあと手札を1枚除外できる効果があります。'
    },
    {
        id: 'majors',
        title: '大札',
        intro: '大札にはそれぞれ専用の条件や効果があります。親のカイが最初の場札「ソードの10」をめくりました。',
        dealer: 1,
        start: 'sword-10',
        hands: { 0: ['major-21', 'major-11', 'wand-3', 'cup-5', 'sword-6', 'coin-6', 'wand-12', 'cup-13'], 1: [], 2: ['major-16', 'cup-6'] },
        steps: [
            cpu(2, 'play', ['major-16'], 'ミナは大札「塔16」を出しました。16はソード、17はカップ、18はペンタクル、19はワンドの1枚場にだけ出せます。', ['suitMajor']),
            me('play', ['major-21'], '大札「世界21」のワールドエンドは、大札1枚の場に出すと即座に場を流します。「世界21」を出してください。', '大札16〜21を1枚で出して自分で場を流すと、＋1翻です。', ['world21', 'majorClear']),
            me('play', ['major-11'], '大札16〜19と21は、最後の1枚でない限り空の場には出せません。ここでは大札「正義11」を出してください。', '正義11のライブリバースは、数字の強弱を反転し、この局の手番を逆回りにします。逆回りは場が流れても続きますが、節制14を出すか局が終わると元に戻ります。次はミナの番です。', ['reverse', 'back']),
            cpu(2, 'play', ['cup-6'], '11バック中なので、ミナは小さい6で返しました。', ['back']),
            pass(1, '逆回りなので、ミナの次はカイ、その次があなたです。'),
            me('pass', [], 'パスしてください。', '場が流れ、ミナが親になりました。', ['pass', 'clear'])
        ],
        outro: '対応スートの大札16〜19、世界21の即流し、大札流しの＋1翻、正義11の逆回りを体験しました。ほかの大札の効果はルールページで確認できます。'
    },
    {
        id: 'roles',
        title: '5枚役',
        intro: '空の場には、手札5枚で作る5枚役も出せます。最初の場札は親ミナの「ソードの2」です。',
        dealer: 2,
        start: 'sword-2',
        hands: { 0: ['coin-3', 'coin-4', 'coin-10', 'coin-12', 'coin-14', 'wand-6', 'cup-9', 'sword-11'], 1: [], 2: ['wand-5', 'cup-6', 'sword-7', 'coin-8', 'wand-9'] },
        steps: [
            me('pass', [], 'まずはパスして、相手の出方を見ましょう。', '', ['pass']),
            pass(1, '場が流れ、ミナが親です。'),
            cpu(2, 'play', ['wand-5', 'cup-6', 'sword-7', 'coin-8', 'wand-9'], 'ミナは5・6・7・8・9の「ストレート」を出しました。5枚役の場には、より強い5枚役でしか返せません。', ['role']),
            me('play', ['coin-3', 'coin-4', 'coin-10', 'coin-12', 'coin-14'], '同じスート5枚の「フラッシュ」はストレートより強い役です。光っているペンタクル5枚を選んで「役を出す」を押してください。', '', ['roleOver']),
            pass(1),
            pass(2, 'フラッシュが通って場が流れ、＋2翻です。5枚役で場を流すと、役に応じて翻が増えます。', ['roleHan', 'clear'])
        ],
        outro: '5枚役の強さと、場を流したときの翻を表で確認しましょう。表は弱い役から順に並んでいます。',
        table: true
    },
    {
        id: 'finish',
        title: 'コールと上がり',
        intro: '最後は、コールで役を作り、手札を出し切って上がります。最初の場札は親ミナの「カップの4」です。',
        dealer: 2,
        start: 'cup-4',
        hands: { 0: ['wand-4', 'sword-4', 'cup-9', 'coin-9', 'wand-3', 'sword-3', 'cup-3', 'major-19'], 1: ['wand-15'], 2: [] },
        steps: [
            me('play', ['wand-4', 'sword-4', 'cup-9', 'coin-9'], '1枚の場札に手札4枚を合わせて5枚役を作るのが「コール」です。4・4・9・9を選んで「コール」を押してください。場の4と合わせてフルハウスです。', 'コールで作った役は、表より1翻少なくなります。', ['call']),
            pass(1),
            pass(2, 'フルハウスのコールが通り、3−1＝＋2翻です。コールで、ロック・8カット・11バックも解除されます。', ['roleHan', 'clear']),
            me('play', ['wand-3', 'sword-3', 'cup-3'], '3を3枚まとめて出してください。', '', ['multi']),
            pass(1),
            pass(2, '残りは大札「太陽19」1枚です。', ['clear']),
            me('play', ['major-19'], '19は普段は空の場に出せませんが、最後の1枚なら出して上がれます。大札を最後の1枚として出して上がると「切札」で＋1翻です。「太陽19」を出してください。', '手札を出し切って上がりました！ 最後の1枚が大札なので切札＋1翻です。点数を計算します。', ['win', 'lastCard'])
        ],
        outro: '上がった人の翻は、上がり1翻＋役や大札流しの翻＋切札＋親の1翻です。負けた人は「残り枚数 × 翻 × 10枚」を払います。残した小札Aは1枚につき1翻、親は1翻多く払います。',
        settle: true
    }
];

const ALL = Rules.buildDeck();
const byId = new Map(ALL.map(card => [card.id, card]));
export const card = id => byId.get(id);

// Fill each hand with whole pairs of unused cards, so no filled hand qualifies as an opening win.
function fillHands(chapter) {
    const used = new Set([chapter.start, ...Object.values(chapter.hands).flat()]);
    const spare = ALL.filter(c => !c.major && !used.has(c.id) && c.num !== 15 && c.num !== 5 && c.num !== 8);
    const hands = [];
    for (let seat = 0; seat < SEATS; seat += 1) {
        const hand = [...(chapter.hands[seat] || [])];
        while (hand.length < Rules.HAND_LIMIT) {
            const num = spare[0].num;
            for (const c of spare.filter(s => s.num === num).slice(0, Rules.HAND_LIMIT - hand.length >= 2 ? 2 : 1)) {
                hand.push(c.id);
                spare.splice(spare.indexOf(c), 1);
            }
        }
        hands.push(hand);
    }
    return { hands, rest: spare };
}

// createRound pops cards from the end: eight rounds of dealing from the dealer, then the field card.
export function chapterDeck(chapter) {
    const { hands } = fillHands(chapter);
    const used = new Set([chapter.start, ...hands.flat()]);
    const bottom = ALL.filter(c => !used.has(c.id));
    const deal = [];
    for (let n = 0; n < Rules.HAND_LIMIT; n += 1) {
        for (let k = 0; k < SEATS; k += 1) deal.push(card(hands[(chapter.dealer + k) % SEATS][n]));
    }
    return [...bottom, card(chapter.start), ...deal.reverse()];
}

export function startChapter(index) {
    const chapter = CHAPTERS[index];
    const match = createMatch({ players: SEATS, rng: () => 0.5 });
    match.dealer = chapter.dealer;
    startRound(match, chapterDeck(chapter));
    return { index, chapter, match, step: 0, result: null, seen: new Set() };
}

export const currentStep = session => session.chapter.steps[session.step] || null;
export const chapterDone = session => session.step >= session.chapter.steps.length;

const sameSet = (a, b) => a.length === b.length && a.every(id => b.includes(id));
const kindFor = ids => ids.length === 5 ? 'role' : ids.length === 4 ? 'call' : 'normal';

// Apply the scripted step for the seat. A player's action must match the script exactly.
export function perform(session, action) {
    const step = currentStep(session);
    if (!step) return { ok: false, reason: 'この章は終わりました' };
    const round = session.match.round;
    if (round.turn !== step.seat || action.seat !== step.seat) return { ok: false, reason: '今は手番ではありません' };
    if (action.type !== step.type) {
        return { ok: false, reason: step.type === 'pass' ? '今は「パス」を押してください' : '光っている札を選んで「出す」を押してください' };
    }
    if (step.type === 'play' && !sameSet(action.ids || [], step.cards)) {
        return { ok: false, reason: '光っている札だけを、すべて選んでください' };
    }
    const res = step.type === 'pass' ? Rules.pass(round, step.seat) : Rules.play(round, step.seat, step.cards, kindFor(step.cards));
    if (!res.ok) return res;
    for (const rule of step.rules) session.seen.add(rule);
    session.step += 1;
    if (round.phase === 'over' && session.chapter.settle) session.result = settleRound(session.match);
    return { ok: true };
}

export const performCpu = session => {
    const step = currentStep(session);
    return perform(session, { seat: step.seat, type: step.type, ids: step.cards });
};

export const RULE_LABELS = {
    normal: '通常出し', multi: '複数枚出し', counter: '同じ数字のスートの相性', majorSame: '大札で同じ数字に返す',
    pass: 'パス', clear: '場流し', ace: '小札Aの強さ', skip: '5のスキップ', back: '11バック', clear8: '8の複数枚で即流し',
    cut8: '8カット', lock: 'ロック', unlock: 'クリアランス（節制14）', suitMajor: '大札16〜19の対応スート', world21: 'ワールドエンド（世界21）',
    majorClear: '大札流しの＋1翻', reverse: '正義11の逆回り', role: '5枚役', roleOver: '役に強い役で返す', roleHan: '役の翻',
    call: 'コール', win: '上がり', lastCard: '切札の＋1翻'
};

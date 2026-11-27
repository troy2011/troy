// Interpretive rules for TROY's fictional four-element reading, not a psychometric score.
const ELEMENTS = Object.freeze({
    fire: { drive: 'まず動いて流れをつくる', gift: '最初の一歩を後押しする' },
    water: { drive: '相手の気持ちを受け止める', gift: '言いにくい気持ちをくみ取る' },
    wind: { drive: '理由を整理してから選ぶ', gift: '考えを短く整理する' },
    earth: { drive: '無理なく続く形をつくる', gift: '現実に続く段取りをつける' }
});
const CATALOG = require('../public/four-elements/result-catalog');
const TYPES = Object.freeze(Object.fromEntries(Object.entries(CATALOG).map(([key, result]) => [key, result.name])));
const PAIRS = {
    'fire:water': [-3, 'まず動きたい側と、気持ちを確かめてから進みたい側で、決める速さに差が出やすい。', '先に「今すぐ決める？ もう少し話す？」と聞いてみて。'],
    'earth:wind': [-3, '実際に続く形を探す側と、筋が通るかを考える側で、納得する順番がずれやすい。', '小さく試す範囲と、見直すタイミングを先に決めてみて。'],
    'earth:fire': [2, '一方が最初の一歩をつくり、もう一方が無理なく続く形にできる。', 'やりたいことと、今日できることを一つずつ出してみて。'],
    'fire:wind': [1, '一方のひらめきを、もう一方が言葉にして形にできる。', '案を出す時間と、絞る時間を分けてみて。'],
    'earth:water': [2, '気持ちをくみ取る力と、安心して続けられる形をつくる力が補い合う。', '「何がうれしい？」と「何なら続けられる？」を順に聞いてみて。'],
    'water:wind': [1, '言葉にならない気持ちと、言葉で整理する力が補い合う。', '答えを出すより先に、相手の話を一度そのまま受け止めてみて。']
};
const SAME_ADVICE = {
    fire:'勢いが重なったら、一息ついてから次を決めてみて。',
    water:'お互いに遠慮しすぎないよう、希望を一つずつ言ってみて。',
    wind:'結論を出す前に、お互いが何を大事にしているかも聞いてみて。',
    earth:'いつものやり方を大事にしつつ、新しい案を一つだけ試してみて。'
};
const MAJOR = {
    fool: ['新しい選択肢を見つける', '自由に試せるところと、先に決めておくところを分けてみて。'],
    magician: ['場に応じてやり方を切り替える', '何を任せ合うと楽か、一つずつ相談してみて。'],
    world: ['違う考えをひとつの場にまとめる', 'みんなが納得する形と、自分が望む形の両方を話してみて。']
};
const TRI = {
    'tri:fire:water:wind': ['再出発を後押しする', '新しく始める前に、今日できる小さな一歩を決めてみて。'],
    'tri:fire:water:earth': ['立ち止まって別の道を探す', '先に考える時間を決めておくと、急ぐ人も待つ人も安心しやすい。'],
    'tri:fire:wind:earth': ['続けられる仕組みにまとめる', '共通のやり方を決めるときは、相手が何を大事にするかも聞いてみて。'],
    'tri:water:wind:earth': ['次へ進めるように区切りをつける', '終わらせることと、これからも残すことを一つずつ話してみて。']
};
const TRI_GAP = {
    fire: ['動き出す速さに違いが出やすい。', 'まず試したいことと、準備しておきたいことを一つずつ出してみて。'],
    water: ['気持ちを先に確かめたい側と、やり方を先に決めたい側で話がすれ違いやすい。', '段取りの話に入る前に、何が気になるかを聞いてみて。'],
    wind: ['理由を整理してから進みたい側と、立ち止まって別のやり方を探したい側でペースが違う。', '結論を急がず、お互いが納得できる条件を一つずつ出してみて。'],
    earth: ['すぐ形にできるかを先に考える側と、まず可能性を広げたい側で意見が分かれやすい。', '試す範囲を小さく決めて、アイデアを一つだけ形にしてみて。']
};
function resultGift(key) {
    return (MAJOR[key] || TRI[key])?.[0] || ELEMENTS[key.split(':')[0]].gift;
}
function validKey(key) { return typeof key === 'string' && Object.hasOwn(TYPES, key); }
function compare(left, right) {
    if (!validKey(left) || !validKey(right)) return null;
    const [a,b] = [left,right].sort();
    if (MAJOR[a] || MAJOR[b]) {
        const gift = resultGift;
        return { mark: '○', reason: a === b
            ? `二人とも「${gift(a)}」ことを大事にする組み合わせ。`
            : `「${gift(a)}」力と「${gift(b)}」力を持ち寄れる組み合わせ。`,
            advice: [...new Set([MAJOR[a]?.[1], MAJOR[b]?.[1]].filter(Boolean))].join('') };
    }
    if (TRI[a] || TRI[b]) {
        const [triple,other] = TRI[a] ? [a,b] : [b,a];
        const missing = Object.keys(ELEMENTS).find((element) => !triple.split(':').includes(element));
        const otherMain = TRI[other] ? null : other.split(':')[0];
        if (otherMain === missing) {
            const [reason,advice] = TRI_GAP[missing];
            return { mark:'△', reason, advice };
        }
        const reason = a === b
            ? `二人とも「${resultGift(a)}」ことを大事にするので、進め方が通じやすい。`
            : `「${resultGift(a)}」力と「${resultGift(b)}」力を持ち寄れる組み合わせ。`;
        return { mark:a === b ? '◎' : '○', reason, advice:TRI[triple][1] };
    }
    const [am,as] = a.split(':'), [bm,bs] = b.split(':');
    const interaction = (x,y) => x === y ? [2,`二人とも「${ELEMENTS[x].drive}」のが得意なので、進め方が通じやすい。`, SAME_ADVICE[x]] : PAIRS[[x,y].sort().join(':')];
    const [main,reason,advice] = interaction(am,bm);
    const sub = interaction(as,bs)[0];
    const crossover = Number(am === bs) + Number(bm === as);
    const score = main * 3 + sub + crossover;
    const mark = score >= 6 ? '◎' : score < 0 ? '△' : '○';
    const supporting = am !== bm && am === bs && bm === as
        ? ' 表に出やすい力と、内側で頼りにする力が入れ替わっているので、相手の進め方にも心当たりがありそう。'
        : am === bm && sub < 0 ? ' ただ、迷ったときに頼りにするものは少し違う。' : '';
    return { mark, reason: reason + supporting, advice };
}

const ARCANA_INTERNAL_KEY = 'MajorArcanaDiagnosisV1';
const normalizePlayer = (value) => String(value || '').trim().toUpperCase();

async function readSavedKey(deps, playFabId) {
    const result = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserInternalData, {
        PlayFabId: playFabId,
        Keys: [ARCANA_INTERNAL_KEY]
    });
    const key = result?.Data?.[ARCANA_INTERNAL_KEY]?.Value;
    return validKey(key) ? key : null;
}

// Call only after authorizing the viewer and resolving the target profile.
async function getProfileArcanaCompatibility(deps, viewer, target) {
    const from = normalizePlayer(viewer);
    const to = normalizePlayer(target);
    if (!/^[A-Z0-9]+$/.test(from) || !/^[A-Z0-9]+$/.test(to) || from === to) return null;
    const [own,other] = await Promise.all([readSavedKey(deps, from), readSavedKey(deps, to)]);
    if (!own || !other) return null;
    return { title: TYPES[other], ...compare(own, other) };
}

function initializeFourElementsRoutes(app, deps) {
    const { requireAuthenticatedPlayFabId, promisifyPlayFab, PlayFabServer } = deps;
    function route(path, handler) {
        app.post('/api/four-elements/' + path, async (req, res) => {
            res.set('Cache-Control', 'private, no-store');
            try {
                const id = await requireAuthenticatedPlayFabId(req, res, req.body?.playFabId);
                if (!id) return;
                return await handler(req, res, normalizePlayer(id));
            } catch (error) {
                console.error('[four-elements]', path, error?.code || 'unknown');
                return res.status(500).json({ error: '大アルカナ診断を読み書きできませんでした。' });
            }
        });
    }
    route('self', async (_req, res, id) => {
        const key = await readSavedKey(deps, id);
        return res.json({ saved: key ? { key } : null });
    });
    route('save', async (req, res, id) => {
        const { key } = req.body || {};
        if (!validKey(key)) return res.status(400).json({ error: '結果が正しくありません。' });
        // Explicit save replaces one result. Do not keep answers or prior outcomes.
        const saved = { key };
        await promisifyPlayFab(PlayFabServer.UpdateUserInternalData, {
            PlayFabId: id,
            Data: { [ARCANA_INTERNAL_KEY]: key }
        });
        return res.json({ saved });
    });
}
module.exports = { TYPES, compare, validKey, initializeFourElementsRoutes, getProfileArcanaCompatibility };

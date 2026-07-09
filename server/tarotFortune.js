const { VIRTUAL_CURRENCY_CODE, LEADERBOARD_NAME } = require('./economy');
const { getCardSkillName } = require('./tarotSkillNames');
const { getDeckType } = require('./tarotDeck');
const { drawLocalGachaItem } = require('./gacha');
const {
    PLAYER_DAILY_CONTRIBUTION_STAT,
    ensureDailyContributionVersionForToday,
    getPreviousJstDateKey
} = require('./contributionStats');

const FORTUNE_DATA_KEY = 'DailyTarotFortune';
const DAILY_BOUNTY_GACHA_DATA_KEY = 'DailyBountyGachaReward';
const DAILY_BOUNTY_STAT_NAME = PLAYER_DAILY_CONTRIBUTION_STAT;
const DAILY_BOUNTY_TOP_COUNT = Math.max(1, Math.floor(Number(process.env.DAILY_BOUNTY_TOP_COUNT || 3)));
const DAILY_BOUNTY_PULLS_BY_POSITION = {
    1: Math.max(1, Math.floor(Number(process.env.DAILY_BOUNTY_PULLS_1 || 3))),
    2: Math.max(1, Math.floor(Number(process.env.DAILY_BOUNTY_PULLS_2 || 2))),
    3: Math.max(1, Math.floor(Number(process.env.DAILY_BOUNTY_PULLS_3 || 1)))
};

const SUITS = ['Wand', 'Sword', 'Cup', 'Pentacle'];
const SUIT_LABEL = {
    Wand: 'ワンド',
    Sword: 'ソード',
    Cup: 'カップ',
    Pentacle: 'ペンタクル'
};

const ARCANA_NAME = {
    0: '愚者',
    1: '魔術師',
    2: '女教皇',
    3: '女帝',
    4: '皇帝',
    5: '法王',
    6: '恋人',
    7: '戦車',
    8: '力',
    9: '隠者',
    10: '運命の輪',
    11: '正義',
    12: '吊るされた男',
    13: '死神',
    14: '節制',
    15: '悪魔',
    16: '塔',
    17: '星',
    18: '月',
    19: '太陽',
    20: '審判',
    21: '世界'
};

const MINOR_RANK_LABEL = {
    1: 'A',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: 'ペイジ',
    12: 'ナイト',
    13: 'クイーン',
    14: 'キング'
};

const MAJOR_FORTUNE = {
    0: {
        upright: '無防備な一歩が扉を開く日。ただし海図なしの出航は一度だけにしてください。',
        reversed: '勢いだけで出ると浅瀬に乗り上げます。予定を一枚書いてから動いてください。'
    },
    1: {
        upright: '道具は足りています。言い訳を畳み、最初の号令を出す日です。',
        reversed: '器用さでごまかすほど信用を失います。手順を見せてから進めてください。'
    },
    2: {
        upright: '違和感は当たります。騒ぐ前に事実を集め、静かに舵を切ってください。',
        reversed: '黙りすぎると誤解が膨らみます。必要な一言だけ甲板に出してください。'
    },
    3: {
        upright: '実りはありますが、放置した畑は荒れます。世話する対象を一つに絞る日です。',
        reversed: '優しさの名で甘やかすと腐ります。境界線を引き、世話を減らしてください。'
    },
    4: {
        upright: '基盤を固める日。情ではなくルールで甲板を整えるほど味方が動きます。',
        reversed: '支配したい気持ちが船を重くします。命令を一つ減らし、責任は明確に。'
    },
    5: {
        upright: '古い教えに使える宝があります。型を守り、今日は奇策を控えてください。',
        reversed: '常識に隠れた怠慢が見えます。守る理由のない規則は捨ててください。'
    },
    6: {
        upright: '選択の甘さが見抜かれる日。好き嫌いより、乗る船を一つ決めてください。',
        reversed: '曖昧な約束は沈みます。返事・期限・条件を今日中に確認してください。'
    },
    7: {
        upright: '追い風です。ただし勝つ船は勢いより舵。目的地を一行で決めて進めてください。',
        reversed: '急発進は損を呼びます。止まって航路を直す勇気が今日の勝ち筋です。'
    },
    8: {
        upright: '吠えずに耐える強さの日。感情を飲み込み、反復作業で突破してください。',
        reversed: '気力切れを根性で隠すと折れます。休む時間を先に確保してください。'
    },
    9: {
        upright: '孤独は逃げ場ではなく見張り台です。30分だけ切り離して答えを書いてください。',
        reversed: '考えすぎて錨が下りています。小さな連絡か提出で流れを戻してください。'
    },
    10: {
        upright: '潮目が変わります。来た波に乗るため、古い予定を一つ捨ててください。',
        reversed: '噛み合わない日はあります。無理に押さず、準備品を揃えて次の潮を待ってください。'
    },
    11: {
        upright: '事実が味方します。感情を削り、記録・数字・約束で判断してください。',
        reversed: '自分に都合のよい裁きは返ってきます。先に落ち度を一つ認めてください。'
    },
    12: {
        upright: '足止めは罰ではありません。視点を逆さにし、待つ間に弱点を補修してください。',
        reversed: '我慢したふりで先延ばししています。今日やめることを一つ決めてください。'
    },
    13: {
        upright: '終わらせるほど軽くなります。沈んだ積荷を捨て、新しい航路を空けてください。',
        reversed: '終わったものに縄を結ぶほど沈みます。未練ではなく処理日を決めてください。'
    },
    14: {
        upright: '混ぜる力が働きます。極端な選択を避け、温度差のある相手と橋をかけてください。',
        reversed: '偏りが漏れています。酒も言葉も注ぎすぎず、量を半分にしてください。'
    },
    15: {
        upright: '欲が顔を出します。見ないふりは危険です。誘惑の名前を書いて距離を取ってください。',
        reversed: '鎖は外せます。悪習を一つ断つだけで、甲板の空気が変わります。'
    },
    16: {
        upright: '崩れるものはもう傷んでいます。隠すより早く認め、被害範囲を切り分けてください。',
        reversed: '崩壊を先延ばしにしています。小さい修理で済むうちに謝るか直してください。'
    },
    17: {
        upright: '希望はあります。ただし眺めるだけでは宝になりません。長期目標を一手だけ進めてください。',
        reversed: '夢で現実をごまかしています。数字・期限・担当を入れて灯りを戻してください。'
    },
    18: {
        upright: '霧が濃い日。怖さは合図です。噂ではなく一次情報で航路を確かめてください。',
        reversed: '不安の正体が見え始めます。曖昧な点を一つ質問すれば霧は薄くなります。'
    },
    19: {
        upright: '明るく出ていい日です。ただし自慢は船を傾けます。成果を共有に変えてください。',
        reversed: '過信が小さな穴になります。勝っている時ほど確認し、礼を先に出してください。'
    },
    20: {
        upright: '呼び戻される案件があります。過去の失敗を隠さず、再提出か再挑戦を選んでください。',
        reversed: '決断待ちが腐っています。今日のうちに返事を出すか、降りると伝えてください。'
    },
    21: {
        upright: '区切りをつける日。完成品を甲板に出し、次の航海へ移る準備をしてください。',
        reversed: '最後の一手を雑にすると全部が安く見えます。締切前に最終確認を入れてください。'
    }
};

const MINOR_SUIT_THEME = {
    Wand: {
        upright: '火種と行動の舵',
        reversed: '勢い任せの突撃'
    },
    Sword: {
        upright: '判断と交渉の刃',
        reversed: '言葉の切り傷と衝突'
    },
    Cup: {
        upright: '感情と縁の潮',
        reversed: '情の濁りと依存'
    },
    Pentacle: {
        upright: '金貨と実務の積荷',
        reversed: '浪費と停滞の重荷'
    }
};

const MINOR_RANK_FORTUNE = {
    1: {
        upright: '始めるなら今日。迷っている間に港は混みます。最初の一手だけ出してください。',
        reversed: '船出の準備不足。始める前に目的・期限・持ち物を一行で確認してください。'
    },
    2: {
        upright: '選択肢は二つに絞れます。両方抱えず、勝てる航路を一つ選んでください。',
        reversed: '優柔不断が一番高くつきます。保留の理由を紙に出し、不要なら捨ててください。'
    },
    3: {
        upright: '協力で伸びる日。黙って期待せず、役割を渡して甲板を動かしてください。',
        reversed: '連携の穴から水が入ります。誰が何をするか、今日中に言葉で固定してください。'
    },
    4: {
        upright: '守りを固める日。派手さより、崩れやすい場所の補修が効きます。',
        reversed: '安全地帯に居座りすぎです。小さな変化を一つ入れないと潮が止まります。'
    },
    5: {
        upright: '面倒な戦いは避けられません。逃げずに争点を絞れば、傷は浅く済みます。',
        reversed: '勝たなくていい喧嘩があります。火種から離れ、記録だけ残してください。'
    },
    6: {
        upright: '助けが返ってくる日。受け取るだけでなく、次に渡す相手を決めてください。',
        reversed: '過去の貸し借りに縛られています。恩ではなく、今の必要で判断してください。'
    },
    7: {
        upright: '守る価値がある場所です。ただし構えるだけでは負けます。反撃の一手を用意してください。',
        reversed: '守りすぎて宝を逃します。譲れる線と譲れない線を分けてください。'
    },
    8: {
        upright: '反復が武器になります。退屈な作業ほど、今日の腕を鍛えます。',
        reversed: '惰性で櫂を漕いでいます。数字で目標を置き、終わりを決めてください。'
    },
    9: {
        upright: 'あと一息です。疲れていても、最後の確認だけは手を抜かないでください。',
        reversed: '疲労で判断が鈍っています。休むのは撤退ではなく、沈まないための操船です。'
    },
    10: {
        upright: '積み荷は重いが成果は近い。完了条件を決めて、終わらせに行ってください。',
        reversed: '抱え込みすぎです。捨てる荷を一つ選ばないと、船ごと遅れます。'
    },
    11: {
        upright: '未熟でも武器になります。知らないことを認め、一つ学んで試してください。',
        reversed: '知ったかぶりは見抜かれます。基本を読み直し、質問を一つ出してください。'
    },
    12: {
        upright: '速さが効く日。完璧を待たず、まず連絡・予約・提出を済ませてください。',
        reversed: '焦りが見落としを呼びます。出航前の確認を一段増やしてください。'
    },
    13: {
        upright: '支える力が強い日。ただし世話役で終わらず、自分の取り分も確保してください。',
        reversed: '気遣いの過剰で消耗しています。境界線を引き、頼まれていない荷は持たないでください。'
    },
    14: {
        upright: '判断を任される日。逃げずに号令を出し、責任の所在を明らかにしてください。',
        reversed: '独断は反乱を招きます。決める前に一人だけ相談し、盲点を潰してください。'
    }
};

function parseJsonSafe(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function getJstDayKey() {
    const now = Date.now();
    const jst = new Date(now + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

function buildTarotDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (let number = 1; number <= 14; number += 1) {
            deck.push({
                id: `minor-${suit.toLowerCase()}-${number}`,
                number,
                suit,
                isArcana: false,
                effectType: 'None'
            });
        }
    }
    for (let number = 0; number <= 21; number += 1) {
        let suit = 'None';
        if (number === 1) suit = 'All';
        let effectType = 'None';
        if (number === 21) effectType = 'World';
        if (number === 20) effectType = 'Judgment';
        if (number === 0) effectType = 'Fool';
        deck.push({
            id: `arcana-${number}`,
            number,
            suit,
            isArcana: true,
            effectType
        });
    }
    return deck;
}

function pickRandom(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx] || null;
}


function buildFortuneReward(card, orientation) {
    const rewardItemName = getCardName(card);
    const rewardPs = getFortuneGoldRewardAmount(card);
    const goldLabel = rewardPs > 0 ? ` / +${rewardPs}G` : '';
    return {
        rewardType: 'card',
        rewardPs,
        rewardItemId: String(card?.id || '').trim(),
        rewardItemName,
        rewardLabel: `${rewardItemName}を獲得${goldLabel}`
    };
}

function getFortuneGoldRewardAmount(card) {
    const amount = Math.floor(Number(card?.number) || 0);
    return Math.max(0, amount);
}

function getCardName(card) {
    if (!card) return '';
    if (card.isArcana) {
        return ARCANA_NAME[Number(card.number)] || `大アルカナ${Number(card.number) || 0}`;
    }
    const suitLabel = SUIT_LABEL[String(card.suit)] || String(card.suit || '');
    const rankLabel = MINOR_RANK_LABEL[Number(card.number)] || String(card.number || '');
    return `${suitLabel}${rankLabel}`;
}

function getFortuneText(card, orientation) {
    const dir = orientation === 'reversed' ? 'reversed' : 'upright';
    if (card?.isArcana) {
        const major = MAJOR_FORTUNE[Number(card.number)];
        if (major && major[dir]) return major[dir];
        return dir === 'upright'
            ? '流れは悪くありません。ただし油断は穴になります。足元から整えてください。'
            : '焦りが潮を乱します。確認を一つ増やし、壊れる前に直してください。';
    }
    const suit = String(card?.suit || 'Wand');
    const rank = Number(card?.number) || 1;
    const suitTheme = MINOR_SUIT_THEME[suit]?.[dir] || '基礎運';
    const rankText = MINOR_RANK_FORTUNE[rank]?.[dir]
        || (dir === 'upright'
            ? '基本が一番残酷に差を出します。小さい作業を丁寧に終えてください。'
            : '無理に進めるほど傷が広がります。止める作業を一つ選んでください。');
    return `${suitTheme}が焦点。${rankText}`;
}

async function readFortuneRecord(playFabId, promisifyPlayFab, PlayFabServer) {
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [FORTUNE_DATA_KEY]
    });
    const raw = ro?.Data?.[FORTUNE_DATA_KEY]?.Value || '';
    return parseJsonSafe(raw);
}

async function writeFortuneRecord(playFabId, record, promisifyPlayFab, PlayFabServer) {
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [FORTUNE_DATA_KEY]: JSON.stringify(record)
        }
    });
}

function normalizePlayFabId(value) {
    return String(value || '').trim().replace(/^playfab:/i, '').toUpperCase();
}

function normalizeDailyBountyRewardRecord(raw, todayKey) {
    const record = raw && typeof raw === 'object' ? raw : {};
    const dayKey = String(record.dayKey || '');
    const rewardDayKey = String(record.rewardDayKey || '');
    const itemIds = Array.isArray(record.itemIds)
        ? record.itemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)
        : [];
    const rank = Number(record.rank || 0);
    const pulls = Number(record.pulls || itemIds.length || 0);
    const eligible = !!record.eligible;
    const alreadyClaimed = dayKey === String(todayKey || '');
    return {
        dayKey,
        rewardDayKey,
        eligible,
        awarded: itemIds.length > 0,
        alreadyClaimed,
        rank: Number.isFinite(rank) && rank > 0 ? rank : null,
        pulls: Number.isFinite(pulls) && pulls > 0 ? pulls : 0,
        items: itemIds.map((itemId) => ({ itemId, amount: 1 }))
    };
}

async function readDailyBountyRewardRecord(playFabId, promisifyPlayFab, PlayFabServer) {
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [DAILY_BOUNTY_GACHA_DATA_KEY]
    });
    const raw = ro?.Data?.[DAILY_BOUNTY_GACHA_DATA_KEY]?.Value || '';
    return parseJsonSafe(raw);
}

async function writeDailyBountyRewardRecord(playFabId, record, promisifyPlayFab, PlayFabServer) {
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [DAILY_BOUNTY_GACHA_DATA_KEY]: JSON.stringify(record)
        }
    });
}

function getDailyBountyPullCount(position) {
    const pos = Math.max(1, Math.floor(Number(position) || 0));
    return Math.max(0, Number(DAILY_BOUNTY_PULLS_BY_POSITION[pos] || 0));
}

async function claimDailyBountyGachaReward(playFabId, deps, todayKey) {
    const { promisifyPlayFab, PlayFabServer, addEconomyItem } = deps;
    const current = await readDailyBountyRewardRecord(playFabId, promisifyPlayFab, PlayFabServer);
    const currentNormalized = normalizeDailyBountyRewardRecord(current, todayKey);
    if (currentNormalized.alreadyClaimed) {
        return currentNormalized;
    }

    const contributionState = await ensureDailyContributionVersionForToday(deps, { todayKey });
    const rewardDayKey = contributionState.rewardDayKey || getPreviousJstDateKey(todayKey);
    const rewardVersion = contributionState.rewardVersion;
    if (!Number.isFinite(rewardVersion)) {
        const notReadyRecord = {
            dayKey: todayKey,
            rewardDayKey,
            checkedAt: new Date().toISOString(),
            eligible: false,
            rank: null,
            pulls: 0,
            itemIds: []
        };
        await writeDailyBountyRewardRecord(playFabId, notReadyRecord, promisifyPlayFab, PlayFabServer);
        return normalizeDailyBountyRewardRecord(notReadyRecord, todayKey);
    }

    const rankingResult = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
        StatisticName: DAILY_BOUNTY_STAT_NAME,
        StartPosition: 0,
        MaxResultsCount: DAILY_BOUNTY_TOP_COUNT,
        Version: rewardVersion
    });
    const ranking = Array.isArray(rankingResult?.Leaderboard) ? rankingResult.Leaderboard : [];
    const selfId = normalizePlayFabId(playFabId);
    let rank = null;
    for (let i = 0; i < ranking.length; i += 1) {
        const entryId = normalizePlayFabId(ranking[i]?.PlayFabId);
        if (entryId && entryId === selfId) {
            rank = i + 1;
            break;
        }
    }

    if (!rank) {
        const notEligibleRecord = {
            dayKey: todayKey,
            rewardDayKey,
            checkedAt: new Date().toISOString(),
            eligible: false,
            rank: null,
            pulls: 0,
            itemIds: []
        };
        await writeDailyBountyRewardRecord(playFabId, notEligibleRecord, promisifyPlayFab, PlayFabServer);
        return normalizeDailyBountyRewardRecord(notEligibleRecord, todayKey);
    }

    const pulls = getDailyBountyPullCount(rank);
    const grantedItemIds = [];
    for (let i = 0; i < pulls; i += 1) {
        const gachaResult = drawLocalGachaItem(deps.catalogCache);
        const itemId = String(gachaResult?.itemId || '').trim();
        if (!itemId) continue;
        const idempotencyId = `daily-bounty-gacha-${normalizePlayFabId(playFabId)}-${todayKey}-r${rank}-p${i + 1}-${itemId}`;
        await addEconomyItem(playFabId, itemId, 1, { idempotencyId });
        grantedItemIds.push(itemId);
    }

    const rewardRecord = {
        dayKey: todayKey,
        rewardDayKey,
        checkedAt: new Date().toISOString(),
        eligible: true,
        rank,
        pulls,
        itemIds: grantedItemIds
    };
    await writeDailyBountyRewardRecord(playFabId, rewardRecord, promisifyPlayFab, PlayFabServer);
    return normalizeDailyBountyRewardRecord(rewardRecord, todayKey);
}

async function updatePlayerGoldLeaderboard(playFabId, balance, deps) {
    const value = Math.max(0, Math.floor(Number(balance) || 0));
    if (!playFabId || !deps?.promisifyPlayFab || !deps?.PlayFabServer) return;
    try {
        await deps.promisifyPlayFab(deps.PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: value }]
        });
    } catch (error) {
        console.warn('[tarot-fortune] gold leaderboard update skipped:', error?.errorMessage || error?.message || error);
    }
}

function initializeTarotFortuneRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, addEconomyItem, getCurrencyBalance } = deps;

    app.post('/api/tarot-fortune-status', async (req, res) => {
        const playFabId = String(req.body?.playFabId || '').trim();
        if (!playFabId) {
            return res.status(400).json({ error: 'playFabId is required' });
        }
        try {
            const todayKey = getJstDayKey();
            const current = await readFortuneRecord(playFabId, promisifyPlayFab, PlayFabServer);
            const canDraw = !current || String(current.dayKey || '') !== todayKey;
            return res.json({
                canDraw,
                dayKey: todayKey,
                currency: VIRTUAL_CURRENCY_CODE,
                result: canDraw ? null : current
            });
        } catch (error) {
            console.error('[tarot-fortune-status] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'FailedToGetTarotFortuneStatus' });
        }
    });

    app.post('/api/tarot-fortune-draw', async (req, res) => {
        const playFabId = String(req.body?.playFabId || '').trim();
        if (!playFabId) {
            return res.status(400).json({ error: 'playFabId is required' });
        }
        try {
            const todayKey = getJstDayKey();
            const current = await readFortuneRecord(playFabId, promisifyPlayFab, PlayFabServer);
            if (current && String(current.dayKey || '') === todayKey) {
                const balance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
                let dailyBountyReward = null;
                try {
                    dailyBountyReward = await claimDailyBountyGachaReward(playFabId, deps, todayKey);
                } catch (rewardError) {
                    console.warn('[daily-bounty-gacha] claim skipped (already fortune claimed):', rewardError?.errorMessage || rewardError?.message || rewardError);
                }
                return res.json({
                    ok: true,
                    alreadyClaimed: true,
                    currency: VIRTUAL_CURRENCY_CODE,
                    balance,
                    result: current,
                    dailyBountyReward
                });
            }

            const deck = buildTarotDeck();
            const card = pickRandom(deck);
            if (!card) {
                return res.status(500).json({ error: 'TarotDeckEmpty' });
            }
            const orientation = Math.random() < 0.5 ? 'upright' : 'reversed';
            const reward = buildFortuneReward(card, orientation);
            const deckType = getDeckType(orientation);
            const skillName = getCardSkillName(card, orientation);
            const result = {
                dayKey: todayKey,
                drawnAt: new Date().toISOString(),
                cardId: card.id,
                cardNumber: Number(card.number) || 0,
                suit: card.suit || 'None',
                isArcana: !!card.isArcana,
                effectType: card.effectType || 'None',
                orientation,
                deckType,
                skillName,
                cardName: getCardName(card),
                fortune: getFortuneText(card, orientation),
                rewardType: reward.rewardType,
                rewardPs: reward.rewardPs,
                rewardItemId: reward.rewardItemId,
                rewardItemName: reward.rewardItemName,
                rewardLabel: reward.rewardLabel
            };

            if (reward.rewardType === 'card' && reward.rewardItemId) {
                const idempotencyId = `tarot-fortune-card-${playFabId}-${todayKey}-${reward.rewardItemId}`;
                await addEconomyItem(playFabId, reward.rewardItemId, 1, { idempotencyId });
            }
            if (reward.rewardPs > 0) {
                const goldIdempotencyId = `tarot-fortune-gold-${playFabId}-${todayKey}-${card.id}`;
                await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, reward.rewardPs, { idempotencyId: goldIdempotencyId });
            }
            await writeFortuneRecord(playFabId, result, promisifyPlayFab, PlayFabServer);
            let dailyBountyReward = null;
            try {
                dailyBountyReward = await claimDailyBountyGachaReward(playFabId, deps, todayKey);
            } catch (rewardError) {
                console.warn('[daily-bounty-gacha] claim skipped:', rewardError?.errorMessage || rewardError?.message || rewardError);
            }
            const balance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
            if (reward.rewardPs > 0) {
                await updatePlayerGoldLeaderboard(playFabId, balance, { promisifyPlayFab, PlayFabServer });
            }

            return res.json({
                ok: true,
                alreadyClaimed: false,
                currency: VIRTUAL_CURRENCY_CODE,
                awarded: reward.rewardPs,
                balance,
                result,
                dailyBountyReward
            });
        } catch (error) {
            console.error('[tarot-fortune-draw] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'FailedToDrawTarotFortune' });
        }
    });
}

module.exports = {
    initializeTarotFortuneRoutes
};

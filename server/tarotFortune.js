const { VIRTUAL_CURRENCY_CODE } = require('./economy');

const FORTUNE_DATA_KEY = 'DailyTarotFortune';
const DAILY_BOUNTY_GACHA_DATA_KEY = 'DailyBountyGachaReward';
const DAILY_BOUNTY_STAT_NAME = 'bounty_ranking';
const DAILY_BOUNTY_TOP_COUNT = Math.max(1, Math.floor(Number(process.env.DAILY_BOUNTY_TOP_COUNT || 3)));
const DAILY_BOUNTY_GACHA_TABLE_ID = String(process.env.DAILY_BOUNTY_GACHA_TABLE_ID || process.env.GACHA_DROP_TABLE_ID || 'gacha_table');
const DAILY_BOUNTY_GACHA_CATALOG_VERSION = String(process.env.DAILY_BOUNTY_GACHA_CATALOG_VERSION || process.env.GACHA_CATALOG_VERSION || 'main');
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
        upright: '自由な発想が運を開きます。軽やかな一歩が吉。',
        reversed: '無計画な行動に注意。確認を一つ増やすと安定します。'
    },
    1: {
        upright: 'あなたの才能が形になります。主導権を握る日です。',
        reversed: '焦りで力が空回りしやすい日。順序立てて進めましょう。'
    },
    2: {
        upright: '直感が冴えています。静かな判断が好結果を呼びます。',
        reversed: '迷いが出やすい日。情報を集めてから結論を出すと吉。'
    },
    3: {
        upright: '育てる力が高まる日。人脈や計画に実りが見えます。',
        reversed: '甘えや停滞に注意。生活リズムを整えると運気回復。'
    },
    4: {
        upright: '基盤固めに最適。ルール作りや整理整頓が成功の鍵。',
        reversed: '頑固さが摩擦を生みます。柔軟な対応で流れが改善。'
    },
    5: {
        upright: '信頼できる助言者に恵まれます。学び直しが吉。',
        reversed: '固定観念に縛られやすい日。常識を一度疑うと前進。'
    },
    6: {
        upright: '対人運上昇。誠実な選択が良縁を引き寄せます。',
        reversed: '感情優先で判断ミスの暗示。約束ごとは再確認を。'
    },
    7: {
        upright: '勢いに乗れます。目的を定めるほど勝率アップ。',
        reversed: '急ぎすぎると失点。速度より方向を意識しましょう。'
    },
    8: {
        upright: '粘り強さが実を結ぶ日。難所も着実に突破できます。',
        reversed: '気力低下のサイン。小さな成功を積んで調子を戻すと吉。'
    },
    9: {
        upright: '一人時間が質を上げます。振り返りが大きなヒントに。',
        reversed: '考え込み過ぎに注意。短時間で区切って行動へ。'
    },
    10: {
        upright: '好転の波が来ます。流れに乗る柔軟さが幸運を呼ぶ日。',
        reversed: 'タイミングが噛み合いにくい日。準備を徹底して待つのが吉。'
    },
    11: {
        upright: '公平な判断で評価が上がる日。契約ごとにも追い風。',
        reversed: 'かたよりが出やすい日。感情より事実ベースで判断を。'
    },
    12: {
        upright: '視点転換が突破口。あえて待つことで得るものがあります。',
        reversed: '停滞感の暗示。小さな変化を取り入れて流れを作りましょう。'
    },
    13: {
        upright: '古い流れの終わりと再生。手放しが新運気を呼び込みます。',
        reversed: '変化への抵抗が遅れを生みます。一区切りの決断が吉。'
    },
    14: {
        upright: 'バランス感覚が冴える日。調整役として成功しやすい。',
        reversed: '極端に振れやすい日。バランスを意識すると安定します。'
    },
    15: {
        upright: '欲望や執着が強まりやすい日。誘惑の見極めが鍵です。',
        reversed: '悪習慣を断つ好機。自制が運気改善に直結します。'
    },
    16: {
        upright: '価値観の再構築が起こる日。壊れた後に本物が残ります。',
        reversed: '先延ばしの反動に注意。早めの修正で被害最小化。'
    },
    17: {
        upright: '希望の光が差し込む日。長期目標に追い風が来ます。',
        reversed: '理想先行で空回りの暗示。現実的な一歩を重視すると吉。'
    },
    18: {
        upright: '感性が高い日。違和感を見逃さないことが成功の鍵。',
        reversed: '不安が膨らみやすい日。事実確認で霧が晴れます。'
    },
    19: {
        upright: '明るい成果が得られる日。堂々と前に出るほど運が伸びます。',
        reversed: '過信による失点に注意。謙虚さを添えると安定。'
    },
    20: {
        upright: '再起・復活の運気。過去の努力が再評価されやすい日です。',
        reversed: '決断の先送りは損。期限を決めて動くと好転します。'
    },
    21: {
        upright: '完成と達成の最良日。一区切りを祝うと次の扉が開きます。',
        reversed: '最後の確認不足に注意。最終確認を徹底すると大成功に。'
    }
};

const MINOR_SUIT_THEME = {
    Wand: {
        upright: '行動力と挑戦運',
        reversed: '勢いの空回り'
    },
    Sword: {
        upright: '判断力と対人調整運',
        reversed: '考え過ぎと衝突'
    },
    Cup: {
        upright: '恋愛運と感情運',
        reversed: '感情の乱れ'
    },
    Pentacle: {
        upright: '金運と実務運',
        reversed: '停滞と浪費'
    }
};

const MINOR_RANK_FORTUNE = {
    1: {
        upright: '新しい流れの始まり。最初の一歩を切ると吉。',
        reversed: '開始の遅れが出やすい日。準備の見直しが先決です。'
    },
    2: {
        upright: '二択を整える日。バランス重視で好結果に。',
        reversed: '優柔不断に注意。優先順位を明確にしましょう。'
    },
    3: {
        upright: '協力で成長する日。チームワークが鍵です。',
        reversed: '連携不足の暗示。役割分担を再確認すると吉。'
    },
    4: {
        upright: '安定運。守りを固めることで成果が残ります。',
        reversed: '停滞感あり。小さな改善を入れると流れが戻る。'
    },
    5: {
        upright: '試練の日。粘り強く進めば実力が伸びます。',
        reversed: '無用な対立を回避。冷静な会話で損失を防げます。'
    },
    6: {
        upright: '回復と前進。助け合いが運を押し上げます。',
        reversed: '過去への執着に注意。いま必要な行動に集中を。'
    },
    7: {
        upright: '防衛成功の暗示。立場を守る判断が冴える日。',
        reversed: '守り過ぎて機会損失。攻め所を一つ作ると吉。'
    },
    8: {
        upright: '鍛錬の成果が出る日。反復が強さに変わります。',
        reversed: '惰性に流れやすい日。目標を数値化すると改善。'
    },
    9: {
        upright: 'あと一歩を詰める日。継続で成果に届きます。',
        reversed: '疲労のサイン。休息を挟むほど結果が良くなります。'
    },
    10: {
        upright: '一区切りと達成。積み重ねが実を結ぶ日です。',
        reversed: '負担過多に注意。抱え込みを減らすと運気回復。'
    },
    11: {
        upright: '学びの芽が出る日。新しい知識が武器になります。',
        reversed: '未熟さが出やすい日。基本を丁寧に確認すると吉。'
    },
    12: {
        upright: '機動力が鍵。素早い対応が評価に直結します。',
        reversed: '焦りによる見落としに注意。確認を一段増やしましょう。'
    },
    13: {
        upright: '包容力が運を育てる日。周囲を支えるほど好転。',
        reversed: '気遣い疲れに注意。境界線を引くと安定します。'
    },
    14: {
        upright: '統率力が光る日。最終判断を任されやすい運勢。',
        reversed: '独断で摩擦が出やすい日。相談を挟むと成功率上昇。'
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

function getRewardPoints(card) {
    if (!card) return 0;
    if (card.isArcana && Number(card.number) === 21) return 100;
    if (card.isArcana && Number(card.number) === 20) return 50;
    if (!card.isArcana && Number(card.number) === 1) return 15;
    return Math.max(0, Math.floor(Number(card.number) || 0));
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
            ? '運気は安定。丁寧な行動が成果を引き寄せます。'
            : '焦りは禁物。確認を一つ増やすと流れが整います。';
    }
    const suit = String(card?.suit || 'Wand');
    const rank = Number(card?.number) || 1;
    const suitTheme = MINOR_SUIT_THEME[suit]?.[dir] || '基礎運';
    const rankText = MINOR_RANK_FORTUNE[rank]?.[dir]
        || (dir === 'upright'
            ? '基本を丁寧に積むと運が開きます。'
            : '無理をせず整えるほど好転します。');
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
    const itemIds = Array.isArray(record.itemIds)
        ? record.itemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)
        : [];
    const rank = Number(record.rank || 0);
    const pulls = Number(record.pulls || itemIds.length || 0);
    const eligible = !!record.eligible;
    const alreadyClaimed = dayKey === String(todayKey || '');
    return {
        dayKey,
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

    const rankingResult = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
        StatisticName: DAILY_BOUNTY_STAT_NAME,
        StartPosition: 0,
        MaxResultsCount: DAILY_BOUNTY_TOP_COUNT
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
        const randomResult = await promisifyPlayFab(PlayFabServer.EvaluateRandomResultTable, {
            TableId: DAILY_BOUNTY_GACHA_TABLE_ID,
            CatalogVersion: DAILY_BOUNTY_GACHA_CATALOG_VERSION
        });
        const itemId = String(randomResult?.ResultItemId || '').trim();
        if (!itemId) continue;
        const idempotencyId = `daily-bounty-gacha-${normalizePlayFabId(playFabId)}-${todayKey}-r${rank}-p${i + 1}-${itemId}`;
        await addEconomyItem(playFabId, itemId, 1, { idempotencyId });
        grantedItemIds.push(itemId);
    }

    const rewardRecord = {
        dayKey: todayKey,
        checkedAt: new Date().toISOString(),
        eligible: true,
        rank,
        pulls,
        itemIds: grantedItemIds
    };
    await writeDailyBountyRewardRecord(playFabId, rewardRecord, promisifyPlayFab, PlayFabServer);
    return normalizeDailyBountyRewardRecord(rewardRecord, todayKey);
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
            const rewardPs = getRewardPoints(card);
            const result = {
                dayKey: todayKey,
                drawnAt: new Date().toISOString(),
                cardId: card.id,
                cardNumber: Number(card.number) || 0,
                suit: card.suit || 'None',
                isArcana: !!card.isArcana,
                effectType: card.effectType || 'None',
                orientation,
                cardName: getCardName(card),
                fortune: getFortuneText(card, orientation),
                rewardPs
            };

            const idempotencyId = `tarot-fortune-${playFabId}-${todayKey}`;
            await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, rewardPs, { idempotencyId });
            await writeFortuneRecord(playFabId, result, promisifyPlayFab, PlayFabServer);
            let dailyBountyReward = null;
            try {
                dailyBountyReward = await claimDailyBountyGachaReward(playFabId, deps, todayKey);
            } catch (rewardError) {
                console.warn('[daily-bounty-gacha] claim skipped:', rewardError?.errorMessage || rewardError?.message || rewardError);
            }
            const balance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);

            return res.json({
                ok: true,
                alreadyClaimed: false,
                currency: VIRTUAL_CURRENCY_CODE,
                awarded: rewardPs,
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

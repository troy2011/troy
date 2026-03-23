export const SPIN_TAROT_SPRITE_CONFIG = {
    src: 'Sprites/Buildings/tarot.png',
    tileWidth: 48,
    tileHeight: 80,
    sheetWidth: 512,
    sheetHeight: 1024,
    majorArcanaOffset: 80,
    backIndex: 110
};

export const SPIN_TAROT_MAJOR_ARCANA = {
    0: { name: '愚者', icon: '🃏', summary: 'スピン開始時に中央がワイルドになる。フリーズ時はジャックポット。', foolWild: true, freezeJackpot: true },

    1: { name: '魔術師', icon: '✨', summary: '勝利時に魔法使いストックを追加。', mageGain: 2 },
    2: { name: '女教皇', icon: '💧', summary: '勝利時に各キャラを回復。', unitHeal: 16 },

    3: { name: '女帝', icon: '👑', summary: '役成立で人口が増加。', populationGain: 10, queenMultiplier: 2 },

    4: { name: '皇帝', icon: '🦁', summary: '勝利時に士気が高まり攻撃力上昇。', kingMultiplier: 2, moraleBoost: 1.2 },

    5: { name: '法王', icon: '⛪', summary: '勝利時にビショップを補充。', bishopGain: 1 },
    6: { name: '恋人', icon: '💞', summary: '勝利時に城壁を大回復。', castleHeal: 30 },
    7: { name: '戦車', icon: '🚎', summary: '横ライン成立時にナイト砲撃。', horizontalKnightBurst: 1.6 },
    8: { name: '力', icon: '🦾', summary: '斜めライン成立時にビショップ砲撃。', diagonalBishopBurst: 1.8 },
    9: { name: '隠者', icon: '🔮', summary: '勝利時に全体魔法ダメージ。', magicNova: 1.25 },
    10: { name: '運命の輪', icon: '🎡', summary: 'ハズレ時に盤面を再抽選。', redrawOnMiss: true },
    11: { name: '正義', icon: '⚖️', summary: '横ライン成立で回復付き貫通攻撃。', horizontalJusticeBurst: 1.8, lifestealRatio: 0.28 },
    12: { name: '吊るされた男', icon: '🪢', summary: '城壁10%消費で次回ツーペア以上を保証。', hpCostRatio: 0.1, guaranteeRole: 'TwoPair' },
    13: { name: '死神', icon: '💀', summary: '勝利時にコートカードを数値化して追撃。', deathCounter: 1.55, courtShift: -10 },
    14: { name: '節制', icon: '🪽', summary: '次回スピンをワンドとカップに絞る。', suitFilter: ['Wand', 'Cup'], magicNova: 1.1 },
    15: { name: '悪魔', icon: '😈', summary: '斜めライン成立時に闇の貫通攻撃。', diagonalDevilBurst: 2.1 },
    16: { name: '塔', icon: '🗼', summary: '横ライン成立時に大砲を強化。', horizontalTowerBurst: 2.6 },
    17: { name: '星', icon: '🌟', summary: '勝利時に回復し、配当が2倍。', castleHeal: 18, payoutMultiplier: 2 },
    18: { name: '月', icon: '🌙', summary: '敵に幻惑を付与し、次の敵攻撃を反射。', confuseTurns: 1 },
    19: { name: '太陽', icon: '☀️', summary: '勝利時に大きな全体魔法ダメージ。', magicNova: 2.2 },
    20: { name: '審判', icon: '📯', summary: '斜めライン成立時に大貫通ダメージ。', diagonalJudgementBurst: 2.8 },
    21: { name: '世界', icon: '🌍', summary: '最強フリーズで世界制覇。次のバトルはランク3から開始。', worldJackpot: true, globalVictory: true }
};

export const SPIN_TAROT_CONFIG = {
    board: {
        rows: 3,
        reels: 5,
        paylines: [
            { id: 'mid', label: 'MID', rows: [1, 1, 1, 1, 1] },
            { id: 'top', label: 'TOP', rows: [0, 0, 0, 0, 0] },
            { id: 'bot', label: 'BOT', rows: [2, 2, 2, 2, 2] },
            { id: 'diag-fall', label: '＼', rows: [0, 0, 1, 2, 2] },
            { id: 'diag-rise', label: '／', rows: [2, 2, 1, 0, 0] },
            { id: 'v-up', label: 'V', rows: [0, 1, 2, 1, 0] },
            { id: 'v-down', label: 'Λ', rows: [2, 1, 0, 1, 2] },
            { id: 'zig-right', label: 'Z1', rows: [1, 0, 1, 2, 1] },
            { id: 'zig-left', label: 'Z2', rows: [1, 2, 1, 0, 1] }
        ]
    },
    deck: {
        finite: true,
        ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    },
    lineSelection: {
        defaultActiveLines: 9,
        minActiveLines: 1,
        maxActiveLines: 9,
        allowedCounts: [1, 3, 5, 9]
    },
    suits: [
        { key: 'Wand', label: 'ワンド', icon: '🪄', enemyEmoji: '🧙', weight: 1 },
        { key: 'Sword', label: 'ソード', icon: '⚔️', enemyEmoji: '👹', weight: 1 },
        { key: 'Cup', label: 'カップ', icon: '🩵', enemyEmoji: '🧝', weight: 1 },
        { key: 'Pentacle', label: 'ペンタクル', icon: '🪙', enemyEmoji: '👺', weight: 1 }
    ],
    rankWeights: {
        1: 1,
        2: 1,
        3: 1,
        4: 1,
        5: 1,
        6: 1,
        7: 1,
        8: 1,
        9: 1,
        10: 1,
        11: 1,
        12: 1,
        13: 1
    },
    payoutTable: {
        OnePair: { multiplier: 1, label: 'リプレイ' },
        TwoPair: { multiplier: 2, label: 'ツーペア' },
        ThreeKind: { multiplier: 3, label: 'スリーカード' },
        Straight: { multiplier: 5, label: 'ストレート' },
        Flush: { multiplier: 7, label: 'フラッシュ' },
        FullHouse: { multiplier: 10, label: 'フルハウス' },
        FourKindLow: { multiplier: 50, label: 'フォーカード(1-10)' },
        FourKindHigh: { multiplier: 150, label: 'フォーカード(J-A)' },
        StraightFlush: { multiplier: 500, label: 'ストレートフラッシュ' },
        RoyalStraightFlush: { multiplier: 4000, label: 'ロイヤルストレートフラッシュ' }
    },
    betLevels: [
        { level: 1, cost: 1, statMultiplier: 1, label: 'BET 1' },
        { level: 2, cost: 2, statMultiplier: 2, label: 'BET 2' },
        { level: 5, cost: 5, statMultiplier: 5, label: 'BET 5' },
        { level: 10, cost: 10, statMultiplier: 10, label: 'MAX BET' }
    ],
    startingResources: {
        coins: 240,
        castleHp: 180,
        castleMaxHp: 180
    },
    statusGrowth: {
        1: { rankGauge: 8, kingGauge: 8, summary: 'エースゲージ' },
        11: { population: 8, summary: '人口' },
        12: { knights: 2, summary: '騎士' },
        13: { rankGauge: 6, queenGauge: 6, summary: 'クイーンゲージ' },
        flushMageGain: 1
    },
    combat: {
        lineAttackBase: 8,
        knightPower: 4,
        magePower: 5,
        bishopPower: 10,
        populationShieldRatio: 0.02,
        payoutToDamageRatio: 0.18,
        minimumBattleDamage: 8,
        maxCarryShield: 0.45,
        battleRewardMultiplier: 1.1,
        enemyMissDamageBase: 18,
        treasureChestMin: 8,
        treasureChestMax: 22
    },
    minorArcana: {
        mysteryWild: {
            holdRank: 2,
            triggerProbability: 1,
            summary: 'ハズレ時に最強役へ化けるワイルド'
        },
        skipNudge: {
            holdRank: 5,
            triggerProbability: 1,
            minShift: 1,
            maxShift: 2,
            guaranteeRole: 'OnePair',
            summary: 'ハズレ時にリールが滑って最低でもワンペアを形成'
        },
        cascade: {
            holdRank: 8,
            triggerProbability: 1,
            multiplierStep: 1,
            summary: 'ハズレ枠を破壊し、破壊数ぶん倍率アップ'
        }
    },
    zones: {
        heaven: { label: '天国', probability: 0.18, minSpins: 6, maxSpins: 8 },
        normal: { label: '通常', probability: 0.64, minSpins: 12, maxSpins: 18 },
        ceiling: { label: '深追い', probability: 0.18, minSpins: 24, maxSpins: 36 }
    },
    enemyNations: {
        Sword: {
            label: 'ソード国',
            emoji: '👹',
            summary: '超攻撃力で短期決戦型',
            hp: 150,
            attack: 34,
            healRatio: 0,
            holdLockChance: 0,
            fortifyRatio: 0
        },
        Cup: {
            label: 'カップ国',
            emoji: '🧝',
            summary: '毎ターン再生する回復型',
            hp: 140,
            attack: 19,
            healRatio: 0.14,
            holdLockChance: 0,
            fortifyRatio: 0
        },
        Wand: {
            label: 'ワンド国',
            emoji: '🧙',
            summary: 'ホールド妨害の術を使う',
            hp: 145,
            attack: 24,
            healRatio: 0,
            holdLockChance: 0.34,
            fortifyRatio: 0
        },
        Pentacle: {
            label: 'ペンタクル国',
            emoji: '🏰',
            summary: '高HPの要塞型',
            hp: 240,
            attack: 16,
            healRatio: 0,
            holdLockChance: 0,
            fortifyRatio: 0.18
        }
    },
    premiumEvents: {
        bossRaid: {
            probability: 0.022,
            label: '超強敵乱入',
            enemy: {
                label: 'ドラゴン乱入',
                emoji: '🐉',
                hp: 420,
                attack: 32,
                healRatio: 0.05,
                holdLockChance: 0.2,
                fortifyRatio: 0.12
            }
        },
        treasureIsland: {
            probability: 0.032,
            label: '宝島エピソード',
            minSpins: 5,
            maxSpins: 7
        },
        freeze: {
            probability: 0.0018,
            label: 'ロングフリーズ',
            jackpotMultiplier: 60
        },
        preAlertVibrateProbability: 0.18
    },
    majorArcana: {
        normalPool: [1, 2, 3, 4, 5],
        battlePoolByTier: {
            1: [6, 7, 8, 9, 10],
            2: [11, 12, 13, 14, 15],
            3: [16, 17, 18, 19, 20]
        },
        freezePool: [0, 21],
        changeEverySpins: 5
    },
    kingdomRank: {
        minRank: 1,
        maxRank: 20,
        gaugePerRank: 24,
        tierThresholds: [
            { minRank: 1, maxRank: 7, tier: 1 },
            { minRank: 8, maxRank: 14, tier: 2 },
            { minRank: 15, maxRank: 20, tier: 3 }
        ]
    },
    progression: {
        guaranteedBattleRewardCoins: 32,
        battleRewardPerRank: 4,
        bossBattleRewardBonus: 48,
        lossRefundRatio: 0.2,
        logLimit: 14,
        treasureCooldownSpins: 18,
        omenGaugeMax: 100,
        hintThreshold: 36,
        highThreshold: 82,
        czThreshold: 112,
        missOmenGain: 7,
        replayOmenGain: 8,
        twoPairOmenGain: 12,
        strongOmenGain: 18,
        premiumOmenGain: 24,
        missQueenGain: 1,
        missKingGain: 0,
        replayQueenGain: 2,
        strongKingGain: 2,
        queenModeThreshold: 72,
        kingModeThreshold: 96,
        queenModeSpins: 4,
        kingModeSpins: 3,
        czSpins: 3,
        czTarget: 120,
        czMissGain: 10,
        czReplayGain: 20,
        czStrongGain: 36
    },
    ui: {
        spinBounceMs: 360,
        cutinMs: 1800,
        logDelayMs: 260,
        resultPulseMs: 720
    },
    adapters: {
        enablePersistence: true,
        storageKey: 'spinTarotState.v2'
    }
};

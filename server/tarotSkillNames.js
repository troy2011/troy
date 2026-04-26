// server/tarotSkillNames.js
// タロットカードのスキル名辞書
// 小アルカナ: 正位置/逆位置で向きによって名前が変わる
// 大アルカナ: カード名そのまま（向きに関係なく同じ）

const MINOR_SKILL_NAMES = {
    wand: {
        1:  { upright: '開幕',    reversed: '空転'    },
        2:  { upright: '遠望',    reversed: '焦燥'    },
        3:  { upright: '出航',    reversed: '停滞'    },
        4:  { upright: '平和',    reversed: '遅延'    },
        5:  { upright: '乱戦',    reversed: '強襲号令' },
        6:  { upright: '凱旋',    reversed: '慢心'    },
        7:  { upright: '迎撃',    reversed: '疲弊'    },
        8:  { upright: '疾風',    reversed: '混乱'    },
        9:  { upright: '持久',    reversed: '疑心'    },
        10: { upright: '重圧',    reversed: '崩壊'    },
        11: { upright: '探求',    reversed: '軽率'    },
        12: { upright: '突撃',    reversed: '暴走'    },
        13: { upright: '勇猛',    reversed: '嫉妬'    },
        14: { upright: '先見',    reversed: '独裁'    }
    },
    sword: {
        1:  { upright: '明断',    reversed: '混迷'    },
        2:  { upright: '膠着',    reversed: '欺瞞'    },
        3:  { upright: '悲嘆',    reversed: '解放'    },
        4:  { upright: '瞑想',    reversed: '焦慮'    },
        5:  { upright: '屈辱',    reversed: '和解'    },
        6:  { upright: '旅立',    reversed: '未練'    },
        7:  { upright: '奇策',    reversed: '暴露'    },
        8:  { upright: '束縛',    reversed: '退避路'  },
        9:  { upright: '悪夢',    reversed: '覚醒'    },
        10: { upright: '終焉',    reversed: '復活'    },
        11: { upright: '洞察',    reversed: '欺き'    },
        12: { upright: '果断',    reversed: '暴言'    },
        13: { upright: '鋭敏',    reversed: '冷酷'    },
        14: { upright: '公正',    reversed: '専制'    }
    },
    cup: {
        1:  { upright: '溢愛',    reversed: '枯渇'    },
        2:  { upright: '調和',    reversed: '救難信号' },
        3:  { upright: '祝宴',    reversed: '放縦'    },
        4:  { upright: '倦怠',    reversed: '再起'    },
        5:  { upright: '喪失',    reversed: '希望'    },
        6:  { upright: '追憶',    reversed: '執着'    },
        7:  { upright: '幻想',    reversed: '意志'    },
        8:  { upright: '撤退',    reversed: '漂流'    },
        9:  { upright: '満足',    reversed: '過信'    },
        10: { upright: '幸福',    reversed: '幻滅'    },
        11: { upright: '夢想',    reversed: '幻惑'    },
        12: { upright: '魅力',    reversed: '詐欺'    },
        13: { upright: '慈愛',    reversed: '操作'    },
        14: { upright: '知恵',    reversed: '不誠実'  }
    },
    pentacle: {
        1:  { upright: '豊穣',    reversed: '損失'    },
        2:  { upright: '均衡',    reversed: '過負荷'  },
        3:  { upright: '熟練',    reversed: '粗雑'    },
        4:  { upright: '蓄積',    reversed: '執着'    },
        5:  { upright: '困窮',    reversed: '援助'    },
        6:  { upright: '施し',    reversed: '負債'    },
        7:  { upright: '忍耐',    reversed: '焦燥'    },
        8:  { upright: '修練',    reversed: '怠惰'    },
        9:  { upright: '充足',    reversed: '浪費'    },
        10: { upright: '繁栄',    reversed: '崩壊'    },
        11: { upright: '勤勉',    reversed: '怠慢'    },
        12: { upright: '着実',    reversed: '停滞'    },
        13: { upright: '豊かさ',  reversed: '物欲'    },
        14: { upright: '安定',    reversed: '腐敗'    }
    }
};

// 大アルカナ: 向きに関係なくカード名そのまま
const MAJOR_SKILL_NAMES = {
    0:  '愚者',
    1:  '魔術師',
    2:  '女教皇',
    3:  '女帝',
    4:  '皇帝',
    5:  '法王',
    6:  '恋人',
    7:  '戦車',
    8:  '力',
    9:  '隠者',
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

function normalizeSuitKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'wands') return 'wand';
    if (raw === 'swords') return 'sword';
    if (raw === 'cups') return 'cup';
    if (raw === 'pentacles') return 'pentacle';
    return raw;
}

/**
 * 小アルカナのスキル名を返す
 * @param {string} suit  - 'wand' | 'sword' | 'cup' | 'pentacle'
 * @param {number} rank  - 1-14
 * @param {string} orientation - 'upright' | 'reversed'
 * @returns {string}
 */
function getMinorSkillName(suit, rank, orientation) {
    const suitKey = normalizeSuitKey(suit);
    const rankNum = Number(rank);
    const dir = orientation === 'reversed' ? 'reversed' : 'upright';
    return MINOR_SKILL_NAMES[suitKey]?.[rankNum]?.[dir] || '';
}

/**
 * 大アルカナのスキル名を返す（向きに関係なく同じ）
 * @param {number} arcanaNumber - 0-21
 * @returns {string}
 */
function getMajorSkillName(arcanaNumber) {
    return MAJOR_SKILL_NAMES[Number(arcanaNumber)] || `大アルカナ${arcanaNumber}`;
}

/**
 * カードオブジェクトとオリエンテーションからスキル名を返す汎用関数
 * @param {object} card - { isArcana, number, suit }  (buildTarotDeck() の形式)
 * @param {string} orientation - 'upright' | 'reversed'
 * @returns {string}
 */
function getCardSkillName(card, orientation) {
    if (!card) return '';
    if (card.isArcana) {
        return getMajorSkillName(card.number);
    }
    return getMinorSkillName(card.suit, card.number, orientation);
}

module.exports = {
    MINOR_SKILL_NAMES,
    MAJOR_SKILL_NAMES,
    getMinorSkillName,
    getMajorSkillName,
    getCardSkillName
};

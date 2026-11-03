// Monster detail for the exploration stage list: how each monster looks and fights, plus its element,
// weakness, ailments, special ability and the weapons that hit it hard. The numbers come from the battle
// data (the same functions a battle uses), so this file only adds the written descriptions.
import {
    getTarotKingdomEnemyAffinity,
    TAROT_KINGDOM_ELEMENT_LABELS
} from './tarotKingdomMajorEffects.js?v=20261103-element-balance-v1';
import { getTarotKingdomEnemyAbilityProfile } from './tarotKingdomEnemies.js?v=20261103-element-balance-v1';
import {
    TAROT_KINGDOM_WEAPON_PROFILES,
    TAROT_KINGDOM_WEAPON_TAG_LABELS,
    getTarotKingdomMonsterWeaponTags,
    getTarotKingdomMonsterWeakFamilies
} from './tarotKingdomWeaponRules.js?v=20261103-element-balance-v1';

// look: what it is; single / area: its attack on one member and on the whole party
const MONSTER_NOTES = Object.freeze({
    'ismartal-vol1-monster-01': { look: '赤く焼けたトゲに覆われた、丸いハリネズミのような魔物。', single: '焼けたトゲを弾き飛ばす', area: '地面から燃えるトゲを突き出す' },
    'ismartal-vol1-monster-02': { look: '目のついた魔導書。ページを牙のように開いて噛みつく。', single: '炎の呪文を唱える', area: '全員に炎の印を刻む' },
    'ismartal-vol1-monster-03': { look: '骨だけになった獣。骨の芯でくすぶる火を宿している。', single: '燃える骨を投げつける', area: '足元から骨の炎を噴き上げる' },
    'ismartal-vol1-monster-04': { look: '角の生えた殻を背負う、青いカタツムリ。', single: '水流を吹きつける', area: '足元に波紋を広げる' },
    'ismartal-vol1-monster-05': { look: '小さな体に大きな一つ目がついた魔物。', single: 'じっとにらみつける', area: '全員をにらみつける' },
    'ismartal-vol1-monster-06': { look: '翼のような脚を持つ紫の大きな魔物。風に乗って飛び回る。', single: '突風とともに噛みつく', area: 'コウモリの群れをけしかける' },
    'ismartal-vol1-monster-07': { look: '小さな赤いキノコの魔物。', single: '胞子を吹きつける', area: '全員に胞子をまき散らす' },
    'ismartal-vol1-monster-08': { look: '地面からはい出す、黒い影の手。', single: '影の腕で足元からつかみかかる', area: '全員の足元から影の腕を伸ばす' },
    'ismartal-vol1-monster-09': { look: '火の粉のように光るホタルの群れ。', single: '火の玉になって飛びこむ', area: '全員に火の玉をぶつける' },
    'ismartal-vol1-monster-10': { look: '大きな葉っぱに隠れた魔物。', single: '葉をムチのように振るう', area: '花びらを突風に乗せる' },
    'ismartal-vol1-monster-11': { look: '大きなあごを持つ青い魚竜。', single: '水流を吐きつける', area: '足元に渦潮を起こす' },
    'ismartal-vol1-monster-12': { look: '針のような口を持つ、ピンクの羽虫の群れ。', single: '群れで渦を巻いて襲う', area: '全員に群れでまとわりつく' },
    'ismartal-vol1-monster-13': { look: '緑色の水ヘビ。', single: '水をまとって噛みつく', area: '雨を降らせる' },
    'ismartal-vol1-monster-14': { look: 'オレンジ色のタコ。', single: '墨を吹きつける', area: '足元に墨を広げる' },
    'ismartal-vol1-monster-15': { look: '大きな口を持つ食虫植物。', single: 'ツルを振るう', area: '足元に毒の沼をつくる' },
    'ismartal-vol1-monster-16': { look: '月の光をまとう大きな蛾。', single: '光の羽で打つ', area: '周りに光のトゲを広げる' },
    'ismartal-vol1-monster-17': { look: '毒針を持つ紫の羽虫。', single: '電気をまとって噛みつく', area: 'コウモリの群れを呼ぶ' },
    'ismartal-vol1-monster-18': { look: '口から緑のガスを吐く、紫の魔物。', single: 'ガスを吹きつける', area: '全員をガスで包む' },
    'ismartal-vol1-monster-19': { look: '紫色のぷるぷるしたゼリーの魔物。', single: '水の玉を落とす', area: '雨を降らせる' },
    'ismartal-vol1-monster-20': { look: '水でできた幽霊。', single: '水の玉を落とす', area: '滝のような水を浴びせる' },
    'ismartal-vol2-monster-01': { look: '氷のトゲを背負った青いナメクジ。', single: '氷の槍を放つ', area: '冷気を広げて凍らせる' },
    'ismartal-vol2-monster-02': { look: 'きらめく鱗粉をまとう蝶。', single: '光る鱗粉を弾けさせる', area: '光る蝶を全員に向かわせる' },
    'ismartal-vol2-monster-03': { look: '大きな羽を持つ灰色の蛾。', single: '毒の鱗粉を飛ばす', area: '鱗粉の雲を広げる' },
    'ismartal-vol2-monster-04': { look: '大きな角を持つカブトムシ。', single: '角で土ごとはね上げる', area: '地面を揺らす' },
    'ismartal-vol2-monster-05': { look: '槍を持った緑のゴブリン。', single: '槍を投げつける', area: '全員の足元から石のトゲを突き出す' },
    'ismartal-vol2-monster-06': { look: '葉に包まれた大きな球根。', single: '種を光らせて弾けさせる', area: '全員に胞子を浴びせる' },
    'ismartal-vol2-monster-07': { look: '赤いトゲに覆われた巨大な甲殻獣。森の主。', single: '体当たりで押しつぶす', area: 'トゲを突き出して地面を揺らす' },
    'ismartal-vol2-monster-08': { look: '赤い小鬼。', single: '火を吐く', area: '周りを炎の輪で包む' },
    'ismartal-vol2-monster-09': { look: '鳥のような頭をした茶色の魔物。', single: '力いっぱい殴りつける', area: '周りを炎の輪で包む' },
    'ismartal-vol2-monster-10': { look: '歩く木の魔物。', single: '枝をムチのように振るう', area: '木の葉を降らせる' },
    'ismartal-vol2-monster-11': { look: '大きなハチ。', single: '針を突き刺す', area: '全員に飛びかかってしびれさせる' },
    'ismartal-vol2-monster-12': { look: '緑色の大きなカエル。', single: '舌でたたく', area: 'カエルたちを全員に飛びかからせる' },
    'ismartal-vol2-monster-13': { look: '牙の生えた黒いナメクジ。', single: 'ぬめる体で噛みつく', area: '雨を降らせる' },
    'ismartal-vol2-monster-14': { look: '燃えるトゲが並んだ毛虫。', single: '燃えるトゲを飛ばす', area: '足元に燃えるトゲを並べる' },
    'ismartal-vol2-monster-15': { look: '無数の目と口を持つ、深淵の主。', single: '深淵へ魂を引きずりこむ', area: '闇の炎と触手で全員を襲う' },
    'ismartal-vol2-monster-16': { look: '光をあやつる一つ目の主。', single: '光線を撃ちこむ', area: '光の網で全員を焼く' },
    'ismartal-vol2-monster-17': { look: '銃を持ったロボット。', single: '弾を撃ちこむ', area: 'レーザーの網を張る' },
    'ismartal-vol2-monster-18': { look: '燃えるドクロ。', single: '火の弾を撃つ', area: '爆発を起こす' },
    'ismartal-vol2-monster-19': { look: '宝箱に化けたミミック。', single: '闇をまとって噛みつく', area: '金貨を吐き出してぶつける' },
    'ismartal-vol2-monster-20': { look: '地面から顔を出す紫の大ミミズ。', single: '岩を投げつける', area: '地面を揺らす' },
    'ismartal-vol3-monster-01': { look: 'トゲのある岩の魔物。', single: '岩を落とす', area: '全員に岩を降らせる' },
    'ismartal-vol3-monster-02': { look: '炎の柱のような魔物。', single: '炎を噴きつける', area: '全員を炎でなぎ払う' },
    'ismartal-vol3-monster-03': { look: '顔のある竜巻。', single: '竜巻をぶつける', area: '全員の足元に竜巻を起こす' },
    'ismartal-vol3-monster-04': { look: '青いスライム。', single: 'スライムを落とす', area: '全員にスライムを落とす' },
    'ismartal-vol3-monster-05': { look: '灰色の雲の魔物。', single: '雷を落とす', area: '全員に嵐を起こす' },
    'ismartal-vol3-monster-06': { look: '紫のフードをかぶった魔導士。', single: '闇の炎を放つ', area: '全員の魂を引き抜こうとする' },
    'ismartal-vol3-monster-07': { look: 'トゲの生えた緑のゾンビ。', single: '腐った爪でひっかく', area: '腐った霧を広げる' },
    'ismartal-vol3-monster-08': { look: '大きな傘を持つキノコの魔物。', single: '胞子の弾を撃つ', area: '毒の霧を広げる' },
    'ismartal-vol3-monster-09': { look: '脚の生えた黒い爆弾。', single: '火花を散らして体当たりする', area: '爆発する' },
    'ismartal-vol3-monster-10': { look: '闇をまとうカラス。', single: '闇の弾を撃つ', area: 'カラスの群れで全員を襲う' }
});

const SPECIAL_KIND_TEXT = Object.freeze({
    heal: 'HPが減ると回復する',
    buff: '能力を高める',
    drain: '攻撃でHPを吸い取る',
    cleanse: '自分の状態異常を払う'
});

// weapon families in the order the equipment screen lists them
const WEAPON_FAMILY_ORDER = Object.freeze(['blade', 'dagger', 'heavy', 'polearm', 'ranged', 'arcane', 'martial']);

function elementLabel(key) {
    return key ? (TAROT_KINGDOM_ELEMENT_LABELS[key] || '') : '';
}

function weaponFamilyLabel(family) {
    const labels = Object.values(TAROT_KINGDOM_WEAPON_PROFILES)
        .filter((profile) => profile.family === family)
        .map((profile) => profile.label);
    return [...new Set(labels)].join('・');
}

/** Everything the detail dialog shows for one monster; null for an unknown id. */
export function getTarotKingdomMonsterDetail(monsterId = '') {
    const id = String(monsterId || '').trim();
    const notes = MONSTER_NOTES[id];
    if (!notes) return null;
    const affinity = getTarotKingdomEnemyAffinity(id, 3);
    const ability = getTarotKingdomEnemyAbilityProfile(id, 1);
    const ailments = [ability?.attacks?.single?.ailment, ability?.attacks?.area?.ailment]
        .filter(Boolean)
        .map((ailment) => String(ailment.label || ''))
        .filter(Boolean);
    const weakFamilies = getTarotKingdomMonsterWeakFamilies(id);
    return {
        id,
        look: notes.look,
        singleAttack: notes.single,
        areaAttack: notes.area,
        element: affinity.native,
        elementLabel: elementLabel(affinity.native) || '無',
        weak: affinity.weak,
        resist: affinity.resist,
        weakLabel: elementLabel(affinity.weak),
        resistLabel: elementLabel(affinity.resist),
        ailmentLabels: [...new Set(ailments)],
        specialLabel: ability?.special ? String(ability.special.label || '') : '',
        specialText: ability?.special ? (SPECIAL_KIND_TEXT[ability.special.kind] || '') : '',
        traitLabels: getTarotKingdomMonsterWeaponTags(id).map((tag) => TAROT_KINGDOM_WEAPON_TAG_LABELS[tag] || tag),
        weakWeaponLabels: WEAPON_FAMILY_ORDER.filter((family) => weakFamilies.includes(family)).map(weaponFamilyLabel)
    };
}

export const __test = { MONSTER_NOTES };

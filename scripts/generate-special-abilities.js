const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.resolve(__dirname, '..', 'server', 'data', 'special-abilities.json');
const CATALOG_VERSION = 2;

const TYPE_AFFINITIES = Object.freeze({
    INTJ: ['manipulation', 'specialization'],
    INTP: ['manipulation'],
    ENTJ: ['specialization', 'manipulation'],
    ENTP: ['transmutation', 'manipulation'],
    INFJ: ['specialization', 'conjuration'],
    INFP: ['conjuration', 'transmutation', 'specialization'],
    ENFJ: ['specialization', 'emission'],
    ENFP: ['transmutation', 'specialization'],
    ISTJ: ['enhancement', 'conjuration'],
    ISFJ: ['enhancement', 'conjuration'],
    ESTJ: ['enhancement', 'conjuration'],
    ESFJ: ['enhancement', 'emission'],
    ISTP: ['manipulation', 'transmutation'],
    ISFP: ['specialization', 'conjuration', 'transmutation'],
    ESTP: ['transmutation', 'emission'],
    ESFP: ['transmutation', 'emission']
});

const AFFINITY_TYPES = Object.freeze(Object.fromEntries(
    ['manipulation', 'specialization', 'transmutation', 'conjuration', 'enhancement', 'emission']
        .map((affinity) => [
            affinity,
            Object.entries(TYPE_AFFINITIES)
                .filter(([, affinities]) => affinities.includes(affinity))
                .map(([type]) => type)
        ])
));

function vectorForType(type) {
    return {
        E: type.startsWith('E') ? 1 : -1,
        S: type[1] === 'S' ? 1 : -1,
        T: type[2] === 'T' ? 1 : -1,
        J: type.endsWith('J') ? 1 : -1
    };
}

const BLUEPRINTS = Object.freeze({
    manipulation: {
        label: '操作',
        count: 55,
        motifs: [
            { name: '影糸', medium: '影から伸びる黒い糸', target: '視界に入った複数の物体', benefit: '複雑な動きを同時に整えられる' },
            { name: '鏡像', medium: '鏡面に映った像', target: '映り込んだ人や物の向き', benefit: '離れた位置から配置を組み替えられる' },
            { name: '磁針', medium: '空中に浮かぶ磁力の針', target: '金属と方角', benefit: '大量の金属を精密な軌道へ導ける' },
            { name: '音叉', medium: '狙った相手だけに届く共鳴音', target: '音を聞いた者の動作', benefit: '複数人の呼吸と行動を揃えられる' },
            { name: '花粉', medium: '淡く光る花粉', target: '触れた植物や小さな生き物', benefit: '広い範囲を一つの群れとして動かせる' },
            { name: '刻印', medium: '触れた場所へ残す発光文字', target: '刻印された道具の機能', benefit: '道具を望んだ順序で自動作動させられる' },
            { name: '香律', medium: '色の違う香りの帯', target: '香りに包まれた人の注意', benefit: '意識を狙った対象へ自然に集められる' },
            { name: '鎖環', medium: '空間を渡る透明な鎖', target: '鎖で結んだ複数の対象', benefit: '距離を越えて同じ動きを共有させられる' },
            { name: '光点', medium: '指先から放つ小さな光点', target: '光が触れた飛翔物', benefit: '多数の軌道を衝突なく操れる' },
            { name: '砂盤', medium: '宙に広がる細かな砂', target: '砂が形取った地形内の物体', benefit: '周囲の配置を立体図のように制御できる' },
            { name: '水紋', medium: '空中へ残る青い波紋', target: '波紋を通過した力の向き', benefit: '衝撃や流れを望む方向へ滑らかに変えられる' }
        ],
        forms: [
            { name: '操舵', action: '対象を狙った動きへ正確に導き', outcome: '入り組んだ場面でも全体を一つの意思のように動かせる' },
            { name: '同調', action: '対象を同じ規則へ揃え', outcome: 'ばらばらな動きを完全な連携へ変えられる' },
            { name: '転針', action: '対象へ働く力の方向を瞬時に切り替え', outcome: '変化する状況へ全対象を同時に適応させられる' },
            { name: '編隊', action: '対象を互いに連携する配置へ整え', outcome: '多数の対象を最適な関係のまま行動させられる' },
            { name: '指令', action: '対象を設定した一つの手順で動かし', outcome: '意図した作業を正確な順番で完遂させられる' }
        ]
    },
    specialization: {
        label: '特質',
        count: 78,
        motifs: [
            { name: '時枝', base: '時間の流れを細い枝のように見分け、数秒先の分岐を把握できる', impact: '行動すべき最善の瞬間を選び取れる' },
            { name: '記憶海', base: '人や場所に残った記憶を光景として読み取り、失われた出来事を再現できる', impact: '隠れた手掛かりを完全な形で取り戻せる' },
            { name: '因果環', base: '出来事同士を結ぶ因果の線を視認し、結果へ続く起点を特定できる', impact: '最小の働きかけで大きな流れを起こせる' },
            { name: '夢境', base: '眠る者が見ている夢へ静かに入り、景色や物語を自由に組み替えられる', impact: '心に残る鮮明な体験を夢の中へ届けられる' },
            { name: '幸運脈', base: '周囲に漂う偶然の偏りを読み、好機が集まる場所を見つけられる', impact: '選択を望ましい巡り合わせへ近づけられる' },
            { name: '真名印', base: '物や現象が持つ本質の名前を読み取り、その性質を正確に理解できる', impact: '未知の力でも最適な扱い方を即座に見抜ける' },
            { name: '境界線', base: '空間や概念の境目を光の線として捉え、境界の位置を自在に引き直せる', impact: '隔たりと接続を望む形へ組み替えられる' },
            { name: '共鳴核', base: '離れた存在同士に共通する感情や性質を見つけ、強い共鳴を生み出せる', impact: '本来交わらない力を一つの成果へ束ねられる' },
            { name: '未来片', base: 'これから起こり得る未来を断片的な映像として受け取り、複数の可能性を比較できる', impact: '危険を避けながら有利な未来を選べる' },
            { name: '過去窓', base: '指定した場所の過去を透明な窓として開き、その場で起きたことを観察できる', impact: '時間に埋もれた事実をそのまま確かめられる' },
            { name: '可能性樹', base: '人や物が秘めた成長の可能性を樹形図として映し出し、伸びる方向を見極められる', impact: '眠っている才能を最短の手順で開花させられる' },
            { name: '無音域', base: '音だけでなく気配や思考の雑音まで消える静かな領域を作り出せる', impact: '必要な一つの感覚へ意識を完全に集中できる' },
            { name: '生命譜', base: '生き物が持つ生命の律動を楽譜として読み、活力の流れを整えられる', impact: '集団全体を健やかで調和した状態へ導ける' }
        ],
        forms: [
            { name: '眼', method: '能力が捉えた変化を視界へ直接重ねて確認する', extension: '状況の全体像を一目で理解できる' },
            { name: '鍵', method: '能力の核心を開く鍵の形へ凝縮する', extension: '複雑な問題から必要な答えだけを取り出せる' },
            { name: '書', method: '能力が捉えた変化を消えない記録へ変える', extension: '知識を正確な形で他者にも共有できる' },
            { name: '鐘', method: '能力の働きを澄んだ音として周囲へ伝える', extension: '離れた仲間にも同じ気づきを同時に届けられる' },
            { name: '庭', method: '力が安定して働く専用の領域を広げる', extension: '複数の対象へ同じ恩恵を行き渡らせられる' },
            { name: '冠', method: '得た知見と力を一つの判断へ統合する', extension: '迷いのない決断として力を最大限に生かせる' }
        ]
    },
    transmutation: {
        label: '変化',
        count: 78,
        motifs: [
            { name: '雷性', base: '自らの力を青白い雷へ変え、触れた場所へ瞬時に走らせられる', impact: '広い範囲へ高速で作用を届けられる' },
            { name: '氷性', base: '自らの力を透明な冷気へ変え、空気や水を美しい氷へ変えられる', impact: '地形と流れを望む形へ整えられる' },
            { name: '霧性', base: '自らの力を濃密な霧へ変え、広い空間へ自在に満たせる', impact: '姿と気配を包み込みながら安全な道を作れる' },
            { name: '刃性', base: '自らの力へ鋭い刃の性質を与え、あらゆる形へ伸縮させられる', impact: '細かな作業から大きな切断まで正確に行える' },
            { name: '光性', base: '自らの力を純粋な光へ変え、暗闇や遠方へ自在に放てる', impact: '必要な場所を照らし情報を鮮明に伝えられる' },
            { name: '音性', base: '自らの力を音と振動へ変え、強さや高さを細かく調整できる', impact: '物質と感情の両方へ心地よい共鳴を起こせる' },
            { name: '重力性', base: '自らの力へ重力の性質を与え、引力と浮力を自在に切り替えられる', impact: '重い物も軽やかに運び空間の流れを支配できる' },
            { name: '泡性', base: '自らの力を弾力ある泡へ変え、大きさと硬さを自由に調整できる', impact: '衝撃を包み込み安全な足場や容器を作れる' },
            { name: '硝子性', base: '自らの力を透明で硬い硝子質へ変え、複雑な形へ瞬時に成形できる', impact: '視界を保ったまま堅牢な構造を生み出せる' },
            { name: '樹脂性', base: '自らの力を柔軟な樹脂へ変え、接着力と弾力を自在に操れる', impact: '壊れた物を補修し異なる素材を強く結び付けられる' },
            { name: '炎性', base: '自らの力を温度自在の炎へ変え、形を崩さず操れる', impact: '照明から高熱加工まで繊細に使い分けられる' },
            { name: '水銀性', base: '自らの力を鏡のような液体金属へ変え、細い隙間にも流し込める', impact: '自在な形状と高い伝導性を同時に生かせる' },
            { name: '植物性', base: '自らの力を急成長する蔓や葉の性質へ変え、広く枝分かれさせられる', impact: '空間を緑で満たし必要な形へ生長させられる' }
        ],
        forms: [
            { name: '衣', method: '全身を包む衣として展開できる', extension: '移動しながら力の性質を途切れず維持できる' },
            { name: '脈', method: '体内から地面や物体へ脈のように巡らせられる', extension: '触れた範囲全体へ均等に作用を広げられる' },
            { name: '翼', method: '背中から広がる翼の形へ整えられる', extension: '高速移動と広範囲への展開を同時に行える' },
            { name: '爪', method: '指先へ集めて繊細な道具のように扱える', extension: '細部まで狙い通りに加工し操作できる' },
            { name: '波', method: '連続する波として周囲へ送り出せる', extension: '複数の対象へ滑らかに力を行き渡らせられる' },
            { name: '輪', method: '空中に浮かぶ輪として保持できる', extension: '必要な瞬間に任意の場所から力を呼び出せる' }
        ]
    },
    conjuration: {
        label: '具現化',
        count: 66,
        motifs: [
            { name: '万能鍵', object: '形のない仕組みにも差し込める鍵', benefit: '閉ざされた情報や経路を安全に開けられる' },
            { name: '星図', object: '周囲の地形と動きを自動で描く立体地図', benefit: '見えない場所を含めた最適な進路を把握できる' },
            { name: '護界盾', object: '守る対象に合わせて形を変える透明な盾', benefit: '複数方向から届く力をまとめて受け止められる' },
            { name: '静止檻', object: '内部の動きを穏やかに止める光の檻', benefit: '危険な物や現象を傷付けず安全に保管できる' },
            { name: '空渡橋', object: '離れた二点を一直線に結ぶ空中の橋', benefit: '地形に左右されず誰でも安定して移動できる' },
            { name: '遠隔扉', object: '記憶した場所へ通じる自立した扉', benefit: '遠く離れた地点同士を短い通路で結べる' },
            { name: '代行人形', object: '持ち主の技術を再現する精巧な人形', benefit: '複数の作業を同じ品質で同時に進められる' },
            { name: '無限書庫', object: '得た知識を自動分類する小さな書庫', benefit: '必要な情報を瞬時に検索して取り出せる' },
            { name: '即成工房', object: '材料に合わせて設備が変化する移動工房', benefit: '場所を選ばず高度な制作と修復を行える' },
            { name: '雲上船', object: '空と水の両方を進める小型の船', benefit: '仲間や荷物を守りながら自由な航路を進める' },
            { name: '観測塔', object: '遠方と微細な変化を同時に映す高い塔', benefit: '広域の異変を早い段階で正確に発見できる' }
        ],
        forms: [
            { name: '原型', method: '必要な時に完成した姿で素早く呼び出せる', extension: 'その場で待ち時間なく本来の機能を使える' },
            { name: '群体', method: '同じ機能を持つ複数の個体へ分けられる', extension: '広い範囲で同時に役目を果たせる' },
            { name: '巨構', method: '建造物ほどの規模へ拡張できる', extension: '広い範囲全体へ一度に機能を及ぼせる' },
            { name: '自律', method: '目的を理解して自動で働く機能を持つ', extension: '使い手が離れていても最適な動作を続けられる' },
            { name: '共用', method: '触れた仲間にも同じ機能を使わせられる', extension: '一つの能力を集団全体の力へ変えられる' },
            { name: '連結', method: '別の具現物と自由に組み合わせられる', extension: '状況に合わせて新しい用途へ発展させられる' }
        ]
    },
    enhancement: {
        label: '強化',
        count: 44,
        motifs: [
            { name: '剛力', base: '筋力と瞬発力を大きく高め、巨大な物も自在に扱える', benefit: '細かな力加減を保ったまま圧倒的な出力を発揮できる' },
            { name: '鷹眼', base: '視覚を遠距離と微細観察の両方へ高められる', benefit: '暗所や高速移動中でも重要な変化を見逃さない' },
            { name: '天聴', base: '聴覚を広範囲へ拡張し、重なる音を一つずつ聞き分けられる', benefit: '遠方の合図や異常を正確に捉えられる' },
            { name: '神速反射', base: '反射神経と身体制御を極限まで高められる', benefit: '予想外の変化にも考える前に最適な動きで対応できる' },
            { name: '再生力', base: '身体が本来持つ回復力を強く引き出せる', benefit: '疲労を素早く整え健やかな状態を長く保てる' },
            { name: '金剛身', base: '皮膚と骨格の耐久性を高め、全身を強固に保てる', benefit: '大きな負荷の中でも安定した動作を続けられる' },
            { name: '空踏', base: '脚力と平衡感覚を高め、わずかな足場でも大きく跳躍できる', benefit: '立体的な空間を地上と同じように移動できる' },
            { name: '霊嗅', base: '嗅覚を高め、物質だけでなく力の残り香まで追跡できる', benefit: '複雑な場所でも目的の痕跡を正確に辿れる' },
            { name: '一点集中', base: '意識の密度を高め、長時間でも深い集中を保てる', benefit: '膨大な情報から必要な一つを正確に処理できる' },
            { name: '精密手', base: '指先の感覚と制御力を高め、微細な動きを完全に再現できる', benefit: '高度な制作や調整を安定した品質で行える' },
            { name: '生命炉', base: '全身の活力を高め、周囲へ温かな生命力を巡らせられる', benefit: '自分と仲間の行動力を力強く引き上げられる' }
        ],
        forms: [
            { name: '極', method: '必要な一点へ力を集中できる', extension: '狙った能力だけを瞬間的に最大まで引き上げられる' },
            { name: '刻', method: '高めた状態を安定して持続できる', extension: '長い活動でも性能を落とさず保てる' },
            { name: '鎧', method: '強化した力を全身へ均等に巡らせられる', extension: '動きと守りを両立した完成度の高い状態になれる' },
            { name: '冠', method: '強化の恩恵を近くの仲間へ共有できる', extension: '集団全体の能力を同時に底上げできる' }
        ]
    },
    emission: {
        label: '放出',
        count: 44,
        motifs: [
            { name: '光弾', base: '凝縮した光を遠方へ正確に送り届けられる', benefit: '暗闇を照らしながら狙った場所へ強い作用を与えられる' },
            { name: '響波', base: '澄んだ音の波を広い範囲へ放てる', benefit: '障害物の向こうまで合図と共鳴を届けられる' },
            { name: '熱流', base: '温かな熱の流れを遠方へ送り、範囲全体を均一に温められる', benefit: '大きな空間の環境を短時間で快適に整えられる' },
            { name: '冷流', base: '清涼な冷気を遠方へ送り、熱を素早く整えられる', benefit: '広い範囲を安定した温度へ変えられる' },
            { name: '衝波', base: '力強い衝撃を直線や曲線の軌道で放てる', benefit: '離れた対象へ正確に運動エネルギーを届けられる' },
            { name: '磁界', base: '磁力の場を遠くへ展開し、金属や電流へ作用できる', benefit: '広域の機械や金属を一斉に整えられる' },
            { name: '活力波', base: '穏やかな活力を波として周囲へ放てる', benefit: '離れた仲間まで気力に満ちた状態へ導ける' },
            { name: '索敵波', base: '見えない探査の波を全方向へ放ち、反応を立体的に捉えられる', benefit: '広い範囲の地形と動く存在を正確に把握できる' },
            { name: '転送光', base: '物や情報を光へ変えて指定地点へ送り届けられる', benefit: '距離を越えて必要なものを瞬時に共有できる' },
            { name: '心話', base: '言葉と感情を直接届く思念として放てる', benefit: '遠く離れた相手とも明瞭で温度のある意思疎通ができる' },
            { name: '重圧波', base: '空間を押す力を広い面として放てる', benefit: '多数の対象や大きな物体を同時に望む方向へ動かせる' }
        ],
        forms: [
            { name: '砲', method: '一点へ密度高く収束して放てる', extension: '遠距離でも作用を弱めず正確に届けられる' },
            { name: '環', method: '自分を中心とした円環状に広げられる', extension: '全方向へ均等に力を行き渡らせられる' },
            { name: '矢', method: '複数の軌道へ分けて同時に放てる', extension: '離れた複数の対象へ個別に作用を届けられる' },
            { name: '門', method: '空間に固定した出口から連続して放てる', extension: '自分の位置に関係なく必要な場所へ力を供給できる' }
        ]
    }
});

function buildName(affinity, motif, form, index) {
    void affinity;
    void index;
    return `${motif.name}・${form.name}`;
}

function buildEffect(affinity, motif, form) {
    if (affinity === 'manipulation') {
        return `${motif.medium}を介して${motif.target}へ働きかけ、${form.action}ながら${motif.benefit}。その制御により、${form.outcome}。`;
    }
    if (affinity === 'specialization') {
        return `${motif.base}うえ、${form.method}ことで、${motif.impact}。その形式により、${form.extension}。`;
    }
    if (affinity === 'transmutation') {
        return `${motif.base}うえ、${form.method}ため、${motif.impact}。その形を生かし、${form.extension}。`;
    }
    if (affinity === 'conjuration') {
        return `${motif.object}を具現化し、${form.method}ため、${motif.benefit}。その構造により、${form.extension}。`;
    }
    if (affinity === 'enhancement') {
        return `${motif.base}うえ、${form.method}ため、${motif.benefit}。その強化により、${form.extension}。`;
    }
    return `${motif.base}うえ、${form.method}ため、${motif.benefit}。その放ち方により、${form.extension}。`;
}

function buildAbilitiesForAffinity(affinity, blueprint) {
    const compatibleTypes = AFFINITY_TYPES[affinity];
    const abilities = [];
    blueprint.motifs.forEach((motif, motifIndex) => {
        blueprint.forms.forEach((form, formIndex) => {
            const index = abilities.length;
            const targetType = compatibleTypes[index % compatibleTypes.length];
            const tempoCycle = [0.08, 0.28, 0.5, 0.72, 0.92];
            abilities.push({
                id: `special-${affinity}-${String(index + 1).padStart(3, '0')}`,
                name: buildName(affinity, motif, form, motifIndex + formIndex),
                effect: buildEffect(affinity, motif, form),
                affinity,
                affinityLabel: blueprint.label,
                compatibleTypes,
                targetType,
                traitVector: vectorForType(targetType),
                tempoTarget: tempoCycle[Math.floor(index / compatibleTypes.length) % tempoCycle.length]
            });
        });
    });
    if (abilities.length !== blueprint.count) {
        throw new Error(`${affinity} count mismatch: expected ${blueprint.count}, got ${abilities.length}`);
    }
    return abilities;
}

const abilities = Object.entries(BLUEPRINTS)
    .flatMap(([affinity, blueprint]) => buildAbilitiesForAffinity(affinity, blueprint));

const payload = {
    version: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    typeAffinities: TYPE_AFFINITIES,
    abilities
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`[special-ability-generate] wrote ${abilities.length} abilities to ${OUTPUT_PATH}`);

const fs = require('node:fs');
const path = require('node:path');
const animalInsights = require('./data/personality-animal-insights');

const SPECIES_PATH = path.resolve(__dirname, '..', 'server', 'data', 'past-life-animal-species.json');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'server', 'data', 'past-life-animals.json');

const AXES = Object.freeze(['E', 'S', 'T', 'J']);
const MOTIFS = Object.freeze(['beast', 'wing', 'scale', 'water', 'swarm']);
const ARCHETYPES = Object.freeze(['guardian', 'explorer', 'nurturer', 'strategist', 'transformer']);

const CATEGORY_PROFILE = Object.freeze({
    mammal: { axes: { E: 0, S: 0.45, T: -0.15, J: 0.15 }, motif: { beast: 1, wing: 0, scale: 0.05, water: 0.1, swarm: 0.15 }, tempo: 0.55, seasonMonth: 10 },
    bird: { axes: { E: 0.15, S: -0.15, T: -0.05, J: -0.05 }, motif: { beast: 0.25, wing: 1, scale: 0.05, water: 0.15, swarm: 0.35 }, tempo: 0.72, seasonMonth: 4 },
    reptile: { axes: { E: -0.55, S: 0.55, T: 0.45, J: 0.25 }, motif: { beast: 0.35, wing: 0, scale: 1, water: 0.25, swarm: 0.05 }, tempo: 0.35, seasonMonth: 7 },
    amphibian: { axes: { E: -0.35, S: -0.15, T: -0.25, J: -0.45 }, motif: { beast: 0.2, wing: 0, scale: 0.1, water: 0.8, swarm: 0.05 }, tempo: 0.42, seasonMonth: 5 },
    aquatic: { axes: { E: -0.1, S: -0.05, T: 0.2, J: -0.35 }, motif: { beast: 0.1, wing: 0.05, scale: 0.65, water: 1, swarm: 0.3 }, tempo: 0.52, seasonMonth: 8 },
    invertebrate: { axes: { E: -0.05, S: 0.35, T: 0.45, J: 0.05 }, motif: { beast: 0.05, wing: 0.25, scale: 0.55, water: 0.2, swarm: 0.65 }, tempo: 0.5, seasonMonth: 6 }
});

const LINEAGES = Object.freeze([
    { key: 'big-cat', names: ['ライオン','トラ','ヒョウ','ジャガー','チーター','ユキヒョウ','ピューマ','オオヤマネコ','カラカル','サーバル'], signature: '静かに間合いを測り、必要な瞬間だけ全身の力を使う', delta: { E: -0.25, T: 0.55, J: 0.2 }, archetype: 'strategist' },
    { key: 'canid', names: ['オオカミ','コヨーテ','アカギツネ','ホッキョクギツネ','タヌキ','リカオン','ドール','キンイロジャッカル','フェネック'], signature: '気配と距離を読み、単独の判断と仲間との連携を切り替える', delta: { E: 0.25, S: 0.15, J: -0.1 }, archetype: 'explorer' },
    { key: 'bear', names: ['ヒグマ','ホッキョクグマ','ツキノワグマ','ジャイアントパンダ','レッサーパンダ','アライグマ','クズリ','シマスカンク','ニホンアナグマ'], signature: '自分の領域を保ちながら、季節と状況に合わせて力を蓄える', delta: { E: -0.55, S: 0.45, J: 0.15 }, archetype: 'guardian' },
    { key: 'otter', names: ['ユーラシアカワウソ','ラッコ'], signature: '遊びと器用さを使い、水辺の変化へすばやく順応する', delta: { E: 0.55, S: 0.35, T: -0.25, J: -0.4 }, motif: { water: 0.85 }, archetype: 'explorer' },
    { key: 'giant-herbivore', names: ['アフリカゾウ','インドゾウ','シロサイ','クロサイ','カバ','キリン','サバンナシマウマ','オカピ','マレーバク'], signature: '大きな身体に繊細な感覚を宿し、揺るがない歩幅で環境を読む', delta: { E: 0.1, S: 0.65, T: -0.25, J: 0.45 }, archetype: 'guardian' },
    { key: 'rodent', names: ['カピバラ','アメリカビーバー','ヤマアラシ','ニホンリス','モモンガ','ムササビ','ゴールデンハムスター','チンチラ','ユキウサギ','ナキウサギ','プレーリードッグ','マーモット'], signature: '小さな変化を見逃さず、食料と安全な居場所を着実に整える', delta: { S: 0.55, T: -0.25, J: 0.45 }, archetype: 'guardian' },
    { key: 'marsupial', names: ['コアラ','アカカンガルー','ワラビー','ウォンバット','タスマニアデビル','フクロモモンガ'], signature: '独自の生活圏を守り、環境に合う方法を身体で覚えていく', delta: { S: 0.5, J: -0.15 }, archetype: 'nurturer' },
    { key: 'monotreme', names: ['カモノハシ','ハリモグラ'], signature: '既存の分類に収まらない個性を、実用的な生存術へ変える', delta: { E: -0.5, S: -0.2, T: 0.35, J: -0.45 }, archetype: 'transformer' },
    { key: 'primate', names: ['ニシゴリラ','チンパンジー','ボノボ','ボルネオオランウータン','シロテテナガザル','ニホンザル','マンドリル','ワオキツネザル','スローロリス'], signature: '相手の表情と序列を読み、学んだ工夫を次の場面へ持ち越す', delta: { E: 0.45, S: -0.15, T: -0.35, J: 0.05 }, archetype: 'strategist' },
    { key: 'pinniped', names: ['ミナミゾウアザラシ','ゴマフアザラシ','カリフォルニアアシカ','セイウチ'], signature: '陸と海の境界を行き来し、休息と行動の時機を大胆に切り替える', delta: { E: 0.25, S: 0.25, J: -0.3 }, motif: { water: 0.9 }, archetype: 'explorer' },
    { key: 'cetacean', names: ['シロナガスクジラ','ザトウクジラ','マッコウクジラ','シャチ','ハンドウイルカ','イッカク','シロイルカ','ジュゴン','アメリカマナティー'], signature: '広い水域の流れと仲間の音を感じ、長い距離を自分のリズムで進む', delta: { E: 0.2, S: -0.65, T: -0.35, J: -0.25 }, motif: { water: 1 }, archetype: 'nurturer' },
    { key: 'hoofed', names: ['モウコノウマ','ロバ','ヒトコブラクダ','アルパカ','ラマ','シロイワヤギ','オオツノヒツジ','トナカイ','ヘラジカ','ニホンジカ','ニホンカモシカ','トムソンガゼル','アメリカバイソン','ヤク','アフリカスイギュウ','ジャコウウシ','イノシシ'], signature: '地形と群れの動きを同時に見て、長く進める確かな足場を選ぶ', delta: { E: 0.3, S: 0.7, T: -0.1, J: 0.25 }, archetype: 'guardian' },
    { key: 'special-mammal', names: ['ミユビナマケモノ','ココノオビアルマジロ','オオアリクイ','ツチブタ','ミーアキャット','センザンコウ'], signature: '他者と違う道具や時間感覚を、揺るがない生存の型へ変える', delta: { E: -0.35, S: 0.35, T: 0.2, J: -0.1 }, archetype: 'strategist' },
    { key: 'raptor', names: ['オジロワシ','イヌワシ','ハクトウワシ','オオワシ','ハヤブサ','チョウゲンボウ','オオタカ','トビ'], signature: '高所から全体を見渡し、狙うべき一点へ迷いなく降りる', delta: { E: -0.1, S: 0.25, T: 0.7, J: 0.5 }, archetype: 'strategist' },
    { key: 'owl', names: ['メンフクロウ','ワシミミズク','シロフクロウ','ヨタカ'], signature: '暗がりのわずかな気配を拾い、静けさの中で正確に判断する', delta: { E: -0.85, S: -0.15, T: 0.55, J: 0.15 }, archetype: 'strategist' },
    { key: 'corvid-parrot', names: ['ハシブトガラス','ワタリガラス','カササギ','カケス','ホシガラス','キバタン','ルリコンゴウインコ','ヨウム','セキセイインコ'], signature: '好奇心と記憶を組み合わせ、道具や声で周囲との関係を動かす', delta: { E: 0.55, S: -0.55, T: 0.25, J: -0.35 }, archetype: 'transformer' },
    { key: 'display-bird', names: ['ベニイロフラミンゴ','インドクジャク','オシドリ','タンチョウ','ヤマドリ','キジ'], signature: '姿勢と間合いで存在を示し、仲間との儀礼を丁寧に守る', delta: { E: 0.55, S: 0.25, T: -0.4, J: 0.5 }, archetype: 'nurturer' },
    { key: 'water-bird', names: ['コブハクチョウ','ハイイロガン','マガモ','フンボルトペンギン','コウテイペンギン','アデリーペンギン','モモイロペリカン','カワウ','マナヅル','シュバシコウ','アオサギ','トキ','ヘラサギ','クロツラヘラサギ','カイツブリ'], signature: '水面と岸の変化を読み、仲間との距離を保ちながら移動する', delta: { E: 0.3, S: 0.3, T: -0.35, J: 0.25 }, motif: { water: 0.75 }, archetype: 'guardian' },
    { key: 'seabird', names: ['ワタリアホウドリ','ユリカモメ','ウミネコ','アオアシカツオドリ','ツノメドリ','オオグンカンドリ','ウミガラス','エトピリカ','ハシボソミズナギドリ'], signature: '風と潮の境目を見つけ、遠い海でも帰る方角を失わない', delta: { E: 0.1, S: -0.45, T: 0.1, J: -0.55 }, motif: { water: 0.65 }, archetype: 'explorer' },
    { key: 'small-bird', names: ['カワセミ','ノドアカハチドリ','ツバメ','スズメ','メジロ','ウグイス','ヨーロッパコマドリ','ルリビタキ','シジュウカラ','カナリア','ブンチョウ','ムクドリ','ヒヨドリ','アカゲラ','オニオオハシ','オオサイチョウ','カッコウ','ホトトギス','ウズラ','セキショクヤケイ','シチメンチョウ','ハクセキレイ','ヒバリ','モズ','ツグミ','シマエナガ','アマツバメ'], signature: '身近な環境の細かな合図を拾い、声と素早い移動で機会をつなぐ', delta: { E: 0.35, S: 0.2, T: -0.2, J: -0.25 }, archetype: 'explorer' },
    { key: 'flightless', names: ['ダチョウ','エミュー','ヒクイドリ','キーウィ','ハシビロコウ','ライチョウ'], signature: '飛ぶことに頼らず、地上で培った感覚と脚力で自分の領域を守る', delta: { E: -0.3, S: 0.75, T: 0.25, J: 0.25 }, motif: { wing: 0.55, beast: 0.55 }, archetype: 'guardian' },
    { key: 'lizard', names: ['コモドオオトカゲ','グリーンイグアナ','パンサーカメレオン','トッケイヤモリ','ニホントカゲ','ミズオオトカゲ','エリマキトカゲ','フトアゴヒゲトカゲ','アオジタトカゲ','ヒョウモントカゲモドキ','ムカシトカゲ','モロクトカゲ','グリーンバシリスク'], signature: '熱と周囲の色を読み、動かない時間まで戦略として使う', delta: { E: -0.5, S: 0.55, T: 0.5, J: -0.05 }, archetype: 'strategist' },
    { key: 'crocodilian', names: ['ナイルワニ','ミシシッピワニ','インドガビアル'], signature: '水際で長く待ち、勝機が届いた瞬間だけ圧倒的な力を解放する', delta: { E: -0.7, S: 0.75, T: 0.85, J: 0.45 }, motif: { water: 0.8 }, archetype: 'guardian' },
    { key: 'turtle', names: ['アオウミガメ','ガラパゴスゾウガメ','スッポン','カミツキガメ','クサガメ','ニホンイシガメ','マタマタ'], signature: '自分を守る境界を持ち、急がず長い時間軸で目的地へ進む', delta: { E: -0.7, S: 0.55, T: 0.1, J: 0.7 }, archetype: 'guardian' },
    { key: 'snake', names: ['ビルマニシキヘビ','ボアコンストリクター','キングコブラ','ガラガラヘビ','エラブウミヘビ','アオダイショウ','シマヘビ','ニホンマムシ','サンゴヘビ'], signature: '地面や空気の微細な振動を読み、無駄のない一手で局面を変える', delta: { E: -0.8, S: 0.15, T: 0.75, J: 0.15 }, archetype: 'transformer' },
    { key: 'amphibian', names: ['メキシコサラマンダー','オオサンショウウオ','アカハライモリ','ファイアサラマンダー','ニホンアマガエル','ヤドクガエル','ウシガエル','ベルツノガエル','アカメアマガエル','トノサマガエル','ニホンヒキガエル','ゴライアスガエル','トビガエル'], signature: '水と陸の二つの条件を受け入れ、変化する身体で居場所を作る', delta: { E: -0.25, S: -0.25, T: -0.2, J: -0.65 }, motif: { water: 0.75 }, archetype: 'transformer' },
    { key: 'shark-ray', names: ['ホホジロザメ','ジンベエザメ','シュモクザメ','ネコザメ','ノコギリザメ','ミツクリザメ','ラブカ','オニイトマキエイ','アカエイ','ノコギリエイ'], signature: '水の圧力と匂いを全身で読み、止まらず自分の進路を保つ', delta: { E: -0.15, S: 0.35, T: 0.6, J: -0.35 }, archetype: 'explorer' },
    { key: 'open-ocean-fish', names: ['シーラカンス','リュウグウノツカイ','クロマグロ','カツオ','メカジキ','バショウカジキ','シロザケ','ニジマス','アユ','トビウオ','マンボウ','マサバ','マイワシ','サンマ','オニカマス'], signature: '広い水の流れに身体を合わせ、進むべき潮を途切れず追う', delta: { E: 0.15, S: -0.25, T: 0.25, J: -0.65 }, archetype: 'explorer' },
    { key: 'eel-bottom', names: ['ニホンウナギ','ウツボ','マアナゴ','トビハゼ','ムツゴロウ','メバル','マダイ','イシダイ','コブダイ','ダンゴウオ','フウセンウオ'], signature: '岩陰と底流の形を覚え、狭い条件の中に確かな居場所を見つける', delta: { E: -0.55, S: 0.55, T: 0.3, J: 0.2 }, archetype: 'guardian' },
    { key: 'reef-fish', names: ['タツノオトシゴ','ヨウジウオ','カクレクマノミ','ナンヨウハギ','チョウチョウウオ','ハリセンボン','トラフグ','ナンヨウブダイ','ハナミノカサゴ','オニオコゼ','カサゴ'], signature: '色と形の多い環境で、守り方と見せ方を巧みに使い分ける', delta: { E: 0.1, S: 0.5, T: -0.05, J: 0.1 }, archetype: 'transformer' },
    { key: 'electric-freshwater', names: ['テッポウウオ','デンキウナギ','デンキナマズ','マナマズ','ニシキゴイ','ワキン','ベタ','グッピー','アジアアロワナ','ピラルク','ピラニア','アリゲーターガー','ハイギョ'], signature: '濁りや障害のある水でも、自分だけの感覚と技で獲物や出口を捉える', delta: { E: -0.05, S: 0.35, T: 0.45, J: -0.2 }, archetype: 'strategist' },
    { key: 'deepsea-soft', names: ['キアンコウ','チョウチンアンコウ','ハダカカメガイ','オウムガイ','ダイオウイカ','コウイカ','ミズダコ','メンダコ','ミズクラゲ','カツオノエボシ'], signature: '光の乏しい深みで、形と感覚を変えながら見えない流れをつかむ', delta: { E: -0.65, S: -0.75, T: 0.15, J: -0.65 }, motif: { scale: 0.15, water: 1 }, archetype: 'transformer' },
    { key: 'beetle', names: ['カブトムシ','オオクワガタ','ナナホシテントウ','ゲンジボタル','ヤマトタマムシ','オサムシ','ハンミョウ','ゾウムシ','ミズスマシ','ゲンゴロウ'], signature: '小さな身体に明確な役割と装備を持ち、環境の一点を着実に攻略する', delta: { E: -0.2, S: 0.75, T: 0.55, J: 0.35 }, archetype: 'guardian' },
    { key: 'orthoptera', names: ['オオカマキリ','トノサマバッタ','キリギリス','エンマコオロギ','スズムシ','ナナフシ','ミンミンゼミ','ハサミムシ','セイヨウシミ'], signature: '姿や音を環境へ合わせ、動く時機を短い合図から判断する', delta: { E: 0.05, S: 0.55, T: 0.25, J: -0.35 }, archetype: 'strategist' },
    { key: 'flying-insect', names: ['オニヤンマ','アオモンイトトンボ','ナミアゲハ','モルフォチョウ','オオムラサキ','ヤママユガ','カイコ','カゲロウ','ウスバカゲロウ','クサカゲロウ'], signature: '成長の段階ごとに姿と役割を変え、短い好機へ集中する', delta: { E: 0.2, S: -0.45, T: -0.15, J: -0.75 }, motif: { wing: 0.9 }, archetype: 'transformer' },
    { key: 'colony-insect', names: ['セイヨウミツバチ','マルハナバチ','オオスズメバチ','クロオオアリ','ヤマトシロアリ'], signature: '個の働きを共同体の流れへ結び、役割を積み重ねて大きな成果を作る', delta: { E: 0.9, S: 0.55, T: 0.2, J: 0.9 }, motif: { swarm: 1 }, archetype: 'guardian' },
    { key: 'small-scavenger', names: ['ミズアブ','ショウジョウバエ','ヒトスジシマカ','ネコノミ','マダニ'], signature: '見過ごされる隙間を見つけ、短い周期で機会へ食らいつく', delta: { E: 0.1, S: 0.7, T: 0.55, J: -0.55 }, motif: { swarm: 0.9 }, archetype: 'explorer' },
    { key: 'water-insect', names: ['タガメ','アメンボ'], signature: '水面という不安定な境界を足場に変え、静かに獲物の動きを待つ', delta: { E: -0.55, S: 0.7, T: 0.65, J: 0.2 }, motif: { water: 0.8 }, archetype: 'strategist' },
    { key: 'arachnid', names: ['コガネグモ','オオツチグモ','ハエトリグモ','ダイオウサソリ'], signature: '自分の感覚が届く範囲を整え、振動から相手の次の動きを読む', delta: { E: -0.75, S: 0.35, T: 0.75, J: 0.6 }, motif: { swarm: 0.1 }, archetype: 'strategist' },
    { key: 'crustacean', names: ['ズワイガニ','タラバガニ','ホンヤドカリ','クルマエビ','アメリカンロブスター','モンハナシャコ','オカダンゴムシ'], signature: '硬い守りと器用な肢を使い、潮や地形に合わせて居場所を更新する', delta: { E: -0.25, S: 0.7, T: 0.45, J: 0.15 }, motif: { water: 0.7, scale: 0.9 }, archetype: 'guardian' },
    { key: 'many-legged-worm', names: ['トビズムカデ','ヤスデ','フトミミズ','チスイビル'], signature: '地面や水底の細い道を進み、分解と循環の役割を黙々と果たす', delta: { E: -0.7, S: 0.55, T: 0.15, J: -0.1 }, motif: { swarm: 0.3 }, archetype: 'transformer' },
    { key: 'mollusk', names: ['カタツムリ','アメフラシ','アオウミウシ','マナマコ'], signature: '柔らかな身体を守りながら、痕跡を残すほど確実な速度で進む', delta: { E: -0.75, S: -0.05, T: -0.35, J: 0.2 }, motif: { water: 0.7, scale: 0.1 }, archetype: 'nurturer' }
]);

const SOCIAL_NAMES = new Set(['ライオン','オオカミ','リカオン','ドール','アフリカゾウ','インドゾウ','カピバラ','プレーリードッグ','ニシゴリラ','チンパンジー','ボノボ','ニホンザル','シロイルカ','シャチ','ハンドウイルカ','モウコノウマ','アルパカ','ラマ','トナカイ','アメリカバイソン','アフリカスイギュウ','ジャコウウシ','ハシブトガラス','ワタリガラス','セキセイインコ','ベニイロフラミンゴ','コブハクチョウ','ハイイロガン','マガモ','コウテイペンギン','アデリーペンギン','タンチョウ','ツバメ','スズメ','ムクドリ','シマエナガ','マイワシ','グッピー','ピラニア','セイヨウミツバチ','マルハナバチ','クロオオアリ','ヤマトシロアリ']);
const SOLITARY_NAMES = new Set(['トラ','ヒョウ','ジャガー','ユキヒョウ','ピューマ','オオヤマネコ','カラカル','サーバル','ヒグマ','ホッキョクグマ','ツキノワグマ','クズリ','マッコウクジラ','ボルネオオランウータン','スローロリス','オジロワシ','イヌワシ','ハヤブサ','メンフクロウ','ワシミミズク','シロフクロウ','コモドオオトカゲ','パンサーカメレオン','ナイルワニ','インドガビアル','キングコブラ','ビルマニシキヘビ','ホホジロザメ','ミツクリザメ','ウツボ','ベタ','キアンコウ','チョウチンアンコ','オオカマキリ','オオツチグモ','ハエトリグモ','ダイオウサソリ']);
const FAST_NAMES = new Set(['チーター','トムソンガゼル','ハヤブサ','チョウゲンボウ','ツバメ','アマツバメ','ノドアカハチドリ','クロマグロ','カツオ','メカジキ','バショウカジキ','トビウオ','オニカマス','ハンミョウ','オニヤンマ','アオモンイトトンボ','トノサマバッタ','モンハナシャコ']);
const SLOW_NAMES = new Set(['ジャイアントパンダ','コアラ','ウォンバット','ミユビナマケモノ','ガラパゴスゾウガメ','マタマタ','オオサンショウウオ','マンボウ','オウムガイ','メンダコ','ミズクラゲ','カタツムリ','マナマコ']);
const AQUATIC_NAMES = new Set(LINEAGES.filter((lineage) => ['otter','pinniped','cetacean','crocodilian','turtle','amphibian','shark-ray','open-ocean-fish','eel-bottom','reef-fish','electric-freshwater','deepsea-soft','water-insect','crustacean','mollusk'].includes(lineage.key)).flatMap((lineage) => lineage.names));

function clamp(value, min = -1, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function rounded(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(Number(value || 0) * factor) / factor;
}

function addVector(base, delta = {}, keys = AXES) {
    return Object.fromEntries(keys.map((key) => [key, rounded(clamp(Number(base?.[key] || 0) + Number(delta?.[key] || 0)))]));
}

function findLineage(name) {
    return LINEAGES.find((lineage) => lineage.names.includes(name)) || {
        key: 'independent',
        names: [name],
        signature: '自分の身体感覚を信じ、与えられた環境から独自の生き方を作る',
        delta: {},
        archetype: 'explorer'
    };
}

function ordinalNuance(index, stride, amplitude) {
    // A small, ordered editorial gradation prevents two species in the same
    // ecological family from receiving an identical private vector.
    const centered = ((((index * stride) % 367) / 366) * 2) - 1;
    return centered * amplitude;
}

function buildSelection(species, index, lineage) {
    const base = CATEGORY_PROFILE[species.category];
    const socialDelta = SOCIAL_NAMES.has(species.name) ? 0.45 : SOLITARY_NAMES.has(species.name) ? -0.35 : 0;
    const axes = addVector(base.axes, {
        ...lineage.delta,
        E: Number(lineage.delta?.E || 0) + socialDelta + ordinalNuance(index, 5, 0.035),
        S: Number(lineage.delta?.S || 0) + ordinalNuance(index, 7, 0.035),
        T: Number(lineage.delta?.T || 0) + ordinalNuance(index, 11, 0.035),
        J: Number(lineage.delta?.J || 0) + ordinalNuance(index, 13, 0.035)
    });
    const motif = Object.fromEntries(MOTIFS.map((key) => [
        key,
        rounded(clamp(Math.max(Number(base.motif?.[key] || 0), Number(lineage.motif?.[key] || 0)), 0, 1))
    ]));
    const primaryArchetype = lineage.archetype;
    const secondaryArchetype = axes.J > 0.5 ? 'guardian'
        : axes.E > 0.45 ? 'explorer'
            : axes.T > 0.45 ? 'strategist'
                : axes.J < -0.45 ? 'transformer'
                    : 'nurturer';
    const archetype = Object.fromEntries(ARCHETYPES.map((key) => [
        key,
        key === primaryArchetype ? 1 : key === secondaryArchetype ? 0.65 : 0.15
    ]));
    const speedDelta = FAST_NAMES.has(species.name) ? 0.25 : SLOW_NAMES.has(species.name) ? -0.25 : 0;
    const tempo = rounded(clamp(base.tempo + speedDelta + ordinalNuance(index, 3, 0.045), 0, 1));
    return { axes, motif, archetype, tempo };
}

function axisLanguage(axes) {
    const describe = (value, strongPositive, positive, balanced, negative, strongNegative) => {
        if (value >= 0.55) return strongPositive;
        if (value >= 0.18) return positive;
        if (value > -0.18) return balanced;
        if (value > -0.55) return negative;
        return strongNegative;
    };
    return {
        social: describe(axes.E,
            '人と動くほど力が湧き、考えたことをすぐ外へ働きかけます',
            '周囲の反応から力を受け取り、必要な場では自分から動きます',
            '一人で整える時間と、人から刺激を受ける時間の両方を必要とします',
            '少人数との深い関わりを好み、一人の時間で力を戻します',
            '内側で十分に考えてから動き、広い交流より信頼できる少数を選びます'),
        perception: describe(axes.S,
            '抽象論より、見た事実と実体験を強く信頼します',
            '目の前の変化を細かく拾い、確かめた情報から考えます',
            '事実を確かめながら、その意味や先の可能性も見ます',
            '個々の事実から共通する意味や今後の展開を読みます',
            '見えているものの奥にある構造や、まだ形のない可能性へ意識が向きます'),
        decision: describe(axes.T,
            '判断では感情に流されず、筋道・公平さ・結果を優先します',
            '判断では納得できる理由と一貫性を大切にします',
            '判断では筋道と人の気持ちを同じくらい確かめます',
            '判断では相手への影響と、自分が大切にする価値を重く見ます',
            '判断では人の気持ちを深く受け取り、関係を傷つけない道を探します'),
        pace: describe(axes.J,
            '先に予定と終点を決め、見通しが立つほど本来の力を出せます',
            '区切りと優先順位を作ることで、落ち着いて進められます',
            '必要な計画は立てつつ、状況に応じて余白も残します',
            '選択肢を残し、変化を見ながら方法を組み替えます',
            '固定した計画に縛られず、その場で見つけた可能性へ柔軟に移れます')
    };
}

function strongestAxes(axes, count = 2) {
    return AXES
        .map((axis) => ({ axis, value: Number(axes[axis] || 0) }))
        .sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || AXES.indexOf(left.axis) - AXES.indexOf(right.axis))
        .slice(0, count);
}

function primaryArchetype(selection) {
    return ARCHETYPES
        .map((key) => ({ key, value: Number(selection.archetype?.[key] || 0) }))
        .sort((left, right) => right.value - left.value || ARCHETYPES.indexOf(left.key) - ARCHETYPES.indexOf(right.key))[0].key;
}

function archetypeStrength(key) {
    return ({
        guardian: '役割と境界を整え、周囲が安心して動ける土台を作れる',
        explorer: '未知の状況にも好奇心を失わず、最初の道を見つけられる',
        nurturer: '相手の状態を感じ取り、無理なく力が戻る関わり方を選べる',
        strategist: '全体を観察し、感情に流されず有効な一手を選べる',
        transformer: '行き詰まりを別の見方へ変え、新しい形に組み直せる'
    })[key];
}

function axisBlindSpot(axis, value) {
    const positive = value >= 0;
    return ({
        E: positive
            ? {
                state: '周囲の反応が薄いと、必要以上に動いて相手が考える余白を奪いやすくなります',
                focus: '周囲の反応が薄い時に動きすぎ、相手が考える余白を奪いやすいこと'
            }
            : {
                state: '考えを内側だけで完成させ、助けを求める時機を逃しやすくなります',
                focus: '考えを内側だけで完成させ、助けを求める時機を逃しやすいこと'
            },
        S: positive
            ? {
                state: '確実な材料を重く見るあまり、まだ形のない可能性を早めに切りやすくなります',
                focus: '確実な材料を重く見るあまり、まだ形のない可能性を早めに切りやすいこと'
            }
            : {
                state: '可能性を広げすぎて、目の前で確かめるべき事実が後回しになりやすくなります',
                focus: '可能性を広げすぎ、目の前で確かめるべき事実を後回しにしやすいこと'
            },
        T: positive
            ? {
                state: '正しさを急ぐと、相手が受け取れる言い方を置き去りにしやすくなります',
                focus: '正しさを急ぐあまり、相手が受け取れる言い方を置き去りにしやすいこと'
            }
            : {
                state: '相手を思うほど、自分の限界や不満を言えなくなりやすいです',
                focus: '相手を思うほど、自分の限界や不満を言えなくなりやすいこと'
            },
        J: positive
            ? {
                state: '予定が崩れた時に、必要以上に自分や周囲を締めつけやすくなります',
                focus: '予定が崩れた時に、必要以上に自分や周囲を締めつけやすいこと'
            }
            : {
                state: '選択肢を残しすぎて、決めるべき期限を越えやすくなります',
                focus: '選択肢を残しすぎて、決めるべき期限を越えやすいこと'
            }
    })[axis];
}

function practicalReminder(axis, value) {
    const positive = value >= 0;
    return ({
        E: positive ? '返事をする前に十秒だけ相手の言葉を待ってください' : '信頼できる一人へ途中経過を伝えてください',
        S: positive ? '確証がなくても、別の可能性を一つだけ残してください' : '確認できる事実を三つ書き出してください',
        T: positive ? '結論と一緒に、相手への配慮を一文添えてください' : '引き受けられる上限を数字か期限で示してください',
        J: positive ? '変更してよい部分を一つ決めてください' : '決断の締切を一つ設定してください'
    })[axis];
}

function relationshipVector(selection, species, lineage) {
    const axes = selection.axes;
    const social = SOCIAL_NAMES.has(species.name) ? 0.3 : SOLITARY_NAMES.has(species.name) ? -0.25 : 0;
    return {
        warmth: rounded(clamp((-axes.T * 0.62) + social)),
        independence: rounded(clamp((-axes.E * 0.65) - (social * 0.25))),
        loyalty: rounded(clamp((axes.J * 0.4) + (social * 0.9) + (lineage.archetype === 'guardian' ? 0.2 : 0))),
        energy: rounded(clamp((axes.E * 0.58) + ((selection.tempo - 0.5) * 0.7))),
        flexibility: rounded(clamp((-axes.J * 0.68) + (lineage.archetype === 'transformer' ? 0.3 : 0))),
        directness: rounded(clamp((axes.T * 0.42) + (axes.E * 0.28))),
        order: rounded(clamp((axes.J * 0.78) + (lineage.archetype === 'guardian' ? 0.15 : 0))),
        recovery: rounded(clamp(((selection.tempo - 0.5) * 0.9) - (axes.J * 0.15) + (lineage.archetype === 'transformer' ? 0.25 : 0)))
    };
}

function compatibilityHooks(species, selection, lineage, insight) {
    const offersByArchetype = {
        guardian: `${insight.essence}ことで生まれる安心`,
        explorer: `${insight.essence}ことで見つける新しい選択肢`,
        nurturer: `${insight.essence}ことで育つ温かな支え`,
        strategist: `${insight.essence}ことで得られる的確な見通し`,
        transformer: `${insight.essence}ことで起こす柔軟な変化`
    };
    return {
        offers: offersByArchetype[lineage.archetype],
        needs: selection.axes.E >= 0 ? '反応が返り、気持ちを共有できること' : '急かされず、自分の時間を守れること',
        trusts: selection.axes.T >= 0 ? '言葉と行動が一致する' : '感情を軽く扱わず受け止める',
        conflictPattern: selection.axes.J >= 0 ? '結論を急いで正しさを固める' : '答えを保留して距離を取る',
        repairNeed: selection.axes.T >= 0 ? '事実と約束を一つずつ確認すること' : '傷ついた気持ちを否定せず聞くこと',
        workStyle: buildWorkStyle(selection.axes)
    };
}

function buildWorkStyle(axes) {
    const perception = axes.S >= 0.35
        ? '小さな変化を拾い、確認した事実から'
        : axes.S >= 0.08
            ? '見た事実と実体験を確かめてから'
            : axes.S > -0.08
                ? '事実と、その先にある意味の両方を見て'
                : axes.S > -0.35
                    ? '個々の事実から共通点と今後の展開を読み'
                    : 'まだ形のない可能性を結びつけて';
    return axes.J >= 0
        ? `${perception}、手順を決めて進める`
        : `${perception}、状況に合わせて方法を変える`;
}

const MEMORY_WORLDS = Object.freeze({
    mammal: Object.freeze([
        ['土と草の匂いが混じる薄明かりの中を進み', '風向きと足元の震え'],
        ['雨上がりの森で濡れた地面を確かめながら歩き', '葉擦れと仲間の呼吸'],
        ['冷えた夜気の中で安全な寝場所へ戻り', '遠くから届く匂いと物音'],
        ['乾いた大地で水と休息の場所を探し', '陽射しの強さと地面の感触'],
        ['季節が変わる境目で食べ物と居場所を選び', '空気の湿り気と身体の疲れ'],
        ['仲間の気配が途切れない距離を保って移動し', '声にならない合図と足音']
    ]),
    bird: Object.freeze([
        ['朝焼けの空へ翼を広げ、風の層を乗り換えながら進み', '羽根を押し返す風圧と地上の小さな動き'],
        ['森の高い枝から次の着地点を見定め', '木々を抜ける光と仲間の声'],
        ['雲の切れ間と地平線を目印に長い距離を渡り', '気流の温度と空の明るさ'],
        ['水辺の静かな朝に羽音を抑えて立ち', '水面の揺れと魚影の動き'],
        ['夕暮れの巣へ戻る前に周囲を一周し', '遠くの鳴き声と風に混じる雨の匂い'],
        ['暗い空の下で音だけを頼りに獲物と障害を分け', '闇の奥から返るかすかな気配']
    ]),
    reptile: Object.freeze([
        ['温められた岩肌と冷たい影の境目を選び', '地面の振動と皮膚に伝わる熱'],
        ['水際の泥に身体を沈め、動くべき瞬間まで待ち', '水圧の変化と近づく足音'],
        ['乾いた地面を腹でなぞりながら安全な隙間へ進み', '砂の温度と空気の震え'],
        ['強い陽射しを避けて岩陰から周囲を見張り', '光の変化と獲物の匂い'],
        ['雨季の水路と乾季の道を身体で覚え', '湿度の変化と地面に残る痕跡'],
        ['古い甲羅や鱗に季節の傷を重ねながら移動し', '水の流れと身体を包む温度']
    ]),
    amphibian: Object.freeze([
        ['雨で満ちた森のくぼみから水辺へ身体を滑らせ', '皮膚を包む湿り気と水面の振動'],
        ['夜の湿地で草の影を渡りながら居場所を探し', '雨粒の強さと遠くの鳴き声'],
        ['澄んだ流れの石陰に身を置き、季節の水位を見守り', '冷たい流れと岩に伝わる震え'],
        ['水と陸の境界で身体の変化を受け入れ', '土の匂いと浅瀬の温度'],
        ['霧の残る朝に濡れた葉の間を進み', '光の弱まりと天敵の気配'],
        ['乾きを避けられる小さな場所へ戻りながら動き', '皮膚が覚える湿度と夜気']
    ]),
    aquatic: Object.freeze([
        ['光の筋が揺れる水中を、潮の向きに身体を合わせて進み', '全身を押す水圧と遠くの音'],
        ['暗い水底で岩と流れの形を覚えながら移動し', '底流の冷たさと砂の震え'],
        ['広い海で目印のない距離を自分のリズムで渡り', '潮の匂いと仲間から届く響き'],
        ['珊瑚や海藻の隙間に安全な道を見つけ', '色の変化と近づく水流'],
        ['川の濁りの中で流れに逆らわず進路を選び', '水温の差と岸から落ちる影'],
        ['深い水の静寂に身体を預け、わずかな光を追い', '闇の中を伝わる振動と自分の鼓動']
    ]),
    invertebrate: Object.freeze([
        ['落ち葉と土の重なる狭い世界を丁寧に進み', '身体に伝わる振動と湿り気'],
        ['朝露の残る葉や石の陰で身体を整え', '光の温度と空気の揺れ'],
        ['小さな巣や隙間へ必要なものを運び続け', '仲間の匂いと地面に残る道筋'],
        ['水面や浅瀬の境界を足場に変えて移動し', '表面張力の揺れと水の震え'],
        ['暗い岩陰で外の気配が変わるまで身を潜め', '殻や皮膚へ届く圧力と音'],
        ['季節の短い好機に姿を変え、光のある方へ進み', '気温の上昇と風に乗る匂い']
    ])
});

const LINEAGE_MEMORY_WORLDS = Object.freeze({
    'big-cat': Object.freeze([
        ['身を隠せる地形の中で獲物との距離を測り', '風下から届く匂いと足元の震え'],
        ['広い縄張りを静かに巡り、勝負をかける一瞬を待ち', '遠くの動きと自分の呼吸']
    ]),
    canid: Object.freeze([
        ['仲間の足跡と匂いが残る道をたどり', '風に混じる気配と遠くの声'],
        ['単独で進む距離と群れへ戻る時機を見極め', '地面の痕跡と仲間の合図']
    ]),
    bear: Object.freeze([
        ['季節ごとに食べ物と休める場所を探し', '空気の冷たさと蓄えた体力'],
        ['自分の領域をゆっくり巡り、危険との距離を保ち', '風に運ばれる匂いと地面の感触']
    ]),
    otter: Object.freeze([
        ['流れのある水辺で身体をひるがえし、安全な岸へ戻り', '水圧の変化と仲間の声'],
        ['水中で食べ物を探し、手足と道具を器用に使い', '流れの速さと触れた物の形']
    ]),
    'giant-herbivore': Object.freeze([
        ['広い土地を歩きながら水と安全な通り道を探し', '地面の震えと遠くの群れの動き'],
        ['大きな身体で進路を作り、周囲の小さな変化を確かめ', '風向きと足元の硬さ']
    ]),
    rodent: Object.freeze([
        ['食べ物を運べる道と身を守れる巣を整え', '土の匂いと近づく足音'],
        ['小さな身体で周囲を素早く確かめ、必要なものを蓄え', '光の変化と地面の振動']
    ]),
    marsupial: Object.freeze([
        ['自分の身体に合う休息場所と食べ物を選び', '気温の変化と身近な仲間の気配'],
        ['慣れた生活圏を守りながら環境の変化へ身体を合わせ', '地面や木から伝わる振動と匂い']
    ]),
    monotreme: Object.freeze([
        ['水辺や地面に残る微かな気配を独自の感覚で追い', '触れた場所から伝わる振動と温度'],
        ['他の動物とは違う身体の使い方で食べ物を探し', '水や土の抵抗と近づく影']
    ]),
    primate: Object.freeze([
        ['木々や地面を行き来しながら仲間の表情を読み', '枝の揺れと声色の変化'],
        ['手で触れた物の使い道を覚え、群れの中で試し', '指先の感触と周囲の反応']
    ]),
    hoofed: Object.freeze([
        ['長く歩ける地面を選び、群れと水場の間を進み', '蹄へ伝わる硬さと風の匂い'],
        ['開けた場所で周囲を見渡し、危険から離れる道を保ち', '地平線の動きと仲間の足音']
    ]),
    'special-mammal': Object.freeze([
        ['自分だけの身体の使い方で食べ物と安全な場所を探し', '土や木の手触りと近づく気配'],
        ['他の動物が見過ごす場所に居場所を作り', '気温の変化と身体へ届く振動']
    ]),
    raptor: Object.freeze([
        ['高い岩棚から地上の動きを見渡し、上昇気流へ翼を乗せ', '風圧の変化と遠くを横切る影'],
        ['山の稜線を越えながら狙う一点を探し', '翼の傾きと地上のわずかな動き']
    ]),
    owl: Object.freeze([
        ['暗い森で羽音を抑え、音だけで獲物と障害を分け', '闇の奥から返るかすかな気配'],
        ['月明かりの届かない枝で動く時機を待ち', '空気を震わせる小さな音と距離']
    ]),
    'corvid-parrot': Object.freeze([
        ['木々の間を渡りながら仲間の声と新しい道具を覚え', '声色の違いと目の前の形'],
        ['人や動物の集まる場所を高所から観察し', '周囲の反応と手触りの変化']
    ]),
    'display-bird': Object.freeze([
        ['森の開けた場所で姿勢を整え、相手との間合いを測り', '視線の向きと羽根を揺らす風'],
        ['草地と木陰の境目で仲間の反応を確かめ', '色の見え方と近づく足音']
    ]),
    'water-bird': Object.freeze([
        ['水面と岸の境目を行き来し、仲間と離れすぎない距離を保ち', '水面の揺れと風に混じる鳴き声'],
        ['浅瀬に映る空を見ながら休む場所と進む方向を選び', '足元の流れと群れの動き']
    ]),
    seabird: Object.freeze([
        ['陸の見えない海で風と波の境目を追い', '潮の匂いと翼を押し上げる気流'],
        ['荒い波の上を長く飛び、帰る方角を身体に刻み', '海面の光と遠くの風向き']
    ]),
    'small-bird': Object.freeze([
        ['朝の林や草地を移り、声と光の変化を確かめ', '葉擦れと仲間の短い合図'],
        ['身近な茂みや地面で食べ物と安全な場所を探し', '陽射しの傾きと周囲の鳴き声']
    ]),
    flightless: Object.freeze([
        ['地上を確かな足取りで進み、茂みと開けた場所を見比べ', '足裏の振動と地平線の動き'],
        ['歩いて越えられる道を探し、自分の領域を静かに守り', '土の硬さと近づく足音']
    ]),
    lizard: Object.freeze([
        ['陽の当たる場所と冷たい隠れ場所を使い分け', '皮膚へ届く熱と地面の振動'],
        ['周囲の色や地形へ身体を合わせ、動く時機を待ち', '光の変化と近づく気配']
    ]),
    crocodilian: Object.freeze([
        ['水際へ身体を沈め、獲物が届く瞬間まで待ち', '水圧の変化と岸の足音'],
        ['流れと陸の境界を巡り、自分の領域を守り', '泥へ伝わる震えと水温']
    ]),
    turtle: Object.freeze([
        ['硬い甲羅に身を守りながら、自分の速度で進み', '身体を包む温度と足元の抵抗'],
        ['休める場所と次に進む方向を長い時間軸で選び', '光の傾きと周囲の振動']
    ]),
    snake: Object.freeze([
        ['狭い隙間と開けた場所の境目を静かに進み', '腹へ伝わる振動と空気の匂い'],
        ['身体を無駄なく使い、動くべき一瞬まで力を保ち', '地面の温度と近づく気配']
    ]),
    amphibian: Object.freeze([
        ['冷たい水と湿った岸の境目で安全な場所を探し', '皮膚を包む湿度と水の振動'],
        ['流れや水たまりの陰に身を置き、周囲が静まるのを待ち', '水温の変化と近づく足音']
    ]),
    cetacean: Object.freeze([
        ['広い海で目印のない距離を自分のリズムで渡り', '潮の匂いと仲間から届く響き'],
        ['光の届く海面と深い水の間を行き来し', '全身を包む水圧と遠くの声']
    ]),
    pinniped: Object.freeze([
        ['冷たい海と休息できる岸を往復し', '波の強さと仲間が動く音'],
        ['水中で素早く向きを変え、陸では安全な間合いを守り', '流れの抵抗と岸から届く気配']
    ]),
    'shark-ray': Object.freeze([
        ['広い水の流れを全身で受け、止まらず進路を保ち', '水圧と遠くから流れる匂い'],
        ['海底と海面の間を渡りながら獲物の気配を追い', '身体へ届く微細な電気と振動']
    ]),
    'open-ocean-fish': Object.freeze([
        ['広い水域で大きな流れへ身体を合わせ', '水温の境目と群れの向き'],
        ['開けた水の中を進み、流れが変わる地点を探し', '身体を押す水流と差し込む光']
    ]),
    'eel-bottom': Object.freeze([
        ['岩陰と水底の狭い道を覚えながら進み', '底流の向きと砂に伝わる震え'],
        ['濁った浅瀬で身を隠せる場所を確保し', '水の匂いと近づく影']
    ]),
    'reef-fish': Object.freeze([
        ['珊瑚や海藻の隙間に安全な道を見つけ', '色の変化と近づく水流'],
        ['光と影が細かく揺れる岩礁で守る場所を選び', '仲間の動きと水面から落ちる影']
    ]),
    'electric-freshwater': Object.freeze([
        ['川の濁りの中で流れに逆らわず進路を選び', '水温の差と岸から落ちる影'],
        ['障害の多い淡水で自分だけの感覚を頼りに進み', '流木の位置と水を伝わる振動']
    ]),
    'deepsea-soft': Object.freeze([
        ['静かな水中へ身体を預け、わずかな光と流れを追い', '水を伝わる振動と自分の鼓動'],
        ['光の量が変わる水中で形を変えながら進み', '冷たい水圧と遠くの気配']
    ]),
    beetle: Object.freeze([
        ['土や木の表面を進み、硬い身体で狭い道を越え', '足元の凹凸と光の温度'],
        ['身を守れる場所と食べ物のある一点を探し', '匂いの濃さと地面の震え']
    ]),
    orthoptera: Object.freeze([
        ['草や地面へ姿を溶け込ませ、動く合図を待ち', '空気の振動と近づく影'],
        ['短い跳躍や音で居場所を変えながら進み', '気温の変化と周囲の反応']
    ]),
    'flying-insect': Object.freeze([
        ['朝露が乾く短い時間に翅を広げ、光のある方へ進み', '気温の上昇と花や樹液の匂い'],
        ['幼い姿で過ごした場所を離れ、風へ身体を預け', '翅を揺らす空気と季節の光']
    ]),
    'colony-insect': Object.freeze([
        ['仲間の匂いが続く道をたどり、巣へ必要なものを運び', '地面に残る道筋と触角へ届く合図'],
        ['狭い巣の中で役割を受け渡し、外の変化へ備え', '仲間の動きと空気の温度']
    ]),
    'small-scavenger': Object.freeze([
        ['大きな生き物が見過ごす小さな隙間へ入り', '匂いの変化と空気の流れ'],
        ['短い好機を逃さず、次の居場所へ素早く移り', '熱と振動が近づく気配']
    ]),
    'water-insect': Object.freeze([
        ['揺れる水面を足場に変え、波紋の中心を見定め', '表面張力の震えと水の流れ'],
        ['水中と水面の境界で動く時機を待ち', '光の反射と獲物が作る波紋']
    ]),
    arachnid: Object.freeze([
        ['自分の感覚が届く範囲を整え、動かずに気配を待ち', '糸や地面へ伝わる振動'],
        ['暗い隙間と開けた場所を使い分け、獲物との距離を測り', '空気の動きと足元の震え']
    ]),
    crustacean: Object.freeze([
        ['岩と砂が続く海底を、殻を守りながら進み', '脚へ伝わる底流と砂の震え'],
        ['潮が引く場所で隠れ家と食べ物を探し', '水圧の変化と殻に触れる音']
    ]),
    mollusk: Object.freeze([
        ['海藻と岩の間を柔らかな身体で進み', '皮膚へ届く水流と光の変化'],
        ['海底の砂をゆっくり渡り、危険には身体を縮め', '水の冷たさと周囲の圧力']
    ]),
    'many-legged-worm': Object.freeze([
        ['土や水底の細い道を身体で確かめながら進み', '湿り気と地面へ伝わる振動'],
        ['光の届きにくい場所で環境の変化を受け止め', '温度の差と周囲の圧力']
    ])
});

const AQUATIC_MEMORY_LINEAGES = new Set([
    'otter', 'pinniped', 'cetacean', 'shark-ray', 'open-ocean-fish', 'eel-bottom',
    'reef-fish', 'electric-freshwater', 'deepsea-soft', 'water-insect', 'crustacean'
]);
const LAND_MEMORY_EXCEPTIONS = new Set(['オカダンゴムシ', 'カタツムリ', 'フトミミズ', 'ヤスデ', 'トビズムカデ']);

function memoryWorldKey(species, lineage) {
    if (species.category === 'amphibian') return 'amphibian';
    if (AQUATIC_MEMORY_LINEAGES.has(lineage.key) && !LAND_MEMORY_EXCEPTIONS.has(species.name)) return 'aquatic';
    return MEMORY_WORLDS[species.category] ? species.category : 'mammal';
}

function memoryWorlds(species, lineage) {
    if (LAND_MEMORY_EXCEPTIONS.has(species.name)) return MEMORY_WORLDS.invertebrate;
    return LINEAGE_MEMORY_WORLDS[lineage.key] || MEMORY_WORLDS[memoryWorldKey(species, lineage)];
}

function memoryEcho(selection) {
    const strongest = strongestAxes(selection.axes, 1)[0];
    const positive = strongest.value >= 0;
    return ({
        E: positive ? '人の動きが変わると、自分から場を動かしたくなる感覚' : '一人で静かに考える時間がないと、判断の軸を失いやすい感覚',
        S: positive ? '小さな違和感や手触りを、言葉になる前に察する感覚' : '目の前の出来事から、その先にある意味を先に読む感覚',
        T: positive ? '感情が揺れる場面ほど、筋道の通った答えを探す感覚' : '誰かの痛みや喜びを、自分のことのように受け取る感覚',
        J: positive ? '先に終点と順序を定めると、身体まで落ち着く感覚' : '逃げ道や別の可能性を残しておくと、自然に動ける感覚'
    })[strongest.axis];
}

function buildPastLifeMemory(species, index, selection, insight, lineage) {
    const worlds = memoryWorlds(species, lineage);
    const [scene, sensation] = worlds[index % worlds.length];
    const echo = memoryEcho(selection);
    const templates = [
        `前世のあなたは${species.name}として、${scene}、${insight.essence}ことで生き延びていました。${sensation}を手掛かりに次の一手を決めていた記憶が、今も${echo}として残っています。`,
        `記憶の奥にあるのは、${scene}、「${insight.essence}」ことを選び続けた${species.name}の姿です。${sensation}を読み違えない緊張が、今も${echo}として表れます。`,
        `前世の記憶では、あなたは${species.name}の身体で${scene}、${insight.essence}ことで危機を越えていました。そこで磨かれた${sensation}への鋭さが、今も${echo}につながっています。`,
        `あなたの内側には、${species.name}として${scene}、${insight.essence}日々を重ねた記憶があります。${sensation}だけを頼りに進路を選んだ経験が、今も${echo}として息づいています。`,
        `かつて${species.name}だったあなたは、${scene}、何度も「${insight.essence}」ことを選びました。${sensation}に従って生き延びた感覚は、今も${echo}となって判断を支えています。`
    ];
    return templates[index % templates.length];
}

function turningEvent(selection, index) {
    const events = {
        guardian: [
            '周囲から新しい責任を預けられ、守る範囲を決め直す場面',
            '続けてきた役割の境界が曖昧になり、引き受け方を選び直す場面',
            '家族や仲間から中心に立つことを期待され、覚悟を問われる場面'
        ],
        explorer: [
            '慣れた場所を離れる誘いと、今の安定を守る理由が同時に現れる場面',
            '偶然つながった相手から、これまでになかった選択肢を渡される場面',
            '温めていた計画が予想より早く動き出し、最初の一歩を迫られる場面'
        ],
        nurturer: [
            '大切な誰かから助けを求められ、自分の余力も試される場面',
            '親しい関係の形が変わり、曖昧にせず本音を返す必要が生まれる場面',
            '離れていた人が再び近づき、受け入れる範囲を決める場面'
        ],
        strategist: [
            '情報が出そろわないまま、先に方針を決めるよう求められる場面',
            '隠れていた問題が表へ出て、見て見ぬふりを続けられなくなる場面',
            '二つの有力な提案が並び、どちらか一方へ資源を集中する場面'
        ],
        transformer: [
            '終わったと思っていた話が別の形で戻り、続けるか手放すかを迫られる場面',
            '予定していた道が突然閉じ、その代わりとなる新しい入口が現れる場面',
            '長く使ってきた習慣や関係が合わなくなり、自分から形を変える場面'
        ]
    };
    const options = events[primaryArchetype(selection)];
    return options[index % options.length];
}

function buildArcanaProphecy(animal, day) {
    const animalNumber = Number(animal.id.slice(-3));
    const event = turningEvent(animal.selection, animalNumber);
    const consequence = [
        'その先で担う役割',
        'これから一年の人間関係',
        '次に手にする居場所',
        '長く続く仕事と習慣',
        '今後の自由と責任の釣り合い'
    ][animalNumber % 5];
    return `${day.label}前後、${event}が訪れ、その時の「${animal.arcanaAction}」という選択が、${consequence}を大きく変えるでしょう。`;
}

function buildArcanaOmen(animal) {
    return `転機が近づいており、鍵になる選択は「${animal.arcanaAction}」です。`;
}

function buildEditorial(species, index, selection, insight, lineage) {
    const language = axisLanguage(selection.axes);
    const blindSpot = strongestAxes(selection.axes, 1)[0];
    const trust = selection.axes.T >= 0 ? '言葉と行動が一致する' : '感情を軽く扱わず受け止める';
    const opening = selection.axes.E >= 0
        ? '反応を返し合えると、関係への安心が深まります'
        : '急かされずに距離を選べると、少しずつ本音を見せられます';
    const traits = `人との関わり方では、${language.social}。情報の受け取り方は、${language.perception}。${language.decision}。物事の進め方は、${language.pace}。`;
    const style = index % 5;
    const strengthText = archetypeStrength(primaryArchetype(selection));
    const blindSpotText = axisBlindSpot(blindSpot.axis, blindSpot.value);
    const reminder = practicalReminder(blindSpot.axis, blindSpot.value);
    const cores = [
        `${species.name}が映す本質は、「${insight.essence}」ことです。周囲と同じ速さや方法を選ぶより、自分の感覚に合う生き方を選んだ時に軸が戻ります。`,
        `あなたの核には、${species.name}に通じる「${insight.essence}」という姿勢があります。迷った時ほど、人の正解ではなく自分が無理なく続けられる方を選ぶと、本来の感覚が戻ります。`,
        `前世動物の${species.name}が伝える中心テーマは、「${insight.essence}」ことです。目立つ結果より、この姿勢を守れたかどうかがあなたの納得感を左右します。`,
        `${species.name}という象徴が指すのは、「${insight.essence}」という生き方です。環境に合わせすぎて苦しくなった時は、この生き方へ戻ると判断の軸が整います。`,
        `この結果の中心にあるのは、${species.name}の「${insight.essence}」という性質です。あなたは、自分に合う距離と速度を選べた時に、迷いより確信を持って動けます。`
    ];
    const strengths = [
        `あなたの強みは、${strengthText}ことです。${species.name}が${insight.essence}ように、難しい状況でも使える力を見つけられます。`,
        `${species.name}の生き方と重なる長所は、${strengthText}ことです。周囲が迷っている場でも、自分の役割を見つけて状況を前へ進められます。`,
        `強みとして最も表れやすいのは、${strengthText}点です。「${insight.essence}」という姿を体現する${species.name}のように、条件が厳しいほど判断の質が際立ちます。`,
        `あなたは、${strengthText}人です。${species.name}が見せる「${insight.essence}」という姿勢を使えば、混乱を自分なりの秩序へ変えられます。`,
        `${species.name}から受け取る力は、${strengthText}ことです。無理に誰かと同じ方法を選ばなくても、持っている感覚を役立つ形へ変えられます。`
    ];
    const weaknesses = [
        `${species.name}の力が一方向へ偏ると、${blindSpotText.state}。これは欠点ではなく、得意な方法を使いすぎた時に出る偏りです。`,
        `注意したいのは、${blindSpotText.focus}です。${species.name}らしい強さを守りながらも、一つの方法だけが正解になっていないか確かめてください。`,
        `苦しい時は、${blindSpotText.state}。それは${species.name}の性質が悪いのではなく、長所を休ませず使い続けた合図です。`,
        `${species.name}の影が出ると、${blindSpotText.state}。結果を急ぐ前に、身体の疲れと実際に起きた事実を分けて見てください。`,
        `弱点になりやすいのは、${blindSpotText.focus}です。得意な判断ほど、一度だけ反対の可能性を確かめると偏りを防げます。`
    ];
    const relationshipTexts = [
        `${species.name}の気質を持つあなたは、人間関係では${trust}相手を信頼します。${opening}。曖昧な好意より、同じ態度が続くことを確かめてください。`,
        `人との間では、${trust}ことが安心の入口です。${opening}。${species.name}のように自分の距離を守りながら、必要な本音は言葉へしてください。`,
        `${species.name}のあなたが心を開きやすいのは、${trust}人です。${opening}。一度の強い言葉ではなく、約束が続くかを見て相手を判断してください。`,
        `関係を育てる鍵は、${trust}相手を選ぶことです。${opening}。無理に相手へ合わせるより、安心できる接し方を先に共有してください。`,
        `あなたは人間関係で、${trust}態度を重く見ます。${opening}。${species.name}のように必要な距離を保つことが、かえって長い信頼につながります。`
    ];
    const adviceTexts = [
        `${species.name}の象徴を現実に生かす一手は、${insight.action}ことです。${reminder}。`,
        `具体的な一手は、${insight.action}ことです。そのうえで、${reminder}。二つを組み合わせると、${species.name}の長所が空回りしません。`,
        `${species.name}からの助言は明確です。まず、${insight.action}こと。そのうえで、${reminder}。考えるだけで終えず、どちらか一つは実行へ移してください。`,
        `流れを変えるには、${insight.action}ことから始めてください。さらに、${reminder}。${species.name}の力は、小さな実行に落とした時に現実へ効きます。`,
        `最初に行うのは、${insight.action}ことです。迷いが残るなら、${reminder}。${species.name}の生き方を、一度に変えず一つの行動へ翻訳してください。`
    ];
    return {
        traits,
        pastLifeMemory: buildPastLifeMemory(species, index, selection, insight, lineage),
        core: cores[style],
        strength: strengths[style],
        weakness: weaknesses[style],
        relationships: relationshipTexts[style],
        advice: adviceTexts[style]
    };
}

function calendarDays() {
    const days = [];
    const counts = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    counts.forEach((count, monthIndex) => {
        for (let day = 1; day <= count; day += 1) {
            days.push({
                value: `${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                label: `${monthIndex + 1}月${day}日`,
                month: monthIndex + 1,
                day
            });
        }
    });
    return days;
}

function circularMonthDistance(left, right) {
    const distance = Math.abs(left - right);
    return Math.min(distance, 12 - distance);
}

function assignArcanaDays(animals) {
    const availableDays = calendarDays();
    const ordered = [...animals].sort((left, right) => (
        left.preferredSeasonMonth - right.preferredSeasonMonth || left.id.localeCompare(right.id)
    ));
    for (const animal of ordered) {
        const day = availableDays
            .map((candidate, index) => ({
                candidate,
                index,
                score: circularMonthDistance(candidate.month, animal.preferredSeasonMonth)
                    + (Math.abs(candidate.day - ((Number(animal.id.slice(-3)) % 28) + 1)) / 100)
            }))
            .sort((left, right) => left.score - right.score || left.candidate.value.localeCompare(right.candidate.value))[0];
        availableDays.splice(day.index, 1);
        animal.arcanaDay = {
            value: day.candidate.value,
            label: day.candidate.label,
            omen: buildArcanaOmen(animal),
            prophecy: buildArcanaProphecy(animal, day.candidate)
        };
    }
}

const source = JSON.parse(fs.readFileSync(SPECIES_PATH, 'utf8'));
if (!Array.isArray(source.species) || source.species.length !== 365) {
    throw new Error(`Species catalog must contain exactly 365 entries; received ${source.species?.length || 0}`);
}

const animals = source.species.map((species, index) => {
    const lineage = findLineage(species.name);
    const insight = animalInsights[species.name];
    if (!insight) {
        throw new Error(`Missing individual insight for ${species.name}`);
    }
    const selection = buildSelection(species, index, lineage);
    const editorial = buildEditorial(species, index, selection, insight, lineage);
    const baseMonth = CATEGORY_PROFILE[species.category]?.seasonMonth || 6;
    const preferredSeasonMonth = AQUATIC_NAMES.has(species.name) ? 8
        : SLOW_NAMES.has(species.name) ? 1
            : FAST_NAMES.has(species.name) ? 5
                : ((baseMonth + (index % 3) - 1 + 11) % 12) + 1;
    return {
        id: `animal-${String(index + 1).padStart(3, '0')}`,
        name: species.name,
        category: species.category,
        imageUrl: `/assets/personality-animals/animal-${String(index + 1).padStart(3, '0')}.webp`,
        ...editorial,
        selection,
        relationVector: relationshipVector(selection, species, lineage),
        compatibilityHooks: compatibilityHooks(species, selection, lineage, insight),
        lineage: lineage.key,
        symbolicEssence: insight.essence,
        arcanaAction: insight.action,
        preferredSeasonMonth
    };
});

assignArcanaDays(animals);

const payload = {
    version: 3,
    catalogVersion: 'personality-destiny-v3',
    disclaimer: 'これはMBTI公式診断や医学的・心理学的な検査ではありません。画像への直感的な反応を、MBTIの4つの性格軸を参考に読み解くTROY独自のエンタメ診断です。結果は自分を決めつける札ではなく、自分の傾向を見直すための物語としてお楽しみください。',
    methodology: {
        public: '12回の画像選択から、人との関わり方、情報の受け取り方、判断の基準、物事の進め方を読み取り、365種から最も近い一種を選びます。',
        fitWeights: { axes: 0.6, motif: 0.2, archetype: 0.15, tempo: 0.05 }
    },
    animals: animals.map(({ symbolicEssence, arcanaAction, preferredSeasonMonth, ...animal }) => animal)
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Generated ${animals.length} V3 past-life animals at ${OUTPUT_PATH}`);

// One visible cue per move. Full teaching copy stays in tutorialScript.js.
const outcomes = {
    basics: {0:'6に9で返せた！',1:'同じ9：赤↔青',3:'場が流れてカイが親',4:'黄色の9が出た',6:'同じ9：黄↔緑',8:'大札は同じ9に勝つ',10:'全員パスで場が流れた',11:'同じ数字はまとめて出せる',14:'次はあなたが親',17:'Aは小札で一番強い'},
    numbers: {0:'5で次の人を飛ばす',1:'11バック：小さい数字が強い',4:'場が流れて11バック解除',5:'8を2枚出すと即流れ',7:'ペンタクルでロック',9:'ロック解除・清めの杯＋1翻',14:'8カットで場が流れた'},
    majors: {0:'塔16はソードに返せる',1:'世界で場を流して＋1翻',2:'正義で数字の強弱が逆に',3:'カイがパス',4:'11バック中は小さい6が勝つ',5:'場が流れてミナが親'},
    roles: {1:'場が流れてミナが親',2:'ミナがストレート',5:'フラッシュで＋2翻'},
    finish: {0:'コールは役の翻から−1',2:'フルハウスで＋2翻',5:'残り1枚！',6:'上がり！ 大札で＋1翻'}
};
export const quickOutcome = (chapter,step) => outcomes[chapter]?.[step] ?? '次に進もう';
export function quickAction(type, cardCount, selectedCount, buttonLabel) {
    if (type === 'pass') return '「パス」をタップ';
    if (selectedCount === cardCount) return '「' + buttonLabel + '」をタップ';
    if (selectedCount > 0) return 'あと' + (cardCount-selectedCount) + '枚選ぶ';
    return cardCount === 1 ? '光る札をタップ' : '光る札を' + cardCount + '枚選ぶ';
}

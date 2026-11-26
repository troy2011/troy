import { tutorialIsEnglish } from './tutorialLocale.js';

// One visible cue per move. Full teaching copy stays in tutorialScript.js.
const outcomes = {
    basics: {0:'6に9で返せた！',1:'同じ9：赤↔青',3:'場が流れてカイが親',4:'黄色の9が出た',6:'同じ9：黄↔緑',8:'大札は同じ9に勝つ',10:'全員パスで場が流れた',11:'同じ数字はまとめて出せる',14:'次はあなたが親',17:'Aは小札で一番強い'},
    numbers: {0:'5で次の人を飛ばす',1:'11バック：小さい数字が強い',4:'場が流れて11バック解除',5:'8を2枚出すと即流れ',7:'ペンタクルでロック',9:'ロック解除・清めの盃＋1翻',14:'8カットで場が流れた'},
    majors: {0:'塔16はソードに返せる',1:'世界で場を流して＋1翻',2:'正義で数字の強弱が逆に',3:'カイがパス',4:'11バック中は小さい6が勝つ',5:'場が流れてミナが親'},
    roles: {1:'場が流れてミナが親',2:'ミナがストレート',5:'フラッシュで＋2翻'},
    finish: {0:'コールは役の翻から−1',2:'フルハウスで＋2翻',3:'スリーカードで＋1翻',5:'残り1枚！',6:'上がり！ 大札で＋1翻'}
};
const englishOutcomes = {
    basics: {0: 'The 9 beat the 6!', 1: 'Same 9: red beats blue', 3: 'Table cleared. Kai leads.', 4: 'Kai played a yellow 9.', 6: 'Same 9: green beats yellow', 8: 'A Major beats the same rank.', 10: 'Everyone passed. Table clear.', 11: 'Play matching ranks together.', 14: 'You lead next.', 17: 'The Ace is the strongest Minor.'},
    numbers: {0: 'A 5 skips the next player.', 1: 'Eleven Back: lower ranks win.', 4: 'Table cleared. Eleven Back ends.', 5: 'Two 8s clear the table.', 7: 'Locked to Pentacles.', 9: 'Lock removed: Purification +1 han', 14: 'Eight Cut cleared the table.'},
    majors: {0: 'The Tower answers Swords.', 1: 'The World clears the table: +1 han', 2: 'Justice reverses the ranks.', 3: 'Kai passed.', 4: 'A lower 6 wins in Eleven Back.', 5: 'Table cleared. Mina leads.'},
    roles: {1: 'Table cleared. Mina leads.', 2: 'Mina played a Straight.', 5: 'Flush: +2 han'},
    finish: {0: 'A Call earns 1 less han.', 2: 'Full House: +2 han', 3: 'Three of a Kind: +1 han', 5: 'One card left!', 6: 'You went out with a Major: +1 han'}
};

export const quickOutcome = (chapter, step) => tutorialIsEnglish()
    ? englishOutcomes[chapter]?.[step] ?? 'Let’s continue.'
    : outcomes[chapter]?.[step] ?? '次に進もう';
export function quickAction(type, cardCount, selectedCount, buttonLabel) {
    if (tutorialIsEnglish()) {
        if (type === 'pass') return 'Tap Pass';
        if (selectedCount === cardCount) return 'Tap ' + (cardCount === 4 ? 'Call' : cardCount === 5 ? 'Play Hand' : 'Play');
        if (selectedCount > 0) return 'Select ' + (cardCount - selectedCount) + ' more';
        return cardCount === 1 ? 'Tap the glowing card' : 'Select the ' + cardCount + ' glowing cards';
    }
    if (type === 'pass') return '「パス」をタップ';
    if (selectedCount === cardCount) return '「' + buttonLabel + '」をタップ';
    if (selectedCount > 0) return 'あと' + (cardCount-selectedCount) + '枚選ぶ';
    return cardCount === 1 ? '光る札をタップ' : '光る札を' + cardCount + '枚選ぶ';
}

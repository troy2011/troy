import { translateTable as tr, translateTableTemplate as trf } from './tableLocale.js?v=6';
import { ABILITY } from './abilityNames.js?v=pirate-ability-finish-han-v1';
// A private, read-only view of a legal normal play; never predicts opponent choices.
import { HAND_LIMIT, MAJOR_CLEAR_HAN, aceCounterMajor, lockSuits, numberKey, play, ferry } from './rules.js?v=suit-opposition-v1-finish-han-v1-auto-pass-v1';

export function selectedCardEffect(round, seat, cards, suitNames, {ferried=false}={}) {
    if (!cards.length || round.players[seat].hand.length === cards.length) return '';
    // The view (including masked opponent hands online) is enough for a normal play.
    // Don't copy old events or inspect unknown card identities to name immediate effects.
    const next = structuredClone({ ...round, events: [] });
    const attempt=ferried?ferry(next,seat,cards[0].id):play(next,seat,cards.map(card=>card.id),'normal');
    if(!attempt.ok)return '';
    const [first] = cards;
    const major = num => first.major && first.num === num;
    const top = round.field.plays.at(-1)?.cards || [];
    const event = type => next.events.find(mark => mark.type === type);
    const back = event('back');
    const clear = event('clear');
    const majorHan = event('majorClear');
    if (major(21) && clear) return tr(ABILITY.world) + tr('：すぐに場を流す') + (majorHan ? tr('・大札流し +') + majorHan.add + tr('翻') : '');
    if (event('justiceHan')) return tr('正義執行：11バック解除・＋1翻');
    if (cards.some(card => card.major && card.num === 11) && back) return tr(ABILITY.justice) + tr('：札の強弱を逆転');
    if (major(20) && back) {
        const retrieve = next.players[seat].hand.length < HAND_LIMIT ? '・' + tr(ABILITY.resurrection) + tr('：流した人は他人の墓地から小札1枚回収可') : '';
        return tr('審判：強弱を') + (back.on ? tr('逆転') : tr('元に戻す')) + retrieve;
    }
    if (back) return back.on ? tr('11バック：カードの強弱が逆に') : tr('11バック解除：カードの強弱を元に戻す');
    if (numberKey(first) === 8) {
        if (clear) return (cards.some(card=>card.major && card.num===8) ? tr(ABILITY.mighty) : tr('8カット')) + tr('：すぐに場を流す');
        if (event('cut')) return first.major ? tr(ABILITY.mighty) + tr('：通常出しは世界21だけ') : tr('8カット：コールかパスのみ');
    }
    const skip = event('skip');
    if (skip) return (cards.length === 1 && major(5) ? tr('Wスキップ') : tr('スキップ')) + tr('：次の') + skip.count + tr('席を飛ばす');
    if (event('temperanceHan')) return tr('清めの盃：効果を解除・＋1翻');
    if (event('reset')) return tr(ABILITY.clearance) + tr('：続いている効果をリセット');
    const lock = event('lock');
    if (lock) {
        const after = lockSuits(lock.suit);
        const before = lockSuits(round.lock);
        const changed = after.length !== before.length || after.some(suit => !before.includes(suit));
        if (changed) {
            const suits = after.map(suit => tr(suitNames[suit])).join('・');
            return cards.some(card => card.major && card.num === 13) ? tr('死神：') + suits + tr('にロック') : tr('ロック：以後') + suits + tr('で返す');
        }
    }
    if (next.trashBy === seat && cards.some(card => card.num === 12)) return cards.some(card => card.major && card.num === 12)
        ? tr(ABILITY.hang) + tr('：全員がパスし場を流すと、手札が最少の相手に1枚渡せる')
        : tr(ABILITY.banish) + tr('：全員がパスすると手札1枚を除外できる');
    if (major(1)) return tr('魔術師：すべてのスートとして扱う');
    if (cards.length === 1 && major(13)) return tr(ABILITY.death) + tr('：場を流すと相手は一番強いコート札を1枚捨てる（最後の1枚は除く）');
    if (cards.length !== 1 || !first.major || first.num < 15) return '';

    const bonus = tr('場を流すと大札流し +') + MAJOR_CLEAR_HAN + tr('翻');
    if (major(15)) return tr(ABILITY.devil) + tr('：場を流すと全員で交換を選ぶ');
    if (first.num >= 16 && first.num <= 19 && top.length === 1 && numberKey(top[0]) === 'A' &&
        aceCounterMajor(top[0].suit) === first.num) return tr(suitNames[top[0].suit]) + tr('のAに対抗・') + bonus;
    return bonus;
}

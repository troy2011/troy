import { ABILITY } from './abilityNames.js?v=pirate-ability-v1';
// A private, read-only view of a legal normal play; never predicts opponent choices.
import { HAND_LIMIT, MAJOR_CLEAR_HAN, aceCounterMajor, lockSuits, numberKey, play, ferry } from './rules.js?v=suit-opposition-v1';

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
    if (major(21) && clear) return ABILITY.world + '：すぐに場を流す' + (majorHan ? '・大札流し +' + majorHan.add + '翻' : '');
    if(cards.some(card => card.major && card.num === 11) && back)return ABILITY.justice + (event('reverse') ? '：手番が逆回り・' : '：') + (back.on?'札の強弱を逆転':'札の強弱を元に戻す');
    if (major(20) && back) {
        const retrieve = next.players[seat].hand.length < HAND_LIMIT ? '・' + ABILITY.resurrection + '：流した人は他人の墓地から小札1枚回収可' : '';
        return '審判：強弱を' + (back.on ? '逆転' : '元に戻す') + retrieve;
    }
    if (back) return back.on ? '11バック：カードの強弱が逆に' : '11バック解除：カードの強弱を元に戻す';
    if (numberKey(first) === 8) {
        if (clear) return (cards.some(card=>card.major && card.num===8) ? ABILITY.mighty : '8カット') + '：すぐに場を流す';
        if (event('cut')) return first.major ? ABILITY.mighty + '：通常出しは世界21だけ' : '8カット：コールかパスのみ';
    }
    const skip = event('skip');
    if (skip) return (cards.length === 1 && major(5) ? 'Wスキップ' : 'スキップ') + '：次の' + skip.count + '席を飛ばす';
    if (event('reset')) return ABILITY.clearance + '：続いている効果をリセット';
    const lock = event('lock');
    if (lock) {
        const after = lockSuits(lock.suit);
        const before = lockSuits(round.lock);
        const changed = after.length !== before.length || after.some(suit => !before.includes(suit));
        if (changed) {
            const suits = after.map(suit => suitNames[suit]).join('・');
            return cards.some(card => card.major && card.num === 13) ? '死神：' + suits + 'にロック' : 'ロック：以後' + suits + 'で返す';
        }
    }
    if (next.trashBy === seat && cards.some(card => card.num === 12)) return cards.some(card => card.major && card.num === 12)
        ? ABILITY.hang + '：全員がパスし場を流すと、手札が最少の相手に1枚渡せる'
        : ABILITY.banish + '：全員がパスすると手札1枚を除外できる';
    if (major(1)) return '魔術師：すべてのスートとして扱う';
    if (cards.length === 1 && major(13)) return ABILITY.death + '：場を流すと相手は一番強いコート札を1枚捨てる（最後の1枚は除く）';
    if (cards.length !== 1 || !first.major || first.num < 15) return '';

    const bonus = '場を流すと大札流し +' + MAJOR_CLEAR_HAN + '翻';
    if (major(15)) return ABILITY.devil + '：場を流すと全員で交換を選ぶ';
    if (first.num >= 16 && first.num <= 19 && top.length === 1 && numberKey(top[0]) === 'A' &&
        aceCounterMajor(top[0].suit) === first.num) return suitNames[top[0].suit] + 'のAに対抗・' + bonus;
    return bonus;
}

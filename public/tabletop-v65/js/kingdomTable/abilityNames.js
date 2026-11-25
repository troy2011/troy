export const ABILITY = Object.freeze({
    hang: 'ハングドォーバー', resurrection: 'リザレクション', banish: 'バニッシュ',
    mighty: 'マイティ・カット', justice: 'ライブリバース', clearance: '清めの盃',
    world: 'ワールドエンド', death: 'ザ・リーピング', devil: 'デッドマンズ・チェスト'
});
export function choiceAbility(round, card) {
    if (!card) return '';
    if (round.phase === 'trash' && !card.major && card.num === 12) return ABILITY.banish;
    if (!card.major) return '';
    if (round.phase === 'give' && card.num === 12) return ABILITY.hang;
    if (round.phase === 'retrieve' && card.num === 20) return ABILITY.resurrection;
    if (round.phase === 'deathSwap' && card.num === 15) return ABILITY.devil;
    return '';
}
// Name only effects confirmed by engine events belonging to a normal play.
export function playAbility(play, consequences) {
    if (play?.type !== 'play' || play.kind !== 'normal' || consequences.some(e => e.type === 'win')) return null;
    const has = type => consequences.some(e => e.type === type);
    for (const card of play.cards) {
        if (!card.major) continue;
        const label = card.num === 8 && (has('cut') || has('clear')) ? ABILITY.mighty
            : card.num === 11 && has('back') ? ABILITY.justice
            : card.num === 14 && has('reset') ? ABILITY.clearance
            : card.num === 21 && card === play.cards[0] && has('clear') ? ABILITY.world : '';
        if (label) return { card, label };
    }
    return null;
}

import { choiceAbility } from './abilityNames.js?v=pirate-ability-v1';

// Public triggering card only: never substitute a selected card from anyone's hand.
const choicePhases = new Set(['exchange', 'trash', 'give', 'deathSwap', 'retrieve', 'ferry']);

export function choiceFocusState(round) {
    const active = choicePhases.has(round?.phase);
    const trigger = active && typeof round.effectTriggerCard?.id === 'string' ? round.effectTriggerCard : null;
    return { active, trigger, label: choiceAbility(round, trigger) };
}

export function renderChoiceFocus(round, table, host, makeCard, retrieveDialog = false) {
    const { active, trigger, label: name } = choiceFocusState(round);
    const card = retrieveDialog && round?.phase === 'retrieve' ? null : trigger;
    table.classList.toggle('is-choice-focus', active);
    host.hidden = !card;
    const id = card ? card.id + ':' + (name || '') : '';
    if (host.dataset.trigger === id) return;
    host.dataset.trigger = id;
    host.replaceChildren(...(card ? [makeCard(card)] : []));
    if (card && name) {
        const title = host.ownerDocument.createElement('strong');
        title.className = 'kt-choice-label';
        title.textContent = name;
        host.append(title);
    }
}

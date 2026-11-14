// Hand order is presentation only; never rearrange the round's actual card array.
export const sortByNumber = cards => [...cards].sort((a, b) => a.num - b.num
    || Number(a.major) - Number(b.major) || String(a.suit).localeCompare(String(b.suit)));

export function displayHand(cards, order) {
    const sorted = sortByNumber(cards);
    if (!order) return sorted;
    const remaining = new Map(sorted.map(card => [card.id, card]));
    const hand = [];
    for (const id of order) {
        if (!remaining.has(id)) continue;
        hand.push(remaining.get(id));
        remaining.delete(id);
    }
    return [...hand, ...remaining.values()];
}

export function moveCard(cards, id, index) {
    const order = cards.map(card => card.id);
    const from = order.indexOf(id);
    if (from < 0) return order;
    order.splice(from, 1);
    order.splice(Math.max(0, Math.min(index, order.length)), 0, id);
    return order;
}

// A horizontal drag uses a separate preview. The real buttons stay in the fan
// until release, preserving pointer capture and the neighbouring hit areas.
export function installHandDrag(host, { enabled, pick, move }) {
    const DRAG_DISTANCE = 8;
    let drag = null;
    let suppressClick = false;

    function cancel() {
        if (!drag) return;
        const current = drag;
        drag = null;
        current.node.classList.remove('is-sorting');
        current.ghost?.remove();
        current.marker?.remove();
        if (current.node.hasPointerCapture(current.pointerId)) current.node.releasePointerCapture(current.pointerId);
    }

    host.addEventListener('pointerdown', event => {
        suppressClick = false;
        const node = event.target.closest('.kt-card');
        if (!enabled() || !event.isPrimary || event.button !== 0 || !node || node.disabled) return;
        cancel();
        pick(node.dataset.card);
        drag = { node, pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: node.getBoundingClientRect() };
        node.setPointerCapture(event.pointerId);
    });

    host.addEventListener('pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = Math.abs(event.clientX - drag.x);
        const dy = Math.abs(event.clientY - drag.y);
        if (!drag.ghost) {
            if (Math.max(dx, dy) < DRAG_DISTANCE) return;
            if (dy > dx) { cancel(); return; }
            const ghost = drag.node.cloneNode(true);
            ghost.classList.add('kt-hand-drag-card');
            ghost.tabIndex = -1;
            ghost.setAttribute('aria-hidden', 'true');
            ghost.style.width = `${drag.node.offsetWidth}px`;
            ghost.style.height = `${drag.node.offsetHeight}px`;
            const marker = document.createElement('div');
            marker.className = 'kt-hand-drop-marker';
            marker.setAttribute('aria-hidden', 'true');
            host.parentElement.append(ghost, marker);
            drag.ghost = ghost;
            drag.marker = marker;
            drag.node.classList.add('is-sorting');
        }
        event.preventDefault();
        drag.ghost.style.left = `${event.clientX - (drag.x - drag.rect.left)}px`;
        drag.ghost.style.top = `${event.clientY - (drag.y - drag.rect.top)}px`;
        const others = [...host.children].filter(node => node !== drag.node);
        const ranks = others.map(node => node.querySelector('.kt-card-rank').getBoundingClientRect());
        drag.index = ranks.filter(rect => event.clientX >= rect.left + rect.width / 2).length;
        const target = others[drag.index]?.getBoundingClientRect();
        const last = others.at(-1)?.getBoundingClientRect();
        const hand = host.getBoundingClientRect();
        drag.marker.style.left = `${target ? target.left - 3 : last?.right ?? hand.left}px`;
        drag.marker.style.top = `${hand.top + 12}px`;
        drag.marker.style.height = `${Math.max(24, hand.height - 20)}px`;
    });

    host.addEventListener('pointerup', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const current = drag;
        suppressClick = Boolean(current.ghost);
        cancel();
        if (suppressClick) move(current.node.dataset.card, current.index);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) host.addEventListener(type, event => {
        if (drag?.pointerId === event.pointerId) cancel();
    });
    host.addEventListener('click', event => {
        if (!suppressClick || event.detail === 0) return;
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    return cancel;
}

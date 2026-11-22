// Opening on a hold must not also select a card or dismiss the newly opened preview.
export function installHandInspect(host, { enabled, inspect }) {
    const HOLD_MS = 480;
    const MOVE_LIMIT = 9;
    const doc = host.ownerDocument;
    let press = null;
    let swallowClick = false;
    const handCard = event => {
        const node = event.target.closest?.('.kt-card');
        return node?.parentElement === host ? node : null;
    };
    function cancel() {
        if (press) clearTimeout(press.timer);
        press = null;
    }

    doc.addEventListener('pointerdown', () => {
        cancel();
        swallowClick = false;
    }, true);
    host.addEventListener('pointerdown', event => {
        const node = handCard(event);
        if (!enabled() || !event.isPrimary || event.button !== 0 || !node) return;
        const id = node.dataset.card;
        const timer = setTimeout(() => {
            cancel();
            if (enabled() && node.parentElement === host) swallowClick = inspect(id);
        }, HOLD_MS);
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, timer };
    });
    doc.addEventListener('pointermove', event => {
        if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_LIMIT) cancel();
    }, true);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        doc.addEventListener(type, event => { if (press?.id === event.pointerId) cancel(); }, true);
    }
    doc.defaultView?.addEventListener('blur', cancel);
    doc.addEventListener('click', event => {
        if (!swallowClick || event.detail === 0) return;
        swallowClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    host.addEventListener('contextmenu', event => {
        if ((enabled() || swallowClick) && handCard(event)) event.preventDefault();
    });
    host.addEventListener('keydown', event => {
        const node = handCard(event);
        if (!node || !enabled() || event.key !== 'Enter' || !event.shiftKey) return;
        event.preventDefault();
        if (!event.repeat) inspect(node.dataset.card);
    });
}

// Full-screen look at one tarot card artwork. Shared by the daily fortune and the inventory detail.
const VIEWER_CLASS = 'tarot-card-viewer';
let activeViewer = null;

function findFrontArtwork(trigger) {
    const image = trigger?.querySelector('img.pirate-tarot-artwork[data-artwork-side="front"]');
    return image && !image.hidden && image.getAttribute('src') ? image : null;
}

export function closeTarotCardViewer({ immediate = false } = {}) {
    if (!activeViewer) return;
    const { root, frame, origin, trigger, previousOverflow, onKeyDown } = activeViewer;
    activeViewer = null;
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.style.overflow = previousOverflow;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
        root.remove();
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    root.classList.remove('is-open');
    root.classList.add('is-closing');
    if (immediate || reducedMotion || document.hidden || typeof frame.animate !== 'function') {
        finish();
        return;
    }
    const target = origin?.isConnected ? origin.getBoundingClientRect() : null;
    const from = frame.getBoundingClientRect();
    let animation = null;
    if (target?.width && from.width) {
        const dx = (target.x + target.width / 2) - (from.x + from.width / 2);
        const dy = (target.y + target.height / 2) - (from.y + from.height / 2);
        try {
            animation = frame.animate([
                { transform: 'translate(0, 0) scale(1)' },
                { transform: `translate(${dx}px, ${dy}px) scale(${target.width / from.width})` }
            ], { duration: 220, easing: 'cubic-bezier(.4, 0, .9, .6)', fill: 'forwards' });
        } catch { /* Fading alone is enough. */ }
    }
    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    animation?.finished.then(once, once);
    setTimeout(once, 260);
}

export function openTarotCardViewer(trigger, { label = '' } = {}) {
    const source = findFrontArtwork(trigger);
    if (!source) return false;
    closeTarotCardViewer({ immediate: true });
    const reversed = source.classList.contains('is-reversed');

    const root = document.createElement('div');
    root.className = VIEWER_CLASS;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', `${label || 'カード'}を全画面で表示`);

    const stage = document.createElement('div');
    stage.className = 'tarot-card-viewer-stage';
    const frame = document.createElement('div');
    frame.className = 'tarot-card-viewer-frame';
    const image = document.createElement('img');
    image.className = 'tarot-card-viewer-image';
    image.src = source.getAttribute('src');
    image.alt = source.alt || label;
    image.width = 640;
    image.height = 960;
    image.decoding = 'async';
    image.classList.toggle('is-reversed', reversed);
    frame.append(image);
    stage.append(frame);

    const caption = document.createElement('p');
    caption.className = 'tarot-card-viewer-caption';
    caption.textContent = label;
    if (reversed) {
        const badge = document.createElement('span');
        badge.className = 'tarot-card-viewer-orientation';
        badge.textContent = '逆位置';
        caption.append(badge);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tarot-card-viewer-close';
    close.setAttribute('aria-label', '全画面表示を閉じる');

    root.append(stage, caption, close);
    // Any tap closes: the card is for looking at, and there is nothing else to press here.
    root.addEventListener('click', (event) => {
        event.stopPropagation();
        closeTarotCardViewer();
    });
    const onKeyDown = (event) => {
        // The detail sheet underneath must not switch items while its card is enlarged.
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            closeTarotCardViewer();
        } else if (event.key === 'Tab') {
            event.preventDefault();
            close.focus();
        }
    };
    document.addEventListener('keydown', onKeyDown, true);
    activeViewer = { root, frame, origin: source, trigger, previousOverflow: document.body.style.overflow, onKeyDown };
    document.body.style.overflow = 'hidden';
    document.body.append(root);
    close.focus({ preventScroll: true });

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
        if (activeViewer?.root !== root) return;
        root.classList.add('is-open');
        if (reducedMotion || typeof frame.animate !== 'function') return;
        // Grow out of the card that was tapped so it reads as the same card coming closer.
        const from = source.getBoundingClientRect();
        const to = frame.getBoundingClientRect();
        if (!from.width || !to.width) return;
        const dx = (from.x + from.width / 2) - (to.x + to.width / 2);
        const dy = (from.y + from.height / 2) - (to.y + to.height / 2);
        try {
            frame.animate([
                { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` },
                { transform: 'translate(0, 0) scale(1)' }
            ], { duration: 320, easing: 'cubic-bezier(.2, .9, .25, 1.06)' });
        } catch { /* The fade-in still shows the card. */ }
    });
    return true;
}

function disableTarotCardZoom(trigger) {
    if (!trigger.classList.contains('is-card-zoomable')) return;
    trigger.classList.remove('is-card-zoomable');
    trigger.removeAttribute('aria-label');
    if (trigger.tagName === 'BUTTON') {
        trigger.disabled = true;
    } else {
        trigger.removeAttribute('tabindex');
        trigger.removeAttribute('role');
    }
}

// Makes a card element open the viewer once it shows its front artwork.
export function enableTarotCardZoom(trigger, { label = '' } = {}) {
    const artwork = findFrontArtwork(trigger);
    if (!artwork) return;
    // A card whose artwork fails keeps its old sprite and simply stays a plain card.
    artwork.addEventListener('error', () => disableTarotCardZoom(trigger), { once: true });
    trigger.dataset.cardZoomLabel = label;
    trigger.classList.add('is-card-zoomable');
    if (trigger.tagName === 'BUTTON') {
        trigger.disabled = false;
    } else {
        trigger.tabIndex = 0;
        trigger.setAttribute('role', 'button');
    }
    trigger.setAttribute('aria-label', `${label || 'カード'}を全画面で見る`);
    if (trigger.dataset.cardZoomBound === '1') return;
    trigger.dataset.cardZoomBound = '1';
    const open = (event) => {
        if (!trigger.classList.contains('is-card-zoomable')) return;
        if (!findFrontArtwork(trigger)) return;
        event.preventDefault();
        event.stopPropagation();
        openTarotCardViewer(trigger, { label: trigger.dataset.cardZoomLabel || '' });
    };
    trigger.addEventListener('click', open);
    trigger.addEventListener('keydown', (event) => {
        if (trigger.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) open(event);
    });
}

// Tarot Kingdom, table version: presentation on top of the table — card flights, stamps, chip showers.
// Presentation only: nothing here reads or changes the round, the chips or the deck.
// Everything is drawn in one fixed layer from screen boxes, so a re-render of the table never cuts an effect short.
// Movement uses transform and opacity only, for slow phones.

const layer = document.createElement('div');
layer.className = 'kt-fx';
layer.setAttribute('aria-hidden', 'true');
document.body.append(layer);

const timers = new Set();
let quiet = false;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

// Fast mode turns presentation off entirely; reduced motion keeps the words but drops the movement.
export function setQuiet(value) { quiet = !!value; }
export const active = () => !quiet;
export const moving = () => !quiet && !reducedMotion();

export function later(ms, run) {
    if (ms <= 0) { run(); return; }
    const id = setTimeout(() => { timers.delete(id); run(); }, ms);
    timers.add(id);
}

// A new match or a seat change: drop everything still in the air.
export function cancelAll() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    layer.replaceChildren();
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

function place(node, rect) {
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    if (rect.width !== undefined) node.style.width = `${rect.width}px`;
    if (rect.height !== undefined) node.style.height = `${rect.height}px`;
    layer.append(node);
    return node;
}

function settle(animation, node) {
    return animation.finished.catch(() => {}).then(() => node.remove());
}

// A centred box of the given size around a point, for the effects that are not tied to an element.
export function boxAt(point, width, height) {
    return { left: point.x - width / 2, top: point.y - height / 2, width, height };
}

// Moves a card face or back from one screen box to another along a short arc.
// With `keep`, the card stays where it landed until `sweep` or `cancelAll` takes it away.
export function fly(node, from, to, { duration = 300, delay = 0, keep = false, spin = 0 } = {}) {
    if (!moving() || !from || !to) return Promise.resolve(node);
    node.classList.add('kt-fx-card');
    place(node, to);
    const a = centre(from);
    const b = centre(to);
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const scale = from.width && to.width ? from.width / to.width : 1;
    const lift = Math.min(70, 18 + Math.hypot(dx, dy) * 0.14);
    const animation = node.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${spin}deg)`, opacity: 0.7 },
        { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(${((scale + 1) / 2) * 1.1}) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.55 },
        { transform: 'none', opacity: 1 }
    ], { duration, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' });
    return animation.finished.catch(() => {}).then(() => {
        if (!keep) node.remove();
        return node;
    });
}

// The field is cleared: the cards slide off the table like a wave carrying them away.
export function sweep(items) {
    if (!moving()) return 0;
    items.forEach(({ node, rect }, index) => {
        node.classList.add('kt-fx-card');
        if (!node.isConnected) place(node, rect);
        const animation = node.animate([
            { transform: 'none', opacity: 1 },
            { transform: `translate(${-rect.width * 0.4}px, -8px) rotate(-6deg)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${-window.innerWidth * 0.75}px, 18px) rotate(-24deg)`, opacity: 0 }
        ], { duration: 420, delay: index * 35, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'both' });
        settle(animation, node);
    });
    return 420 + Math.max(0, items.length - 1) * 35;
}

// A card lands: a ring spreads over the felt and a few sparks fly. `strong` for roles and the World.
export function impact(rect, { strong = false } = {}) {
    if (!moving() || !rect) return;
    const point = centre(rect);
    const size = Math.max(60, rect.width * 1.2);
    const ring = place(el('span', strong ? 'kt-fx-ring is-strong' : 'kt-fx-ring'), boxAt(point, size, size));
    settle(ring.animate([
        { transform: 'scale(.35)', opacity: 0.95 },
        { transform: `scale(${strong ? 2.6 : 1.7})`, opacity: 0 }
    ], { duration: strong ? 560 : 400, easing: 'cubic-bezier(.2,.7,.3,1)' }), ring);
    const sparks = strong ? 14 : 7;
    for (let i = 0; i < sparks; i += 1) {
        const angle = (i / sparks) * Math.PI * 2 + Math.random() * 0.5;
        const distance = (strong ? 70 : 40) + Math.random() * 30;
        const spark = place(el('span', 'kt-fx-spark'), boxAt(point, 6, 6));
        settle(spark.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.2)`, opacity: 0 }
        ], { duration: 420 + Math.random() * 160, easing: 'cubic-bezier(.1,.7,.3,1)' }), spark);
    }
}

export function shake(target, strength = 6) {
    if (!target || !moving()) return;
    const s = strength;
    target.animate([
        { transform: 'none' },
        { transform: `translate(${-s}px, ${s * 0.4}px)` },
        { transform: `translate(${s * 0.8}px, ${-s * 0.5}px)` },
        { transform: `translate(${-s * 0.5}px, ${s * 0.3}px)` },
        { transform: `translate(${s * 0.3}px, 0)` },
        { transform: 'none' }
    ], { duration: 340, easing: 'ease-out' });
}

export function flash(kind = 'gold') {
    if (!moving()) return;
    const veil = place(el('span', `kt-fx-flash is-${kind}`), { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
    settle(veil.animate([{ opacity: 0 }, { opacity: 0.75, offset: 0.2 }, { opacity: 0 }], { duration: 360, easing: 'ease-out' }), veil);
}

// A word stamped on the table: "8カット", "上がり" and so on. Returns how long it stays.
export function stamp(text, point, kind = 'gold', { big = false } = {}) {
    const node = place(el('span', `kt-fx-stamp is-${kind}${big ? ' is-big' : ''}`, text), { left: point.x, top: point.y });
    // Keep the whole word on screen when it belongs to a seat at the edge.
    const half = node.offsetWidth / 2 + 8;
    node.style.left = `${Math.min(Math.max(point.x, half), window.innerWidth - half)}px`;
    const duration = big ? 1100 : 760;
    const frames = moving()
        ? [
            { transform: 'translate(-50%, -50%) scale(2.4) rotate(-8deg)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(.92) rotate(-4deg)', opacity: 1, offset: 0.2 },
            { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.3 },
            { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.8 },
            { transform: 'translate(-50%, -80%) scale(1) rotate(-4deg)', opacity: 0 }
        ]
        : [
            { transform: 'translate(-50%, -50%)', opacity: 1 },
            { transform: 'translate(-50%, -50%)', opacity: 1, offset: 0.85 },
            { transform: 'translate(-50%, -50%)', opacity: 0 }
        ];
    settle(node.animate(frames, { duration, easing: 'ease-out', fill: 'both' }), node);
    return duration;
}

// A band across the table for a five-card role. `tier` 'legend' adds light rays behind the name.
export function banner(text, rect, tier = 'normal', sub = '') {
    const band = place(el('div', `kt-fx-banner is-${tier}`), { left: rect.left, top: centre(rect).y - 38, width: rect.width, height: 76 });
    if (tier === 'legend') band.append(el('span', 'kt-fx-rays'));
    const label = el('strong', 'kt-fx-banner-text', text);
    if (sub) label.append(el('small', '', sub));
    band.append(label);
    const duration = tier === 'legend' ? 1300 : 950;
    if (!moving()) {
        settle(band.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration, fill: 'both' }), band);
        return duration;
    }
    band.animate([
        { transform: 'scaleY(0)' },
        { transform: 'scaleY(1)', offset: 0.14 },
        { transform: 'scaleY(1)', offset: 0.86 },
        { transform: 'scaleY(0)' }
    ], { duration, easing: 'ease-in-out', fill: 'both' });
    settle(label.animate([
        { transform: 'translateX(70%) skewX(-12deg)', opacity: 0 },
        { transform: 'translateX(0) skewX(-12deg)', opacity: 1, offset: 0.2 },
        { transform: 'translateX(0) skewX(0)', opacity: 1, offset: 0.3 },
        { transform: 'translateX(-4%) skewX(0)', opacity: 1, offset: 0.82 },
        { transform: 'translateX(-70%) skewX(12deg)', opacity: 0 }
    ], { duration, easing: 'ease-in-out', fill: 'both' }), band);
    return duration;
}

// A speech bubble over a seat: "パス", "親を渡す".
export function bubble(text, rect) {
    const node = place(el('span', 'kt-fx-bubble', text), { left: centre(rect).x, top: rect.top });
    const rise = moving() ? -14 : 0;
    settle(node.animate([
        { transform: 'translate(-50%, -60%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%, -100%) scale(1)', opacity: 1, offset: 0.15 },
        { transform: 'translate(-50%, -100%)', opacity: 1, offset: 0.75 },
        { transform: `translate(-50%, calc(-100% + ${rise}px))`, opacity: 0 }
    ], { duration: 900, easing: 'ease-out', fill: 'both' }), node);
}

// The han a role earned flies to the seat that holds it, and the seat's han pill jumps.
export function orb(text, from, target, tier = 'gold') {
    const start = centre(from);
    const node = place(el('span', `kt-fx-orb is-${tier}`, text), { left: start.x, top: start.y });
    const to = target?.getBoundingClientRect();
    if (!to || !moving()) {
        settle(node.animate([{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: 'translate(-50%, -50%)', opacity: 0 }], { duration: 700, fill: 'both' }), node);
        return 700;
    }
    const end = centre(to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    settle(node.animate([
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45)`, opacity: 0.9 }
    ], { duration: 900, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' }), node);
    later(880, () => pop(target));
    return 1000;
}

export function pop(node) {
    if (!node?.isConnected || !moving()) return;
    node.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
}

// Coins arc from one box to another. Returns when the last coin lands.
export function coins(from, to, count, delay = 0) {
    if (!moving() || count <= 0) return 0;
    const a = centre(from);
    const b = centre(to);
    for (let i = 0; i < count; i += 1) {
        const coin = place(el('span', 'kt-fx-coin'), boxAt({ x: a.x + (Math.random() - 0.5) * from.width * 0.5, y: a.y }, 16, 16));
        const dx = b.x - a.x + (Math.random() - 0.5) * 18;
        const dy = b.y - a.y + (Math.random() - 0.5) * 10;
        const lift = 50 + Math.random() * 40;
        settle(coin.animate([
            { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
            { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(1.15)`, opacity: 1, offset: 0.45 },
            { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: 1, offset: 0.92 },
            { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 }
        ], { duration: 560, delay: delay + i * 55, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' }), coin);
    }
    return delay + (count - 1) * 55 + 560;
}

// Counts a number up or down on screen; the final text is always the exact value.
export function countUp(node, from, to, duration = 700, format = (value) => String(value)) {
    if (!node) return;
    if (!moving() || from === to) { node.textContent = format(to); return; }
    const start = performance.now();
    const tick = (now) => {
        if (!node.isConnected) return;
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - progress) ** 3;
        node.textContent = format(Math.round(from + (to - from) * eased));
        if (progress < 1) requestAnimationFrame(tick);
    };
    node.textContent = format(from);
    requestAnimationFrame(tick);
}

// Hand cards come off the deck one after another. The animation ends on each card's own fan position.
export function deal(nodes, from) {
    if (!moving() || !from) return 0;
    const start = centre(from);
    nodes.forEach((node, index) => {
        const rect = node.getBoundingClientRect();
        const end = centre(rect);
        const resting = getComputedStyle(node).transform;
        node.animate([
            { transform: `translate(${start.x - end.x}px, ${start.y - end.y}px) scale(.45) rotate(-30deg)`, opacity: 0 },
            { transform: resting === 'none' ? 'none' : resting, opacity: 1 }
        ], { duration: 300, delay: 120 + index * 55, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    });
    return 120 + Math.max(0, nodes.length - 1) * 55 + 300;
}

// A light passes over the hand: your turn.
export function sweepLight(rect) {
    if (!moving()) return;
    const node = place(el('span', 'kt-fx-light'), rect);
    settle(node.animate([
        { transform: 'translateX(-60%)', opacity: 0 },
        { transform: 'translateX(-10%)', opacity: 1, offset: 0.4 },
        { transform: 'translateX(60%)', opacity: 0 }
    ], { duration: 700, easing: 'ease-in-out' }), node);
}

// Gold and coloured paper falls over the whole screen when you win the match.
export function confetti(count = 54) {
    if (!moving()) return;
    const colours = ['#ffe08a', '#efc66d', '#e86b4f', '#62c3b4', '#fff6dc', '#b86fd4'];
    for (let i = 0; i < count; i += 1) {
        const piece = place(el('span', 'kt-fx-confetti'), { left: Math.random() * window.innerWidth, top: -20, width: 7 + Math.random() * 5, height: 10 + Math.random() * 8 });
        piece.style.background = colours[i % colours.length];
        const drift = (Math.random() - 0.5) * 160;
        const turn = (Math.random() - 0.5) * 900;
        settle(piece.animate([
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${turn}deg)`, opacity: 0.9 }
        ], { duration: 1500 + Math.random() * 1300, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.1,.7,1)', fill: 'backwards' }), piece);
    }
}

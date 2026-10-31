// Extra layers for the daily fortune reveal: the wind compass, the reversed turn and
// the major arcana signatures. Display only: every value shown here was already
// settled by the server, and nothing here touches the card, reward or any API.

// Where the needle rests while each color stage is showing. It only ever climbs,
// and the final value comes from the settled wind level.
const STAGE_FLOOR = { moon: 1, blue: 5, gold: 8, legend: 10 };

// One signature per major arcana, keyed by card number.
const SIGNATURES = {
    0: 'fool', 1: 'magician', 2: 'priestess', 3: 'empress', 4: 'emperor', 5: 'hierophant',
    6: 'lovers', 7: 'chariot', 8: 'strength', 9: 'hermit', 10: 'wheel', 11: 'justice',
    12: 'hanged', 13: 'death', 14: 'temperance', 15: 'devil', 16: 'tower', 17: 'star',
    18: 'moon', 19: 'sun', 20: 'judgement', 21: 'world'
};

const REVERSED_TURN_MS = 460;

function clampLevel(level) {
    const value = Math.round(Number(level) || 0);
    return Math.min(10, Math.max(1, value || 5));
}

function buildCompassTicks() {
    let ticks = '';
    for (let value = 1; value <= 10; value += 1) {
        const angle = (value / 10) * Math.PI;
        const x = 60 - Math.cos(angle) * 50;
        const y = 58 - Math.sin(angle) * 50;
        const inner = value % 5 === 0 ? 41 : 44;
        const ix = 60 - Math.cos(angle) * inner;
        const iy = 58 - Math.sin(angle) * inner;
        ticks += `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    }
    return ticks;
}

export function createWindCompass(fx, level) {
    const target = clampLevel(level);
    const el = document.createElement('div');
    el.className = 'tarot-fortune-compass';
    el.innerHTML = `
        <svg viewBox="0 0 120 70" focusable="false">
            <defs>
                <linearGradient id="tarotFortuneCompassGlow" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stop-color="#a78bfa"></stop>
                    <stop offset="0.5" stop-color="#38bdf8"></stop>
                    <stop offset="0.8" stop-color="#fbbf24"></stop>
                    <stop offset="1" stop-color="#fff1b5"></stop>
                </linearGradient>
            </defs>
            <path class="tarot-fortune-compass-track" d="M10 58 A50 50 0 0 1 110 58"></path>
            <path class="tarot-fortune-compass-lit" d="M10 58 A50 50 0 0 1 110 58" pathLength="100"></path>
            <g class="tarot-fortune-compass-ticks">${buildCompassTicks()}</g>
            <text class="tarot-fortune-compass-caption" x="60" y="36">WIND</text>
            <g class="tarot-fortune-compass-needle"><g class="tarot-fortune-compass-needle-body">
                <path d="M60 18 L63.5 56 L60 60 L56.5 56 Z"></path>
            </g></g>
            <circle class="tarot-fortune-compass-cap" cx="60" cy="58" r="11"></circle>
            <text class="tarot-fortune-compass-value" x="60" y="62.5">0</text>
        </svg>
    `;
    fx.appendChild(el);
    const valueEl = el.querySelector('.tarot-fortune-compass-value');
    let shown = 0;
    let frame = 0;

    const point = (value, duration) => {
        el.style.setProperty('--compass-turn', `${(value / 10) * 180 - 90}deg`);
        el.style.setProperty('--compass-lit', String(100 - value * 10));
        el.style.setProperty('--compass-duration', `${duration}ms`);
        // The digits follow the needle; the loop ends by itself once the fx layer is gone.
        cancelAnimationFrame(frame);
        const from = shown;
        const start = performance.now();
        const step = (now) => {
            if (!el.isConnected) return;
            const t = Math.min(1, (now - start) / Math.max(1, duration));
            shown = from + (value - from) * (1 - (1 - t) ** 3);
            valueEl.textContent = String(Math.round(shown));
            if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
    };

    return {
        toStage(stage) {
            const floor = Math.min(target, STAGE_FLOOR[stage] || 1);
            el.classList.add('is-searching');
            point(floor, shown === 0 ? 760 : 360);
        },
        settle() {
            el.classList.remove('is-searching');
            el.classList.add('is-settled');
            point(target, 220);
        }
    };
}

// A reversed card first lands upright, then turns over into its reversed position.
export function playReversedTurn(fx, cardEl) {
    if (!cardEl.classList.contains('is-reversed')) return 0;
    fx.classList.add('is-reversed');
    const label = document.createElement('div');
    label.className = 'tarot-fortune-fx-reversed';
    label.textContent = '逆位置';
    fx.appendChild(label);
    const finish = () => cardEl.classList.remove('is-reversed-turn');
    cardEl.addEventListener('animationend', (event) => {
        if (event.animationName === 'tarotFortuneReversedTurn') finish();
    });
    setTimeout(finish, 1600);
    cardEl.classList.add('is-reversed-turn');
    return REVERSED_TURN_MS;
}

export function getFortuneSignature(cardEl) {
    const id = cardEl.querySelector('img[data-artwork-side="front"]')?.dataset.artworkCardId || '';
    const match = /^major-(\d+)$/.exec(id);
    return match ? SIGNATURES[Number(match[1])] || '' : '';
}

// Small particles take their place and delay from inline custom properties.
function particles(className, list) {
    return list.map(([x, y, delay]) => `<i class="${className}" style="--x:${x};--y:${y};--delay:${delay}ms"></i>`).join('');
}

const SIGNATURE_MARKUP = {
    fool: particles('tarot-fortune-sign-bubble', [[-0.55, 0.3, 0], [0.5, 0.42, 140], [-0.2, 0.55, 300], [0.25, 0.2, 440], [-0.7, 0.62, 600]]),
    magician: `<svg class="tarot-fortune-sign-figure is-infinity" viewBox="0 0 120 60" focusable="false">
        <path d="M60 30 C45 8 15 8 15 30 C15 52 45 52 60 30 C75 8 105 8 105 30 C105 52 75 52 60 30 Z" pathLength="100"></path>
    </svg>`,
    priestess: '<i class="tarot-fortune-sign-pillar is-dark"></i><i class="tarot-fortune-sign-pillar is-light"></i>',
    empress: particles('tarot-fortune-sign-petal', [[-0.7, 0, 0], [0.55, 0, 180], [-0.15, 0, 360], [0.85, 0, 520], [-0.45, 0, 700], [0.2, 0, 860]]),
    emperor: `<svg class="tarot-fortune-sign-figure is-crown" viewBox="0 0 100 60" focusable="false">
        <path d="M14 52 L8 16 L32 34 L50 8 L68 34 L92 16 L86 52 Z" pathLength="100"></path>
    </svg>`,
    hierophant: `<svg class="tarot-fortune-sign-figure is-keys" viewBox="0 0 100 100" focusable="false">
        <g transform="rotate(45 50 50)"><circle cx="18" cy="50" r="9" pathLength="100"></circle><path d="M27 50 H90 M80 50 V60 M88 50 V62" pathLength="100"></path></g>
        <g transform="rotate(135 50 50)"><circle cx="18" cy="50" r="9" pathLength="100"></circle><path d="M27 50 H90 M80 50 V60 M88 50 V62" pathLength="100"></path></g>
    </svg>`,
    lovers: `<svg class="tarot-fortune-sign-heart" viewBox="0 0 24 22" focusable="false"><path d="M12 21 C5 15 1 11 1 7 A5 5 0 0 1 12 5 A5 5 0 0 1 23 7 C23 11 19 15 12 21 Z"></path></svg>
        <svg class="tarot-fortune-sign-heart" viewBox="0 0 24 22" focusable="false"><path d="M12 21 C5 15 1 11 1 7 A5 5 0 0 1 12 5 A5 5 0 0 1 23 7 C23 11 19 15 12 21 Z"></path></svg>`,
    chariot: particles('tarot-fortune-sign-speed', [[0, -0.42, 0], [0, -0.12, 120], [0, 0.16, 60], [0, 0.44, 200]]),
    strength: '<i class="tarot-fortune-sign-aura"></i><i class="tarot-fortune-sign-aura"></i>',
    hermit: '<i class="tarot-fortune-sign-lantern-beam"></i><i class="tarot-fortune-sign-lantern"></i>',
    justice: `<svg class="tarot-fortune-sign-figure is-scales" viewBox="0 0 120 90" focusable="false">
        <path d="M60 12 V84 M44 84 H76" pathLength="100"></path>
        <g class="tarot-fortune-sign-scale-arm"><path d="M14 22 H106 M14 22 L5 46 H23 Z M106 22 L97 46 H115 Z" pathLength="100"></path></g>
    </svg>`,
    hanged: '<i class="tarot-fortune-sign-thread"></i><i class="tarot-fortune-sign-halo"></i>',
    death: '<i class="tarot-fortune-sign-dawn"></i><i class="tarot-fortune-sign-dawn-line"></i>',
    temperance: `<svg class="tarot-fortune-sign-figure is-flow" viewBox="0 0 120 60" focusable="false">
        <path d="M12 52 C30 0 90 0 108 52" pathLength="100"></path>
        <path class="tarot-fortune-sign-flow-drops" d="M12 52 C30 0 90 0 108 52" pathLength="100"></path>
    </svg>`,
    devil: '<i class="tarot-fortune-sign-smoke"></i>' + particles('tarot-fortune-sign-ember', [[-0.5, 0, 0], [0.35, 0, 160], [-0.1, 0, 320], [0.65, 0, 460], [-0.75, 0, 620], [0.15, 0, 760]]),
    judgement: particles('tarot-fortune-sign-ray', [[-24, 0, 0], [0, 0, 120], [24, 0, 240]]),
    sun: '<i class="tarot-fortune-sign-rays"></i><i class="tarot-fortune-sign-disk"></i>',
    moon: '<i class="tarot-fortune-sign-crescent"></i><i class="tarot-fortune-sign-mist"></i><i class="tarot-fortune-sign-mist"></i>',
    star: '<i class="tarot-fortune-sign-streak"></i><i class="tarot-fortune-sign-streak"></i><i class="tarot-fortune-sign-streak"></i><i class="tarot-fortune-sign-sparkle"></i>',
    world: '<i class="tarot-fortune-sign-wreath"></i><i class="tarot-fortune-sign-wreath"></i>',
    wheel: `<svg class="tarot-fortune-sign-wheel" viewBox="0 0 100 100" focusable="false">
        <circle cx="50" cy="50" r="44"></circle><circle cx="50" cy="50" r="36"></circle><circle cx="50" cy="50" r="7"></circle>
        <path d="M50 6V94M6 50H94M18.9 18.9L81.1 81.1M81.1 18.9L18.9 81.1"></path>
    </svg>`,
    tower: `<svg class="tarot-fortune-sign-bolt" viewBox="0 0 100 160" focusable="false">
        <path d="M62 2 L40 58 L58 62 L30 122 L44 124 L26 158" pathLength="100"></path>
    </svg>`
};

export function playArcanaSignature(fx, cardEl) {
    const name = getFortuneSignature(cardEl);
    if (!name) return '';
    const sign = document.createElement('div');
    sign.className = 'tarot-fortune-sign';
    sign.dataset.sign = name;
    if (cardEl.offsetHeight) {
        sign.style.setProperty('--sign-h', `${cardEl.offsetHeight}px`);
        sign.style.setProperty('--sign-w', `${cardEl.offsetWidth}px`);
    }
    sign.innerHTML = SIGNATURE_MARKUP[name];
    fx.appendChild(sign);
    fx.dataset.sign = name;
    return name;
}

export const __test = { clampLevel, STAGE_FLOOR, SIGNATURES };

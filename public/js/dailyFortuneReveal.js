// Daily fortune card reveal presentation.
// Display only: the result is already settled by the server before this runs.
// Nothing here may change the card, weather, reward or call any API.

const TIER_STYLES = {
    moon: { core: [236, 232, 255], glow: [167, 139, 250] },
    blue: { core: [224, 251, 255], glow: [56, 189, 248] },
    gold: { core: [255, 244, 194], glow: [251, 191, 36] },
    legend: { core: [255, 250, 230], glow: [255, 214, 102] }
};

const COIN_COLORS = { face: '#f6c945', edge: '#a8741a', shine: '#fff2b0' };
const CONFETTI_COLORS = ['#ffd75e', '#ff8fa3', '#7dd3fc', '#a7f3d0', '#c4b5fd', '#fff4c2'];

export function getDailyFortuneRevealTier(level) {
    const value = Number(level) || 0;
    if (value >= 10) return 'legend';
    if (value >= 8) return 'gold';
    if (value >= 5) return 'blue';
    return 'moon';
}

// Color escalation shown while the light gathers. It only ever promotes,
// so a lower result never fakes a better one.
function buildStagePlan(tier, random = Math.random) {
    if (tier === 'legend') return ['blue', 'gold', 'legend'];
    if (tier === 'gold') return random() < 0.4 ? ['blue', 'gold'] : ['gold'];
    if (tier === 'blue') return random() < 0.25 ? ['moon', 'blue'] : ['blue'];
    return ['moon'];
}

function isLowPowerDevice() {
    const cores = Number(navigator.hardwareConcurrency || 0);
    const memory = Number(navigator.deviceMemory || 0);
    return (cores > 0 && cores <= 4) || (memory > 0 && memory <= 3);
}

function rgba([r, g, b], alpha) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class FortuneFxCanvas {
    constructor(canvas, onError) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onError = onError;
        this.particles = [];
        this.emitters = [];
        this.running = false;
        this.frame = 0;
        this.last = 0;
        this.scale = isLowPowerDevice() ? 0.55 : 1;
        this.slowFrames = 0;
        this.tick = this.tick.bind(this);
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
        this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    count(base) {
        return Math.max(1, Math.round(base * this.scale));
    }

    add(particle) {
        if (this.particles.length < 220) this.particles.push(particle);
    }

    start() {
        if (this.running || !this.ctx) return;
        this.running = true;
        this.last = performance.now();
        this.frame = requestAnimationFrame(this.tick);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frame);
        this.particles = [];
        this.emitters = [];
        try { this.ctx?.clearRect(0, 0, this.width || 0, this.height || 0); } catch { /* A failed canvas must not block cleanup. */ }
    }

    tick(now) {
        if (!this.running) return;
        try {
        const dt = Math.min(48, now - this.last) / 1000;
        this.last = now;
        // Shed particles on devices that cannot hold the frame rate.
        if (dt > 0.03) this.slowFrames += 1;
        if (this.slowFrames > 8 && this.scale > 0.4) {
            this.scale *= 0.6;
            this.slowFrames = 0;
            this.particles = this.particles.filter((_, index) => index % 2 === 0);
        }
        for (const emitter of this.emitters) emitter(dt);
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.globalCompositeOperation = 'lighter';
        this.particles = this.particles.filter((p) => {
            p.age += dt;
            if (p.age >= p.life) return false;
            p.update(p, dt);
            p.draw(ctx, p);
            return true;
        });
        ctx.globalCompositeOperation = 'source-over';
        this.frame = requestAnimationFrame(this.tick);
        } catch (error) {
            this.onError(error);
        }
    }
}

function drawGlowDot(ctx, p) {
    const t = p.age / p.life;
    const fade = p.fadeIn ? Math.min(1, t / p.fadeIn) * (1 - Math.max(0, (t - 0.7) / 0.3)) : 1 - t;
    const twinkle = p.twinkle ? 0.65 + 0.35 * Math.sin((p.age + p.seed) * p.twinkle) : 1;
    const alpha = Math.max(0, fade * twinkle);
    const color = p.hue === undefined ? p.color : null;
    ctx.fillStyle = color ? rgba(p.glowColor, alpha * 0.22) : `hsla(${p.hue}, 100%, 70%, ${alpha * 0.22})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color ? rgba(color, alpha) : `hsla(${p.hue}, 100%, 88%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    if (p.star) {
        ctx.strokeStyle = color ? rgba(color, alpha * 0.8) : `hsla(${p.hue}, 100%, 88%, ${alpha * 0.8})`;
        ctx.lineWidth = 1;
        const len = p.r * 4;
        ctx.beginPath();
        ctx.moveTo(p.x - len, p.y);
        ctx.lineTo(p.x + len, p.y);
        ctx.moveTo(p.x, p.y - len);
        ctx.lineTo(p.x, p.y + len);
        ctx.stroke();
    }
}

function drawCoin(ctx, p) {
    const t = p.age / p.life;
    const alpha = t > 0.75 ? (1 - t) / 0.25 : 1;
    const squash = Math.cos(p.spin);
    const width = Math.max(0.8, Math.abs(squash) * p.r);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COIN_COLORS.edge;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, width, p.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = squash > 0 ? COIN_COLORS.face : '#e0ad2c';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, width * 0.86, p.r * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    if (squash > 0.5) {
        ctx.fillStyle = COIN_COLORS.shine;
        ctx.beginPath();
        ctx.ellipse(p.x - width * 0.3, p.y - p.r * 0.3, width * 0.22, p.r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
}

function drawConfetti(ctx, p) {
    const t = p.age / p.life;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.flip));
    ctx.fillStyle = p.fill;
    ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
}

function drawRing(ctx, p) {
    const t = p.age / p.life;
    const eased = 1 - (1 - t) ** 3;
    const radius = p.r0 + (p.r1 - p.r0) * eased;
    ctx.strokeStyle = p.hue === undefined ? rgba(p.color, (1 - t) * p.alpha) : `hsla(${p.hue}, 100%, 75%, ${(1 - t) * p.alpha})`;
    ctx.lineWidth = p.width * (1 - t) + 0.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius, radius * p.squash, 0, 0, Math.PI * 2);
    ctx.stroke();
}

const moveFree = (p, dt) => {
    p.vx *= 1 - p.drag * dt;
    p.vy = p.vy * (1 - p.drag * dt) + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
};

const moveSpiral = (p, dt) => {
    const t = Math.min(1, p.age / p.life);
    const radius = p.radius * (1 - t) ** 1.6;
    p.angle += p.spinRate * dt * (1 + t * 2);
    p.x = p.cx + Math.cos(p.angle) * radius;
    p.y = p.cy + Math.sin(p.angle) * radius * 0.82;
};

function tierColors(stage) {
    return TIER_STYLES[stage] || TIER_STYLES.gold;
}

function createFxDom(host, tier) {
    const fx = document.createElement('div');
    fx.className = 'tarot-fortune-fx';
    fx.dataset.tier = tier;
    fx.setAttribute('aria-hidden', 'true');
    fx.innerHTML = `
        <div class="tarot-fortune-fx-veil"></div>
        <div class="tarot-fortune-fx-rays"></div>
        <div class="tarot-fortune-fx-ring"></div>
        <canvas class="tarot-fortune-fx-canvas"></canvas>
        <div class="tarot-fortune-fx-bloom"></div>
        <div class="tarot-fortune-fx-omen">風が変わる…</div>
        <div class="tarot-fortune-fx-banner"><span>大当たり</span></div>
    `;
    host.appendChild(fx);
    return fx;
}

function restartClass(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
}

export async function playDailyFortuneGrandReveal({
    cardEl,
    host,
    overlay,
    level,
    wait,
    isStillOpen,
    ownsOverlay = isStillOpen,
    flipToFront,
    random = Math.random
}) {
    const tier = getDailyFortuneRevealTier(level);
    const stages = buildStagePlan(tier, random);
    let fx;
    let engine;
    let cleaned = false;
    let lingerTimer = 0;
    let resolveFailure;
    const failure = new Promise((resolve) => { resolveFailure = resolve; });
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(lingerTimer);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        engine?.stop();
        fx?.remove();
        if (ownsOverlay()) overlay?.classList.remove('is-fortune-charging');
        cardEl.classList.remove('is-fortune-trembling', 'is-fortune-hovering', 'is-flip-out', 'is-flip-in');
    };
    const onVisibilityChange = () => { if (document.hidden) cleanup(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const proceed = () => !cleaned && !document.hidden && isStillOpen();
    const finishQuietly = () => {
        cleanup();
        const open = isStillOpen();
        if (open) flipToFront();
        return { aborted: !open, tier };
    };
    const waitForStage = (ms) => Promise.race([wait(ms), failure]);
    try {
    fx = createFxDom(host, tier);
    engine = new FortuneFxCanvas(fx.querySelector('.tarot-fortune-fx-canvas'), () => {
        cleanup();
        resolveFailure();
    });
    engine.resize();
    engine.start();
    const center = () => {
        const canvasRect = engine.canvas.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();
        return {
            x: cardRect.left + cardRect.width / 2 - canvasRect.left,
            y: cardRect.top + cardRect.height / 2 - canvasRect.top,
            w: cardRect.width,
            h: cardRect.height
        };
    };

    let stage = stages[0];
    const setStage = (next) => {
        stage = next;
        fx.dataset.stage = next;
    };

    const spawnMote = () => {
        const c = center();
        const colors = tierColors(stage);
        const legend = stage === 'legend';
        engine.add({
            cx: c.x, cy: c.y, x: 0, y: 0,
            radius: Math.max(c.w, c.h) * (0.75 + random() * 0.55),
            angle: random() * Math.PI * 2,
            spinRate: 1.4 + random() * 1.6,
            r: 0.9 + random() * 1.6,
            age: 0, life: 0.9 + random() * 0.5, seed: random() * 10,
            fadeIn: 0.25, twinkle: 18,
            color: legend ? undefined : colors.core,
            glowColor: colors.glow,
            hue: legend ? Math.floor(random() * 360) : undefined,
            update: moveSpiral, draw: drawGlowDot
        });
    };

    const burst = (count, { speed = 160, gravity = 40, life = 1, star = 0.3, spread = 1 } = {}) => {
        const c = center();
        const colors = tierColors(stage);
        const legend = stage === 'legend';
        for (let i = 0; i < engine.count(count); i += 1) {
            const angle = random() * Math.PI * 2;
            const velocity = speed * (0.35 + random() * 0.65);
            engine.add({
                x: c.x + (random() - 0.5) * c.w * 0.4 * spread,
                y: c.y + (random() - 0.5) * c.h * 0.4 * spread,
                vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity * 0.85 - speed * 0.15,
                drag: 2.2, gravity, r: 1 + random() * 1.8,
                age: 0, life: life * (0.6 + random() * 0.6), seed: random() * 10, twinkle: 22,
                star: random() < star,
                color: legend ? undefined : colors.core, glowColor: colors.glow,
                hue: legend ? Math.floor(random() * 360) : undefined,
                update: moveFree, draw: drawGlowDot
            });
        }
    };

    const ring = ({ from = 0.3, to = 1.4, width = 4, life = 0.6, alpha = 0.8 } = {}) => {
        const c = center();
        const legend = stage === 'legend';
        engine.add({
            x: c.x, y: c.y, r0: c.w * from, r1: c.w * to, width, alpha, squash: 0.9,
            age: 0, life,
            color: legend ? undefined : tierColors(stage).core,
            hue: legend ? 48 : undefined,
            update: () => {}, draw: drawRing
        });
    };

    const coins = (count, { power = 1, life = 1.5 } = {}) => {
        const c = center();
        for (let i = 0; i < engine.count(count); i += 1) {
            const angle = -Math.PI / 2 + (random() - 0.5) * 1.9;
            const velocity = (190 + random() * 170) * power;
            engine.add({
                x: c.x + (random() - 0.5) * c.w * 0.5, y: c.y,
                vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
                drag: 0.9, gravity: 520, r: 4 + random() * 3,
                spin: random() * Math.PI, spinRate: 8 + random() * 10,
                age: 0, life: life * (0.75 + random() * 0.35),
                update: (p, dt) => { moveFree(p, dt); p.spin += p.spinRate * dt; },
                draw: drawCoin
            });
        }
    };

    const confetti = (count) => {
        const c = center();
        for (let i = 0; i < engine.count(count); i += 1) {
            const angle = -Math.PI / 2 + (random() - 0.5) * 2.4;
            const velocity = 160 + random() * 220;
            engine.add({
                x: c.x, y: c.y - c.h * 0.1,
                vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
                drag: 2.4, gravity: 140, r: 3 + random() * 2.5,
                rot: random() * Math.PI, rotRate: (random() - 0.5) * 9,
                flip: random() * Math.PI, flipRate: 6 + random() * 8,
                fill: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
                age: 0, life: 1.8 + random() * 0.8,
                update: (p, dt) => { moveFree(p, dt); p.rot += p.rotRate * dt; p.flip += p.flipRate * dt; },
                draw: drawConfetti
            });
        }
    };

    // 1. Charge: light spirals into the hovering card and the room dims.
    let moteBudget = 0;
    const moteRate = () => (stage === 'legend' ? 90 : 60) * engine.scale;
    engine.emitters.push((dt) => {
        moteBudget += moteRate() * dt;
        while (moteBudget >= 1) {
            moteBudget -= 1;
            spawnMote();
        }
    });
    setStage(stage);
    overlay?.classList.add('is-fortune-charging');
    cardEl.classList.add('is-fortune-hovering');
    fx.classList.add('is-charging');
    await waitForStage(900);
    if (!proceed()) return finishQuietly();

    // 2. Promotion: each step cracks the ring into a brighter color.
    for (const next of stages.slice(1)) {
        setStage(next);
        restartClass(fx, 'is-promoting');
        burst(18, { speed: 120, gravity: 0, life: 0.6, star: 0.5 });
        ring({ from: 0.5, to: 1.2, width: 3, life: 0.45, alpha: 0.7 });
        await waitForStage(next === 'legend' ? 360 : 440);
        if (!proceed()) return finishQuietly();
    }

    // 3. Jackpot omen: only the top wind gets the rays, tremble and omen line.
    if (tier === 'legend') {
        fx.classList.add('is-omen');
        cardEl.classList.add('is-fortune-trembling');
        await waitForStage(760);
        if (!proceed()) return finishQuietly();
        cardEl.classList.remove('is-fortune-trembling');
    } else {
        await waitForStage(380);
        if (!proceed()) return finishQuietly();
    }

    // 4. Flip: the gathered light snaps inward, then the card turns.
    engine.emitters = [];
    fx.classList.remove('is-charging');
    fx.classList.add('is-imploding');
    cardEl.classList.remove('is-fortune-hovering');
    cardEl.classList.add('is-flip-out');
    await waitForStage(240);
    if (!proceed()) return finishQuietly();
    flipToFront();
    cardEl.classList.remove('is-flip-out');
    cardEl.classList.add('is-flip-in');
    fx.classList.remove('is-imploding');
    fx.classList.add('is-revealed');
    restartClass(fx.querySelector('.tarot-fortune-fx-bloom'), 'is-on');

    // 5. Afterglow scaled to the wind level.
    if (tier === 'moon') {
        ring({ from: 0.4, to: 1.25, width: 2, life: 0.8, alpha: 0.5 });
        burst(26, { speed: 70, gravity: -30, life: 1.6, star: 0.4, spread: 1.4 });
    } else if (tier === 'blue') {
        ring({ from: 0.35, to: 1.5, width: 3, life: 0.7 });
        burst(40, { speed: 170, gravity: 30, life: 1.1, star: 0.35 });
    } else if (tier === 'gold') {
        ring({ from: 0.3, to: 1.7, width: 4, life: 0.7 });
        ring({ from: 0.2, to: 1.2, width: 2, life: 0.9, alpha: 0.5 });
        burst(52, { speed: 210, gravity: 40, life: 1.2, star: 0.45 });
        coins(22);
    } else {
        ring({ from: 0.3, to: 1.9, width: 5, life: 0.8 });
        ring({ from: 0.2, to: 1.4, width: 3, life: 1, alpha: 0.6 });
        burst(70, { speed: 240, gravity: 30, life: 1.4, star: 0.5 });
        coins(36, { power: 1.15, life: 1.8 });
        confetti(46);
        fx.classList.add('is-jackpot');
    }
    await waitForStage(340);
    if (!proceed()) return finishQuietly();
    cardEl.classList.remove('is-flip-in');
    overlay?.classList.remove('is-fortune-charging');

    // Particles finish on their own beside the result; the reading never waits for them.
    lingerTimer = setTimeout(cleanup, tier === 'legend' ? 2800 : 1800);
    return { aborted: false, tier, cleanup };
    } catch {
        return finishQuietly();
    }
}

export const __test = { buildStagePlan, getDailyFortuneRevealTier };

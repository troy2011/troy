import { PIXEL_MONSTERS_ROSTER } from './pixelMonstersManifest.js?v=20260724h';

// Tarot Kingdom renders both player avatars and pet sprites inside the same
// combat-scale host. Keep this base multiplier shared by every companion view.
export const PIXEL_MONSTER_COMPANION_SCALE = 1;
export const PIXEL_MONSTER_COMPANION_OFFSET_Y = Object.freeze({
    'ismartal-vol2-monster-05': 0,
    'ismartal-vol2-monster-17': 0,
    'ismartal-vol3-monster-09': 0
});

const MONSTER_BY_ID = new Map(PIXEL_MONSTERS_ROSTER.map((monster) => [String(monster.id || ''), monster]));
const animationTimers = new WeakMap();

function stopCompanionAnimation(target) {
    const timerId = animationTimers.get(target);
    if (timerId) clearInterval(timerId);
    animationTimers.delete(target);
}
function setCompanionFrame(sprite, monster, animation, frameIndex) {
    const width = Math.max(1, Number(monster.frameWidth) || 48);
    const height = Math.max(1, Number(monster.frameHeight) || 48);
    const columns = Math.max(1, Number(animation.columns) || 1);
    const frameCount = Math.max(1, Number(animation.frameCount) || 1);
    const rows = Math.max(1, Math.ceil(frameCount / columns));
    const frame = Math.max(0, Math.min(frameCount - 1, Math.floor(Number(frameIndex) || 0)));
    const col = frame % columns;
    const row = Math.floor(frame / columns);
    sprite.style.width = `${width}px`;
    sprite.style.height = `${height}px`;
    sprite.style.backgroundImage = `url('${animation.src}')`;
    sprite.style.backgroundSize = `${columns * width}px ${rows * height}px`;
    sprite.style.backgroundPosition = `-${col * width}px -${row * height}px`;
    sprite.style.backgroundRepeat = 'no-repeat';
    sprite.style.imageRendering = String(monster.renderMode || 'pixel') === 'illustration' ? 'auto' : 'pixelated';
}

function startCompanionIdle(target, sprite, monster) {
    stopCompanionAnimation(target);
    const animation = monster.animations?.idle;
    if (!animation) return;
    const frameCount = Math.max(1, Number(animation.frameCount) || 1);
    let frame = 0;
    setCompanionFrame(sprite, monster, animation, frame);
    if (frameCount <= 1 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const intervalMs = Math.max(80, Math.round(1000 / Math.max(1, Number(animation.fps) || 10)));
    const timerId = setInterval(() => {
        if (!target.isConnected || target.hidden) {
            stopCompanionAnimation(target);
            return;
        }
        frame = (frame + 1) % frameCount;
        setCompanionFrame(sprite, monster, animation, frame);
    }, intervalMs);
    animationTimers.set(target, timerId);
}

export function getPixelMonsterCompanion(monsterId = '') {
    return MONSTER_BY_ID.get(String(monsterId || '').trim()) || null;
}

export function renderPixelMonsterCompanion(targetOrId, pet = null) {
    const target = typeof targetOrId === 'string'
        ? document.getElementById(targetOrId)
        : targetOrId;
    if (!target) return false;
    const monster = getPixelMonsterCompanion(pet?.monsterId);
    stopCompanionAnimation(target);
    target.innerHTML = '';
    target.hidden = !monster;
    target.classList.toggle('has-monster', !!monster);
    if (!monster) {
        target.removeAttribute('aria-label');
        delete target.dataset.monsterId;
        delete target.dataset.monsterAnchor;
        return false;
    }

    const anchorMode = monster.idleAnchor?.mode === 'air' ? 'air' : 'ground';
    const configuredOffset = Object.prototype.hasOwnProperty.call(
        PIXEL_MONSTER_COMPANION_OFFSET_Y,
        String(monster.id || '')
    )
        ? PIXEL_MONSTER_COMPANION_OFFSET_Y[String(monster.id || '')]
        : Number(monster.battleOffsetY) || 0;
    const renderedWidth = Math.max(1, Number(monster.frameWidth) || 48) * PIXEL_MONSTER_COMPANION_SCALE;
    target.dataset.monsterId = String(monster.id || '');
    target.dataset.monsterAnchor = anchorMode;
    target.setAttribute(
        'aria-label',
        `${String(pet?.nickname || pet?.displayName || pet?.monsterName || monster.name || 'ペット')}（ペット）`
    );
    target.style.setProperty('--pixel-monster-companion-shadow-width', `${Math.max(34, Math.min(68, Math.round(renderedWidth * 0.72)))}px`);
    target.style.setProperty('--pixel-monster-companion-offset-y', `${Math.max(-24, Math.min(24, configuredOffset))}px`);
    target.style.setProperty('--pixel-monster-companion-scale', String(PIXEL_MONSTER_COMPANION_SCALE));
    target.style.setProperty('--pixel-monster-companion-scale-x', monster.flipX === true ? '-1' : '1');
    target.style.setProperty('--pixel-monster-companion-scale-y', monster.flipY === true ? '-1' : '1');

    const shadow = document.createElement('span');
    shadow.className = 'pixel-monster-companion-shadow';
    shadow.setAttribute('aria-hidden', 'true');
    const sprite = document.createElement('span');
    sprite.className = 'pixel-monster-companion-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    target.append(shadow, sprite);
    startCompanionIdle(target, sprite, monster);
    return true;
}
